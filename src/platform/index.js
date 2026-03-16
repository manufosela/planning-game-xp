/**
 * Platform module — multi-tenant SaaS management.
 * @module platform
 */

export {
  // Schema types are JSDoc only (no runtime exports)

  // Collection references
  instancesRef,
  pendingRequestsRef,
  platformConfigRef,

  // Instances CRUD
  listInstances,
  getInstance,
  getInstanceByName,
  createInstance,
  updateInstance,

  // Pending Requests CRUD
  listPendingRequests,
  getPendingRequest,
  createPendingRequest,
  updatePendingRequest,

  // Platform Config CRUD
  getPlatformConfig,
  setPlatformConfig,
  listPlatformConfig,

  // Validation
  validateInstanceName,
  INSTANCE_STATUSES,
  REQUEST_STATUSES,
} from './schema.js';
