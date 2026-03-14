import { Timestamp } from '../entities/timestamp';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'action';
  read: boolean;
  cardRef?: string;
  createdAt: Timestamp;
}

export interface NotificationRepository {
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  markAsRead(userId: string, notifId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
}
