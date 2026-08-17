import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetMockData,
  setMockRtdbData
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

const {
  createGlobalConfig,
  updateGlobalConfig,
  listGlobalConfig,
  getGlobalConfig,
  getGuidelineHistory,
  restoreGuidelineVersion
} = await import('../tools/global-config.js');

describe('global-config guidelines versioning', () => {
  beforeEach(() => {
    resetMockData();
  });

  describe('createGlobalConfig with guidelines', () => {
    it('should auto-set version to 1 for guidelines', async () => {
      const result = await createGlobalConfig({
        type: 'guidelines',
        name: 'Test Guideline',
        content: 'Initial content'
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.version).toBe(1);
      expect(parsed.type).toBe('guidelines');
      expect(parsed.configId).toBeDefined();
    });

    it('should accept targetFile for guidelines', async () => {
      const result = await createGlobalConfig({
        type: 'guidelines',
        name: 'CLAUDE.md Guideline',
        content: 'Content here',
        targetFile: 'CLAUDE.md'
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.configId).toBeDefined();
      // Verify the stored data includes targetFile
      const getResult = await getGlobalConfig({
        type: 'guidelines',
        configId: parsed.configId
      });
      const config = JSON.parse(getResult.content[0].text);
      expect(config.targetFile).toBe('CLAUDE.md');
      expect(config.version).toBe(1);
    });

    it('should reject absolute targetFile paths', async () => {
      await expect(createGlobalConfig({
        type: 'guidelines',
        name: 'Bad Path',
        content: 'Content',
        targetFile: '/etc/passwd'
      })).rejects.toThrow('targetFile must be a relative path');
    });

    it('should reject targetFile with .. segments', async () => {
      await expect(createGlobalConfig({
        type: 'guidelines',
        name: 'Bad Path',
        content: 'Content',
        targetFile: '../../../etc/passwd'
      })).rejects.toThrow('targetFile cannot contain ".." path traversal');
    });

    it('should not set version for non-guidelines types', async () => {
      const result = await createGlobalConfig({
        type: 'instructions',
        name: 'Test Instruction',
        content: 'Some instruction'
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.version).toBeUndefined();
    });
  });

  describe('updateGlobalConfig with guidelines versioning', () => {
    const GUIDELINE_ID = 'test-guideline-1';

    beforeEach(() => {
      setMockRtdbData('global/guidelines/' + GUIDELINE_ID, {
        name: 'Test Guideline',
        content: 'Version 3 content',
        version: 3,
        category: 'development',
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'geniova-mcp',
        updatedAt: '2026-01-03T00:00:00Z',
        updatedBy: 'geniova-mcp'
      });
    });

    it('should auto-increment version when content changes (AC1)', async () => {
      const result = await updateGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID,
        updates: { content: 'Version 4 content' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.config.version).toBe(4);
      expect(parsed.config.content).toBe('Version 4 content');
    });

    it('should save previous content in history with timestamp and author (AC1)', async () => {
      await updateGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID,
        updates: { content: 'Version 4 content' }
      });

      // Verify history was saved by reading the full config
      const getResult = await getGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID
      });
      const config = JSON.parse(getResult.content[0].text);

      expect(config.history).toBeDefined();
      expect(config.history['3']).toBeDefined();
      expect(config.history['3'].content).toBe('Version 3 content');
      expect(config.history['3'].updatedAt).toBe('2026-01-03T00:00:00Z');
      expect(config.history['3'].updatedBy).toBe('geniova-mcp');
    });

    it('should not increment version when content is not updated', async () => {
      const result = await updateGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID,
        updates: { description: 'New description' }
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.config.version).toBe(3);
    });

    it('should protect version field from manual update', async () => {
      await expect(updateGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID,
        updates: { version: 999 }
      })).rejects.toThrow('Cannot update protected field: "version"');
    });

    it('should protect history field from manual update', async () => {
      await expect(updateGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID,
        updates: { history: {} }
      })).rejects.toThrow('Cannot update protected field: "history"');
    });

    it('should reject absolute targetFile on update', async () => {
      await expect(updateGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID,
        updates: { targetFile: '/etc/passwd' }
      })).rejects.toThrow('targetFile must be a relative path');
    });

    it('should reject targetFile with .. segments on update', async () => {
      await expect(updateGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID,
        updates: { targetFile: '../../etc/passwd' }
      })).rejects.toThrow('targetFile cannot contain ".." path traversal');
    });

    it('should allow valid targetFile on update', async () => {
      const result = await updateGlobalConfig({
        type: 'guidelines',
        configId: GUIDELINE_ID,
        updates: { targetFile: 'docs/CLAUDE.md' }
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.config.targetFile).toBe('docs/CLAUDE.md');
    });
  });

  describe('getGuidelineHistory (AC2)', () => {
    const GUIDELINE_ID = 'hist-guideline';

    beforeEach(() => {
      setMockRtdbData('global/guidelines/' + GUIDELINE_ID, {
        name: 'History Guideline',
        content: 'Current v3 content',
        version: 3,
        category: 'development',
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'geniova-mcp',
        updatedAt: '2026-01-03T00:00:00Z',
        updatedBy: 'geniova-mcp',
        history: {
          '1': {
            content: 'Original v1 content',
            updatedAt: '2026-01-01T00:00:00Z',
            updatedBy: 'geniova-mcp'
          },
          '2': {
            content: 'Updated v2 content',
            updatedAt: '2026-01-02T00:00:00Z',
            updatedBy: 'geniova-mcp'
          }
        }
      });
    });

    it('should return current version and previous versions', async () => {
      const result = await getGuidelineHistory({ configId: GUIDELINE_ID });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.configId).toBe(GUIDELINE_ID);
      expect(parsed.current.version).toBe(3);
      expect(parsed.current.content).toBe('Current v3 content');
      expect(parsed.previousVersions).toHaveLength(2);
      expect(parsed.totalVersions).toBe(3);
    });

    it('should return previous versions sorted by version descending', async () => {
      const result = await getGuidelineHistory({ configId: GUIDELINE_ID });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.previousVersions[0].version).toBe(2);
      expect(parsed.previousVersions[1].version).toBe(1);
    });

    it('should include updatedAt and updatedBy in each version', async () => {
      const result = await getGuidelineHistory({ configId: GUIDELINE_ID });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.current.updatedAt).toBe('2026-01-03T00:00:00Z');
      expect(parsed.previousVersions[0].updatedAt).toBe('2026-01-02T00:00:00Z');
      expect(parsed.previousVersions[1].updatedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('should throw error if guideline not found', async () => {
      await expect(getGuidelineHistory({ configId: 'nonexistent' }))
        .rejects.toThrow('Guideline "nonexistent" not found.');
    });

    it('should handle guideline with no history', async () => {
      setMockRtdbData('global/guidelines/new-guideline', {
        name: 'New Guideline',
        content: 'First content',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'geniova-mcp',
        updatedAt: '2026-01-01T00:00:00Z',
        updatedBy: 'geniova-mcp'
      });

      const result = await getGuidelineHistory({ configId: 'new-guideline' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.current.version).toBe(1);
      expect(parsed.previousVersions).toHaveLength(0);
      expect(parsed.totalVersions).toBe(1);
    });
  });

  describe('restoreGuidelineVersion (AC3)', () => {
    const GUIDELINE_ID = 'restore-guideline';

    beforeEach(() => {
      setMockRtdbData('global/guidelines/' + GUIDELINE_ID, {
        name: 'Restore Guideline',
        content: 'Current v5 content',
        version: 5,
        category: 'development',
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'geniova-mcp',
        updatedAt: '2026-01-05T00:00:00Z',
        updatedBy: 'geniova-mcp',
        history: {
          '1': {
            content: 'Original v1 content',
            updatedAt: '2026-01-01T00:00:00Z',
            updatedBy: 'geniova-mcp'
          },
          '2': {
            content: 'Updated v2 content',
            updatedAt: '2026-01-02T00:00:00Z',
            updatedBy: 'geniova-mcp'
          },
          '3': {
            content: 'Updated v3 content',
            updatedAt: '2026-01-03T00:00:00Z',
            updatedBy: 'geniova-mcp'
          },
          '4': {
            content: 'Updated v4 content',
            updatedAt: '2026-01-04T00:00:00Z',
            updatedBy: 'geniova-mcp'
          }
        }
      });
    });

    it('should restore v3 from v5, creating v6 with v3 content', async () => {
      const result = await restoreGuidelineVersion({
        configId: GUIDELINE_ID,
        version: 3
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.newVersion).toBe(6);
      expect(parsed.restoredFromVersion).toBe(3);
      expect(parsed.content).toBe('Updated v3 content');
    });

    it('should preserve full history after restore', async () => {
      await restoreGuidelineVersion({
        configId: GUIDELINE_ID,
        version: 3
      });

      const historyResult = await getGuidelineHistory({ configId: GUIDELINE_ID });
      const parsed = JSON.parse(historyResult.content[0].text);

      // Current should be v6 with v3 content
      expect(parsed.current.version).toBe(6);
      expect(parsed.current.content).toBe('Updated v3 content');

      // History should include v1, v2, v3, v4, v5 (5 was added during restore)
      expect(parsed.previousVersions).toHaveLength(5);
      const versions = parsed.previousVersions.map(v => v.version);
      expect(versions).toContain(5);
      expect(versions).toContain(4);
      expect(versions).toContain(3);
      expect(versions).toContain(2);
      expect(versions).toContain(1);

      // v5 history entry should have the old v5 content
      const v5Entry = parsed.previousVersions.find(v => v.version === 5);
      expect(v5Entry.content).toBe('Current v5 content');
    });

    it('should throw error if version not found in history', async () => {
      await expect(restoreGuidelineVersion({
        configId: GUIDELINE_ID,
        version: 99
      })).rejects.toThrow('Version 99 not found in history');
    });

    it('should throw error if guideline not found', async () => {
      await expect(restoreGuidelineVersion({
        configId: 'nonexistent',
        version: 1
      })).rejects.toThrow('Guideline "nonexistent" not found.');
    });
  });

  describe('listGlobalConfig for guidelines', () => {
    it('should include version and targetFile in summary', async () => {
      setMockRtdbData('global/guidelines', {
        'g1': {
          name: 'Guideline 1',
          content: 'Content',
          version: 3,
          targetFile: 'CLAUDE.md',
          category: 'development',
          createdAt: '2026-01-01T00:00:00Z',
          createdBy: 'geniova-mcp'
        }
      });

      const result = await listGlobalConfig({ type: 'guidelines' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed[0].version).toBe(3);
      expect(parsed[0].targetFile).toBe('CLAUDE.md');
    });

    it('should not include version for non-guidelines types', async () => {
      setMockRtdbData('global/instructions', {
        'i1': {
          name: 'Instruction 1',
          content: 'Content',
          category: 'development',
          createdAt: '2026-01-01T00:00:00Z',
          createdBy: 'geniova-mcp'
        }
      });

      const result = await listGlobalConfig({ type: 'instructions' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed[0].version).toBeUndefined();
    });
  });

  describe('full versioning workflow', () => {
    it('should track complete version lifecycle: create → update → update → restore', async () => {
      // Step 1: Create
      const createResult = await createGlobalConfig({
        type: 'guidelines',
        name: 'Workflow Guideline',
        content: 'v1 content'
      });
      const configId = JSON.parse(createResult.content[0].text).configId;

      // Step 2: Update to v2
      await updateGlobalConfig({
        type: 'guidelines',
        configId,
        updates: { content: 'v2 content' }
      });

      // Step 3: Update to v3
      await updateGlobalConfig({
        type: 'guidelines',
        configId,
        updates: { content: 'v3 content' }
      });

      // Verify history has v1 and v2
      const histResult = await getGuidelineHistory({ configId });
      const hist = JSON.parse(histResult.content[0].text);
      expect(hist.current.version).toBe(3);
      expect(hist.current.content).toBe('v3 content');
      expect(hist.previousVersions).toHaveLength(2);

      // Step 4: Restore v1
      const restoreResult = await restoreGuidelineVersion({ configId, version: 1 });
      const restored = JSON.parse(restoreResult.content[0].text);
      expect(restored.newVersion).toBe(4);
      expect(restored.content).toBe('v1 content');

      // Verify final state
      const finalHist = await getGuidelineHistory({ configId });
      const finalParsed = JSON.parse(finalHist.content[0].text);
      expect(finalParsed.current.version).toBe(4);
      expect(finalParsed.current.content).toBe('v1 content');
      expect(finalParsed.previousVersions).toHaveLength(3); // v1, v2, v3
    });
  });
});
