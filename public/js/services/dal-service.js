/**
 * @fileoverview DAL Service for the web client.
 *
 * Initializes the Data Access Layer with browser Firebase SDK adapters.
 * Provides a single point of access to DAL repositories for the web app.
 *
 * Usage:
 *   import { dalService } from './dal-service.js';
 *   dalService.init(); // call once at startup
 *   const cards = await dalService.cards.listCards('PlanningGame', 'task');
 *
 * @module services/dal-service
 */

import {
  database, ref, push, set, get, update, remove, onValue,
  databaseFirestore, doc, getDoc, setDoc, runTransaction, runDbTransaction
} from '../../firebase-config.js';

import {
  registerCardBackend,
  registerProjectBackend,
  registerCounterBackend,
  registerEntityBackend,
  registerBacklogBackend,
  registerNotificationBackend,
  registerPlanBackend,
  registerConfigBackend,
  registerDocsBackend,
  registerStateTransitionBackend,
  registerHistoryBackend,
  registerAppDistributionBackend,
  createRepositories,
  createDualWriteRepositories,
  createReadSwitchRepositories,
  createFirestoreOnlyRepositories,
  clearRegisteredBackends,
  RtdbBaseRepository,
  createClientAdapter,
  RtdbCardRepository,
  RtdbProjectRepository,
  RtdbCounterService,
  createClientCounterAdapter,
  RtdbEntityRepository,
  RtdbBacklogRepository,
  RtdbNotificationRepository,
  RtdbPlanRepository,
  RtdbConfigRepository,
  RtdbDocsRepository,
  RtdbStateTransitionRepository,
  RtdbHistoryRepository,
  RtdbAppDistributionRepository
} from '../../../shared/dal/index.js';

// DAL modes for the migration phases
const DAL_MODES = {
  RTDB_ONLY: 'rtdb-only',
  DUAL_WRITE: 'dual-write',
  READ_SWITCH: 'read-switch',
  FIRESTORE_ONLY: 'firestore-only'
};

class DalService {
  constructor() {
    this._initialized = false;
    this._mode = DAL_MODES.RTDB_ONLY;
    this._repos = null;
  }

  /**
   * Initialize the DAL with the specified mode.
   * @param {string} [mode='rtdb-only'] - Migration phase mode
   */
  init(mode = DAL_MODES.RTDB_ONLY) {
    if (this._initialized) return;

    this._mode = mode;
    clearRegisteredBackends();

    // Register RTDB backend
    const rtdbAdapter = createClientAdapter({
      database, ref, get, set, update, push, remove, onValue,
      off: () => {}, // Client SDK uses unsubscribe return value
      runTransaction: runDbTransaction
    });
    const rtdbBase = new RtdbBaseRepository(rtdbAdapter);

    registerCardBackend('rtdb', class extends RtdbCardRepository {
      constructor() { super(rtdbBase); }
    });
    registerProjectBackend('rtdb', class extends RtdbProjectRepository {
      constructor() { super(rtdbBase); }
    });
    registerEntityBackend('rtdb', class extends RtdbEntityRepository {
      constructor() { super(rtdbBase); }
    });
    registerBacklogBackend('rtdb', class extends RtdbBacklogRepository {
      constructor() { super(rtdbBase); }
    });
    registerNotificationBackend('rtdb', class extends RtdbNotificationRepository {
      constructor() { super(rtdbBase); }
    });
    registerPlanBackend('rtdb', class extends RtdbPlanRepository {
      constructor() { super(rtdbBase); }
    });
    registerConfigBackend('rtdb', class extends RtdbConfigRepository {
      constructor() { super(rtdbBase); }
    });
    registerDocsBackend('rtdb', class extends RtdbDocsRepository {
      constructor() { super(rtdbBase); }
    });
    registerStateTransitionBackend('rtdb', class extends RtdbStateTransitionRepository {
      constructor() { super(rtdbBase); }
    });
    registerHistoryBackend('rtdb', class extends RtdbHistoryRepository {
      constructor() { super(rtdbBase); }
    });
    registerAppDistributionBackend('rtdb', class extends RtdbAppDistributionRepository {
      constructor() { super(rtdbBase); }
    });

    // Register counter backend (always Firestore)
    const counterAdapter = createClientCounterAdapter({
      firestore: databaseFirestore, doc, getDoc, setDoc, runTransaction
    });
    registerCounterBackend('firestore', class extends RtdbCounterService {
      constructor() { super(counterAdapter); }
    });

    // Create repositories based on mode
    switch (mode) {
      case DAL_MODES.RTDB_ONLY:
        this._repos = createRepositories('rtdb');
        break;

      case DAL_MODES.DUAL_WRITE:
      case DAL_MODES.READ_SWITCH:
      case DAL_MODES.FIRESTORE_ONLY:
        // Firestore backend registration will be added when Firestore
        // client adapter dependencies are fully available in firebase-config.js
        // For now, fall back to RTDB-only
        console.warn(`[DAL] Mode "${mode}" not yet supported, using rtdb-only`);
        this._repos = createRepositories('rtdb');
        break;

      default:
        throw new Error(`Unknown DAL mode: ${mode}`);
    }

    this._initialized = true;
  }

  /** @returns {import('../../../shared/dal/card-repository.js').CardRepository} */
  get cards() {
    this._ensureInitialized();
    return this._repos.cards;
  }

  /** @returns {import('../../../shared/dal/project-repository.js').ProjectRepository} */
  get projects() {
    this._ensureInitialized();
    return this._repos.projects;
  }

  /** @returns {import('../../../shared/dal/counter-service.js').CounterService} */
  get counters() {
    this._ensureInitialized();
    return this._repos.counters;
  }

  /** @returns {import('../../../shared/dal/entity-repository.js').EntityRepository} */
  get entities() {
    this._ensureInitialized();
    return this._repos.entities;
  }

  /** @returns {import('../../../shared/dal/backlog-repository.js').BacklogRepository} */
  get backlogs() {
    this._ensureInitialized();
    return this._repos.backlogs;
  }

  /** @returns {import('../../../shared/dal/notification-repository.js').NotificationRepository} */
  get notifications() {
    this._ensureInitialized();
    return this._repos.notifications;
  }

  /** @returns {import('../../../shared/dal/plan-repository.js').PlanRepository} */
  get plans() {
    this._ensureInitialized();
    return this._repos.plans;
  }

  /** @returns {import('../../../shared/dal/config-repository.js').ConfigRepository} */
  get config() {
    this._ensureInitialized();
    return this._repos.config;
  }

  /** @returns {import('../../../shared/dal/docs-repository.js').DocsRepository} */
  get docs() {
    this._ensureInitialized();
    return this._repos.docs;
  }

  /** @returns {import('../../../shared/dal/state-transition-repository.js').StateTransitionRepository} */
  get stateTransitions() {
    this._ensureInitialized();
    return this._repos.stateTransitions;
  }

  /** @returns {import('../../../shared/dal/history-repository.js').HistoryRepository} */
  get history() {
    this._ensureInitialized();
    return this._repos.history;
  }

  /** @returns {import('../../../shared/dal/app-distribution-repository.js').AppDistributionRepository} */
  get appDistribution() {
    this._ensureInitialized();
    return this._repos.appDistribution;
  }

  /** @returns {string} Current DAL mode */
  get mode() {
    return this._mode;
  }

  /** @returns {boolean} Whether DAL is initialized */
  get isInitialized() {
    return this._initialized;
  }

  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('DalService not initialized. Call dalService.init() first.');
    }
  }
}

export const dalService = new DalService();
export { DAL_MODES };
