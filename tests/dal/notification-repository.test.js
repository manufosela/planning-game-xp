/**
 * Tests for NotificationRepository
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockAdapter() {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue('notif-id'),
    remove: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    transaction: vi.fn().mockResolvedValue(null),
    multiUpdate: vi.fn().mockResolvedValue(undefined)
  };
}

class BaseRepo {
  constructor(adapter) { this._adapter = adapter; }
  async read(path) { return this._adapter.read(path); }
  async write(path, data) { return this._adapter.write(path, data); }
  async update(path, updates) { return this._adapter.update(path, updates); }
  async push(path, data) { return this._adapter.push(path, data); }
  async remove(path) { return this._adapter.remove(path); }
  subscribe(path, callback) { return this._adapter.subscribe(path, callback); }
}

class TestNotificationRepository {
  constructor(baseRepo) { this._repo = baseRepo; }

  async getNotifications(userKey) { return this._repo.read(`/notifications/${userKey}`); }
  async addNotification(userKey, data) { return this._repo.push(`/notifications/${userKey}`, data); }
  async updateNotification(userKey, id, updates) { await this._repo.update(`/notifications/${userKey}/${id}`, updates); }
  async removeNotification(userKey, id) { await this._repo.remove(`/notifications/${userKey}/${id}`); }
  async markAsRead(userKey, id) { await this._repo.update(`/notifications/${userKey}/${id}`, { read: true }); }
  async getToken(email) { return this._repo.read(`/userTokens/${email}`); }
  async setToken(email, data) { await this._repo.write(`/userTokens/${email}`, data); }
  async removeToken(email) { await this._repo.remove(`/userTokens/${email}`); }
  async getAllTokens() { return this._repo.read('/userTokens'); }
  subscribeToNotifications(userKey, cb) { return this._repo.subscribe(`/notifications/${userKey}`, cb); }
}

describe('NotificationRepository', () => {
  let adapter;
  let repo;

  beforeEach(() => {
    adapter = createMockAdapter();
    const base = new BaseRepo(adapter);
    repo = new TestNotificationRepository(base);
  });

  describe('notification CRUD', () => {
    it('should get notifications for a user', async () => {
      const notifs = { n1: { message: 'Task assigned', read: false } };
      adapter.read.mockResolvedValueOnce(notifs);

      const result = await repo.getNotifications('user123');
      expect(result).toEqual(notifs);
      expect(adapter.read).toHaveBeenCalledWith('/notifications/user123');
    });

    it('should add a notification', async () => {
      const data = { message: 'New task', read: false };
      const id = await repo.addNotification('user123', data);
      expect(id).toBe('notif-id');
      expect(adapter.push).toHaveBeenCalledWith('/notifications/user123', data);
    });

    it('should update a notification', async () => {
      await repo.updateNotification('user123', 'n1', { read: true });
      expect(adapter.update).toHaveBeenCalledWith('/notifications/user123/n1', { read: true });
    });

    it('should remove a notification', async () => {
      await repo.removeNotification('user123', 'n1');
      expect(adapter.remove).toHaveBeenCalledWith('/notifications/user123/n1');
    });

    it('should mark notification as read', async () => {
      await repo.markAsRead('user123', 'n1');
      expect(adapter.update).toHaveBeenCalledWith('/notifications/user123/n1', { read: true });
    });
  });

  describe('FCM token operations', () => {
    it('should get token', async () => {
      const token = { token: 'fcm-token-123', updatedAt: '2026-01-01' };
      adapter.read.mockResolvedValueOnce(token);

      const result = await repo.getToken('test@example_com');
      expect(result).toEqual(token);
      expect(adapter.read).toHaveBeenCalledWith('/userTokens/test@example_com');
    });

    it('should set token', async () => {
      const data = { token: 'fcm-new', updatedAt: '2026-01-02' };
      await repo.setToken('test@example_com', data);
      expect(adapter.write).toHaveBeenCalledWith('/userTokens/test@example_com', data);
    });

    it('should remove token', async () => {
      await repo.removeToken('test@example_com');
      expect(adapter.remove).toHaveBeenCalledWith('/userTokens/test@example_com');
    });

    it('should get all tokens', async () => {
      const tokens = { 'a@b_com': { token: 't1' }, 'c@d_com': { token: 't2' } };
      adapter.read.mockResolvedValueOnce(tokens);

      const result = await repo.getAllTokens();
      expect(result).toEqual(tokens);
    });
  });

  describe('subscriptions', () => {
    it('should subscribe to notifications', () => {
      const cb = vi.fn();
      repo.subscribeToNotifications('user123', cb);
      expect(adapter.subscribe).toHaveBeenCalledWith('/notifications/user123', cb);
    });
  });
});
