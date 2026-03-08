// OPTIMIZACIÓN: Solo importar componentes críticos de forma síncrona
// Los demás se cargan via AppController que los importa internamente
import '@manufosela/app-modal';
import './wc/SlideNotification.js';
import './wc/ProjectSelector.js';
import './wc/YearSelector.js';
import './wc/ThemeToggle.js';
import './wc/ColorTabs.js';
import './wc/card-history-viewer.js';
import './wc/state-history-viewer.js';
import './wc/AiDocumentUploader.js';
import './wc/AdrList.js';
import './wc/DevPlansSection.js';
import './wc/EntityDirectoryManager.js';
import './wc/UserPermissionsPanel.js';
import './wc/VersionUpdateModal.js';

// Importar controladores - AppController importa los demás componentes
import { AppController } from './controllers/app-controller.js';

// Importar servicios esenciales
import { FirebaseService } from './services/firebase-service.js';
import { historyService } from './services/history-service.js';
import { stateTransitionService } from './services/state-transition-service.js';
import { entityDirectoryService } from './services/entity-directory-service.js';
import { dataBus } from './services/data-bus.js';
import { versionCheckService } from './services/version-check-service.js';

// Importar servicios de theming
import { ThemeLoaderService } from './services/theme-loader-service.js';
import { ThemeManagerService } from './services/theme-manager-service.js';
import { demoModeService } from './services/demo-mode-service.js';

// Importar versión actual
import { version as APP_VERSION } from './version.js';

let servicesInitialized = false;
let controllerCreating = false;

async function initializeServices() {
  if (servicesInitialized) return;
  servicesInitialized = true;

  // Theme: cached tokens already applied by <head> script — RTDB refresh is non-blocking
  ThemeLoaderService.loadAndApply().catch(() => {});
  ThemeManagerService.init();
  demoModeService.init();

  // Initialize core services (once)
  FirebaseService.init();
  historyService.init();
  stateTransitionService.init();
  dataBus.init();
  entityDirectoryService.init({ refreshIfEmpty: true }).catch(() => {});

  versionCheckService.init(APP_VERSION);
  if (!document.querySelector('version-update-modal')) {
    document.body.appendChild(document.createElement('version-update-modal'));
  }
}

/**
 * Show the initial tab content immediately so users don't see a blank screen
 * while services are still initializing.
 */
function showInitialTabEarly() {
  const hash = window.location.hash.replace('#', '');
  const section = hash || 'tasks';
  const tabContent = document.getElementById(`${section}TabContent`);
  if (tabContent && getComputedStyle(tabContent).display === 'none') {
    tabContent.style.display = 'block';
  }
}

async function initializeApplication() {
  try {
    // Show tab content as soon as DOM has the partial HTML,
    // before waiting for slow service initialization
    showInitialTabEarly();

    await initializeServices();
    if (!window.appController && !controllerCreating) {
      controllerCreating = true;
      window.appController = await AppController.create();
    } else if (window.appController) {
      window.appController.onPageNavigated();
    }
  } catch (error) {
    controllerCreating = false;
    console.error('Error initializing application:', error);
    const notification = document.createElement('slide-notification');
    notification.message = 'Error al inicializar la aplicación. Por favor, recarga la página.';
    notification.type = 'error';
    document.body.appendChild(notification);
  }
}

// astro:page-load fires on every navigation (initial + View Transitions)
document.addEventListener('astro:page-load', initializeApplication);

document.addEventListener('user-authenticated', () => {
  entityDirectoryService.init({ refreshIfEmpty: true }).catch(() => {});
});
