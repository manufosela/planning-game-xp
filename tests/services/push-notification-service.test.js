import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockRef = vi.fn(() => 'mock-ref');
const mockPush = vi.fn(() => ({ key: 'mock-notification-id' }));
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockOnValue = vi.fn();
const mockServerTimestamp = vi.fn(() => ({ '.sv': 'timestamp' }));
const mockQuery = vi.fn(() => 'mock-query');
const mockOrderByChild = vi.fn(() => 'mock-order');

vi.mock('https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js', () => ({
  ref: (...args) => mockRef(...args),
  push: (...args) => mockPush(...args),
  set: (...args) => mockSet(...args),
  get: (...args) => mockGet(...args),
  onValue: (...args) => mockOnValue(...args),
  serverTimestamp: () => mockServerTimestamp(),
  query: (...args) => mockQuery(...args),
  orderByChild: (...args) => mockOrderByChild(...args),
}));

vi.mock('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  app: {},
  vapidKey: 'test-vapid-key',
}));

vi.mock('../../public/js/utils/email-sanitizer.js', () => ({
  sanitizeEmailForFirebase: vi.fn((email, useOnlyPrefix) => {
    if (!email || typeof email !== 'string') return '';
    if (useOnlyPrefix === false) {
      return email.replace(/[.#$[\]/]/g, '_').replace(/@/g, '_at_');
    }
    const prefix = email.includes('@') ? email.split('@')[0] : email;
    return prefix.replace(/[.#$[\]/]/g, '_');
  }),
}));

vi.mock('../../public/js/services/entity-directory-service.js', () => ({
  entityDirectoryService: {
    waitForInit: vi.fn(),
    resolveDeveloperEmail: vi.fn(),
    resolveStakeholderEmail: vi.fn(),
  },
}));

function setVisibilityState(state) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  });
}

describe('PushNotificationService', () => {
  let service;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();

    mockRef.mockReturnValue('mock-ref');
    mockPush.mockReturnValue({ key: 'mock-notification-id' });
    mockSet.mockResolvedValue(undefined);
    mockGet.mockResolvedValue({ exists: () => false });
    mockOnValue.mockImplementation(() => vi.fn());

    // Mock visibilityState as configurable
    setVisibilityState('visible');

    // Mock Notification API
    global.Notification = { requestPermission: vi.fn().mockResolvedValue('denied'), permission: 'denied' };
    global.window.currentUser = { email: 'test@example.com' };
    global.window.pushNotificationService = null;

    const module = await import('../../public/js/services/push-notification-service.js');
    const PushNotificationService = module.PushNotificationService || module.default;

    // If the class isn't exported directly, create instance from the constructor on window
    if (PushNotificationService) {
      service = new PushNotificationService();
    } else {
      // Fallback: the module sets window.pushNotificationService in constructor
      service = window.pushNotificationService;
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (service?.destroy) {
      service.destroy();
    }
  });

  describe('sanitizeEmail', () => {
    it('should sanitize email using full email mode', () => {
      const result = service.sanitizeEmail('user@example.com');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle email with special characters', () => {
      const result = service.sanitizeEmail('user.name+tag@example.co.uk');
      expect(result).toBeTruthy();
    });
  });

  describe('createNotification', () => {
    it('should create notification with correct data structure', async () => {
      const notification = {
        title: 'Test Title',
        message: 'Test message',
        type: 'info',
      };

      const result = await service.createNotification('user@example.com', notification);

      expect(result).toMatchObject({
        id: 'mock-notification-id',
        title: 'Test Title',
        message: 'Test message',
        type: 'info',
        read: false,
      });
      expect(result.expiryDate).toBeGreaterThan(Date.now());
      expect(result.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should set default type to info when not provided', async () => {
      const notification = { title: 'Test', message: 'msg' };
      const result = await service.createNotification('user@example.com', notification);
      expect(result.type).toBe('info');
    });

    it('should set notification as unread by default', async () => {
      const notification = { title: 'Test', message: 'msg' };
      const result = await service.createNotification('user@example.com', notification);
      expect(result.read).toBe(false);
    });

    it('should set 7-day expiry date', async () => {
      const notification = { title: 'Test', message: 'msg' };
      const result = await service.createNotification('user@example.com', notification);

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expectedExpiry = result.createdAt + sevenDaysMs;
      expect(result.expiryDate).toBe(expectedExpiry);
    });

    it('should include projectId and taskId when provided', async () => {
      const notification = {
        title: 'Task assigned',
        message: 'You got a task',
        projectId: 'PLN',
        taskId: 'PLN-TSK-0001',
      };
      const result = await service.createNotification('user@example.com', notification);
      expect(result.projectId).toBe('PLN');
      expect(result.taskId).toBe('PLN-TSK-0001');
    });

    it('should set null for optional fields when not provided', async () => {
      const notification = { title: 'Test', message: 'msg' };
      const result = await service.createNotification('user@example.com', notification);
      expect(result.projectId).toBeNull();
      expect(result.taskId).toBeNull();
      expect(result.bugId).toBeNull();
    });

    it('should throw when Firebase set fails', async () => {
      mockSet.mockRejectedValue(new Error('Permission denied'));

      const notification = { title: 'Test', message: 'msg' };
      await expect(service.createNotification('user@example.com', notification))
        .rejects.toThrow('Permission denied');
    });
  });

  describe('markAsRead', () => {
    it('should set read to true for the notification', async () => {
      await service.markAsRead('user@example.com', 'notif-123');
      expect(mockSet).toHaveBeenCalled();
    });

    it('should use correct Firebase path with sanitized email', async () => {
      await service.markAsRead('user@example.com', 'notif-123');
      const pathCall = mockRef.mock.calls.find(call => {
        const path = call[1] || '';
        return typeof path === 'string' && path.includes('notifications/') && path.includes('/read');
      });
      expect(pathCall).toBeTruthy();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      const mockSnapshot = {
        exists: () => true,
        forEach: (cb) => {
          cb({ key: 'n1', val: () => ({ read: false, title: 'Unread 1' }) });
          cb({ key: 'n2', val: () => ({ read: true, title: 'Read 1' }) });
          cb({ key: 'n3', val: () => ({ read: false, title: 'Unread 2' }) });
        },
      };
      mockOnValue.mockImplementation((refArg, cb, opts) => {
        if (opts?.onlyOnce) cb(mockSnapshot);
        else cb(mockSnapshot);
        return vi.fn();
      });

      mockSet.mockClear();
      await service.markAllAsRead('user@example.com');

      const setCalls = mockSet.mock.calls.filter(call => call[1] === true);
      expect(setCalls).toHaveLength(2);
    });

    it('should do nothing when no notifications exist', async () => {
      const mockSnapshot = { exists: () => false };
      mockOnValue.mockImplementation((refArg, cb, opts) => {
        if (opts?.onlyOnce) cb(mockSnapshot);
        return vi.fn();
      });

      mockSet.mockClear();
      await service.markAllAsRead('user@example.com');
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should do nothing when all notifications are already read', async () => {
      const mockSnapshot = {
        exists: () => true,
        forEach: (cb) => {
          cb({ key: 'n1', val: () => ({ read: true }) });
          cb({ key: 'n2', val: () => ({ read: true }) });
        },
      };
      mockOnValue.mockImplementation((refArg, cb, opts) => {
        if (opts?.onlyOnce) cb(mockSnapshot);
        return vi.fn();
      });

      mockSet.mockClear();
      await service.markAllAsRead('user@example.com');
      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  describe('clearReadNotifications', () => {
    it('should delete read notifications by setting to null', async () => {
      const mockSnapshot = {
        exists: () => true,
        forEach: (cb) => {
          cb({ key: 'n1', val: () => ({ read: true }) });
          cb({ key: 'n2', val: () => ({ read: false }) });
          cb({ key: 'n3', val: () => ({ read: true }) });
        },
      };
      mockOnValue.mockImplementation((refArg, cb, opts) => {
        if (opts?.onlyOnce) cb(mockSnapshot);
        return vi.fn();
      });

      mockSet.mockClear();
      await service.clearReadNotifications('user@example.com');

      const nullCalls = mockSet.mock.calls.filter(call => call[1] === null);
      expect(nullCalls).toHaveLength(2);
    });
  });

  describe('clearExpiredNotifications', () => {
    it('should delete expired notifications', async () => {
      const now = Date.now();
      const mockSnapshot = {
        exists: () => true,
        forEach: (cb) => {
          cb({ key: 'n1', val: () => ({ expiryDate: now - 1000, title: 'Expired' }) });
          cb({ key: 'n2', val: () => ({ expiryDate: now + 100000, title: 'Valid' }) });
          cb({ key: 'n3', val: () => ({ title: 'No expiry' }) });
        },
      };
      mockOnValue.mockImplementation((refArg, cb, opts) => {
        if (opts?.onlyOnce) cb(mockSnapshot);
        return vi.fn();
      });

      mockSet.mockClear();
      const count = await service.clearExpiredNotifications('user@example.com');

      expect(count).toBe(1);
      const nullCalls = mockSet.mock.calls.filter(call => call[1] === null);
      expect(nullCalls).toHaveLength(1);
    });

    it('should return 0 when no expired notifications', async () => {
      const now = Date.now();
      const mockSnapshot = {
        exists: () => true,
        forEach: (cb) => {
          cb({ key: 'n1', val: () => ({ expiryDate: now + 100000 }) });
        },
      };
      mockOnValue.mockImplementation((refArg, cb, opts) => {
        if (opts?.onlyOnce) cb(mockSnapshot);
        return vi.fn();
      });

      const count = await service.clearExpiredNotifications('user@example.com');
      expect(count).toBe(0);
    });

    it('should return 0 when no notifications exist', async () => {
      const mockSnapshot = { exists: () => false };
      mockOnValue.mockImplementation((refArg, cb, opts) => {
        if (opts?.onlyOnce) cb(mockSnapshot);
        return vi.fn();
      });

      const count = await service.clearExpiredNotifications('user@example.com');
      expect(count).toBe(0);
    });
  });

  describe('notifyUserAssignment', () => {
    it('should create assignment notification with correct fields', async () => {
      const result = await service.notifyUserAssignment(
        'dev@example.com', 'admin@example.com', 'task', 'Fix login bug', 'PLN-TSK-0001', 'PlanningGame'
      );

      expect(result.title).toBe('Nuevo task asignado');
      expect(result.message).toContain('admin@example.com');
      expect(result.message).toContain('Fix login bug');
      expect(result.type).toBe('assignment');
      expect(result.taskId).toBe('PLN-TSK-0001');
    });

    it('should set bugId for bug type assignments', async () => {
      const result = await service.notifyUserAssignment(
        'dev@example.com', 'admin@example.com', 'bug', 'UI broken', 'PLN-BUG-0001', 'PlanningGame'
      );

      expect(result.bugId).toBe('PLN-BUG-0001');
      expect(result.taskId).toBeNull();
    });
  });

  describe('notifyUserUnassignment', () => {
    it('should create unassignment notification with correct fields', async () => {
      const result = await service.notifyUserUnassignment(
        'dev@example.com', 'admin@example.com', 'task', 'Fix login bug', 'PLN-TSK-0001', 'PlanningGame'
      );

      expect(result.title).toBe('task desasignado');
      expect(result.message).toContain('desasignado');
      expect(result.type).toBe('unassignment');
    });
  });

  describe('isUserActive', () => {
    it('should return true when document is visible', () => {
      setVisibilityState('visible');
      expect(service.isUserActive()).toBe(true);
    });

    it('should return false when document is hidden', () => {
      setVisibilityState('hidden');
      expect(service.isUserActive()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should clear all subscriptions', () => {
      const unsubFn = vi.fn();
      service.userNotificationRefs.set('user1', { unsubscribe: unsubFn });
      service.userNotificationRefs.set('user2', { unsubscribe: unsubFn });

      service.destroy();

      expect(unsubFn).toHaveBeenCalledTimes(2);
      expect(service.userNotificationRefs.size).toBe(0);
    });

    it('should clear cleanup interval', () => {
      service.cleanupInterval = setInterval(() => {}, 1000);
      service.destroy();
      expect(service.cleanupInterval).toBeNull();
    });
  });

  describe('subscribeToNotifications', () => {
    it('should filter expired notifications from callback', async () => {
      const now = Date.now();
      let callbackResult;

      mockOnValue.mockImplementation((refArg, cb) => {
        const mockSnapshot = {
          exists: () => true,
          forEach: (fn) => {
            fn({ key: 'n1', val: () => ({ title: 'Valid', timestamp: now, expiryDate: now + 100000 }) });
            fn({ key: 'n2', val: () => ({ title: 'Expired', timestamp: now - 1000, expiryDate: now - 500 }) });
            fn({ key: 'n3', val: () => ({ title: 'No expiry', timestamp: now - 2000 }) });
          },
        };
        cb(mockSnapshot);
        return vi.fn();
      });

      await service.subscribeToNotifications('user@example.com', (notifications) => {
        callbackResult = notifications;
      });

      expect(callbackResult).toHaveLength(2);
      expect(callbackResult.map(n => n.title)).toContain('Valid');
      expect(callbackResult.map(n => n.title)).toContain('No expiry');
      expect(callbackResult.map(n => n.title)).not.toContain('Expired');
    });

    it('should sort notifications by timestamp descending', async () => {
      const now = Date.now();
      let callbackResult;

      mockOnValue.mockImplementation((refArg, cb) => {
        const mockSnapshot = {
          exists: () => true,
          forEach: (fn) => {
            fn({ key: 'n1', val: () => ({ title: 'Old', timestamp: now - 5000 }) });
            fn({ key: 'n2', val: () => ({ title: 'New', timestamp: now }) });
            fn({ key: 'n3', val: () => ({ title: 'Middle', timestamp: now - 2000 }) });
          },
        };
        cb(mockSnapshot);
        return vi.fn();
      });

      await service.subscribeToNotifications('user@example.com', (notifications) => {
        callbackResult = notifications;
      });

      expect(callbackResult[0].title).toBe('New');
      expect(callbackResult[1].title).toBe('Middle');
      expect(callbackResult[2].title).toBe('Old');
    });
  });
});
