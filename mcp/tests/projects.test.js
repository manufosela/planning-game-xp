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

  // Contract since PMC-BUG-0007: the default team comes from the MCP user
  // config (developerId/stakeholderId), NOT from hardcoded legacy IDs.
  describe('createProject - Default team from MCP user config', () => {
    beforeEach(() => {
      setMockRtdbData('/data/developers/dev_001', { name: 'Mánu Fosela', email: 'mjfosela@gmail.com' });
      setMockRtdbData('/data/stakeholders/stk_001', { name: 'Mánu Fosela', email: 'mjfosela@gmail.com', active: true });
      setMockFirestoreData('projectCounters', 'NP-PCS', { lastId: 0 });
    });

    it('assigns the MCP user as default developer AND stakeholder (as objects)', async () => {
      mockMcpUser = { developerId: 'dev_001', stakeholderId: 'stk_001', name: 'Mánu Fosela', email: 'mjfosela@gmail.com' };

      const result = await createProject({
        projectId: 'NewProject',
        name: 'New Project',
        abbreviation: 'NP'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.developers).toEqual([
        { id: 'dev_001', name: 'Mánu Fosela', email: 'mjfosela@gmail.com' }
      ]);
      // Stakeholders are objects too (not plain strings) since PMC-BUG-0007.
      expect(response.project.stakeholders).toEqual([
        { id: 'stk_001', name: 'Mánu Fosela', email: 'mjfosela@gmail.com' }
      ]);
    });

    it('warns and creates empty teams when no MCP user is configured', async () => {
      mockMcpUser = null;
      setMockFirestoreData('projectCounters', 'NP2-PCS', { lastId: 0 });

      const result = await createProject({
        projectId: 'NewProject2',
        name: 'New Project 2',
        abbreviation: 'NP2'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.developers ?? []).toHaveLength(0);
      expect(response.project.stakeholders ?? []).toHaveLength(0);
      expect(response.warnings).toBeDefined();
      expect(response.warnings.some(w => w.code === 'MCP_USER_NOT_CONFIGURED')).toBe(true);
    });

    it('warns when the MCP user has no stakeholderId', async () => {
      mockMcpUser = { developerId: 'dev_001', name: 'Solo Dev', email: 'dev@x.z' };
      setMockFirestoreData('projectCounters', 'NP3-PCS', { lastId: 0 });

      const result = await createProject({
        projectId: 'NewProject3',
        name: 'New Project 3',
        abbreviation: 'NP3'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.stakeholders ?? []).toHaveLength(0);
      expect(response.warnings).toBeDefined();
      expect(response.warnings.some(w => w.code === 'DEFAULT_STAKEHOLDER_MISSING')).toBe(true);
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
      setMockFirestoreData('projectCounters', 'NP-PCS', { lastId: 0 });
    });

    it('falls back to the config name/email when the developer is not in /data yet', async () => {
      // dev_099 has no /data/developers entry — the card is synthesized
      // from the MCP user config (PMC-BUG-0007 behaviour).
      mockMcpUser = { developerId: 'dev_099', name: 'Other User', email: 'other@test.com' };

      const result = await createProject({
        projectId: 'NewProject',
        name: 'New Project',
        abbreviation: 'NP'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.project.developers).toEqual([
        { id: 'dev_099', name: 'Other User', email: 'other@test.com' }
      ]);
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
