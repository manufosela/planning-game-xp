import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import {
  resetMockData,
  setMockRtdbData
} from './__mocks__/firebase.js';

// Mock firebase
vi.mock('../firebase-adapter.js', async () => {
  const mock = await import('./__mocks__/firebase.js');
  return {
    getDatabase: mock.getDatabase,
    getFirestore: mock.getFirestore
  };
});

// We need to mock writeMcpUser to avoid writing to actual filesystem
let writtenUserData = null;
let mockConfigured = false;
let mockCurrentUser = null;

vi.mock('../user.js', () => ({
  isMcpUserConfigured: () => mockConfigured,
  getMcpUser: () => mockCurrentUser,
  getMcpUserId: () => mockCurrentUser?.email || 'geniova-mcp',
  writeMcpUser: (data) => { writtenUserData = data; mockCurrentUser = data; mockConfigured = true; },
  USER_CONFIG_PATH: '/tmp/test-mcp-user.json'
}));

const { setupMcpUser } = await import('../tools/setup-user.js');

describe('setup-user.js', () => {
  beforeEach(() => {
    resetMockData();
    writtenUserData = null;
    mockConfigured = false;
    mockCurrentUser = null;
  });

  describe('setupMcpUser - list developers', () => {
    it('should list available developers when no developerId provided', async () => {
      // setup-user.js reads from /users/ (centralized model)
      setMockRtdbData('/users', {
        'mfosela|geniova!com': { name: 'Mánu Fosela', email: 'mfosela@geniova.com', developerId: 'dev_010', active: true },
        'becaria|ia!local': { name: 'BecarIA', email: 'becaria@ia.local', developerId: 'dev_016', active: true }
      });

      const result = await setupMcpUser({});
      const response = JSON.parse(result.content[0].text);

      expect(response.developers).toHaveLength(2);
      expect(response.message).toContain('not configured');
    });

    it('should show current user when already configured', async () => {
      mockConfigured = true;
      mockCurrentUser = { developerId: 'dev_010', name: 'Mánu Fosela', email: 'mfosela@geniova.com' };

      setMockRtdbData('/users', {
        'mfosela|geniova!com': { name: 'Mánu Fosela', email: 'mfosela@geniova.com', developerId: 'dev_010', active: true }
      });

      const result = await setupMcpUser({});
      const response = JSON.parse(result.content[0].text);

      expect(response.currentUser).toBeDefined();
      expect(response.currentUser.developerId).toBe('dev_010');
    });
  });

  describe('setupMcpUser - configure user', () => {
    beforeEach(() => {
      // setup-user.js reads from /users/ (centralized model)
      setMockRtdbData('/users', {
        'mfosela|geniova!com': { name: 'Mánu Fosela', email: 'mfosela@geniova.com', developerId: 'dev_010', stakeholderId: 'stk_014', active: true },
        'other|test!com': { name: 'Other', email: 'other@test.com', stakeholderId: 'stk_020', active: true }
      });
    });

    it('should create user config with matching stakeholder', async () => {
      const result = await setupMcpUser({ developerId: 'dev_010' });
      const response = JSON.parse(result.content[0].text);

      expect(response.message).toContain('configured successfully');
      expect(writtenUserData).toBeDefined();
      expect(writtenUserData.developerId).toBe('dev_010');
      expect(writtenUserData.stakeholderId).toBe('stk_014');
      expect(writtenUserData.name).toBe('Mánu Fosela');
      expect(writtenUserData.email).toBe('mfosela@geniova.com');
    });

    it('should warn when no matching stakeholder found', async () => {
      // Add a developer WITHOUT stakeholderId
      setMockRtdbData('/users', {
        'mfosela|geniova!com': { name: 'Mánu Fosela', email: 'mfosela@geniova.com', developerId: 'dev_010', stakeholderId: 'stk_014', active: true },
        'nostk|test!com': { name: 'No Stk', email: 'nostk@test.com', developerId: 'dev_099', active: true }
      });

      const result = await setupMcpUser({ developerId: 'dev_099' });
      const response = JSON.parse(result.content[0].text);

      expect(writtenUserData.stakeholderId).toBeNull();
      expect(response.warning).toContain('No matching stakeholder');
    });

    it('should throw for invalid developer ID format', async () => {
      await expect(setupMcpUser({ developerId: 'invalid' }))
        .rejects.toThrow(/Must start with "dev_"/);
    });

    it('should throw for non-existent developer', async () => {
      await expect(setupMcpUser({ developerId: 'dev_999' }))
        .rejects.toThrow(/not found/);
    });
  });
});
