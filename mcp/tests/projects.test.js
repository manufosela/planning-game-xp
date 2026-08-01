import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetMockData,
  setMockRtdbData,
  setMockFirestoreData,
  getMockRtdbData
} from './__mocks__/firebase.js';
import { vi } from 'vitest';

// Mock the firebase module before importing
vi.mock('../firebase-adapter.js', async () => {
  const mock = await import('./__mocks__/firebase.js');
  return {
    getDatabase: mock.getDatabase,
    getFirestore: mock.getFirestore
  };
});

// Mock the user module
let mockMcpUser = null;
vi.mock('../user.js', () => ({
  getMcpUser: () => mockMcpUser,
  getMcpUserId: () => mockMcpUser?.email || 'geniova-mcp'
}));

const { createProject } = await import('../tools/projects.js');

describe('projects.js', () => {
  beforeEach(() => {
    resetMockData();
    mockMcpUser = null;
  });

  describe('createProject - Default team assignment', () => {
    beforeEach(() => {
      setMockRtdbData('/data/developers/dev_010', { name: 'Mánu Fosela', email: 'dev@company.com' });
      setMockRtdbData('/data/developers/dev_016', { name: 'BecarIA', email: 'becaria@ia.local' });
      setMockRtdbData('/data/stakeholders/stk_014', { name: 'Mánu Fosela', email: 'dev@company.com', active: true });
      setMockFirestoreData('projectCounters', 'NP-PCS', { lastId: 0 });
    });

    it('should auto-assign default developers and stakeholders', async () => {
      const result = await createProject({
        projectId: 'NewProject',
        name: 'New Project',
        abbreviation: 'NP'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.developers).toHaveLength(2);
      expect(response.project.developers[0]).toEqual({ id: 'dev_010', name: 'Mánu Fosela', email: 'dev@company.com' });
      expect(response.project.developers[1]).toEqual({ id: 'dev_016', name: 'BecarIA', email: 'becaria@ia.local' });
      expect(response.project.stakeholders).toEqual(['stk_014']);
    });

    it('should warn when default developer not found', async () => {
      setMockRtdbData('/data/developers/dev_016', null);
      setMockFirestoreData('projectCounters', 'NP2-PCS', { lastId: 0 });

      const result = await createProject({
        projectId: 'NewProject2',
        name: 'New Project 2',
        abbreviation: 'NP2'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.developers).toHaveLength(1);
      expect(response.project.developers[0].id).toBe('dev_010');
      expect(response.warnings).toBeDefined();
      expect(response.warnings.some(w => w.message.includes('dev_016'))).toBe(true);
    });

    it('should warn when default stakeholder not found', async () => {
      setMockRtdbData('/data/stakeholders/stk_014', null);
      setMockFirestoreData('projectCounters', 'NP3-PCS', { lastId: 0 });

      const result = await createProject({
        projectId: 'NewProject3',
        name: 'New Project 3',
        abbreviation: 'NP3'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.stakeholders).toHaveLength(0);
      expect(response.warnings).toBeDefined();
      expect(response.warnings.some(w => w.message.includes('stk_014'))).toBe(true);
    });

    it('should throw if project already exists', async () => {
      setMockRtdbData('/projects/ExistingProject', { name: 'Existing' });

      await expect(createProject({
        projectId: 'ExistingProject',
        name: 'Existing',
        abbreviation: 'EP'
      })).rejects.toThrow(/already exists/);
    });
  });

  describe('createProject - Default MANTENIMIENTO epic', () => {
    beforeEach(() => {
      setMockRtdbData('/data/developers/dev_010', { name: 'Mánu Fosela', email: 'dev@company.com' });
      setMockRtdbData('/data/developers/dev_016', { name: 'BecarIA', email: 'becaria@ia.local' });
      setMockRtdbData('/data/stakeholders/stk_014', { name: 'Mánu Fosela', email: 'dev@company.com', active: true });
      setMockFirestoreData('projectCounters', 'NP-PCS', { lastId: 0 });
    });

    it('should create [MANTENIMIENTO] epic when creating a project', async () => {
      const result = await createProject({
        projectId: 'NewProject',
        name: 'New Project',
        abbreviation: 'NP'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.defaultEpic).toBeDefined();
      expect(response.defaultEpic.cardId).toBe('NP-PCS-0001');
      expect(response.defaultEpic.title).toBe('[MANTENIMIENTO]');
    });
  });

  describe('createProject - MCP user integration', () => {
    beforeEach(() => {
      setMockRtdbData('/data/developers/dev_010', { name: 'Mánu Fosela', email: 'dev@company.com' });
      setMockRtdbData('/data/developers/dev_016', { name: 'BecarIA', email: 'becaria@ia.local' });
      setMockRtdbData('/data/stakeholders/stk_014', { name: 'Mánu Fosela', email: 'dev@company.com', active: true });
      setMockFirestoreData('projectCounters', 'NP-PCS', { lastId: 0 });
    });

    it('should add MCP user as developer when not in defaults', async () => {
      mockMcpUser = { developerId: 'dev_099', name: 'Other User', email: 'other@test.com' };

      const result = await createProject({
        projectId: 'NewProject',
        name: 'New Project',
        abbreviation: 'NP'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.developers).toHaveLength(3);
      expect(response.project.developers[2]).toEqual({ id: 'dev_099', name: 'Other User', email: 'other@test.com' });
    });

    it('should not duplicate MCP user when already in defaults', async () => {
      mockMcpUser = { developerId: 'dev_010', name: 'Mánu Fosela', email: 'dev@company.com' };

      const result = await createProject({
        projectId: 'NewProject',
        name: 'New Project',
        abbreviation: 'NP'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.developers).toHaveLength(2);
    });

    it('should use MCP user email in createdBy', async () => {
      mockMcpUser = { developerId: 'dev_099', name: 'Other User', email: 'other@test.com' };

      const result = await createProject({
        projectId: 'NewProject',
        name: 'New Project',
        abbreviation: 'NP'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.createdBy).toBe('other@test.com');
    });

    it('should fallback to geniova-mcp when no mcp.user.json', async () => {
      mockMcpUser = null;

      const result = await createProject({
        projectId: 'NewProject',
        name: 'New Project',
        abbreviation: 'NP'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.createdBy).toBe('geniova-mcp');
    });
  });
});
