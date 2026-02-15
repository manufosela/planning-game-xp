#!/usr/bin/env node
/**
 * Install State Manager
 *
 * Manages resumable installation state for Planning Game XP setup wizard.
 * Persists state to ~/.planning-game/install-state.json so that interrupted
 * installations can be resumed from the last completed step.
 *
 * Steps (in order):
 *   tier_selected → mcp_installed → kj_cloned → kj_installed →
 *   bridge_built → bridge_started → mcp_kj_registered → completed
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.planning-game');
const STATE_FILE_NAME = 'install-state.json';

const INSTALL_STEPS = [
  'tier_selected',
  'mcp_installed',
  'kj_cloned',
  'kj_installed',
  'bridge_built',
  'bridge_started',
  'mcp_kj_registered',
  'completed',
];

class InstallStateManager {
  /**
   * @param {string} [stateDir] - Directory for state file (default: ~/.planning-game)
   */
  constructor(stateDir) {
    this.stateDir = stateDir || DEFAULT_STATE_DIR;
    this.statePath = path.join(this.stateDir, STATE_FILE_NAME);
  }

  /**
   * Load installation state from disk.
   * @returns {object|null} State object or null if no state file exists
   */
  load() {
    try {
      const content = fs.readFileSync(this.statePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Save installation state to disk. Creates directory if needed.
   * @param {object} state - State object to persist
   */
  save(state) {
    fs.mkdirSync(this.stateDir, { recursive: true });
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8');
  }

  /**
   * Remove state file (clear installation state).
   */
  clear() {
    try {
      fs.unlinkSync(this.statePath);
    } catch {
      // File doesn't exist, nothing to clear
    }
  }

  /**
   * Create a fresh installation state.
   * @param {number} tier - Installation tier (1, 2, or 3)
   * @param {object} [config] - Optional initial config
   * @returns {object} New state object
   */
  createState(tier, config = {}) {
    const state = {
      status: 'in_progress',
      tier,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastStep: null,
      completedSteps: [],
      config,
    };
    this.save(state);
    return state;
  }

  /**
   * Check if a specific step has been completed.
   * @param {object} state - State object
   * @param {string} step - Step name
   * @returns {boolean}
   */
  isStepCompleted(state, step) {
    if (!state || !Array.isArray(state.completedSteps)) return false;
    return state.completedSteps.includes(step);
  }

  /**
   * Mark a step as completed and persist state.
   * @param {object} state - State object (mutated in place)
   * @param {string} step - Step name to mark as completed
   * @returns {object} Updated state
   */
  markStepCompleted(state, step) {
    if (!INSTALL_STEPS.includes(step)) {
      throw new Error(`Unknown install step: "${step}". Valid steps: ${INSTALL_STEPS.join(', ')}`);
    }

    if (!state.completedSteps.includes(step)) {
      state.completedSteps.push(step);
    }
    state.lastStep = step;

    if (step === 'completed') {
      state.status = 'completed';
    }

    this.save(state);
    return state;
  }

  /**
   * Update config in state and persist.
   * @param {object} state - State object (mutated in place)
   * @param {object} configUpdates - Config keys to merge
   * @returns {object} Updated state
   */
  updateConfig(state, configUpdates) {
    state.config = { ...state.config, ...configUpdates };
    this.save(state);
    return state;
  }

  /**
   * Get the next pending step for a given tier.
   * @param {object} state - State object
   * @returns {string|null} Next step name or null if all completed
   */
  getNextStep(state) {
    const stepsForTier = this.getStepsForTier(state.tier);
    for (const step of stepsForTier) {
      if (!state.completedSteps.includes(step)) {
        return step;
      }
    }
    return null;
  }

  /**
   * Get the list of steps required for a given tier.
   * @param {number} tier - Installation tier (1, 2, or 3)
   * @returns {string[]} Array of step names
   */
  getStepsForTier(tier) {
    switch (tier) {
    case 1:
      return ['tier_selected', 'completed'];
    case 2:
      return ['tier_selected', 'mcp_installed', 'completed'];
    case 3:
      return ['tier_selected', 'mcp_installed', 'kj_cloned', 'kj_installed', 'bridge_built', 'bridge_started', 'mcp_kj_registered', 'completed'];
    default:
      throw new Error(`Invalid tier: ${tier}. Must be 1, 2, or 3.`);
    }
  }

  /**
   * Check if installation is in progress (state file exists with status 'in_progress').
   * @returns {boolean}
   */
  isInProgress() {
    const state = this.load();
    return state !== null && state.status === 'in_progress';
  }

  /**
   * Get a summary of installation progress.
   * @param {object} state - State object
   * @returns {{ completed: number, total: number, percentage: number, nextStep: string|null }}
   */
  getProgress(state) {
    const stepsForTier = this.getStepsForTier(state.tier);
    const completedCount = state.completedSteps.filter(s => stepsForTier.includes(s)).length;
    const total = stepsForTier.length;
    return {
      completed: completedCount,
      total,
      percentage: Math.round((completedCount / total) * 100),
      nextStep: this.getNextStep(state),
    };
  }
}

module.exports = { InstallStateManager, DEFAULT_STATE_DIR, INSTALL_STEPS };
