/**
 * Tests for DocsRepository
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockAdapter() {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue('generated-id'),
    remove: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    transaction: vi.fn().mockResolvedValue(null),
    multiUpdate: vi.fn().mockResolvedValue(undefined)
  };
}

class BaseRepo {
  constructor(adapter) { this._adapter = adapter; }
  async read(path) { return this._adapter.read(path); }
  async write(path, data) { return this._adapter.write(path, data); }
  async push(path, data) { return this._adapter.push(path, data); }
  async remove(path) { return this._adapter.remove(path); }
}

class TestDocsRepository {
  constructor(baseRepo) { this._repo = baseRepo; }

  async getAllDocs(projectId) { return this._repo.read(`/docs/${projectId}`); }
  async getDoc(projectId, docId) { return this._repo.read(`/docs/${projectId}/${docId}`); }
  async createDoc(projectId, data) { return this._repo.push(`/docs/${projectId}`, data); }
  async setDoc(projectId, docId, data) { await this._repo.write(`/docs/${projectId}/${docId}`, data); }
  async removeDoc(projectId, docId) { await this._repo.remove(`/docs/${projectId}/${docId}`); }
  async getAllSections(projectId) { return this._repo.read(`/doc-sections/${projectId}`); }
  async getSection(projectId, sectionId) { return this._repo.read(`/doc-sections/${projectId}/${sectionId}`); }
  async setSection(projectId, sectionId, data) { await this._repo.write(`/doc-sections/${projectId}/${sectionId}`, data); }
  async removeSection(projectId, sectionId) { await this._repo.remove(`/doc-sections/${projectId}/${sectionId}`); }
  async getAllAdrs(projectId) { return this._repo.read(`/adrs/${projectId}`); }
  async getAdr(projectId, adrId) { return this._repo.read(`/adrs/${projectId}/${adrId}`); }
  async createAdr(projectId, data) { return this._repo.push(`/adrs/${projectId}`, data); }
  async setAdr(projectId, adrId, data) { await this._repo.write(`/adrs/${projectId}/${adrId}`, data); }
  async removeAdr(projectId, adrId) { await this._repo.remove(`/adrs/${projectId}/${adrId}`); }
}

describe('DocsRepository', () => {
  let adapter;
  let repo;

  beforeEach(() => {
    adapter = createMockAdapter();
    const base = new BaseRepo(adapter);
    repo = new TestDocsRepository(base);
  });

  describe('document CRUD', () => {
    it('should get all docs', async () => {
      const docs = { d1: { title: 'Doc 1' }, d2: { title: 'Doc 2' } };
      adapter.read.mockResolvedValueOnce(docs);

      const result = await repo.getAllDocs('PLN');
      expect(result).toEqual(docs);
      expect(adapter.read).toHaveBeenCalledWith('/docs/PLN');
    });

    it('should get a single doc', async () => {
      const doc = { title: 'Test Doc', content: 'Content' };
      adapter.read.mockResolvedValueOnce(doc);

      const result = await repo.getDoc('PLN', 'doc1');
      expect(result).toEqual(doc);
      expect(adapter.read).toHaveBeenCalledWith('/docs/PLN/doc1');
    });

    it('should create a doc', async () => {
      const id = await repo.createDoc('PLN', { title: 'New Doc' });
      expect(id).toBe('generated-id');
      expect(adapter.push).toHaveBeenCalledWith('/docs/PLN', { title: 'New Doc' });
    });

    it('should set (overwrite) a doc', async () => {
      await repo.setDoc('PLN', 'doc1', { title: 'Updated' });
      expect(adapter.write).toHaveBeenCalledWith('/docs/PLN/doc1', { title: 'Updated' });
    });

    it('should remove a doc', async () => {
      await repo.removeDoc('PLN', 'doc1');
      expect(adapter.remove).toHaveBeenCalledWith('/docs/PLN/doc1');
    });
  });

  describe('section CRUD', () => {
    it('should get all sections', async () => {
      const sections = { s1: { title: 'Section 1' } };
      adapter.read.mockResolvedValueOnce(sections);

      const result = await repo.getAllSections('PLN');
      expect(result).toEqual(sections);
      expect(adapter.read).toHaveBeenCalledWith('/doc-sections/PLN');
    });

    it('should get a single section', async () => {
      const section = { title: 'S1', content: 'Text' };
      adapter.read.mockResolvedValueOnce(section);

      const result = await repo.getSection('PLN', 's1');
      expect(result).toEqual(section);
    });

    it('should set a section', async () => {
      await repo.setSection('PLN', 's1', { title: 'Updated' });
      expect(adapter.write).toHaveBeenCalledWith('/doc-sections/PLN/s1', { title: 'Updated' });
    });

    it('should remove a section', async () => {
      await repo.removeSection('PLN', 's1');
      expect(adapter.remove).toHaveBeenCalledWith('/doc-sections/PLN/s1');
    });
  });

  describe('ADR CRUD', () => {
    it('should get all ADRs', async () => {
      const adrs = { a1: { title: 'ADR 001' } };
      adapter.read.mockResolvedValueOnce(adrs);

      const result = await repo.getAllAdrs('PLN');
      expect(result).toEqual(adrs);
      expect(adapter.read).toHaveBeenCalledWith('/adrs/PLN');
    });

    it('should get a single ADR', async () => {
      const adr = { title: 'Use Firestore', status: 'accepted' };
      adapter.read.mockResolvedValueOnce(adr);

      const result = await repo.getAdr('PLN', 'adr1');
      expect(result).toEqual(adr);
    });

    it('should create an ADR', async () => {
      const id = await repo.createAdr('PLN', { title: 'New ADR' });
      expect(id).toBe('generated-id');
      expect(adapter.push).toHaveBeenCalledWith('/adrs/PLN', { title: 'New ADR' });
    });

    it('should set an ADR', async () => {
      await repo.setAdr('PLN', 'adr1', { title: 'Updated ADR' });
      expect(adapter.write).toHaveBeenCalledWith('/adrs/PLN/adr1', { title: 'Updated ADR' });
    });

    it('should remove an ADR', async () => {
      await repo.removeAdr('PLN', 'adr1');
      expect(adapter.remove).toHaveBeenCalledWith('/adrs/PLN/adr1');
    });
  });
});
