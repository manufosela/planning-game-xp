/**
 * @fileoverview RTDB implementation of NotificationRepository.
 *
 * @module shared/dal/rtdb/rtdb-notification-repository
 */

import { NotificationRepository } from '../notification-repository.js';

export class RtdbNotificationRepository extends NotificationRepository {
  /**
   * @param {import('./base-rtdb-repository.js').RtdbBaseRepository} baseRepo
   */
  constructor(baseRepo) {
    super(baseRepo);
  }

  async getNotifications(userKey) {
    return this._repo.read(NotificationRepository.buildNotificationsPath(userKey));
  }

  async addNotification(userKey, data) {
    return this._repo.push(NotificationRepository.buildNotificationsPath(userKey), data);
  }

  async updateNotification(userKey, notificationId, updates) {
    await this._repo.update(
      NotificationRepository.buildNotificationPath(userKey, notificationId),
      updates
    );
  }

  async removeNotification(userKey, notificationId) {
    await this._repo.remove(
      NotificationRepository.buildNotificationPath(userKey, notificationId)
    );
  }

  async markAsRead(userKey, notificationId) {
    await this._repo.update(
      NotificationRepository.buildNotificationPath(userKey, notificationId),
      { read: true }
    );
  }

  async getToken(sanitizedEmail) {
    return this._repo.read(NotificationRepository.buildTokenPath(sanitizedEmail));
  }

  async setToken(sanitizedEmail, tokenData) {
    await this._repo.write(NotificationRepository.buildTokenPath(sanitizedEmail), tokenData);
  }

  async removeToken(sanitizedEmail) {
    await this._repo.remove(NotificationRepository.buildTokenPath(sanitizedEmail));
  }

  async getAllTokens() {
    return this._repo.read(NotificationRepository.tokensPath);
  }

  async setNotification(userKey, notificationId, data) {
    await this._repo.write(
      NotificationRepository.buildNotificationPath(userKey, notificationId),
      data
    );
  }

  async getAllNotificationsRoot() {
    return this._repo.read(NotificationRepository.notificationsPath);
  }

  subscribeToNotifications(userKey, callback) {
    return this._repo.subscribe(NotificationRepository.buildNotificationsPath(userKey), callback);
  }
}
