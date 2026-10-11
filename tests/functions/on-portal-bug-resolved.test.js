import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env before importing the handler (URLs are resolved at import time)
process.env.PORTAL_SOPORTE_URL = 'https://portal.example.com';
process.env.PUBLIC_APP_URL = 'https://test.example.com';

const {
  parsePortalTicketId,
  notifyPortal,
  handlePortalBugResolved
} = require('../../functions/handlers/on-portal-bug-resolved.js');

describe('onPortalBugResolved', () => {
  let mockAxios;
  let mockLogger;
  const TEST_API_KEY = 'test-api-key-123';

  beforeEach(() => {
    mockAxios = { post: vi.fn().mockResolvedValue({ status: 200 }) };
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
  });

  function getDeps() {
    return { axios: mockAxios, apiKey: TEST_API_KEY, logger: mockLogger };
  }

  // ─── parsePortalTicketId ───────────────────────────────────────────

  describe('parsePortalTicketId', () => {
    it('should extract ticketId from a string note with Portal marker', () => {
      const notes = '[Portal de Incidencias] ticketId: ABC-123';
      expect(parsePortalTicketId(notes)).toBe('ABC-123');
    });

    it('should extract ticketId from multiline string notes', () => {
      const notes = 'Some context\n[Portal de Incidencias] ticketId: T-999\nMore text';
      expect(parsePortalTicketId(notes)).toBe('T-999');
    });

    it('should extract ticketId from an array of note objects', () => {
      const notes = [
        { content: 'Regular note' },
        { content: '[Portal de Incidencias] ticketId: XYZ-42' }
      ];
      expect(parsePortalTicketId(notes)).toBe('XYZ-42');
    });

    it('should extract ticketId from a Firebase-object of notes (numeric keys)', () => {
      const notes = {
        0: { content: 'First note' },
        1: { content: '[Portal de Incidencias] ticketId: FB-007' }
      };
      expect(parsePortalTicketId(notes)).toBe('FB-007');
    });

    it('should extract ticketId from a Firebase-object with push keys', () => {
      const notes = {
        '-NxAbc123': { content: '[Portal de Incidencias] ticketId: PK-55' },
        '-NxDef456': { content: 'Another note' }
      };
      expect(parsePortalTicketId(notes)).toBe('PK-55');
    });

    it('should return null for null/undefined notes', () => {
      expect(parsePortalTicketId(null)).toBeNull();
      expect(parsePortalTicketId(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parsePortalTicketId('')).toBeNull();
    });

    it('should return null for empty array', () => {
      expect(parsePortalTicketId([])).toBeNull();
    });

    it('should return null for empty object', () => {
      expect(parsePortalTicketId({})).toBeNull();
    });

    it('should return null when Portal marker exists but no ticketId', () => {
      expect(parsePortalTicketId('[Portal de Incidencias] sin ticket')).toBeNull();
    });

    it('should return null when notes have no Portal marker', () => {
      expect(parsePortalTicketId('Just a regular note')).toBeNull();
      expect(parsePortalTicketId([{ content: 'No marker here' }])).toBeNull();
    });

    it('should handle note objects without content field', () => {
      const notes = [{ text: 'wrong field' }, { content: '[Portal de Incidencias] ticketId: OK-1' }];
      expect(parsePortalTicketId(notes)).toBe('OK-1');
    });

    it('should handle ticketId with various formats', () => {
      expect(parsePortalTicketId('[Portal de Incidencias] ticketId: 12345')).toBe('12345');
      expect(parsePortalTicketId('[Portal de Incidencias] ticketId: my-long-ticket-id')).toBe('my-long-ticket-id');
    });

    it('should extract ticketId when it is on a separate line (real Portal format)', () => {
      const notes = '[Portal de Incidencias] Ticket #46\nticketId: -OkXZOLQaEyUhJ1O4Jt2\nURL: https://support.example.com/adminView?incidencia=-OkXZOLQaEyUhJ1O4Jt2';
      expect(parsePortalTicketId(notes)).toBe('-OkXZOLQaEyUhJ1O4Jt2');
    });

    it('should extract ticketId from array note with multiline content (real Portal format)', () => {
      const notes = [{
        content: '[Portal de Incidencias] Ticket #47\nticketId: -OkX_8dFVLz_9sqrrUep\nURL: https://support.example.com/adminView?incidencia=-OkX_8dFVLz_9sqrrUep',
        id: 'legacy-123',
        timestamp: '2026-02-11T16:41:03.137Z'
      }];
      expect(parsePortalTicketId(notes)).toBe('-OkX_8dFVLz_9sqrrUep');
    });
  });

  // ─── notifyPortal ──────────────────────────────────────────────────

  describe('notifyPortal', () => {
    it('should POST correct payload with api-key header', async () => {
      await notifyPortal(
        { ticketId: 'T-1', cardId: 'PRJ-BUG-0001', projectId: 'MyProject' },
        getDeps()
      );

      expect(mockAxios.post).toHaveBeenCalledTimes(1);

      const [url, payload, config] = mockAxios.post.mock.calls[0];
      expect(url).toBe('https://portal.example.com/api/planningGame/resolveTicket');
      expect(payload).toEqual({
        ticketId: 'T-1',
        cardId: 'PRJ-BUG-0001',
        bugUrl: 'https://test.example.com/adminproject/?projectId=MyProject&cardId=PRJ-BUG-0001#bugs',
        message: 'Bug PRJ-BUG-0001 has been resolved in PlanningGameXP'
      });
      expect(config.headers['x-api-key']).toBe(TEST_API_KEY);
      expect(config.timeout).toBe(10000);
    });

    it('should encode projectId and cardId in bugUrl', async () => {
      await notifyPortal(
        { ticketId: 'T-2', cardId: 'A&B-BUG-0001', projectId: 'My Project' },
        getDeps()
      );

      const [, payload] = mockAxios.post.mock.calls[0];
      expect(payload.bugUrl).toBe(
        'https://test.example.com/adminproject/?projectId=My%20Project&cardId=A%26B-BUG-0001#bugs'
      );
    });

    it('should propagate axios errors', async () => {
      const axiosError = new Error('Network Error');
      mockAxios.post.mockRejectedValueOnce(axiosError);

      await expect(
        notifyPortal({ ticketId: 'T-3', cardId: 'X-BUG-0001', projectId: 'P' }, getDeps())
      ).rejects.toThrow('Network Error');
    });
  });

  // ─── handlePortalBugResolved ───────────────────────────────────────

  describe('handlePortalBugResolved', () => {
    const baseBugData = {
      status: 'In Progress',
      title: 'Test bug',
      cardId: 'PRJ-BUG-0001',
      notes: '[Portal de Incidencias] ticketId: PORTAL-100'
    };

    it('should skip non-bug sections', async () => {
      const result = await handlePortalBugResolved(
        { projectId: 'P', section: 'tasks_P', cardId: 'c1' },
        baseBugData,
        { ...baseBugData, status: 'Fixed' },
        getDeps()
      );

      expect(result).toBeNull();
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should skip when status is not Fixed or Verified', async () => {
      const result = await handlePortalBugResolved(
        { projectId: 'P', section: 'BUGS_P', cardId: 'c1' },
        baseBugData,
        { ...baseBugData, status: 'In Progress' },
        getDeps()
      );

      expect(result).toBeNull();
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should skip when status was already Fixed (no transition)', async () => {
      const result = await handlePortalBugResolved(
        { projectId: 'P', section: 'BUGS_P', cardId: 'c1' },
        { ...baseBugData, status: 'Fixed' },
        { ...baseBugData, status: 'Fixed' },
        getDeps()
      );

      expect(result).toBeNull();
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should skip when no Portal marker in notes', async () => {
      const noMarkerData = { ...baseBugData, notes: 'Just a regular note' };
      const result = await handlePortalBugResolved(
        { projectId: 'P', section: 'BUGS_P', cardId: 'c1' },
        noMarkerData,
        { ...noMarkerData, status: 'Fixed' },
        getDeps()
      );

      expect(result).toBeNull();
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should notify Portal on transition to Fixed', async () => {
      const result = await handlePortalBugResolved(
        { projectId: 'TestProject', section: 'BUGS_TestProject', cardId: 'c1' },
        baseBugData,
        { ...baseBugData, status: 'Fixed' },
        getDeps()
      );

      expect(mockAxios.post).toHaveBeenCalledTimes(1);
      const [, payload] = mockAxios.post.mock.calls[0];
      expect(payload.ticketId).toBe('PORTAL-100');
      expect(payload.cardId).toBe('PRJ-BUG-0001');
      expect(result).toEqual({ notifiedPortal: true, ticketId: 'PORTAL-100' });
    });

    it('should not notify Portal again when a fixed bug is validated', async () => {
      const result = await handlePortalBugResolved(
        { projectId: 'P', section: 'bugs_P', cardId: 'c1' },
        { ...baseBugData, status: 'Fixed' },
        { ...baseBugData, status: 'Done&Validated' },
        getDeps()
      );

      expect(mockAxios.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should use afterData.cardId for notification', async () => {
      const afterData = { ...baseBugData, status: 'Fixed', cardId: 'CUSTOM-BUG-0055' };
      await handlePortalBugResolved(
        { projectId: 'P', section: 'BUGS_P', cardId: 'c1' },
        baseBugData,
        afterData,
        getDeps()
      );

      const [, payload] = mockAxios.post.mock.calls[0];
      expect(payload.cardId).toBe('CUSTOM-BUG-0055');
    });

    it('should fallback to params.cardId when afterData.cardId is missing', async () => {
      const afterData = { ...baseBugData, status: 'Fixed' };
      delete afterData.cardId;

      await handlePortalBugResolved(
        { projectId: 'P', section: 'BUGS_P', cardId: 'fallback-id' },
        baseBugData,
        afterData,
        getDeps()
      );

      const [, payload] = mockAxios.post.mock.calls[0];
      expect(payload.cardId).toBe('fallback-id');
    });

    it('should NOT throw when Portal API fails (best-effort)', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('Portal down'));

      const result = await handlePortalBugResolved(
        { projectId: 'P', section: 'BUGS_P', cardId: 'c1' },
        baseBugData,
        { ...baseBugData, status: 'Fixed' },
        getDeps()
      );

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify Portal'),
        expect.objectContaining({ error: 'Portal down' })
      );
    });

    it('should handle array notes', async () => {
      const arrayNotesData = {
        ...baseBugData,
        notes: [
          { content: 'Regular note' },
          { content: '[Portal de Incidencias] ticketId: ARR-42' }
        ]
      };

      const result = await handlePortalBugResolved(
        { projectId: 'P', section: 'BUGS_P', cardId: 'c1' },
        arrayNotesData,
        { ...arrayNotesData, status: 'Fixed' },
        getDeps()
      );

      expect(mockAxios.post).toHaveBeenCalledTimes(1);
      const [, payload] = mockAxios.post.mock.calls[0];
      expect(payload.ticketId).toBe('ARR-42');
      expect(result).toEqual({ notifiedPortal: true, ticketId: 'ARR-42' });
    });

    it('should handle Firebase-object notes', async () => {
      const fbNotesData = {
        ...baseBugData,
        notes: {
          '-NxAbc': { content: '[Portal de Incidencias] ticketId: FB-99' }
        }
      };

      const result = await handlePortalBugResolved(
        { projectId: 'P', section: 'BUGS_P', cardId: 'c1' },
        fbNotesData,
        { ...fbNotesData, status: 'Fixed' },
        getDeps()
      );

      expect(mockAxios.post).toHaveBeenCalledTimes(1);
      const [, payload] = mockAxios.post.mock.calls[0];
      expect(payload.ticketId).toBe('FB-99');
      expect(result).toEqual({ notifiedPortal: true, ticketId: 'FB-99' });
    });
  });
});
