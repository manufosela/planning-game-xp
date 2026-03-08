/**
 * @fileoverview RTDB implementation of AppDistributionRepository.
 *
 * @module shared/dal/rtdb/rtdb-app-distribution-repository
 */

import { AppDistributionRepository } from '../app-distribution-repository.js';

export class RtdbAppDistributionRepository extends AppDistributionRepository {
  constructor(baseRepo) {
    super(baseRepo);
  }

  // Download stats
  async getDownloadStats(projectId) {
    return this._repo.read(`/appDownloads/${projectId}`);
  }

  async trackDownload(projectId, fileKey, updateFn) {
    return this._repo.transaction(`/appDownloads/${projectId}/${fileKey}`, updateFn);
  }

  subscribeToDownloadStats(projectId, callback) {
    return this._repo.subscribe(`/appDownloads/${projectId}`, callback);
  }

  // Download events
  async getDownloadEvents(projectId) {
    return this._repo.read(`/appDownloadEvents/${projectId}`);
  }

  async pushDownloadEvent(projectId, fileKey, eventData) {
    return this._repo.push(`/appDownloadEvents/${projectId}/${fileKey}`, eventData);
  }

  subscribeToDownloadEvents(projectId, callback) {
    return this._repo.subscribe(`/appDownloadEvents/${projectId}`, callback);
  }

  // App metadata
  async getAppMetadata(projectId) {
    return this._repo.read(`/appMetadata/${projectId}`);
  }

  async getAppMetadataEntry(projectId, fileKey) {
    return this._repo.read(`/appMetadata/${projectId}/${fileKey}`);
  }

  async setAppMetadata(projectId, fileKey, data) {
    return this._repo.write(`/appMetadata/${projectId}/${fileKey}`, data);
  }

  subscribeToAppMetadata(projectId, callback) {
    return this._repo.subscribe(`/appMetadata/${projectId}`, callback);
  }

  // User permissions
  async getUserAppPermission(encodedEmail, projectId, permission) {
    return this._repo.read(`/users/${encodedEmail}/projects/${projectId}/appPermissions/${permission}`);
  }

  async getAppUploader(projectId, encodedEmail) {
    return this._repo.read(`/data/appUploaders/${projectId}/${encodedEmail}`);
  }

  async getAppAdmin(encodedEmail) {
    return this._repo.read(`/data/appAdmins/${encodedEmail}`);
  }

  async setAppAdmin(encodedEmail, value) {
    return this._repo.write(`/data/appAdmins/${encodedEmail}`, value);
  }

  async getBetaUser(projectId, encodedEmail) {
    return this._repo.read(`/data/betaUsers/${projectId}/${encodedEmail}`);
  }

  // Public sharing
  async createPublicShare(shareId, data) {
    return this._repo.write(`/publicAppShares/${shareId}`, data);
  }
}
