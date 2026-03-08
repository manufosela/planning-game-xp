/**
 * @fileoverview Factory for creating repository instances based on backend configuration.
 *
 * Usage:
 *   import { createRepositories } from 'shared/dal/repository-factory.js';
 *   const { cards, projects, counters } = createRepositories('rtdb', { db });
 *
 * Dual-write mode:
 *   const repos = createDualWriteRepositories(primaryOpts, secondaryOpts);
 *
 * @module shared/dal/repository-factory
 */

import { DualWriteCardRepository } from './dual-write-card-repository.js';
import { DualWriteProjectRepository } from './dual-write-project-repository.js';
import { ReadSwitchCardRepository } from './read-switch-card-repository.js';
import { ReadSwitchProjectRepository } from './read-switch-project-repository.js';

/** @type {Object<string, Function>} Registry of backend constructors for CardRepository */
const _cardBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for ProjectRepository */
const _projectBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for CounterService */
const _counterBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for EntityRepository */
const _entityBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for BacklogRepository */
const _backlogBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for NotificationRepository */
const _notificationBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for PlanRepository */
const _planBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for ConfigRepository */
const _configBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for DocsRepository */
const _docsBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for StateTransitionRepository */
const _stateTransitionBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for HistoryRepository */
const _historyBackends = {};

/** @type {Object<string, Function>} Registry of backend constructors for AppDistributionRepository */
const _appDistributionBackends = {};

/**
 * Register a CardRepository implementation for a backend.
 * @param {string} backendName - e.g., 'rtdb', 'firestore'
 * @param {Function} RepositoryClass - Constructor that accepts (options)
 */
export function registerCardBackend(backendName, RepositoryClass) {
  _cardBackends[backendName] = RepositoryClass;
}

/**
 * Register a ProjectRepository implementation for a backend.
 * @param {string} backendName
 * @param {Function} RepositoryClass
 */
export function registerProjectBackend(backendName, RepositoryClass) {
  _projectBackends[backendName] = RepositoryClass;
}

/**
 * Register a CounterService implementation for a backend.
 * @param {string} backendName
 * @param {Function} ServiceClass
 */
export function registerCounterBackend(backendName, ServiceClass) {
  _counterBackends[backendName] = ServiceClass;
}

/** Register an EntityRepository implementation. */
export function registerEntityBackend(backendName, RepositoryClass) {
  _entityBackends[backendName] = RepositoryClass;
}

/** Register a BacklogRepository implementation. */
export function registerBacklogBackend(backendName, RepositoryClass) {
  _backlogBackends[backendName] = RepositoryClass;
}

/** Register a NotificationRepository implementation. */
export function registerNotificationBackend(backendName, RepositoryClass) {
  _notificationBackends[backendName] = RepositoryClass;
}

/** Register a PlanRepository implementation. */
export function registerPlanBackend(backendName, RepositoryClass) {
  _planBackends[backendName] = RepositoryClass;
}

/** Register a ConfigRepository implementation. */
export function registerConfigBackend(backendName, RepositoryClass) {
  _configBackends[backendName] = RepositoryClass;
}

/** Register a DocsRepository implementation. */
export function registerDocsBackend(backendName, RepositoryClass) {
  _docsBackends[backendName] = RepositoryClass;
}

/** Register a StateTransitionRepository implementation. */
export function registerStateTransitionBackend(backendName, RepositoryClass) {
  _stateTransitionBackends[backendName] = RepositoryClass;
}

/** Register a HistoryRepository implementation. */
export function registerHistoryBackend(backendName, RepositoryClass) {
  _historyBackends[backendName] = RepositoryClass;
}

/** Register an AppDistributionRepository implementation. */
export function registerAppDistributionBackend(backendName, RepositoryClass) {
  _appDistributionBackends[backendName] = RepositoryClass;
}

/**
 * Create a CardRepository for the specified backend.
 * @param {string} backend - 'rtdb' or 'firestore'
 * @param {Object} options - Backend-specific options (db instance, etc.)
 * @returns {import('./card-repository.js').CardRepository}
 */
export function createCardRepository(backend, options = {}) {
  const Constructor = _cardBackends[backend];
  if (!Constructor) {
    throw new Error(
      `No CardRepository registered for backend "${backend}". ` +
      `Available: ${Object.keys(_cardBackends).join(', ') || 'none'}`
    );
  }
  return new Constructor(options);
}

/**
 * Create a ProjectRepository for the specified backend.
 * @param {string} backend
 * @param {Object} options
 * @returns {import('./project-repository.js').ProjectRepository}
 */
