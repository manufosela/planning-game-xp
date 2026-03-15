import { Timestamp } from '../entities/timestamp';

export interface HistoryEntry {
  timestamp: Timestamp;
  changedBy: string;
  changedByName: string;
  changes: Record<string, { from: any; to: any }>;
}

export interface HistoryRepository {
  addEntry(projectId: string, cardId: string, entry: HistoryEntry): Promise<void>;
  getHistory(projectId: string, cardId: string): Promise<HistoryEntry[]>;
}
