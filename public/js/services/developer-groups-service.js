/**
 * Developer Groups Service
 *
 * Manages developer classification into groups (internal, external, manager).
 * Reads/writes from /data/developerGroups in Firebase RTDB.
 *
 * Firebase Structure:
 * /data/developerGroups = {
 *   internal: { label: "Internos", developers: ["dev_005", ...] },
 *   external: { label: "Externos", developers: ["dev_014", ...] },
 *   manager: { label: "Manager", developers: ["dev_010"] }
 * }
 */

import { dalService } from './dal-service.js';

export class DeveloperGroupsService {
  constructor() {
    this._groups = null;
    this._devToGroupIndex = new Map();
  }

  /**
   * Load groups from Firebase via DAL
   */
  async loadGroups() {
    const data = await dalService.config.getDeveloperGroups();
    if (data) {
      this._groups = data;
      this._buildIndex();
    } else {
      this._groups = null;
      this._devToGroupIndex.clear();
    }
  }

  /**
   * Get all groups with their members
   * @returns {Object|null} Groups object or null if not loaded/missing
   */
  getGroups() {
    return this._groups;
  }

  /**
   * Get the group key for a developer ID
   * @param {string} devId - Developer ID (e.g. "dev_005")
   * @returns {string|null} Group key (internal/external/manager) or null
   */
  getDeveloperGroup(devId) {
    if (!this._groups) return null;
    return this._devToGroupIndex.get(devId) || null;
  }

  /**
   * Save groups configuration to Firebase
   * @param {Object} groups - Groups object to save
   */
  async saveGroups(groups) {
    await dalService.config.setDeveloperGroups(groups);
    this._groups = groups;
    this._buildIndex();
  }

  /**
   * Build reverse index: devId -> groupKey
   */
  _buildIndex() {
    this._devToGroupIndex.clear();
    if (!this._groups) return;

    for (const [groupKey, groupData] of Object.entries(this._groups)) {
      if (groupData && Array.isArray(groupData.developers)) {
        for (const devId of groupData.developers) {
          this._devToGroupIndex.set(devId, groupKey);
        }
      }
    }
  }
}

// Singleton
export const developerGroupsService = new DeveloperGroupsService();
