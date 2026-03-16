/**
 * Dependency Injection wiring — connects infrastructure adapters to application use cases.
 * Exports a ready-to-use `container` and an `init()` function for startup.
 *
 * @module bootstrap
 */

// Infrastructure adapters
import {
  FirebaseCardRepository,
  FirebaseProjectRepository,
  FirebaseTeamRepository,
  FirebaseUserRepository,
  FirebaseHistoryRepository,
  FirebaseBacklogRepository,
  FirebaseStateTransitionRepository,
  FirebaseNotificationRepository,
  FirebasePlanRepository,
  FirebaseAdrRepository,
  FirebaseGlobalConfigRepository,
  FirebaseAuthAdapter,
  FirebaseRealtimeAdapter,
} from './infrastructure/firebase/index.js';

// Application use cases
import {
  CreateCard,
  UpdateCard,
  DeleteCard,
  ChangeStatus,
  LoadProject,
  ManageAuth,
} from './application/use-cases/index.js';

// Application store (reactive signals)
import * as store from './application/store.js';

// ---------------------------------------------------------------------------
// Instantiate adapters
// ---------------------------------------------------------------------------

const cardRepository = new FirebaseCardRepository();
const projectRepository = new FirebaseProjectRepository();
const teamRepository = new FirebaseTeamRepository();
const userRepository = new FirebaseUserRepository();
const historyRepository = new FirebaseHistoryRepository();
const backlogRepository = new FirebaseBacklogRepository();
const stateTransitionRepository = new FirebaseStateTransitionRepository();
const notificationRepository = new FirebaseNotificationRepository();
const planRepository = new FirebasePlanRepository();
const adrRepository = new FirebaseAdrRepository();
const globalConfigRepository = new FirebaseGlobalConfigRepository();
const authAdapter = new FirebaseAuthAdapter();
const realtimeAdapter = new FirebaseRealtimeAdapter();

// ---------------------------------------------------------------------------
// Instantiate use cases with injected dependencies
// ---------------------------------------------------------------------------

const createCard = new CreateCard({
  cardRepository,
  historyRepository,
  backlogRepository,
});

const updateCard = new UpdateCard({
  cardRepository,
  historyRepository,
});

const deleteCard = new DeleteCard({
  cardRepository,
  historyRepository,
});

const changeStatus = new ChangeStatus({
  cardRepository,
  historyRepository,
  stateTransitionRepository,
  backlogRepository,
});

const loadProject = new LoadProject({
  projectRepository,
  cardRepository,
  teamRepository,
  realtimePort: realtimeAdapter,
});

const manageAuth = new ManageAuth({
  authPort: authAdapter,
  userRepository,
});

// ---------------------------------------------------------------------------
// Container — single access point for the presentation layer
// ---------------------------------------------------------------------------

/** @type {Record<string, any>} */
export const container = {
  // Use cases
  createCard,
  updateCard,
  deleteCard,
  changeStatus,
  loadProject,
  manageAuth,

  // Store (all reactive signals)
  store,
};

// ---------------------------------------------------------------------------
// Init — call once at app startup
// ---------------------------------------------------------------------------

/**
 * Initializes the Firebase auth listener, updates the store, and
 * connects auth state to the pg-app element.
 * @returns {Function} unsubscribe function
 */
export function init() {
  return manageAuth.onAuthChange((user) => {
    store.authUser.value = user;

    // Connect auth state to pg-app element
    const pgApp = /** @type {any} */ (document.querySelector('pg-app'));
    if (pgApp?.setAuthenticated) {
      pgApp.setAuthenticated(!!user);
    }
  });
}
