import { dalService } from '../services/dal-service.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { modalStackService } from '../services/modal-stack-service.js';
const projectCardElement = APP_CONSTANTS.PROJECT_CARD_ELEMENT;
const cardTypes = APP_CONSTANTS.CARD_TYPES;
const developerList = {};
const statusTasksList = {};
const statusBugList = {};
const bugpriorityList = {};
const userAdminEmails = {};
const stakeholders = {};
const epicList = {};
const proposalList = {};
const logList = {};
let section;
let projectId = getProjectIdFromUrl();

// Variable global para almacenar la lista de sprints
let globalSprintList = {};

// Función para actualizar la lista global de sprints
export function updateGlobalSprintList(projectId) {
  return new Promise((resolve) => {
    dalService.cards.subscribeToSection(projectId, 'sprint', (sprintData) => {
      const data = sprintData || {};
      globalSprintList = {};
      Object.values(data).forEach(sprint => {
        if (sprint.cardId) {
          globalSprintList[sprint.cardId] = sprint;
        }
      });
      // Forzar actualización de todos los TaskCard
      document.querySelectorAll('task-card').forEach(card => card.requestUpdate());
      window.globalSprintList = globalSprintList; // Hacer disponible globalmente
      resolve(globalSprintList);
    });
  });
}

// Exportar la función para obtener la lista global de sprints
export function getGlobalSprintList() {
  return globalSprintList;
}

/**
 * Lee el parámetro 'projectId' de la URL.
 */
export function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('projectId');
}

/**
 * Lee el parámetro 'section' de la URL.
 */
export function getSectionFromUrl() {
  const hash = window.location.hash;
  return hash ? hash.replace('#', '') : 'tasks';
}

/**
 * Finds an object by its ID within a nested data structure.
 *
 * @param {string|number} id - The ID of the object to find.
 * @param {Object} data - The nested data structure containing groups of objects.
 * @returns {Object|null} The found object, or null if no object with the given ID is found.
 */
export function findObjectById(id, data) {
  for (const group in data) {
    const found = data[group].find(item => item.id === id);
    if (found) return found;
  }
  return null; // Si no se encuentra el objeto
}

export async function getSprintList(projectId) {
  const sprintListObjects = await dalService.cards.listCards(projectId, 'sprint');
  if (!sprintListObjects) return {};

  // Transform the data to use cardId as key
  const transformedSprintList = {};
  Object.values(sprintListObjects).forEach(sprint => {
    if (sprint.cardId && !sprint.deletedAt) { // Only include non-deleted sprints
      transformedSprintList[sprint.cardId] = sprint;
    }
  });

  return transformedSprintList;
}

export async function getLists(projectId) {
  const [statusTasksList, statusBugList, projectData, bugpriorityList, userAdminEmails] = await Promise.all([
    dalService.config.getStatusList('task-card'),
    dalService.config.getStatusList('bug-card'),
    dalService.projects.getProject(projectId),
    dalService.config.getBugPriorityList(),
    dalService.config.getUserAdminEmails()
  ]);
  // Asegurar que userAdminEmails es siempre un array
  const userAdminEmailsArr = userAdminEmails
    ? Array.isArray(userAdminEmails)
      ? userAdminEmails
      : Object.keys(userAdminEmails)
    : [];
  const sortedBugpriorityList = Object.entries(bugpriorityList)
    .sort((a, b) => a[1] - b[1])
    .map(entry => entry[0]);
  const sortedStatusTaskList = ensureTaskStatuses(
    Object.entries(statusTasksList)
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0])
  );
  const sortedStatusBugList = Object.entries(statusBugList)
    .sort((a, b) => a[1] - b[1])
    .map(entry => entry[0]);
  return {
    statusTasksList: sortedStatusTaskList,
    statusBugList: sortedStatusBugList,
    developerList: projectData?.developers || [],
    bugpriorityList: sortedBugpriorityList,
    userAdminEmails: userAdminEmailsArr,
    stakeholders: projectData?.stakeholders || []
  };
}

function ensureTaskStatuses(statusList) {
  return Array.isArray(statusList) ? [...statusList] : [];
}

/**
 * Muestra una tarjeta expandida en un modal.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta a mostrar.
 */
