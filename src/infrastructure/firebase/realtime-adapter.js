import {
  subscribeToCards as rtSubscribeToCards,
  subscribeToCard as rtSubscribeToCard,
  subscribeToNotifications as rtSubscribeToNotifications,
} from '../../lib/realtime.js';

/**
 * Firebase implementation of RealtimePort.
 * @implements {import('@pgv2/domain/ports').RealtimePort}
 */
export class FirebaseRealtimeAdapter {
  /**
   * @param {string} projectId
   * @param {(cards: import('@pgv2/domain/ports').Card[]) => void} onUpdate
   * @returns {import('@pgv2/domain/ports').Unsubscribe}
   */
  subscribeToCards(projectId, onUpdate) {
    return rtSubscribeToCards(projectId, onUpdate);
  }

  /**
   * @param {string} projectId
   * @param {string} cardId
   * @param {(card: import('@pgv2/domain/ports').Card) => void} onUpdate
   * @returns {import('@pgv2/domain/ports').Unsubscribe}
   */
  subscribeToCard(projectId, cardId, onUpdate) {
    return rtSubscribeToCard(projectId, cardId, onUpdate);
  }

  /**
   * @param {string} userId
   * @param {(notifs: import('@pgv2/domain/ports').Notification[]) => void} onUpdate
   * @returns {import('@pgv2/domain/ports').Unsubscribe}
   */
  subscribeToNotifications(userId, onUpdate) {
    return rtSubscribeToNotifications(userId, onUpdate);
  }
}
