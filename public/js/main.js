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

async function initializeServices() {
  if (servicesInitialized) return;
  servicesInitialized = true;

  // Load theme from RTDB (blocking script in <head> already applied cached tokens)
  await ThemeLoaderService.loadAndApply();
  ThemeManagerService.init();
  demoModeService.init();

  // Initialize core services (once)
  FirebaseService.init();
  historyService.init();
  stateTransitionService.init();
  dataBus.init();
  await entityDirectoryService.init();

  versionCheckService.init(APP_VERSION);
  if (!document.querySelector('version-update-modal')) {
    document.body.appendChild(document.createElement('version-update-modal'));
  }
}

async function initializeApplication() {
  try {
    await initializeServices();
    if (!window.appController) {
      window.appController = await AppController.create();
    } else {
      window.appController.onPageNavigated();
    }
  } catch (error) {
    console.error('Error initializing application:', error);
    const notification = document.createElement('slide-notification');
    notification.message = 'Error al inicializar la aplicación. Por favor, recarga la página.';
    notification.type = 'error';
    document.body.appendChild(notification);
  }
}

// astro:page-load fires on every navigation (initial + View Transitions)
document.addEventListener('astro:page-load', initializeApplication);
