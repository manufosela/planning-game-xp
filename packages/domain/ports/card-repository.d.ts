import { Card, CardType } from '../entities/card';

export interface QueryFilters {
  type?: CardType;
  status?: string;
  year?: number;
  developer?: string;
  sprint?: string;
  epic?: string;
}

export interface CardRepository {
  getCards(projectId: string, filters?: QueryFilters): Promise<Card[]>;
  getCard(projectId: string, cardId: string): Promise<Card | null>;
  saveCard(projectId: string, card: Card): Promise<void>;
  deleteCard(projectId: string, cardId: string): Promise<void>;
  getNextCardNumber(projectId: string, type: CardType): Promise<number>;
  moveToTrash(projectId: string, cardId: string): Promise<void>;
  restoreFromTrash(projectId: string, cardId: string): Promise<void>;
}
