/**
 * @fileoverview App distribution repository interface.
 *
 * Handles app downloads, metadata, permissions, and sharing.
 *
 * @module shared/dal/app-distribution-repository
 */

/**
 * @abstract
 */
export class AppDistributionRepository {
  constructor(baseRepo) {
    if (new.target === AppDistributionRepository) {
      throw new Error('AppDistributionRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  // Download stats
  async getDownloadStats(projectId) { throw new Error('Not implemented'); }
  async trackDownload(projectId, fileKey, updateFn) { throw new Error('Not implemented'); }
  subscribeToDownloadStats(projectId, callback) { throw new Error('Not implemented'); }

  // Download events
  async getDownloadEvents(projectId) { throw new Error('Not implemented'); }
  async pushDownloadEvent(projectId, fileKey, eventData) { throw new Error('Not implemented'); }
  subscribeToDownloadEvents(projectId, callback) { throw new Error('Not implemented'); }

  // App metadata
  async getAppMetadata(projectId) { throw new Error('Not implemented'); }
  async getAppMetadataEntry(projectId, fileKey) { throw new Error('Not implemented'); }
  async setAppMetadata(projectId, fileKey, data) { throw new Error('Not implemented'); }
  subscribeToAppMetadata(projectId, callback) { throw new Error('Not implemented'); }

  // User permissions (single user checks)
  async getUserAppPermission(encodedEmail, projectId, permission) { throw new Error('Not implemented'); }
  async getAppUploader(projectId, encodedEmail) { throw new Error('Not implemented'); }
  async setAppUploader(projectId, encodedEmail, value) { throw new Error('Not implemented'); }
  async getAppAdmin(encodedEmail) { throw new Error('Not implemented'); }
  async setAppAdmin(encodedEmail, value) { throw new Error('Not implemented'); }
  async getBetaUser(projectId, encodedEmail) { throw new Error('Not implemented'); }
  async setBetaUser(projectId, encodedEmail, value) { throw new Error('Not implemented'); }

  // User permissions (list all for a project)
  async listAppUploaders(projectId) { throw new Error('Not implemented'); }
  async listAppAdminsByProject(projectId) { throw new Error('Not implemented'); }
  async setAppAdminByProject(projectId, encodedEmail, value) { throw new Error('Not implemented'); }
  async listBetaUsers(projectId) { throw new Error('Not implemented'); }

  // Public sharing
  async createPublicShare(shareId, data) { throw new Error('Not implemented'); }
}
