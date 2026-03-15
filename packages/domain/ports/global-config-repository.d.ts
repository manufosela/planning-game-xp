import { GlobalConfig } from '../entities/global-config';

export interface GlobalConfigRepository {
  getConfigs(type?: string): Promise<GlobalConfig[]>;
  getConfig(type: string, configId: string): Promise<GlobalConfig | null>;
  saveConfig(config: GlobalConfig): Promise<void>;
  deleteConfig(type: string, configId: string): Promise<void>;
}
