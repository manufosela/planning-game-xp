import { Timestamp } from './timestamp';

export type ConfigType = 'agent' | 'prompt' | 'instruction' | 'guideline';

export interface GlobalConfig {
  id?: string;
  type: ConfigType;
  name: string;
  description: string;
  content: string;
  category?: string;
  targetFile?: string;
  version: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}
