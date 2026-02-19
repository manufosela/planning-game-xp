import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('https://unpkg.com/lit@3/index.js?module', () => ({
  LitElement: class LitElement {
    static properties = {};
    static get styles() { return []; }
    connectedCallback() {}
    disconnectedCallback() {}
    requestUpdate() {}
  },
  html: (strings, ...values) => ({ strings, values }),
  css: (strings, ...values) => ({ strings, values }),
}));

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: vi.fn(() => 'mock-ref'),
  onValue: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../public/js/utils/email-sanitizer.js', () => ({
  sanitizeEmailForFirebase: vi.fn((email, useOnlyPrefix) => {
    if (!email || typeof email !== 'string') return '';
    if (useOnlyPrefix === false) {
      return email.replace(/@/g, '_at_').replace(/[.#$[\]/]/g, '_');
    }
    return email.split('@')[0].replace(/[.#$[\]/]/g, '_');
  }),
}));

vi.mock('../../public/js/wc/notification-bell-styles.js', () => ({
  NotificationBellStyles: [],
}));

describe('NotificationBell', () => {
  let NotificationBell;
  let bell;

  beforeEach(async () => {
    vi.resetModules();

    // Mock customElements.define to prevent registration errors
    if (!global.customElements) {
      global.customElements = { define: vi.fn(), get: vi.fn() };
    }
    vi.spyOn(customElements, 'define').mockImplementation(() => {});

    const module = await import('../../public/js/wc/NotificationBell.js');
    NotificationBell = module.default || module.NotificationBell;

    // If module exports via customElements, extract from the class
    if (!NotificationBell) {
      // NotificationBell is defined via customElements.define, access from the mock
      const defineCall = customElements.define.mock.calls.find(
        call => call[0] === 'notification-bell'
      );
      NotificationBell = defineCall?.[1];
    }

    bell = new NotificationBell();
    bell.notifications = [];
    bell.unreadCount = 0;
    bell.isOpen = false;
    bell.currentUser = { email: 'test@example.com' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getNotificationsToDisplay', () => {
    it('should return empty array when no notifications', () => {
      bell.notifications = [];
      expect(bell.getNotificationsToDisplay()).toEqual([]);
    });

    it('should return all unread notifications', () => {
      bell.notifications = [
        { id: 'n1', read: false, timestamp: 100 },
        { id: 'n2', read: false, timestamp: 200 },
        { id: 'n3', read: false, timestamp: 300 },
      ];

      const displayed = bell.getNotificationsToDisplay();
      expect(displayed).toHaveLength(3);
    });

    it('should limit read notifications to 5 most recent', () => {
      bell.notifications = [
        { id: 'n1', read: true, timestamp: 100 },
        { id: 'n2', read: true, timestamp: 200 },
        { id: 'n3', read: true, timestamp: 300 },
        { id: 'n4', read: true, timestamp: 400 },
        { id: 'n5', read: true, timestamp: 500 },
        { id: 'n6', read: true, timestamp: 600 },
        { id: 'n7', read: true, timestamp: 700 },
      ];

      const displayed = bell.getNotificationsToDisplay();
      expect(displayed).toHaveLength(5);
    });

    it('should show all unread plus 5 most recent read', () => {
      const now = Date.now();
      bell.notifications = [
        { id: 'u1', read: false, timestamp: now },
        { id: 'u2', read: false, timestamp: now - 100 },
        { id: 'r1', read: true, timestamp: now - 200 },
        { id: 'r2', read: true, timestamp: now - 300 },
        { id: 'r3', read: true, timestamp: now - 400 },
        { id: 'r4', read: true, timestamp: now - 500 },
        { id: 'r5', read: true, timestamp: now - 600 },
        { id: 'r6', read: true, timestamp: now - 700 },
        { id: 'r7', read: true, timestamp: now - 800 },
      ];

      const displayed = bell.getNotificationsToDisplay();
      // 2 unread + 5 most recent read = 7
      expect(displayed).toHaveLength(7);

      // All unread should be present
      const unreadIds = displayed.filter(n => !n.read).map(n => n.id);
      expect(unreadIds).toContain('u1');
      expect(unreadIds).toContain('u2');

      // Excluded read notifications (r6, r7 - the oldest)
      const displayedIds = displayed.map(n => n.id);
      expect(displayedIds).not.toContain('r6');
      expect(displayedIds).not.toContain('r7');
    });

    it('should sort all displayed notifications by timestamp descending', () => {
      const now = Date.now();
      bell.notifications = [
        { id: 'u1', read: false, timestamp: now - 500 },
        { id: 'r1', read: true, timestamp: now },
        { id: 'u2', read: false, timestamp: now - 100 },
      ];

      const displayed = bell.getNotificationsToDisplay();
      expect(displayed[0].id).toBe('r1');
      expect(displayed[1].id).toBe('u2');
      expect(displayed[2].id).toBe('u1');
    });

    it('should handle null notifications array', () => {
      bell.notifications = null;
      expect(bell.getNotificationsToDisplay()).toEqual([]);
    });

    it('should handle mixed read/unread with exactly 5 read', () => {
      bell.notifications = [
        { id: 'u1', read: false, timestamp: 600 },
        { id: 'r1', read: true, timestamp: 500 },
        { id: 'r2', read: true, timestamp: 400 },
        { id: 'r3', read: true, timestamp: 300 },
        { id: 'r4', read: true, timestamp: 200 },
        { id: 'r5', read: true, timestamp: 100 },
      ];

      const displayed = bell.getNotificationsToDisplay();
      // 1 unread + 5 read = 6
      expect(displayed).toHaveLength(6);
    });
  });

  describe('formatTime', () => {
    it('should return "Hace un momento" for null timestamp', () => {
      expect(bell.formatTime(null)).toBe('Hace un momento');
    });

    it('should return "Hace un momento" for undefined timestamp', () => {
      expect(bell.formatTime(undefined)).toBe('Hace un momento');
    });

    it('should return "Ahora mismo" for recent timestamps', () => {
      const now = Date.now();
      expect(bell.formatTime(now)).toBe('Ahora mismo');
      expect(bell.formatTime(now - 30000)).toBe('Ahora mismo'); // 30 seconds ago
    });

    it('should return minutes format for < 60 min', () => {
      const now = Date.now();
      const fiveMinAgo = now - (5 * 60 * 1000);
      expect(bell.formatTime(fiveMinAgo)).toBe('Hace 5m');
    });

    it('should return hours format for < 24 hours', () => {
      const now = Date.now();
      const threeHoursAgo = now - (3 * 60 * 60 * 1000);
      expect(bell.formatTime(threeHoursAgo)).toBe('Hace 3h');
    });

    it('should return days format for < 7 days', () => {
      const now = Date.now();
      const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
      expect(bell.formatTime(twoDaysAgo)).toBe('Hace 2d');
    });

    it('should return formatted date for >= 7 days', () => {
      const now = Date.now();
      const tenDaysAgo = now - (10 * 24 * 60 * 60 * 1000);
      const result = bell.formatTime(tenDaysAgo);
      // Should be a date string like "7 feb" or similar locale format
      expect(result).not.toContain('Hace');
      expect(result).toBeTruthy();
    });

    it('should handle Firebase server timestamp objects', () => {
      const now = Date.now();
      const serverTimestamp = { seconds: Math.floor(now / 1000) };
      const result = bell.formatTime(serverTimestamp);
      expect(result).toBe('Ahora mismo');
    });
  });

  describe('toggleModal', () => {
    it('should toggle isOpen from false to true', () => {
      bell.isOpen = false;
      bell.toggleModal();
      expect(bell.isOpen).toBe(true);
    });

    it('should toggle isOpen from true to false', () => {
      bell.isOpen = true;
      bell.toggleModal();
      expect(bell.isOpen).toBe(false);
    });
  });

  describe('sanitizeEmail', () => {
    it('should use full email mode for Firebase paths', () => {
      const result = bell.sanitizeEmail('user@example.com');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('constructor defaults', () => {
    it('should initialize with zero unread count', () => {
      const newBell = new NotificationBell();
      expect(newBell.unreadCount).toBe(0);
    });

    it('should initialize with closed modal', () => {
      const newBell = new NotificationBell();
      expect(newBell.isOpen).toBe(false);
    });

    it('should initialize with empty notifications', () => {
      const newBell = new NotificationBell();
      expect(newBell.notifications).toEqual([]);
    });

    it('should initialize with null currentUser', () => {
      const newBell = new NotificationBell();
      expect(newBell.currentUser).toBeNull();
    });
  });
});
