import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.PUBLIC_APP_URL = 'https://test.example.com';

const {
  handleBugFixed,
  sanitizeEmailForKey,
  generateBugFixedEmailHtml
} = require('../../functions/handlers/on-bug-fixed.js');

describe('onBugFixed', () => {
  let mockDb;
  let mockGetAccessToken;
  let mockSendEmail;
  let mockLogger;
  let mockPushRef;
  let mockQueuePushRef;

  beforeEach(() => {
    mockPushRef = { key: '-notifKey', set: vi.fn().mockResolvedValue(undefined) };
    mockQueuePushRef = { key: '-queueKey', set: vi.fn().mockResolvedValue(undefined) };

    mockDb = {
      ref: vi.fn().mockImplementation((path) => {
        if (path === '/emailQueue/bugFixed') {
          return { push: vi.fn().mockReturnValue(mockQueuePushRef) };
        }
        if (path && path.startsWith('/data/developers/')) {
          return { once: vi.fn().mockResolvedValue({ val: () => null }) };
        }
        return {
          once: vi.fn().mockResolvedValue({ val: () => null }),
          push: vi.fn().mockReturnValue(mockPushRef)
        };
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

  describe('handleBugFixed', () => {
    it('should skip non-bug sections', async () => {
      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key1' };
      const before = { status: 'In Progress' };
      const after = { status: 'Fixed', title: 'Not a bug', createdBy: 'user@test.com' };

      const result = await handleBugFixed(params, before, after, getDeps());
      expect(result).toBeNull();
    });

    it('should skip when status does not change to "Fixed"', async () => {
      const params = { projectId: 'C4D', section: 'bugs_C4D', cardId: 'key1' };
      const before = { status: 'Created' };
      const after = { status: 'In Progress', title: 'Bug', createdBy: 'user@test.com' };

      const result = await handleBugFixed(params, before, after, getDeps());
      expect(result).toBeNull();
    });

    it('should skip when status was already "Fixed"', async () => {
      const params = { projectId: 'C4D', section: 'bugs_C4D', cardId: 'key1' };
      const before = { status: 'Fixed' };
      const after = { status: 'Fixed', title: 'Bug', createdBy: 'user@test.com' };

      const result = await handleBugFixed(params, before, after, getDeps());
      expect(result).toBeNull();
    });

    it('should skip when no creator email', async () => {
      const params = { projectId: 'C4D', section: 'bugs_C4D', cardId: 'key1' };
      const before = { status: 'In Progress' };
      const after = { status: 'Fixed', title: 'Bug' };

      const result = await handleBugFixed(params, before, after, getDeps());
      expect(result).toBeNull();
    });

    it('should skip when creator email is invalid', async () => {
      const params = { projectId: 'C4D', section: 'bugs_C4D', cardId: 'key1' };
      const before = { status: 'In Progress' };
      const after = { status: 'Fixed', title: 'Bug', createdBy: 'not-an-email' };

      const result = await handleBugFixed(params, before, after, getDeps());
      expect(result).toBeNull();
    });

    it('should skip AI agent emails', async () => {
      const params = { projectId: 'C4D', section: 'bugs_C4D', cardId: 'key1' };
      const before = { status: 'In Progress' };
      const after = { status: 'Fixed', title: 'Bug', createdBy: 'becaria@ia.local' };

      const result = await handleBugFixed(params, before, after, getDeps());
      expect(result).toBeNull();
    });

    it('should create push notification and queue email when bug transitions to "Fixed"', async () => {
      const params = { projectId: 'C4D', section: 'bugs_C4D', cardId: 'key1' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'Fixed',
        title: 'Crash on save',
        cardId: 'C4D-BUG-0015',
        createdBy: 'reporter@test.com',
        developer: 'dev_001',
        description: 'App crashes when saving'
      };

      const result = await handleBugFixed(params, before, after, getDeps());

      expect(result).toEqual({ notified: 'reporter@test.com' });

      // Push notification created
      expect(mockPushRef.set).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Bug corregido',
        message: 'El bug "Crash on save" ha sido corregido',
        type: 'bug-fixed',
        projectId: 'C4D',
        bugId: 'C4D-BUG-0015'
      }));

      // Email queued (not sent directly)
      expect(mockQueuePushRef.set).toHaveBeenCalledWith(expect.objectContaining({
        type: 'bugFixed',
        recipientEmail: 'reporter@test.com',
        cardId: 'C4D-BUG-0015',
        projectId: 'C4D',
        bugTitle: 'Crash on save'
      }));

      // No direct email
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should still create push notification if queue fails', async () => {
      mockQueuePushRef.set.mockRejectedValue(new Error('Queue error'));

      const params = { projectId: 'C4D', section: 'bugs_C4D', cardId: 'key1' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'Fixed',
        title: 'Bug',
        cardId: 'C4D-BUG-0001',
        createdBy: 'user@test.com',
        developer: 'Nobody'
      };

      const result = await handleBugFixed(params, before, after, getDeps());

      expect(result).toEqual({ notified: 'user@test.com' });
      expect(mockPushRef.set).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'onBugFixed: Failed to queue email',
        expect.objectContaining({ error: 'Queue error' })
      );
    });
  });

  describe('sanitizeEmailForKey', () => {
    it('should sanitize email special characters', () => {
      expect(sanitizeEmailForKey('user.name@test.com')).toBe('user_name@test_com');
    });
  });

  describe('generateBugFixedEmailHtml', () => {
    it('should include bug title and project info', () => {
      const bugData = { title: 'Crash Bug', description: 'Steps...', developer: 'John' };
      const html = generateBugFixedEmailHtml(bugData, 'Cinema4D', 'C4D-BUG-0015');
      expect(html).toContain('Crash Bug');
      expect(html).toContain('Cinema4D');
      expect(html).toContain('C4D-BUG-0015');
      expect(html).toContain('John');
    });

    it('should include bug URL with correct format', () => {
      const bugData = { title: 'Bug', description: '', developer: '' };
      const html = generateBugFixedEmailHtml(bugData, 'C4D', 'C4D-BUG-0001');
      expect(html).toContain('https://test.example.com/adminproject/?projectId=C4D&cardId=C4D-BUG-0001#bugs');
    });
  });
});
