import {
  getAdrs as fsGetAdrs,
  createAdr,
  updateAdr,
  deleteAdr as fsDeleteAdr,
} from '../../lib/firestore.js';

/**
 * Firebase implementation of AdrRepository port.
 * @implements {import('@pgv2/domain/ports').AdrRepository}
 */
export class FirebaseAdrRepository {
  /**
   * @param {string} projectId
   * @returns {Promise<import('@pgv2/domain/ports').ADR[]>}
   */
  async getAdrs(projectId) {
    const adrs = await fsGetAdrs(projectId);
    return adrs.map(({ id, ...rest }) => ({ adrId: id, ...rest }));
  }

  /**
   * @param {string} projectId
   * @param {string} adrId
   * @returns {Promise<import('@pgv2/domain/ports').ADR | null>}
   */
  async getAdr(projectId, adrId) {
    const adrs = await fsGetAdrs(projectId);
    const found = adrs.find((a) => a.id === adrId);
    if (!found) return null;
    const { id, ...rest } = found;
    return { adrId: id, ...rest };
  }

  /**
   * @param {string} projectId
   * @param {import('@pgv2/domain/ports').ADR} adr
   * @returns {Promise<void>}
   */
  async saveAdr(projectId, adr) {
    if (adr.adrId) {
      const { adrId, ...data } = adr;
      await updateAdr(projectId, adrId, data);
    } else {
      await createAdr(projectId, adr);
    }
  }

  /**
   * @param {string} projectId
   * @param {string} adrId
   * @returns {Promise<void>}
   */
  async deleteAdr(projectId, adrId) {
    await fsDeleteAdr(projectId, adrId);
  }
}
