import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRef = vi.fn(() => 'mock-ref');
const mockPush = vi.fn(() => ({ key: 'mock-notif-id' }));
const mockSet = vi.fn();

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: (...args) => mockRef(...args),
  push: (...args) => mockPush(...args),
  set: (...args) => mockSet(...args),
  onValue: vi.fn(),
  update: vi.fn(),
  databaseFirestore: {},
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
  auth: { currentUser: { email: 'testuser@example.com' } },
  firebaseConfig: {},
  superAdminEmail: 'superadmin@example.com',
}));

vi.mock('../../public/js/utils/email-sanitizer.js', () => ({
  sanitizeEmailForFirebase: vi.fn((email, useOnlyPrefix) => {
    if (!email || typeof email !== 'string') return '';
    if (useOnlyPrefix === false) {
      return email.replace(/@/g, '_at_').replace(/[.#$[\]/]/g, '_');
    }
    const prefix = email.includes('@') ? email.split('@')[0] : email;
    return prefix.replace(/[.#$[\]/]/g, '_');
  }),
}));

vi.mock('../../public/js/services/push-notification-service.js', () => ({
  pushNotificationServicePromise: Promise.resolve({
    isUserActive: vi.fn(() => true),
    sendPushNotification: vi.fn(),
  }),
}));

vi.mock('../../public/js/services/entity-directory-service.js', () => ({
  entityDirectoryService: {
    waitForInit: vi.fn().mockResolvedValue(undefined),
    resolveDeveloperEmail: vi.fn((id) => {
      const devEmails = {
        dev_001: 'dev1@example.com',
        dev_010: 'manu@example.com',
      };
      return devEmails[id] || null;
    }),
    resolveStakeholderEmail: vi.fn((id) => {
      const stkEmails = {
        stk_001: 'stk1@example.com',
      };
      return stkEmails[id] || null;
    }),
  },
}));

vi.mock('../../public/js/constants/app-constants.js', () => ({
  APP_CONSTANTS: {
    APP_URL: 'https://planning-game.example.com',
  },
}));

describe('NotificationService', () => {
  let NotificationService;
  let service;

  beforeEach(async () => {
    vi.resetModules();

    mockRef.mockReturnValue('mock-ref');
    mockPush.mockReturnValue({ key: 'mock-notif-id' });
    mockSet.mockResolvedValue(undefined);

    const module = await import('../../public/js/services/notification-service.js');
    NotificationService = module.NotificationService;
    service = new NotificationService();
  });

  describe('sanitizeEmail', () => {
    it('should use full email mode (useOnlyPrefix=false)', () => {
      const result = service.sanitizeEmail('user@example.com');
      expect(result).toBeTruthy();
      expect(result).toContain('_at_');
    });
  });

  describe('getUserKey', () => {
    it('should sanitize email directly when input contains @', async () => {
      const key = await service.getUserKey('user@example.com');
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    });

    it('should resolve developer ID to email', async () => {
      const key = await service.getUserKey('dev_001');
      expect(key).toBeTruthy();
    });

    it('should resolve stakeholder ID to email', async () => {
      const key = await service.getUserKey('stk_001');
      expect(key).toBeTruthy();
    });

    it('should create name-based key for unknown identifiers', async () => {
      const key = await service.getUserKey('Unknown User');
      expect(key).toBe('unknown_user');
    });

    it('should normalize accented characters in name-based keys', async () => {
      const key = await service.getUserKey('José García');
      expect(key).toBe('jose_garcia');
    });

    it('should remove non-alphanumeric characters from name-based keys', async () => {
      const key = await service.getUserKey('User (admin)');
      expect(key).toBe('user_admin');
    });
  });

  describe('createNotification', () => {
    it('should create notification with correct data structure', async () => {
      const notification = {
        title: 'Test Notification',
        message: 'Test body',
        type: 'info',
      };

      const result = await service.createNotification('user@example.com', notification);

      expect(result).toMatchObject({
        id: 'mock-notif-id',
        title: 'Test Notification',
        message: 'Test body',
        type: 'info',
        read: false,
      });
      expect(result.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should set default title when not provided', async () => {
      const result = await service.createNotification('user@example.com', { message: 'msg' });
      expect(result.title).toBe('Notificación');
    });

    it('should set default message from body field', async () => {
      const result = await service.createNotification('user@example.com', { title: 'T', body: 'Body text' });
      expect(result.message).toBe('Body text');
    });

    it('should set default message when neither message nor body provided', async () => {
      const result = await service.createNotification('user@example.com', { title: 'T' });
      expect(result.message).toBe('Sin mensaje');
    });

    it('should include URL when provided', async () => {
      const notification = {
        title: 'Test',
        message: 'msg',
        url: 'https://example.com/task/123',
      };
      const result = await service.createNotification('user@example.com', notification);
      expect(result.url).toBe('https://example.com/task/123');
    });

    it('should set url to null when not provided', async () => {
      const result = await service.createNotification('user@example.com', { title: 'T', message: 'm' });
      expect(result.url).toBeNull();
    });

    it('should call Firebase push and set', async () => {
      await service.createNotification('user@example.com', { title: 'T', message: 'm' });
      expect(mockPush).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalled();
    });

    it('should throw when Firebase fails', async () => {
      mockSet.mockRejectedValue(new Error('DB error'));
      await expect(service.createNotification('user@example.com', { title: 'T' }))
        .rejects.toThrow('DB error');
    });
  });

  describe('generateItemUrl', () => {
    it('should generate URL for tasks with #tasks hash', () => {
      const url = service.generateItemUrl('task', 'PLN-TSK-0001', 'PlanningGame');
      expect(url).toContain('projectId=PlanningGame');
      expect(url).toContain('cardId=PLN-TSK-0001');
      expect(url).toContain('#tasks');
    });

    it('should generate URL for bugs with #bugs hash', () => {
      const url = service.generateItemUrl('bug', 'PLN-BUG-0001', 'PlanningGame');
      expect(url).toContain('#bugs');
    });

    it('should generate URL for epics with #epics hash', () => {
      const url = service.generateItemUrl('epic', 'PLN-EPC-0001', 'PlanningGame');
      expect(url).toContain('#epics');
    });

    it('should generate URL for sprints with #sprints hash', () => {
      const url = service.generateItemUrl('sprint', 'PLN-SPR-0001', 'PlanningGame');
      expect(url).toContain('#sprints');
    });

    it('should generate URL without hash for unknown types', () => {
      const url = service.generateItemUrl('proposal', 'PLN-PRP-0001', 'PlanningGame');
      expect(url).toContain('cardId=PLN-PRP-0001');
      expect(url).not.toContain('#');
    });

    it('should encode projectId in URL', () => {
      const url = service.generateItemUrl('task', 'TSK-001', 'My Project');
      expect(url).toContain('projectId=My%20Project');
    });
  });

  describe('notifyUserAssignment', () => {
    it('should create assignment notification with URL', async () => {
      const result = await service.notifyUserAssignment(
        'dev@example.com', 'admin@example.com', 'task', 'Fix bug', 'PLN-TSK-0001', 'PlanningGame'
      );

      expect(result.title).toBe('Nuevo task asignado');
      expect(result.message).toContain('admin@example.com');
      expect(result.message).toContain('Fix bug');
      expect(result.type).toBe('assignment');
    });

    it('should set taskId for task assignments', async () => {
      const result = await service.notifyUserAssignment(
        'dev@example.com', 'admin@example.com', 'task', 'Fix bug', 'PLN-TSK-0001', 'PlanningGame'
      );
      expect(result.taskId).toBe('PLN-TSK-0001');
    });

    it('should set bugId for bug assignments', async () => {
      const result = await service.notifyUserAssignment(
        'dev@example.com', 'admin@example.com', 'bug', 'UI broken', 'PLN-BUG-0001', 'PlanningGame'
      );
      expect(result.bugId).toBe('PLN-BUG-0001');
    });
  });

  describe('notifyUserUnassignment', () => {
    it('should create unassignment notification with URL', async () => {
      const result = await service.notifyUserUnassignment(
        'dev@example.com', 'admin@example.com', 'task', 'Fix bug', 'PLN-TSK-0001', 'PlanningGame'
      );

      expect(result.title).toBe('task desasignado');
      expect(result.message).toContain('desasignado');
      expect(result.type).toBe('unassignment');
    });
  });
});
