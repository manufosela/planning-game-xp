import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.PUBLIC_APP_URL = 'https://test.example.com';

const {
  handleHourlyDigest,
  generateDigestHtml
} = require('../../functions/handlers/hourly-validation-digest.js');

describe('hourly-validation-digest', () => {
  let mockDb;
  let mockGetAccessToken;
  let mockSendEmail;
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      ref: vi.fn().mockReturnValue({
        once: vi.fn().mockResolvedValue({ val: () => null }),
        update: vi.fn().mockResolvedValue(undefined)
      })
    };

    mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
    mockSendEmail = vi.fn().mockResolvedValue(undefined);
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
  });

  function getDeps() {
    return {
      db: mockDb,
      getAccessToken: mockGetAccessToken,
      sendEmail: mockSendEmail,
      logger: mockLogger
    };
  }

  function setupQueues(toValidate, bugFixed) {
    mockDb.ref.mockImplementation((path) => {
      if (path === '/emailQueue/toValidate') {
        return { once: vi.fn().mockResolvedValue({ val: () => toValidate }) };
      }
      if (path === '/emailQueue/bugFixed') {
        return { once: vi.fn().mockResolvedValue({ val: () => bugFixed }) };
      }
      if (path === '/emailQueue/validationRevert') {
        return { once: vi.fn().mockResolvedValue({ val: () => null }) };
      }
      // Root ref for cleanup
      return { update: vi.fn().mockResolvedValue(undefined) };
    });
  }

  describe('handleHourlyDigest', () => {
    it('should skip when both queues are empty', async () => {
      setupQueues(null, null);

      const result = await handleHourlyDigest(getDeps());

      expect(result).toEqual({ emailsSent: 0, totalItems: 0 });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockGetAccessToken).not.toHaveBeenCalled();
    });

    it('should send one digest email per recipient', async () => {
      setupQueues({
        '-k1': { recipientEmail: 'alice@test.com', cardId: 'C4D-TSK-0001', projectId: 'Cinema4D', taskTitle: 'Task 1', developerName: 'Dev A' },
        '-k2': { recipientEmail: 'alice@test.com', cardId: 'C4D-TSK-0002', projectId: 'Cinema4D', taskTitle: 'Task 2', developerName: 'Dev B' },
        '-k3': { recipientEmail: 'bob@test.com', cardId: 'NTR-TSK-0010', projectId: 'Intranet', taskTitle: 'Task 3', developerName: 'Dev C' }
      }, null);

      const result = await handleHourlyDigest(getDeps());

      expect(result.emailsSent).toBe(2);
      expect(result.totalItems).toBe(3);
      expect(mockSendEmail).toHaveBeenCalledTimes(2);

      // Check Alice's email
      const aliceCall = mockSendEmail.mock.calls.find(c => c[1][0] === 'alice@test.com');
      expect(aliceCall).toBeDefined();
      expect(aliceCall[2]).toContain('2 elementos pendientes');
      expect(aliceCall[3]).toContain('Task 1');
      expect(aliceCall[3]).toContain('Task 2');

      // Check Bob's email
      const bobCall = mockSendEmail.mock.calls.find(c => c[1][0] === 'bob@test.com');
      expect(bobCall).toBeDefined();
      expect(bobCall[2]).toContain('1 elemento pendiente');
    });

    it('should include both tasks and bugs in the same digest', async () => {
      setupQueues(
        { '-k1': { recipientEmail: 'user@test.com', cardId: 'C4D-TSK-0001', projectId: 'Cinema4D', taskTitle: 'Task A', developerName: 'Dev' } },
        { '-k2': { recipientEmail: 'user@test.com', cardId: 'C4D-BUG-0001', projectId: 'Cinema4D', bugTitle: 'Bug B', developerName: 'Dev' } }
      );

      const result = await handleHourlyDigest(getDeps());

      expect(result.emailsSent).toBe(1);
      expect(result.totalItems).toBe(2);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);

      const html = mockSendEmail.mock.calls[0][3];
      expect(html).toContain('Task A');
      expect(html).toContain('Bug B');
      expect(html).toContain('Tareas pendientes de validacion');
      expect(html).toContain('Bugs corregidos');
    });

    it('should clean up processed queue entries after sending', async () => {
      const mockRootRef = { update: vi.fn().mockResolvedValue(undefined) };

      mockDb.ref.mockImplementation((path) => {
        if (path === '/emailQueue/toValidate') {
          return { once: vi.fn().mockResolvedValue({ val: () => ({
            '-k1': { recipientEmail: 'a@test.com', cardId: 'TSK-1', projectId: 'P1', taskTitle: 'T1' }
          }) }) };
        }
        if (path === '/emailQueue/bugFixed' || path === '/emailQueue/validationRevert') {
          return { once: vi.fn().mockResolvedValue({ val: () => null }) };
        }
        // Root ref
        return mockRootRef;
      });

      await handleHourlyDigest(getDeps());

      // Verify cleanup was called
      expect(mockRootRef.update).toHaveBeenCalledWith({
        '/emailQueue/toValidate/-k1': null
      });
    });

    it('should NOT clean up entries if email sending fails', async () => {
      mockSendEmail.mockRejectedValue(new Error('SMTP error'));
      const mockRootRef = { update: vi.fn().mockResolvedValue(undefined) };

      mockDb.ref.mockImplementation((path) => {
        if (path === '/emailQueue/toValidate') {
          return { once: vi.fn().mockResolvedValue({ val: () => ({
            '-k1': { recipientEmail: 'a@test.com', cardId: 'TSK-1', projectId: 'P1', taskTitle: 'T1' }
          }) }) };
        }
        if (path === '/emailQueue/bugFixed' || path === '/emailQueue/validationRevert') {
          return { once: vi.fn().mockResolvedValue({ val: () => null }) };
        }
        return mockRootRef;
      });

      const result = await handleHourlyDigest(getDeps());

      expect(result.emailsSent).toBe(0);
      // Cleanup should be called but with empty keys (nothing was processed successfully)
      expect(mockRootRef.update).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'hourlyDigest: Failed to send digest email',
        expect.objectContaining({ recipient: 'a@test.com' })
      );
    });

    it('should filter by email when filterEmail is provided', async () => {
      setupQueues({
        '-k1': { recipientEmail: 'alice@test.com', cardId: 'TSK-1', projectId: 'P1', taskTitle: 'T1' },
        '-k2': { recipientEmail: 'bob@test.com', cardId: 'TSK-2', projectId: 'P1', taskTitle: 'T2' }
      }, null);

      const result = await handleHourlyDigest(getDeps(), 'alice@test.com');

      // Only Alice gets the email
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail.mock.calls[0][1]).toEqual(['alice@test.com']);
    });

    it('should acquire access token only once (lazy)', async () => {
      setupQueues({
        '-k1': { recipientEmail: 'a@test.com', cardId: 'TSK-1', projectId: 'P1', taskTitle: 'T1' },
        '-k2': { recipientEmail: 'b@test.com', cardId: 'TSK-2', projectId: 'P1', taskTitle: 'T2' }
      }, null);

      await handleHourlyDigest(getDeps());

      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should group tasks by project in the email', async () => {
      setupQueues({
        '-k1': { recipientEmail: 'user@test.com', cardId: 'C4D-TSK-0001', projectId: 'Cinema4D', taskTitle: 'Task A' },
        '-k2': { recipientEmail: 'user@test.com', cardId: 'NTR-TSK-0001', projectId: 'Intranet', taskTitle: 'Task B' },
        '-k3': { recipientEmail: 'user@test.com', cardId: 'C4D-TSK-0002', projectId: 'Cinema4D', taskTitle: 'Task C' }
      }, null);

      await handleHourlyDigest(getDeps());

      const html = mockSendEmail.mock.calls[0][3];
      // Should contain both project sections
      expect(html).toContain('Cinema4D (2)');
      expect(html).toContain('Intranet (1)');
    });

    it('should handle only bug fixed entries', async () => {
      setupQueues(null, {
        '-k1': { recipientEmail: 'creator@test.com', cardId: 'C4D-BUG-0001', projectId: 'Cinema4D', bugTitle: 'Crash bug', developerName: 'Fix Dev' }
      });

      const result = await handleHourlyDigest(getDeps());

      expect(result.emailsSent).toBe(1);
      const html = mockSendEmail.mock.calls[0][3];
      expect(html).toContain('Bugs corregidos');
      expect(html).toContain('Crash bug');
      expect(html).not.toContain('Tareas pendientes de validacion');
    });
  });

  describe('generateDigestHtml', () => {
    it('should generate HTML with validation tasks section', () => {
      const html = generateDigestHtml({
        validationEntries: [
          { key: '-k1', data: { cardId: 'C4D-TSK-0001', projectId: 'Cinema4D', taskTitle: 'My Task', developerName: 'John' } }
        ],
        bugFixedEntries: []
      });

      expect(html).toContain('Tareas pendientes de validacion (1)');
      expect(html).toContain('C4D-TSK-0001');
      expect(html).toContain('My Task');
      expect(html).toContain('John');
      expect(html).toContain('Cinema4D');
    });

    it('should generate HTML with bug fixed section', () => {
      const html = generateDigestHtml({
        validationEntries: [],
        bugFixedEntries: [
          { key: '-k1', data: { cardId: 'NTR-BUG-0005', projectId: 'Intranet', bugTitle: 'UI Bug', developerName: 'Jane' } }
        ]
      });

      expect(html).toContain('Bugs corregidos (1)');
      expect(html).toContain('NTR-BUG-0005');
      expect(html).toContain('UI Bug');
      expect(html).toContain('Jane');
    });

    it('should include task links with correct URL format', () => {
      const html = generateDigestHtml({
        validationEntries: [
          { key: '-k1', data: { cardId: 'C4D-TSK-0001', projectId: 'Cinema4D', taskTitle: 'Task' } }
        ],
        bugFixedEntries: []
      });

      expect(html).toContain('https://test.example.com/adminproject/?projectId=Cinema4D&cardId=C4D-TSK-0001#tasks');
    });

    it('should include bug links with correct URL format', () => {
      const html = generateDigestHtml({
        validationEntries: [],
        bugFixedEntries: [
          { key: '-k1', data: { cardId: 'C4D-BUG-0001', projectId: 'Cinema4D', bugTitle: 'Bug' } }
        ]
      });

      expect(html).toContain('https://test.example.com/adminproject/?projectId=Cinema4D&cardId=C4D-BUG-0001#bugs');
    });

    it('should show total count in header', () => {
      const html = generateDigestHtml({
        validationEntries: [
          { key: '-k1', data: { cardId: 'TSK-1', projectId: 'P1', taskTitle: 'T1' } },
          { key: '-k2', data: { cardId: 'TSK-2', projectId: 'P1', taskTitle: 'T2' } }
        ],
        bugFixedEntries: [
          { key: '-k3', data: { cardId: 'BUG-1', projectId: 'P1', bugTitle: 'B1' } }
        ]
      });

      expect(html).toContain('3 elementos pendientes');
    });

    it('should use singular when only 1 item', () => {
      const html = generateDigestHtml({
        validationEntries: [
          { key: '-k1', data: { cardId: 'TSK-1', projectId: 'P1', taskTitle: 'T1' } }
        ],
        bugFixedEntries: []
      });

      expect(html).toContain('1 elemento pendiente');
      expect(html).not.toContain('elementos');
    });

    it('should handle missing developerName', () => {
      const html = generateDigestHtml({
        validationEntries: [
          { key: '-k1', data: { cardId: 'TSK-1', projectId: 'P1', taskTitle: 'Task' } }
        ],
        bugFixedEntries: []
      });

      expect(html).toContain('-'); // fallback for missing developer
    });

    it('should include reminder instructions', () => {
      const html = generateDigestHtml({
        validationEntries: [
          { key: '-k1', data: { cardId: 'TSK-1', projectId: 'P1', taskTitle: 'T1' } }
        ],
        bugFixedEntries: []
      });

      expect(html).toContain('Recordatorio');
      expect(html).toContain('Done');
      expect(html).toContain('Done&amp;Validated');
    });
  });
});
