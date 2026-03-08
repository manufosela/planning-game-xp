/**
 * @fileoverview RTDB backend exports.
 * @module shared/dal/rtdb
 */

export { RtdbBaseRepository, createAdminAdapter, createClientAdapter } from './base-rtdb-repository.js';
export { RtdbCardRepository } from './rtdb-card-repository.js';
export { RtdbProjectRepository } from './rtdb-project-repository.js';
export { RtdbCounterService, createAdminCounterAdapter, createClientCounterAdapter } from './rtdb-counter-service.js';
export { RtdbEntityRepository } from './rtdb-entity-repository.js';
export { RtdbBacklogRepository } from './rtdb-backlog-repository.js';
export { RtdbNotificationRepository } from './rtdb-notification-repository.js';
export { RtdbPlanRepository } from './rtdb-plan-repository.js';
export { RtdbConfigRepository } from './rtdb-config-repository.js';
export { RtdbDocsRepository } from './rtdb-docs-repository.js';
