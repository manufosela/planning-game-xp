import {
  getConfigs as fsGetConfigs,
  getConfig as fsGetConfig,
  createConfig,
  updateConfig,
  deleteConfig as fsDeleteConfig,
} from '../../lib/firestore.js';

/**
 * Firebase implementation of GlobalConfigRepository port.
 * @implements {import('@pgv2/domain/ports').GlobalConfigRepository}
 */
export class FirebaseGlobalConfigRepository {
  /**
   * @param {string} [type]
   * @returns {Promise<import('@pgv2/domain/ports').GlobalConfig[]>}
   */
  async getConfigs(type) {
    return fsGetConfigs(type ? { type } : undefined);
  }

  /**
   * @param {string} type
   * @param {string} configId
   * @returns {Promise<import('@pgv2/domain/ports').GlobalConfig | null>}
   */
  async getConfig(type, configId) {
    return fsGetConfig(configId);
  }

  /**
   * @param {import('@pgv2/domain/ports').GlobalConfig} config
   * @returns {Promise<void>}
   */
  async saveConfig(config) {
    if (config.configId) {
      const { configId, ...data } = config;
      await updateConfig(configId, data);
    } else {
      await createConfig(config);
    }
  }

  /**
   * @param {string} type
   * @param {string} configId
   * @returns {Promise<void>}
   */
  async deleteConfig(type, configId) {
    await fsDeleteConfig(configId);
  }
}
