/**
 * @fileoverview RTDB implementation of DocsRepository.
 *
 * @module shared/dal/rtdb/rtdb-docs-repository
 */

import { DocsRepository } from '../docs-repository.js';

export class RtdbDocsRepository extends DocsRepository {
  /**
   * @param {import('./base-rtdb-repository.js').RtdbBaseRepository} baseRepo
   */
  constructor(baseRepo) {
    super(baseRepo);
  }

  async getAllDocs(projectId) {
    return this._repo.read(DocsRepository.buildDocsPath(projectId));
  }

  async getDoc(projectId, docId) {
    return this._repo.read(DocsRepository.buildDocPath(projectId, docId));
  }

  async createDoc(projectId, data) {
    return this._repo.push(DocsRepository.buildDocsPath(projectId), data);
  }

  async setDoc(projectId, docId, data) {
    await this._repo.write(DocsRepository.buildDocPath(projectId, docId), data);
  }

  async removeDoc(projectId, docId) {
    await this._repo.remove(DocsRepository.buildDocPath(projectId, docId));
  }

  async getAllSections(projectId) {
    return this._repo.read(DocsRepository.buildSectionsPath(projectId));
  }

  async getSection(projectId, sectionId) {
    return this._repo.read(DocsRepository.buildSectionPath(projectId, sectionId));
  }

  async setSection(projectId, sectionId, data) {
    await this._repo.write(DocsRepository.buildSectionPath(projectId, sectionId), data);
  }

  async removeSection(projectId, sectionId) {
    await this._repo.remove(DocsRepository.buildSectionPath(projectId, sectionId));
  }

  async getAllAdrs(projectId) {
    return this._repo.read(DocsRepository.buildAdrsPath(projectId));
  }

  async getAdr(projectId, adrId) {
    return this._repo.read(DocsRepository.buildAdrPath(projectId, adrId));
  }

  async createAdr(projectId, data) {
    return this._repo.push(DocsRepository.buildAdrsPath(projectId), data);
  }

  async setAdr(projectId, adrId, data) {
    await this._repo.write(DocsRepository.buildAdrPath(projectId, adrId), data);
  }

  async removeAdr(projectId, adrId) {
    await this._repo.remove(DocsRepository.buildAdrPath(projectId, adrId));
  }
}
