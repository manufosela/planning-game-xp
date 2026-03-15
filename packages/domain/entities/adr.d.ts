import { Timestamp } from './timestamp';

export type AdrStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';

export interface ADR {
  adrId?: string;
  projectId: string;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status: AdrStatus;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}
