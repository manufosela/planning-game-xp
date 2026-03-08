/**
 * @fileoverview Notification repository interface for push notifications and FCM tokens.
 *
 * Path patterns:
 *   /notifications/{userKey}/{notificationId}
 *   /userTokens/{sanitizedEmail}
 *
 * @module shared/dal/notification-repository
 */

/**
 * @abstract
 */
export class NotificationRepository {
  /**
   * @param {import('./base-repository.js').BaseRepository} baseRepo
   */
  constructor(baseRepo) {
    if (new.target === NotificationRepository) {
      throw new Error('NotificationRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  /**
   * Get all notifications for a user.
   * @param {string} userKey - Sanitized user identifier
   * @returns {Promise<Object|null>} Map of notificationId -> notificationData
   */
  async getNotifications(userKey) {
    throw new Error('Not implemented: getNotifications()');
  }

  /**
   * Add a notification for a user.
   * @param {string} userKey
   * @param {Object} data
   * @returns {Promise<string>} Generated notification ID
   */
  async addNotification(userKey, data) {
    throw new Error('Not implemented: addNotification()');
  }

  /**
   * Update a notification.
   * @param {string} userKey
   * @param {string} notificationId
   * @param {Object} updates
   * @returns {Promise<void>}
   */
  async updateNotification(userKey, notificationId, updates) {
    throw new Error('Not implemented: updateNotification()');
  }

  /**
   * Remove a notification.
   * @param {string} userKey
   * @param {string} notificationId
   * @returns {Promise<void>}
   */
  async removeNotification(userKey, notificationId) {
    throw new Error('Not implemented: removeNotification()');
  }

  /**
   * Mark a notification as read.
   * @param {string} userKey
   * @param {string} notificationId
   * @returns {Promise<void>}
   */
  async markAsRead(userKey, notificationId) {
    throw new Error('Not implemented: markAsRead()');
  }

  /**
   * Get FCM token for a user.
   * @param {string} sanitizedEmail
   * @returns {Promise<Object|null>}
   */
  async getToken(sanitizedEmail) {
    throw new Error('Not implemented: getToken()');
  }

  /**
   * Set FCM token for a user.
   * @param {string} sanitizedEmail
   * @param {Object} tokenData
   * @returns {Promise<void>}
   */
  async setToken(sanitizedEmail, tokenData) {
    throw new Error('Not implemented: setToken()');
  }

  /**
   * Remove FCM token for a user.
   * @param {string} sanitizedEmail
   * @returns {Promise<void>}
   */
  async removeToken(sanitizedEmail) {
    throw new Error('Not implemented: removeToken()');
  }

  /**
   * Get all FCM tokens.
   * @returns {Promise<Object|null>}
   */
  async getAllTokens() {
    throw new Error('Not implemented: getAllTokens()');
  }

  /**
   * Set (overwrite) a specific notification by ID.
   * @param {string} userKey
   * @param {string} notificationId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async setNotification(userKey, notificationId, data) {
    throw new Error('Not implemented: setNotification()');
  }

  /**
   * Get all notifications for all users (root level).
   * @returns {Promise<Object|null>} Map of userKey -> { notificationId -> data }
   */
  async getAllNotificationsRoot() {
    throw new Error('Not implemented: getAllNotificationsRoot()');
  }

  /**
   * Subscribe to notifications for a user.
   * @param {string} userKey
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribeToNotifications(userKey, callback) {
    throw new Error('Not implemented: subscribeToNotifications()');
  }

  static get notificationsPath() { return '/notifications'; }
  static get tokensPath() { return '/userTokens'; }

  static buildNotificationsPath(userKey) { return `/notifications/${userKey}`; }
  static buildNotificationPath(userKey, notificationId) { return `/notifications/${userKey}/${notificationId}`; }
  static buildTokenPath(sanitizedEmail) { return `/userTokens/${sanitizedEmail}`; }
}
