import {
  getProjects as fsGetProjects,
  getProject as fsGetProject,
  createProject,
  updateProject,
  archiveProject as fsArchiveProject,
} from '../../lib/firestore.js';

/**
 * Firebase implementation of ProjectRepository port.
 * @implements {import('@pgv2/domain/ports').ProjectRepository}
 */
export class FirebaseProjectRepository {
  /** @returns {Promise<import('@pgv2/domain/ports').Project[]>} */
  async getProjects() {
    return fsGetProjects();
  }

  /**
   * @param {string} id
   * @returns {Promise<import('@pgv2/domain/ports').Project | null>}
   */
  async getProject(id) {
    return fsGetProject(id);
  }

  /**
   * @param {import('@pgv2/domain/ports').Project} project
   * @returns {Promise<void>}
   */
  async saveProject(project) {
    if (project.projectId) {
      const { projectId, ...data } = project;
      await updateProject(projectId, data);
    } else {
      await createProject(project);
    }
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async archiveProject(id) {
    await fsArchiveProject(id);
  }
}
