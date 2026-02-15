import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.PUBLIC_APP_URL = 'https://test.example.com';

const {
  handleBugFixed,
  sanitizeEmailForKey,
  generateBugFixedEmailHtml
} = require('../../functions/handlers/on-bug-fixed.js');

describe('onBugFixed', () => {
  let mockDb;
  let mockSendEmail;
  let mockLogger;
  let mockPushRef;

  beforeEach(() => {
    mockPushRef = { set: vi.fn().mockResolvedValue(undefined), key: 'notif-1' };
    mockDb = {
      ref: vi.fn().mockReturnValue({
        push: vi.fn().mockReturnValue(mockPushRef)
      })
    };
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
      sendEmail: mockSendEmail,
      logger: mockLogger
    };
  }

  describe('sanitizeEmailForKey', () => {
    it('should sanitize full email key', () => {
      expect(sanitizeEmailForKey('john.doe@example.com')).toBe('john_doe@example_com');
    });
  });

  describe('generateBugFixedEmailHtml', () => {
    it('should include bug data and URL', () => {
      const html = generateBugFixedEmailHtml(
        { title: 'Broken flow', description: 'desc', developer: 'dev1' },
        'PRJ',
        'PRJ-BUG-1'
      );
      expect(html).toContain('Broken flow');
      expect(html).toContain('PRJ');
      expect(html).toContain('PRJ-BUG-1');
      expect(html).toContain('https://test.example.com/adminproject/?projectId=PRJ&cardId=PRJ-BUG-1#bugs');
    });
  });

  describe('handleBugFixed', () => {
    it('should skip non-bug sections', async () => {
      const result = await handleBugFixed(
        { projectId: 'PRJ', section: 'tasks_PRJ', cardId: 'key1' },
        { status: 'Assigned' },
        { status: 'Fixed', createdBy: 'user@example.com' },
        getDeps()
      );
      expect(result).toBeNull();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should create notification and send email when bug transitions to Fixed', async () => {
      const result = await handleBugFixed(
        { projectId: 'PRJ', section: 'bugs_PRJ', cardId: 'key1' },
        { status: 'Assigned' },
        {
          status: 'Fixed',
          cardId: 'PRJ-BUG-1',
          title: 'Bug title',
          createdBy: 'creator@example.com'
        },
        getDeps()
      );

      expect(result).toEqual({ notified: 'creator@example.com' });
      expect(mockPushRef.set).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        ['creator@example.com'],
        '[PRJ] Bug corregido: Bug title',
        expect.any(String)
      );
    });

    it('should not send email to ai agents', async () => {
      const result = await handleBugFixed(
        { projectId: 'PRJ', section: 'bugs_PRJ', cardId: 'key1' },
        { status: 'Assigned' },
        {
          status: 'Fixed',
          title: 'Bug title',
          createdBy: 'becaria@ia.local'
        },
        getDeps()
      );

      expect(result).toBeNull();
      expect(mockPushRef.set).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