export function createProjectRepository(backend, options = {}) {
  const Constructor = _projectBackends[backend];
  if (!Constructor) {
    throw new Error(
      `No ProjectRepository registered for backend "${backend}". ` +
      `Available: ${Object.keys(_projectBackends).join(', ') || 'none'}`
    );
  }
  return new Constructor(options);
}

/**
 * Create a CounterService for the specified backend.
 * @param {string} [backend='firestore'] - Counters default to Firestore
 * @param {Object} options
 * @returns {import('./counter-service.js').CounterService}
 */
export function createCounterService(backend = 'firestore', options = {}) {
  const Constructor = _counterBackends[backend];
  if (!Constructor) {
    throw new Error(
      `No CounterService registered for backend "${backend}". ` +
      `Available: ${Object.keys(_counterBackends).join(', ') || 'none'}`
    );
  }
  return new Constructor(options);
}

/**
 * Create a repository for the specified backend from a registry.
 * @param {Object} registry
 * @param {string} name - Repository name for error messages
 * @param {string} backend
 * @param {Object} options
 * @returns {Object}
 */
function _createFromRegistry(registry, name, backend, options = {}) {
  const Constructor = registry[backend];
  if (!Constructor) {
    throw new Error(
      `No ${name} registered for backend "${backend}". ` +
      `Available: ${Object.keys(registry).join(', ') || 'none'}`
    );
  }
  return new Constructor(options);
}

/** Create an EntityRepository for the specified backend. */
export function createEntityRepository(backend, options = {}) {
  return _createFromRegistry(_entityBackends, 'EntityRepository', backend, options);
}

/** Create a BacklogRepository for the specified backend. */
export function createBacklogRepository(backend, options = {}) {
  return _createFromRegistry(_backlogBackends, 'BacklogRepository', backend, options);
}

/** Create a NotificationRepository for the specified backend. */
export function createNotificationRepository(backend, options = {}) {
  return _createFromRegistry(_notificationBackends, 'NotificationRepository', backend, options);
}

/** Create a PlanRepository for the specified backend. */
export function createPlanRepository(backend, options = {}) {
  return _createFromRegistry(_planBackends, 'PlanRepository', backend, options);
}

/** Create a ConfigRepository for the specified backend. */
export function createConfigRepository(backend, options = {}) {
  return _createFromRegistry(_configBackends, 'ConfigRepository', backend, options);
}

/** Create a DocsRepository for the specified backend. */
export function createDocsRepository(backend, options = {}) {
  return _createFromRegistry(_docsBackends, 'DocsRepository', backend, options);
}

/** Create a StateTransitionRepository for the specified backend. */
export function createStateTransitionRepository(backend, options = {}) {
  return _createFromRegistry(_stateTransitionBackends, 'StateTransitionRepository', backend, options);
}

/** Create a HistoryRepository for the specified backend. */
export function createHistoryRepository(backend, options = {}) {
  return _createFromRegistry(_historyBackends, 'HistoryRepository', backend, options);
}

/** Create an AppDistributionRepository for the specified backend. */
export function createAppDistributionRepository(backend, options = {}) {
  return _createFromRegistry(_appDistributionBackends, 'AppDistributionRepository', backend, options);
}

/**
 * Create all repositories for a given backend.
 * @param {string} backend - 'rtdb' or 'firestore'
 * @param {Object} options - Backend-specific options
 * @param {string} [counterBackend='firestore'] - Backend for counters
 */
export function createRepositories(backend, options = {}, counterBackend = 'firestore') {
  const repos = {
    cards: createCardRepository(backend, options),
    projects: createProjectRepository(backend, options),
    counters: createCounterService(counterBackend, options)
  };

  // Add new repositories if their backends are registered
  if (_entityBackends[backend]) repos.entities = createEntityRepository(backend, options);
  if (_backlogBackends[backend]) repos.backlogs = createBacklogRepository(backend, options);
  if (_notificationBackends[backend]) repos.notifications = createNotificationRepository(backend, options);
  if (_planBackends[backend]) repos.plans = createPlanRepository(backend, options);
  if (_configBackends[backend]) repos.config = createConfigRepository(backend, options);
  if (_docsBackends[backend]) repos.docs = createDocsRepository(backend, options);
  if (_stateTransitionBackends[backend]) repos.stateTransitions = createStateTransitionRepository(backend, options);
  if (_historyBackends[backend]) repos.history = createHistoryRepository(backend, options);
  if (_appDistributionBackends[backend]) repos.appDistribution = createAppDistributionRepository(backend, options);

  return repos;
}