export function showExpandedCardInModal(cardElement) {
  try {
    if (!cardElement || !cardElement.projectId) {
      throw new Error('Tarjeta inválida o projectId no definido');
    }

    const modal = document.createElement('app-modal');
    modal._programmaticMode = true; // Para que se muestre automáticamente al añadir al DOM
    modal.maxWidth = '80vw';
    modal.maxHeight = '90dvh';
    modal.showHeader = false;
    modal.showFooter = false;
    modal.interceptClose = true; // Interceptar cierre para verificar cambios

    // Hacer que el modal se adapte al contenido con máximo de 90dvh
    modal.style.setProperty('--modal-body-padding', '0');
    requestAnimationFrame(() => {
      const shadowModal = modal.shadowRoot?.querySelector('.modal');
      const shadowBody = modal.shadowRoot?.querySelector('.modal-body');
      if (shadowModal) {
        shadowModal.style.height = 'auto';
        shadowModal.style.maxHeight = '90dvh';
        shadowModal.style.display = 'flex';
        shadowModal.style.flexDirection = 'column';
      }
      if (shadowBody) {
        shadowBody.style.flex = '1';
        shadowBody.style.overflow = 'auto';
        shadowBody.style.display = 'flex';
        shadowBody.style.flexDirection = 'column';
      }
    });

    let expandedCard;
    if (cardElement._skipClone) {
      // Usar la instancia proporcionada (evita perder props preinyectadas)
      expandedCard = cardElement;
      expandedCard.expanded = true;
    } else {
      // Crear una nueva instancia de la tarjeta para el modal
      expandedCard = document.createElement(cardElement.tagName);
      const props = cardElement.getWCProps();

      // Asegurarnos de que la tarjeta expandida tenga acceso a la lista global de sprints
      if (cardElement.tagName.toLowerCase() === 'task-card') {
        props.globalSprintList = window.globalSprintList || {};
      }

      Object.assign(expandedCard, props);
      expandedCard.expanded = true;
    }

    // Hacer que la card se adapte al contenido
    expandedCard.style.display = 'flex';
    expandedCard.style.flexDirection = 'column';
    expandedCard.style.height = 'auto';
    expandedCard.style.maxHeight = '100%';
    expandedCard.style.overflow = 'auto';

    modal.appendChild(expandedCard);
    document.body.appendChild(modal);

    // Handler para interceptar cierre y verificar cambios sin guardar
    const handleCloseRequested = async (event) => {
      // Detener propagación inmediatamente para evitar que otros listeners cierren el modal
      event.stopImmediatePropagation();

      // Verificar si la card tiene cambios sin guardar
      if (expandedCard && typeof expandedCard.hasChanges === 'function') {
        const hasUnsavedChanges = expandedCard.hasChanges();

        if (hasUnsavedChanges) {
          // Mostrar confirmación antes de cerrar
          try {
            const cardType = expandedCard.cardType?.replace('-card', '') || 'elemento';
            const confirmed = await modalStackService.createConfirmationModal({
              title: 'Cambios sin guardar',
              message: `Tienes cambios sin guardar en este ${cardType}.<br><br>¿Quieres cerrar de todos modos?`,
              confirmText: 'Sí, cerrar sin guardar',
              cancelText: 'No, volver a editar',
              confirmColor: '#f44336',
              cancelColor: '#fcaf00'
            });
            if (!confirmed) {
              return; // Usuario canceló, no cerrar
            }
          } catch (error) {
            // En caso de error, permitir cerrar
          }
        }
      }
      // Cerrar el modal despachando el evento close-modal
      document.dispatchEvent(new CustomEvent('close-modal', {
        detail: { modalId: modal.modalId }
      }));
    };
    modal.addEventListener('modal-closed-requested', handleCloseRequested);

    // Listener para cerrar modal automáticamente al guardar exitosamente
    const handleCardSaveSuccess = (event) => {
      
      // Verificar que el modal existe y tiene método close
      if (modal && typeof modal.close === 'function') {
        modal.close();
      } else {
        // Intentar cerrar de otra forma
        if (modal && modal.remove) {
          modal.remove();
        }
      }
      
      // Limpiar el listener
      expandedCard.removeEventListener('card-save-success', handleCardSaveSuccess);
};
expandedCard.addEventListener('card-save-success', handleCardSaveSuccess);

    // Esperar a que el modal se actualice
    modal.updateComplete.then(() => {
      modal.setContent(expandedCard);
      expandedCard.requestUpdate();
      
      // Las cards expandidas ahora piden permisos automáticamente
      // No es necesario notificar permisos globalmente
    }).catch(error => {
showErrorNotification('Error al mostrar la tarjeta');
    });

  } catch (error) {
showErrorNotification('Error al mostrar la tarjeta');
  }
}

