/**
 * @fileoverview Docs repository interface for documentation, ADRs, and doc sections.
 *
 * Path patterns:
 *   /docs/{projectId}/{docId}
 *   /doc-sections/{projectId}/{sectionId}
 *   /adrs/{projectId}/{adrId}
 *
 * @module shared/dal/docs-repository
 */

/**
 * @abstract
 */
export class DocsRepository {
  /**
   * @param {import('./base-repository.js').BaseRepository} baseRepo
   */
  constructor(baseRepo) {
    if (new.target === DocsRepository) {
      throw new Error('DocsRepository is abstract and cannot be instantiated directly');
    }
    this._repo = baseRepo;
  }

  /**
   * Get all docs for a project.
   * @param {string} projectId
   * @returns {Promise<Object|null>}
   */
  async getAllDocs(projectId) {
    throw new Error('Not implemented: getAllDocs()');
  }

  /**
   * Get a single doc.
   * @param {string} projectId
   * @param {string} docId
   * @returns {Promise<Object|null>}
   */
  async getDoc(projectId, docId) {
    throw new Error('Not implemented: getDoc()');
  }

  /**
   * Create a new doc.
   * @param {string} projectId
   * @param {Object} data
   * @returns {Promise<string>} Generated doc ID
   */
  async createDoc(projectId, data) {
    throw new Error('Not implemented: createDoc()');
  }

  /**
   * Update a doc.
   * @param {string} projectId
   * @param {string} docId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async setDoc(projectId, docId, data) {
    throw new Error('Not implemented: setDoc()');
  }

  /**
   * Remove a doc.
   * @param {string} projectId
   * @param {string} docId
   * @returns {Promise<void>}
   */
  async removeDoc(projectId, docId) {
    throw new Error('Not implemented: removeDoc()');
  }

  /**
   * Get all sections for a project.
   * @param {string} projectId
   * @returns {Promise<Object|null>}
   */
  async getAllSections(projectId) {
    throw new Error('Not implemented: getAllSections()');
  }

  /**
   * Get a single section.
   * @param {string} projectId
   * @param {string} sectionId
   * @returns {Promise<Object|null>}
   */
  async getSection(projectId, sectionId) {
    throw new Error('Not implemented: getSection()');
  }

  /**
   * Set a section.
   * @param {string} projectId
   * @param {string} sectionId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async setSection(projectId, sectionId, data) {
    throw new Error('Not implemented: setSection()');
  }

  /**
   * Remove a section.
   * @param {string} projectId
   * @param {string} sectionId
   * @returns {Promise<void>}
   */
  async removeSection(projectId, sectionId) {
    throw new Error('Not implemented: removeSection()');
  }

  /**
   * Get all ADRs for a project.
   * @param {string} projectId
   * @returns {Promise<Object|null>}
   */
  async getAllAdrs(projectId) {
    throw new Error('Not implemented: getAllAdrs()');
  }

  /**
   * Get a single ADR.
   * @param {string} projectId
   * @param {string} adrId
   * @returns {Promise<Object|null>}
   */
  async getAdr(projectId, adrId) {
    throw new Error('Not implemented: getAdr()');
  }

  /**
   * Create a new ADR.
   * @param {string} projectId
   * @param {Object} data
   * @returns {Promise<string>} Generated ADR ID
   */
  async createAdr(projectId, data) {
    throw new Error('Not implemented: createAdr()');
  }

  /**
   * Update an ADR.
   * @param {string} projectId
   * @param {string} adrId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async setAdr(projectId, adrId, data) {
    throw new Error('Not implemented: setAdr()');
  }

  /**
   * Remove an ADR.
   * @param {string} projectId
   * @param {string} adrId
   * @returns {Promise<void>}
   */
  async removeAdr(projectId, adrId) {
    throw new Error('Not implemented: removeAdr()');
  }

  static get docsBasePath() { return '/docs'; }
  static get sectionsBasePath() { return '/doc-sections'; }
  static get adrsBasePath() { return '/adrs'; }

  static buildDocsPath(projectId) { return `/docs/${projectId}`; }
  static buildDocPath(projectId, docId) { return `/docs/${projectId}/${docId}`; }
  static buildSectionsPath(projectId) { return `/doc-sections/${projectId}`; }
  static buildSectionPath(projectId, sectionId) { return `/doc-sections/${projectId}/${sectionId}`; }
  static buildAdrsPath(projectId) { return `/adrs/${projectId}`; }
  static buildAdrPath(projectId, adrId) { return `/adrs/${projectId}/${adrId}`; }
}
