import { Timestamp } from './timestamp';

export interface Project {
  name: string;
  abbreviation: string;
  description?: string;
  repoUrl?: string;
  scoringSystem: '1-5' | 'fibonacci';
  archived: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  developerCount: number;
  stakeholderCount: number;
}
