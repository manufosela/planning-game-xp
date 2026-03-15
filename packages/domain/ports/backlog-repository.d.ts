export interface BacklogEntry {
  cardId: string;
  projectId: string;
  cardType: string;
  title: string;
  status: string;
}

export interface BacklogRepository {
  getBacklog(developerId: string): Promise<BacklogEntry[]>;
  reorderBacklog(developerId: string, orderedCardIds: string[]): Promise<void>;
  addToBacklog(developerId: string, entry: BacklogEntry): Promise<void>;
  removeFromBacklog(developerId: string, cardId: string): Promise<void>;
}
