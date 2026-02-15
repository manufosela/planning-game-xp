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
import './wc/AiExecutionPanel.js';
import './wc/AdrList.js';
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

// Importar versión actual
import { version as APP_VERSION } from './version.js';

async function initializeApplication() {
  try {
    // Cargar configuración de tema externa (si existe)
    await ThemeLoaderService.loadAndApply();

    // Inicializar gestor de temas (aplica tema guardado o detecta preferencia del sistema)
    ThemeManagerService.init();

    // Inicializar servicios con comunicación via eventos
    FirebaseService.init();
    historyService.init();
    stateTransitionService.init();
    dataBus.init();

    // Inicializar servicio de directorio de entidades (developers/stakeholders)
    await entityDirectoryService.init();

    // Inicializar servicio de verificación de versión (detecta nuevas versiones en tiempo real)
    versionCheckService.init(APP_VERSION);

    // Añadir modal de actualización de versión al body
    if (!document.querySelector('version-update-modal')) {
      const versionModal = document.createElement('version-update-modal');
      document.body.appendChild(versionModal);
    }

    window.appController = await AppController.create();
  } catch (error) {
    console.error('Error initializing application:', error);

    // Mostrar mensaje de error al usuario
    const notification = document.createElement('slide-notification');
    notification.message = 'Error al inicializar la aplicación. Por favor, recarga la página.';
    notification.type = 'error';
    document.body.appendChild(notification);
  }
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', initializeApplication);
