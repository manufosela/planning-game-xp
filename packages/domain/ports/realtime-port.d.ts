import { Card } from '../entities/card';
import { Notification } from './notification-repository';

export type Unsubscribe = () => void;

export interface RealtimePort {
  subscribeToCards(projectId: string, onUpdate: (cards: Card[]) => void): Unsubscribe;
  subscribeToCard(projectId: string, cardId: string, onUpdate: (card: Card) => void): Unsubscribe;
  subscribeToNotifications(userId: string, onUpdate: (notifs: Notification[]) => void): Unsubscribe;
}
