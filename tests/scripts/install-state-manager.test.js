import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { InstallStateManager, INSTALL_STEPS } = await import('../../scripts/install-state-manager.cjs');

describe('InstallStateManager', () => {
  let tmpDir;
  let stateDir;
  let manager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-state-test-'));
    stateDir = path.join(tmpDir, '.planning-game');
    manager = new InstallStateManager(stateDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── load() ──────────────────────────────────────────────────────────

  describe('load()', () => {
    it('should return null when no state file exists', () => {
      expect(manager.load()).toBeNull();
    });

    it('should load existing state from disk', () => {
      fs.mkdirSync(stateDir, { recursive: true });
      const state = { status: 'in_progress', tier: 2, completedSteps: ['tier_selected'] };
      fs.writeFileSync(path.join(stateDir, 'install-state.json'), JSON.stringify(state));

      const loaded = manager.load();

      expect(loaded.status).toBe('in_progress');
      expect(loaded.tier).toBe(2);
      expect(loaded.completedSteps).toContain('tier_selected');
    });

    it('should return null on invalid JSON', () => {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(path.join(stateDir, 'install-state.json'), 'not valid json{{{');

      expect(manager.load()).toBeNull();
    });
  });

  // ─── save() ──────────────────────────────────────────────────────────

  describe('save()', () => {
    it('should create directory and write state file', () => {
      const state = { status: 'in_progress', tier: 3, completedSteps: [] };

      manager.save(state);

      expect(fs.existsSync(path.join(stateDir, 'install-state.json'))).toBe(true);
      const saved = JSON.parse(fs.readFileSync(path.join(stateDir, 'install-state.json'), 'utf8'));
      expect(saved.status).toBe('in_progress');
      expect(saved.updatedAt).toBeDefined();
    });

    it('should set updatedAt timestamp', () => {
      const state = { status: 'in_progress', tier: 1, completedSteps: [] };

      manager.save(state);

      expect(state.updatedAt).toBeDefined();
      expect(new Date(state.updatedAt).getTime()).not.toBeNaN();
    });

    it('should overwrite existing state', () => {
      const first = { status: 'in_progress', tier: 2, completedSteps: [] };
      const second = { status: 'completed', tier: 3, completedSteps: ['tier_selected'] };

      manager.save(first);
      manager.save(second);

      const saved = manager.load();
      expect(saved.status).toBe('completed');
      expect(saved.tier).toBe(3);
    });
  });

  // ─── clear() ─────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('should remove state file', () => {
      const state = { status: 'in_progress', tier: 1, completedSteps: [] };
      manager.save(state);

      manager.clear();

      expect(manager.load()).toBeNull();
    });

    it('should not throw when file does not exist', () => {
      expect(() => manager.clear()).not.toThrow();
    });
  });

  // ─── createState() ───────────────────────────────────────────────────

  describe('createState()', () => {
    it('should create a fresh state with tier', () => {
      const state = manager.createState(2);

      expect(state.status).toBe('in_progress');
      expect(state.tier).toBe(2);
      expect(state.completedSteps).toEqual([]);
      expect(state.lastStep).toBeNull();
      expect(state.startedAt).toBeDefined();
      expect(state.config).toEqual({});
    });

    it('should persist state to disk', () => {
      manager.createState(3, { mcpInstanceName: 'pro' });

      const loaded = manager.load();
      expect(loaded.tier).toBe(3);
      expect(loaded.config.mcpInstanceName).toBe('pro');
    });

    it('should accept initial config', () => {
      const state = manager.createState(3, { kjHome: '/home/user/.karajan' });

      expect(state.config.kjHome).toBe('/home/user/.karajan');
    });
  });

  // ─── isStepCompleted() ───────────────────────────────────────────────

  describe('isStepCompleted()', () => {
    it('should return true for completed step', () => {
      const state = { completedSteps: ['tier_selected', 'mcp_installed'] };

      expect(manager.isStepCompleted(state, 'tier_selected')).toBe(true);
      expect(manager.isStepCompleted(state, 'mcp_installed')).toBe(true);
    });

    it('should return false for non-completed step', () => {
      const state = { completedSteps: ['tier_selected'] };

      expect(manager.isStepCompleted(state, 'mcp_installed')).toBe(false);
    });

    it('should return false for null state', () => {
      expect(manager.isStepCompleted(null, 'tier_selected')).toBe(false);
    });

    it('should return false when completedSteps is not an array', () => {
      expect(manager.isStepCompleted({ completedSteps: 'invalid' }, 'tier_selected')).toBe(false);
    });
  });

  // ─── markStepCompleted() ─────────────────────────────────────────────

  describe('markStepCompleted()', () => {
    it('should add step to completedSteps and set lastStep', () => {
      const state = manager.createState(3);

      manager.markStepCompleted(state, 'tier_selected');

      expect(state.completedSteps).toContain('tier_selected');
      expect(state.lastStep).toBe('tier_selected');
    });

    it('should persist state after marking step', () => {
      const state = manager.createState(2);

      manager.markStepCompleted(state, 'mcp_installed');

      const loaded = manager.load();
      expect(loaded.completedSteps).toContain('mcp_installed');
    });

    it('should not duplicate steps', () => {
      const state = manager.createState(3);

      manager.markStepCompleted(state, 'tier_selected');
      manager.markStepCompleted(state, 'tier_selected');

      expect(state.completedSteps.filter(s => s === 'tier_selected')).toHaveLength(1);
    });

    it('should set status to completed when marking completed step', () => {
      const state = manager.createState(1);

      manager.markStepCompleted(state, 'completed');

      expect(state.status).toBe('completed');
    });

    it('should throw for unknown step', () => {
      const state = manager.createState(1);

      expect(() => manager.markStepCompleted(state, 'unknown_step')).toThrow('Unknown install step');
    });
  });

  // ─── updateConfig() ──────────────────────────────────────────────────

  describe('updateConfig()', () => {
    it('should merge config updates', () => {
      const state = manager.createState(3, { mcpInstanceName: 'pro' });

      manager.updateConfig(state, { kjHome: '/home/user/.karajan', bridgePort: 3100 });

      expect(state.config.mcpInstanceName).toBe('pro');
      expect(state.config.kjHome).toBe('/home/user/.karajan');
      expect(state.config.bridgePort).toBe(3100);
    });

    it('should persist config changes', () => {
      const state = manager.createState(3);

      manager.updateConfig(state, { bridgeApiKey: 'abc123' });

      const loaded = manager.load();
      expect(loaded.config.bridgeApiKey).toBe('abc123');
    });

    it('should overwrite existing config keys', () => {
      const state = manager.createState(3, { bridgePort: 3100 });

      manager.updateConfig(state, { bridgePort: 4000 });

      expect(state.config.bridgePort).toBe(4000);
    });
  });

  // ─── getStepsForTier() ───────────────────────────────────────────────

  describe('getStepsForTier()', () => {
    it('should return minimal steps for tier 1', () => {
      const steps = manager.getStepsForTier(1);

      expect(steps).toEqual(['tier_selected', 'completed']);
    });

    it('should return MCP steps for tier 2', () => {
      const steps = manager.getStepsForTier(2);

      expect(steps).toEqual(['tier_selected', 'mcp_installed', 'completed']);
    });

    it('should return all steps for tier 3', () => {
      const steps = manager.getStepsForTier(3);

      expect(steps).toHaveLength(8);
      expect(steps[0]).toBe('tier_selected');
      expect(steps).toContain('kj_cloned');
      expect(steps).toContain('bridge_built');
      expect(steps[steps.length - 1]).toBe('completed');
    });

    it('should throw for invalid tier', () => {
      expect(() => manager.getStepsForTier(0)).toThrow('Invalid tier');
      expect(() => manager.getStepsForTier(4)).toThrow('Invalid tier');
    });
  });

  // ─── getNextStep() ───────────────────────────────────────────────────

  describe('getNextStep()', () => {
    it('should return first step when nothing completed', () => {
      const state = manager.createState(3);

      expect(manager.getNextStep(state)).toBe('tier_selected');
    });

    it('should return next pending step', () => {
      const state = manager.createState(3);
      state.completedSteps = ['tier_selected', 'mcp_installed'];

      expect(manager.getNextStep(state)).toBe('kj_cloned');
    });

    it('should return null when all steps completed', () => {
      const state = manager.createState(2);
      state.completedSteps = ['tier_selected', 'mcp_installed', 'completed'];

      expect(manager.getNextStep(state)).toBeNull();
    });

    it('should skip steps not required for tier', () => {
      const state = manager.createState(2);
      state.completedSteps = ['tier_selected', 'mcp_installed'];

      // Next step for tier 2 is 'completed', not 'kj_cloned'
      expect(manager.getNextStep(state)).toBe('completed');
    });
  });

  // ─── isInProgress() ──────────────────────────────────────────────────

  describe('isInProgress()', () => {
    it('should return false when no state file', () => {
      expect(manager.isInProgress()).toBe(false);
    });

    it('should return true when state is in_progress', () => {
      manager.createState(2);

      expect(manager.isInProgress()).toBe(true);
    });

    it('should return false when state is completed', () => {
      const state = manager.createState(1);
      state.status = 'completed';
      manager.save(state);

      expect(manager.isInProgress()).toBe(false);
    });
  });

  // ─── getProgress() ───────────────────────────────────────────────────

  describe('getProgress()', () => {
    it('should return 0% for fresh state', () => {
      const state = manager.createState(3);
      const progress = manager.getProgress(state);

      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(8);
      expect(progress.percentage).toBe(0);
      expect(progress.nextStep).toBe('tier_selected');
    });

    it('should calculate percentage correctly', () => {
      const state = manager.createState(2);
      state.completedSteps = ['tier_selected'];

      const progress = manager.getProgress(state);

      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(3);
      expect(progress.percentage).toBe(33);
    });

    it('should return 100% when all steps done', () => {
      const state = manager.createState(1);
      state.completedSteps = ['tier_selected', 'completed'];

      const progress = manager.getProgress(state);

      expect(progress.completed).toBe(2);
      expect(progress.total).toBe(2);
      expect(progress.percentage).toBe(100);
      expect(progress.nextStep).toBeNull();
    });

    it('should only count steps valid for the tier', () => {
      const state = manager.createState(2);
      // Add a step that's not part of tier 2
      state.completedSteps = ['tier_selected', 'kj_cloned'];

      const progress = manager.getProgress(state);

      // kj_cloned is not a tier 2 step, so only tier_selected counts
      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(3);
    });
  });

  // ─── INSTALL_STEPS constant ──────────────────────────────────────────

  describe('INSTALL_STEPS', () => {
    it('should export all valid steps', () => {
      expect(INSTALL_STEPS).toContain('tier_selected');
      expect(INSTALL_STEPS).toContain('mcp_installed');
      expect(INSTALL_STEPS).toContain('kj_cloned');
      expect(INSTALL_STEPS).toContain('kj_installed');
      expect(INSTALL_STEPS).toContain('bridge_built');
      expect(INSTALL_STEPS).toContain('bridge_started');
      expect(INSTALL_STEPS).toContain('mcp_kj_registered');
      expect(INSTALL_STEPS).toContain('completed');
    });

    it('should have steps in correct order', () => {
      expect(INSTALL_STEPS.indexOf('tier_selected')).toBeLessThan(INSTALL_STEPS.indexOf('mcp_installed'));
      expect(INSTALL_STEPS.indexOf('mcp_installed')).toBeLessThan(INSTALL_STEPS.indexOf('kj_cloned'));
      expect(INSTALL_STEPS.indexOf('kj_cloned')).toBeLessThan(INSTALL_STEPS.indexOf('completed'));
    });
  });
});