/**
 * Muestra una notificación de error.
 * @param {string} message - El mensaje de error a mostrar.
 */
function showErrorNotification(message) {
  const notification = document.createElement('slide-notification');
  notification.message = message;
  notification.type = 'error';
  document.body.appendChild(notification);
}

export function renderCardsByStatus(cardList, cards, userEmail, onCardClick) {
  cardList.forEach((column) => {
    const columnId = cards[0]?.cardType === 'bug-card'
      ? `bugs-kanban-${column.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '')}`
      : `kanban-${column.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '')}`;

    const columnContainer = document.getElementById(columnId);

    if (columnContainer) {
      // Limpiar el contenedor y sus event listeners
      const newColumnContainer = columnContainer.cloneNode(false);
      columnContainer.parentNode.replaceChild(newColumnContainer, columnContainer);

      // Filtrar y crear las tarjetas para esta columna
      const columnCards = cards.filter(card => card.status === column).map(card => {
        const cardElement = document.createElement(card.cardType);

        // Asegurarnos de que todas las propiedades se copian correctamente
        const cardProperties = {
          ...card,
          group: card.group || card.section || (card.cardType === 'bug-card' ? 'bugs' : 'tasks'),
          section: card.section || card.group || (card.cardType === 'bug-card' ? 'bugs' : 'tasks'),
          projectId: projectId,
          userEmail: userEmail,
          statusList: card.cardType === 'bug-card' ? statusBugList : statusTasksList,
          stakeholders: stakeholders
        };

        // Asignar todas las propiedades a la tarjeta
        Object.assign(cardElement, cardProperties);

        // Añadir event listener si se proporciona la función de callback
        if (typeof onCardClick === 'function') {
          cardElement.addEventListener('click', () => {
            if (!cardElement.classList.contains('dragging')) {
              onCardClick(cardElement);
            }
          });
        }

        return cardElement;
      });

      // Añadir las tarjetas al nuevo contenedor
      columnCards.forEach(card => newColumnContainer.appendChild(card));
    }
  });
}

export function renderCardsByType(cards, condition, projectId) {
  return cards
    .filter(condition)
    .map((card) => {
      const cardElement = document.createElement(card.cardType);

      // Asegurarnos de que todas las propiedades se copian correctamente
      const cardProperties = {
        ...card,
        group: card.group || card.section || (card.cardType === 'bug-card' ? 'bugs' : 'tasks'),
        section: card.section || card.group || (card.cardType === 'bug-card' ? 'bugs' : 'tasks'),
        projectId: projectId
      };

      // Asignar todas las propiedades a la tarjeta
      Object.assign(cardElement, cardProperties);

      return cardElement;
    });
}

/**
 * Recupera la lista de épicas de un proyecto desde Firebase.
 * @param {string} projectId - ID del proyecto
 * @returns {Promise<Array<{id: string, title: string}>>} Array de épicas con id y título
 */
export async function getEpicList(projectId) {
  try {
    const epicsData = await dalService.cards.listCards(projectId, 'epic');
    if (!epicsData) return [];
    // Mapear a array de objetos {id, title}
    return Object.entries(epicsData)
      .filter(([_, epic]) => !epic.deletedAt)
      .map(([id, epic]) => ({
        id: epic.cardId || id,
        title: epic.title || (epic.cardId || id)
      }));
  } catch (error) {
    return [];
  }
}

export function generateSecureTestId(prefix = 'test') {
  // Genera un array de 4 bytes aleatorios seguros (32 bits)
  const randomValues = new Uint32Array(1);
  window.crypto.getRandomValues(randomValues);

  // Convierte el número a una cadena en base 36 para que sea alfanumérica
  const randomPart = randomValues[0].toString(36);

  return `${prefix}-${Date.now()}-${randomPart}`;
}
