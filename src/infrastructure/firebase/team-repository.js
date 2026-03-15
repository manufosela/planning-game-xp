import {
  getTeam as fsGetTeam,
  addTeamMember,
  removeTeamMember,
  getTagRegistry as fsGetTagRegistry,
  updateTagRegistry,
} from '../../lib/firestore.js';

/**
 * Firebase implementation of TeamRepository port.
 * @implements {import('@pgv2/domain/ports').TeamRepository}
 */
export class FirebaseTeamRepository {
  /**
   * @param {string} projectId
   * @returns {Promise<import('@pgv2/domain/ports').TeamMember[]>}
   */
  async getTeam(projectId) {
    return fsGetTeam(projectId);
  }

  /**
   * @param {string} projectId
   * @param {import('@pgv2/domain/ports').TeamMember} member
   * @returns {Promise<void>}
   */
  async addMember(projectId, member) {
    await addTeamMember(projectId, member);
  }

  /**
   * @param {string} projectId
   * @param {string} memberId
   * @returns {Promise<void>}
   */
  async removeMember(projectId, memberId) {
    await removeTeamMember(projectId, memberId);
  }

  /**
   * @param {string} projectId
   * @returns {Promise<import('@pgv2/domain/ports').TagRegistry>}
   */
  async getTagRegistry(projectId) {
    return fsGetTagRegistry(projectId);
  }

  /**
   * @param {string} projectId
   * @param {import('@pgv2/domain/ports').TagRegistry} tags
   * @returns {Promise<void>}
   */
  async saveTagRegistry(projectId, tags) {
    await updateTagRegistry(projectId, tags);
  }
}
