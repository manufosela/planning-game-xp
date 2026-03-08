/**
 * @fileoverview Public API for the Data Access Layer (DAL).
 *
 * The DAL abstracts database operations behind repository interfaces,
 * allowing transparent switching between RTDB and Firestore backends.
 *
 * @module shared/dal
 */

export { BaseRepository } from './base-repository.js';
export { CardRepository } from './card-repository.js';
export { ProjectRepository } from './project-repository.js';
export { CounterService } from './counter-service.js';
export { EntityRepository } from './entity-repository.js';
export { BacklogRepository } from './backlog-repository.js';
export { NotificationRepository } from './notification-repository.js';
export { PlanRepository } from './plan-repository.js';
export { ConfigRepository } from './config-repository.js';
export { DocsRepository } from './docs-repository.js';
export { StateTransitionRepository } from './state-transition-repository.js';
export { HistoryRepository } from './history-repository.js';
export { AppDistributionRepository } from './app-distribution-repository.js';

export {
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
  createCardRepository,
  createProjectRepository,
  createCounterService,
  createEntityRepository,
  createBacklogRepository,
  createNotificationRepository,
  createPlanRepository,
  createConfigRepository,
  createDocsRepository,
  createStateTransitionRepository,
  createHistoryRepository,
  createAppDistributionRepository,
  createRepositories,
  createDualWriteRepositories,
  createReadSwitchRepositories,
  createFirestoreOnlyRepositories,
  clearRegisteredBackends
} from './repository-factory.js';

// Dual-write wrappers
export { DualWriteCardRepository } from './dual-write-card-repository.js';
export { DualWriteProjectRepository } from './dual-write-project-repository.js';

// Read-switch wrappers (Firestore primary, RTDB fallback)
export { ReadSwitchCardRepository } from './read-switch-card-repository.js';
export { ReadSwitchProjectRepository } from './read-switch-project-repository.js';

// RTDB backend (DEPRECATED — will be removed after Firestore migration is verified)
export {
  RtdbBaseRepository,
  createAdminAdapter,
  createClientAdapter,
  RtdbCardRepository,
  RtdbProjectRepository,
  RtdbCounterService,
  createAdminCounterAdapter,
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
} from './rtdb/index.js';

// Firestore backend
export {
  FirestoreBaseRepository,
  createAdminFirestoreAdapter,
  createClientFirestoreAdapter,
  FirestoreCardRepository,
  FirestoreProjectRepository
} from './firestore/index.js';