/**
 * Create dual-write repositories that write to both primary and secondary backends.
 * Reads come from the primary; secondary receives shadow writes.
 *
 * @param {Object} primaryConfig - { backend: 'rtdb', options: {...} }
 * @param {Object} secondaryConfig - { backend: 'firestore', options: {...} }
 * @param {Object} [dualOptions] - Options passed to DualWrite constructors (e.g. onShadowError)
 * @param {string} [counterBackend='firestore'] - Backend for counters
 * @returns {{cards: DualWriteCardRepository, projects: DualWriteProjectRepository, counters: import('./counter-service.js').CounterService}}
 */
export function createDualWriteRepositories(primaryConfig, secondaryConfig, dualOptions = {}, counterBackend = 'firestore') {
  const primaryCards = createCardRepository(primaryConfig.backend, primaryConfig.options);
  const secondaryCards = createCardRepository(secondaryConfig.backend, secondaryConfig.options);

  const primaryProjects = createProjectRepository(primaryConfig.backend, primaryConfig.options);
  const secondaryProjects = createProjectRepository(secondaryConfig.backend, secondaryConfig.options);

  return {
    cards: new DualWriteCardRepository(primaryCards, secondaryCards, dualOptions),
    projects: new DualWriteProjectRepository(primaryProjects, secondaryProjects, dualOptions),
    counters: createCounterService(counterBackend, primaryConfig.options)
  };
}

/**
 * Create read-switch repositories: reads from Firestore, writes to both, optional RTDB fallback.
 *
 * This is the final migration mode: Firestore is the primary read source.
 * Set migrationFallback=true only during active migration to catch unsynced data.
 *
 * @param {Object} rtdbConfig - { backend: 'rtdb', options: {...} }
 * @param {Object} firestoreConfig - { backend: 'firestore', options: {...} }
 * @param {Object} [switchOptions] - { migrationFallback, onFallback, onShadowError }
 * @param {string} [counterBackend='firestore']
 * @returns {{cards: ReadSwitchCardRepository, projects: ReadSwitchProjectRepository, counters: import('./counter-service.js').CounterService}}
 */
export function createReadSwitchRepositories(rtdbConfig, firestoreConfig, switchOptions = {}, counterBackend = 'firestore') {
  const rtdbCards = createCardRepository(rtdbConfig.backend, rtdbConfig.options);
  const firestoreCards = createCardRepository(firestoreConfig.backend, firestoreConfig.options);
  const dualCards = new DualWriteCardRepository(rtdbCards, firestoreCards, switchOptions);

  const rtdbProjects = createProjectRepository(rtdbConfig.backend, rtdbConfig.options);
  const firestoreProjects = createProjectRepository(firestoreConfig.backend, firestoreConfig.options);
  const dualProjects = new DualWriteProjectRepository(rtdbProjects, firestoreProjects, switchOptions);

  return {
    cards: new ReadSwitchCardRepository(firestoreCards, rtdbCards, dualCards, switchOptions),
    projects: new ReadSwitchProjectRepository(firestoreProjects, rtdbProjects, dualProjects, switchOptions),
    counters: createCounterService(counterBackend, firestoreConfig.options)
  };
}

/**
 * Create Firestore-only repositories (post-migration target state).
 *
 * Use this after migration is verified and RTDB can be decommissioned.
 * No RTDB dependency, no dual-write, no fallback — pure Firestore.
 *
 * @param {Object} firestoreOptions - Backend options for Firestore
 * @param {string} [counterBackend='firestore']
 * @returns {{cards: import('./card-repository.js').CardRepository, projects: import('./project-repository.js').ProjectRepository, counters: import('./counter-service.js').CounterService}}
 */
export function createFirestoreOnlyRepositories(firestoreOptions = {}, counterBackend = 'firestore') {
  return {
    cards: createCardRepository('firestore', firestoreOptions),
    projects: createProjectRepository('firestore', firestoreOptions),
    counters: createCounterService(counterBackend, firestoreOptions)
  };
}

/**
 * Clear all registered backends (useful for testing).
 */
export function clearRegisteredBackends() {
  for (const registry of [
    _cardBackends, _projectBackends, _counterBackends,
    _entityBackends, _backlogBackends, _notificationBackends,
    _planBackends, _configBackends, _docsBackends, _stateTransitionBackends, _historyBackends,
    _appDistributionBackends
  ]) {
    Object.keys(registry).forEach(k => delete registry[k]);
  }
}
