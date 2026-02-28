/**
 * DOM Update Functions - Funciones complejas de actualización del DOM
 * Migradas de lib/eventHandlers.js para mantener toda la funcionalidad
 */
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { getPriorityDisplay } from '../utils/priority-utils.js';
import { UIUtils } from '../utils/ui-utils.js';
import { getStatusColorPair } from '../utils/color-utils.js';

// Column indices from centralized constants
const TASK_COLS = APP_CONSTANTS.TABLE_COLUMNS.TASKS;
const BUG_COLS = APP_CONSTANTS.TABLE_COLUMNS.BUGS;

/**
 * Genera un color basado en el hash de un string (para badges de repo)
 * @param {string} label - Etiqueta del repositorio
 * @returns {string} Color HSL
 */
function _getRepoColor(label) {
  if (!label) return 'hsl(0, 0%, 60%)';
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 45%)`;
}

/**
 * Crea un badge de repositorio para actualizar la celda de ID en la tabla
 * @param {Object} cardData - Datos de la card
 * @param {string} projectId - ID del proyecto
 * @returns {HTMLElement|null} Elemento span del badge o null
 */
function _createRepoBadgeElement(cardData, projectId) {
  const project = window.projects?.[projectId];
  if (!project?.repoUrl || typeof project.repoUrl === 'string') return null;
  if (!Array.isArray(project.repoUrl) || project.repoUrl.length < 2) return null;

  const label = cardData.repositoryLabel || project.repoUrl[0]?.label || '';
  if (!label) return null;

  const color = _getRepoColor(label);
  const badge = document.createElement('span');
  badge.style.cssText = `
    display: inline-block;
    font-size: 0.7em;
    font-weight: 600;
    color: white;
    background-color: ${color};
    padding: 0.1em 0.4em;
    border-radius: 3px;
    margin-left: 0.4em;
    vertical-align: middle;
    text-transform: uppercase;
  `;
  badge.title = `Repositorio: ${label}`;
  badge.textContent = label;
  return badge;
}

function _resolveEpicDisplayName(epicValue) {
  if (!epicValue) return '';
  const epicList = Array.isArray(window.globalEpicList) ? window.globalEpicList : [];
  const epic = epicList.find((e) => e && (e.id === epicValue || e.name === epicValue || e.title === epicValue));
  return epic ? (epic.name || epic.title || epicValue) : epicValue;
}

/**
 * Devuelve los colores de fondo y texto para un status
 * @param {string} status - El status de la tarea
 * @param {string} type - 'task' o 'bug'
 * @returns {{bg: string, fg: string}}
 */
function getStatusColor(status) {
  return getStatusColorPair(status || '');
}

/**
 * Actualiza un dato específico en los datos globales sin recargar todo
 * @param {Object} cardData - Datos de la card que se está guardando
 * @param {string} projectId - ID del proyecto
 */
export function updateSpecificGlobalData(cardData, projectId) {
  const cardId = cardData.cardId || cardData.id;

  if (!cardId) {
return;
  }
// Actualizar datos según el tipo de card
  switch (cardData.group || cardData.cardType?.replace('-card', '')) {
    case 'sprints':
    case 'sprint':
      // Actualizar solo este sprint en la lista global
      if (window.globalSprintList) {
        window.globalSprintList[cardId] = cardData;
      }
      break;

    case 'epics':
    case 'epic':
      // Actualizar solo este epic en la lista global
      if (window.globalEpicList) {
        const epicIndex = window.globalEpicList.findIndex(epic => epic.id === cardId);
        if (epicIndex !== -1) {
          window.globalEpicList[epicIndex] = {
            id: cardId,
            name: cardData.title || cardData.name
          };
} else {
          // Si no existe, añadirlo
          window.globalEpicList.push({
            id: cardId,
            name: cardData.title || cardData.name
          });
}
      }
      break;

    case 'tasks':
    case 'task':
      // Las tasks no tienen una lista global específica, pero pueden afectar a otras vistas
break;

    case 'bugs':
    case 'bug':
      // Los bugs no tienen una lista global específica
break;

    case 'qa':
      // Las QA cards no tienen una lista global específica
break;

    case 'proposals':
    case 'proposal':
      // Las propuestas no tienen una lista global específica
break;
  }
}

/**
 * Repinta solo el elemento específico que ha sido modificado
 * @param {Object} cardData - Datos de la card que se está guardando
 */
export function repaintSpecificElement(cardData) {
  const cardId = cardData.cardId || cardData.id;

  if (!cardId) {
return;
  }
// Buscar y actualizar elementos específicos en el DOM
  const selectors = [
    `[data-task-id="${cardData.id}"]`,           // Fila de tabla de tasks (usar cardData.id que es el ID de Firebase)
    `[data-bug-id="${cardData.id}"]`,            // Fila de tabla de bugs (usar cardData.id que es el ID de Firebase)
    `task-card[id="${cardData.id}"]`,            // Task card (usar cardData.id)
    `bug-card[id="${cardData.id}"]`,             // Bug card (usar cardData.id)
    `epic-card[id="${cardData.id}"]`,            // Epic card (usar cardData.id)
    `sprint-card[id="${cardData.id}"]`,          // Sprint card (usar cardData.id)
    `proposal-card[id="${cardData.id}"]`,        // Proposal card (usar cardData.id)
    `qa-card[id="${cardData.id}"]`               // QA card (usar cardData.id)
  ];

  let elementUpdated = false;

  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      if (element) {
        // Actualizar propiedades del elemento
        Object.keys(cardData).forEach(key => {
          if (element[key] !== undefined) {
            element[key] = cardData[key];
          }
        });

        // Forzar actualización del elemento
        if (element.requestUpdate) {
          element.requestUpdate();
        }

        // Si es una fila de tabla, actualizar el contenido
        if (element.tagName === 'TR') {
          updateTableRow(element, cardData);
        }

        elementUpdated = true;
}
    });
  });

  if (!elementUpdated) {
// Intentar con cardId como fallback
    const fallbackSelectors = [
      `[data-task-id="${cardId}"]`,
      `[data-bug-id="${cardId}"]`,
      `task-card[id="${cardId}"]`,
      `bug-card[id="${cardId}"]`,
      `epic-card[id="${cardId}"]`,
      `sprint-card[id="${cardId}"]`,
      `proposal-card[id="${cardId}"]`,
      `qa-card[id="${cardId}"]`
    ];

    fallbackSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elementUpdated = true;
      }
    });
  }
}

/**
 * Actualiza una fila específica de tabla con los nuevos datos
 * @param {HTMLElement} row - Fila de tabla a actualizar
 * @param {Object} cardData - Datos actualizados de la card
 */
export function updateTableRow(row, cardData) {
  const cells = row.querySelectorAll('td');
  if (cells.length === 0) return;

  // Actualizar celdas según el tipo de tabla
  const isTaskTable = row.hasAttribute('data-task-id');
  const isBugTable = row.hasAttribute('data-bug-id');

  if (isTaskTable) {
    // Actualizar celdas de tabla de tasks usando constantes centralizadas
    // Ver APP_CONSTANTS.TABLE_COLUMNS.TASKS para el orden de columnas
    if (cells.length >= TASK_COLS.TOTAL) {
      // ID + repo badge
      cells[TASK_COLS.ID].innerHTML = '';
      cells[TASK_COLS.ID].textContent = cardData.cardId || cardData.id || '';
      const repoBadge = _createRepoBadgeElement(cardData, cardData.projectId);
      if (repoBadge) cells[TASK_COLS.ID].appendChild(repoBadge);

      // NOTES - No actualizar, preservar el contenido existente
      // (Las notas se manejan de forma diferente y no vienen en cardData normalmente)

      // Título
      cells[TASK_COLS.TITLE].textContent = cardData.title || '';

      // Estado - Recrear el tag con estilos
      const statusText = cardData.status || 'Sin estado';
      const statusColor = getStatusColor(statusText, 'task');
      cells[TASK_COLS.STATUS].innerHTML = '';
      const statusTag = document.createElement('span');
      statusTag.textContent = statusText;
      statusTag.style.cssText = `
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
        background: ${statusColor.bg};
        color: ${statusColor.fg};
        text-transform: capitalize;
        white-space: nowrap;
        border: 1px solid rgba(0,0,0,0.05);
      `;
      cells[TASK_COLS.STATUS].appendChild(statusTag);

      // Prioridad (calculada) - Same rendering as table-renderer
      cells[TASK_COLS.PRIORITY].innerHTML = '';
      if (cardData.spike || cardData.isSpike) {
        // No priority for spikes
      } else {
        const priorityInfo = getPriorityDisplay(cardData.businessPoints, cardData.devPoints);
        if (priorityInfo.hasPriority) {
          const priorityTag = document.createElement('span');
          priorityTag.style.cssText = `
            display: inline-flex; align-items: center; gap: 0.25rem;
            padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.85rem;
            font-weight: 600; background: ${priorityInfo.backgroundColor};
            color: ${priorityInfo.color}; white-space: nowrap;
          `;
          priorityTag.textContent = priorityInfo.label;
          priorityTag.title = `${cardData.businessPoints}/${cardData.devPoints} = ${priorityInfo.value}`;
          const badge = document.createElement('span');
          badge.style.cssText = 'font-size:0.7rem;background:rgba(0,0,0,0.3);padding:0 4px;border-radius:4px;margin-left:4px';
          badge.textContent = priorityInfo.badge;
          priorityTag.appendChild(badge);
          cells[TASK_COLS.PRIORITY].appendChild(priorityTag);
        } else {
          cells[TASK_COLS.PRIORITY].textContent = 'No evaluado';
          cells[TASK_COLS.PRIORITY].style.color = 'var(--text-muted, #6c757d)';
          cells[TASK_COLS.PRIORITY].style.fontStyle = 'italic';
        }
      }

      // Sprint
      let sprintTitle = '';
      if (cardData.sprint && window.globalSprintList?.[cardData.sprint]) {
        sprintTitle = window.globalSprintList[cardData.sprint].title;
      }
      cells[TASK_COLS.SPRINT].textContent = sprintTitle;

      // Developer - Resolver ID a nombre para mostrar
      let developerDisplay = cardData.developer || '';
      if (developerDisplay) {
        if (window.entityDirectoryService?.isInitialized?.()) {
          const resolvedName = window.entityDirectoryService.getDeveloperDisplayName(developerDisplay);
          if (resolvedName && resolvedName !== developerDisplay && !resolvedName.startsWith('dev_')) {
            developerDisplay = resolvedName;
          }
        } else {
          const globalDevList = window.globalDeveloperList || [];
          for (const dev of globalDevList) {
            if (typeof dev === 'object' && dev.id === cardData.developer) {
              developerDisplay = dev.name || dev.email || cardData.developer;
              break;
            }
          }
        }
      }
      cells[TASK_COLS.DEVELOPER].textContent = developerDisplay;

      // Validator - Resolver ID a nombre para mostrar
      let validatorDisplay = cardData.validator || '';
      if (validatorDisplay) {
        if (window.entityDirectoryService?.isInitialized?.()) {
          const resolvedName = window.entityDirectoryService.getStakeholderDisplayName(validatorDisplay);
          if (resolvedName && resolvedName !== validatorDisplay && !resolvedName.startsWith('stk_')) {
            validatorDisplay = resolvedName;
          }
        } else {
          const globalStkList = window.globalStakeholderList || [];
          for (const stk of globalStkList) {
            if (typeof stk === 'object' && stk.id === cardData.validator) {
              validatorDisplay = stk.name || stk.email || cardData.validator;
              break;
            }
          }
        }
      }
      cells[TASK_COLS.VALIDATOR].textContent = validatorDisplay;

      // Épica
      cells[TASK_COLS.EPIC].textContent = _resolveEpicDisplayName(cardData.epic);

      cells[TASK_COLS.START_DATE].textContent = UIUtils.formatDateFriendly(cardData.startDate);
      cells[TASK_COLS.END_DATE].textContent = UIUtils.formatDateFriendly(cardData.endDate);
      // ACTIONS column is not updated
    }
  } else if (isBugTable) {
    // Actualizar celdas de tabla de bugs
    if (cells.length >= 10) {
      // ID + repo badge
      cells[0].innerHTML = ''; // Limpiar contenido anterior (incluyendo badge)
      cells[0].textContent = cardData.cardId || cardData.id || '';
      const bugRepoBadge = _createRepoBadgeElement(cardData, cardData.projectId);
      if (bugRepoBadge) cells[0].appendChild(bugRepoBadge);

      cells[1].textContent = cardData.title || ''; // Título

      // Estado - recrear con estilos
      const status = cardData.status || 'Created';
      const bugStatusColor = getStatusColor(status);
      cells[2].innerHTML = `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;font-size:0.85rem;font-weight:600;background:${bugStatusColor.bg};color:${bugStatusColor.fg};text-transform:capitalize;white-space:nowrap;border:1px solid rgba(0,0,0,0.05)">${status}</span>`;

      // Prioridad - recrear con estilos
      const priority = cardData.priority || 'Not Evaluated';
      const priorityColor = getStatusColor(priority);
      cells[3].innerHTML = `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;font-size:0.85rem;font-weight:600;background:${priorityColor.bg};color:${priorityColor.fg};text-transform:capitalize;white-space:nowrap;border:1px solid rgba(0,0,0,0.05)">${priority}</span>`;

      // Developer - resolver ID a nombre usando entityDirectoryService (igual que table-renderer)
      let developerDisplay = cardData.developer || '';
      if (developerDisplay && developerDisplay.startsWith('dev_')) {
        // Primero intentar con entityDirectoryService
        if (entityDirectoryService?.isInitialized?.()) {
          const name = entityDirectoryService.getDeveloperDisplayName(developerDisplay);
          if (name && name !== developerDisplay && !name.startsWith('dev_')) {
            developerDisplay = name;
          }
        }
        // Fallback a globalDeveloperList
        if (developerDisplay.startsWith('dev_')) {
          const devList = window.globalDeveloperList || [];
          for (const dev of devList) {
            if (typeof dev === 'object' && dev.id === developerDisplay) {
              developerDisplay = dev.name || dev.email || developerDisplay;
              break;
            }
          }
        }
      }
      cells[4].textContent = developerDisplay;
      cells[5].textContent = cardData.createdBy || ''; // Creado por (email)
      cells[6].textContent = UIUtils.formatDateFriendly(cardData.registerDate); // Fecha registro
      cells[7].textContent = UIUtils.formatDateFriendly(cardData.startDate); // Fecha inicio
      cells[8].textContent = UIUtils.formatDateFriendly(cardData.endDate); // Fecha fin
      // cells[9] es el botón detalle, no se actualiza
    }
  }

  // Actualizar estilos si la task es expedited
  if (cardData.expedited) {
    row.style.backgroundColor = '#fff3cd';
    row.style.border = '2px solid #ffc107';
    row.style.fontWeight = 'bold';
  } else {
    row.style.backgroundColor = '';
    row.style.border = '';
    row.style.fontWeight = '';
  }
}

/**
 * Actualiza componentes que dependen de datos específicos
 * @param {Object} cardData - Datos de la card que se está guardando
 */
export function updateDependentComponents(cardData) {
  const cardId = cardData.cardId || cardData.id;

  if (!cardId) return;

  // Actualizar componentes según el tipo de card
  switch (cardData.group || cardData.cardType?.replace('-card', '')) {
    case 'sprints':
    case 'sprint':
      // Actualizar TaskCards que usan este sprint
      document.querySelectorAll('task-card').forEach(card => {
        if (card.sprint === cardId && card.requestUpdate) {
          card.requestUpdate();
        }
      });

      // Actualizar filtros que usan sprints
      document.querySelectorAll('task-filters, bug-filters').forEach(filter => {
        if (filter.requestUpdate) {
          filter.requestUpdate();
        }
      });

      // Actualizar SprintCards
      document.querySelectorAll('sprint-card').forEach(card => {
        if (card.requestUpdate) {
          card.requestUpdate();
        }
      });
      break;

    case 'epics':
    case 'epic':
      // Actualizar TaskCards que usan esta épica
      document.querySelectorAll('task-card').forEach(card => {
        if (card.epic === cardId && card.requestUpdate) {
          card.requestUpdate();
        }
      });

      // Actualizar EpicCards
      document.querySelectorAll('epic-card').forEach(card => {
        if (card.requestUpdate) {
          card.requestUpdate();
        }
      });
      break;

    case 'tasks':
    case 'task':
      // Las tasks pueden afectar a sprints (por los puntos)
      if (cardData.sprint && window.globalSprintList?.[cardData.sprint]) {
        document.querySelectorAll('sprint-card').forEach(card => {
          if (card.requestUpdate) {
            card.requestUpdate();
          }
        });
      }

      // Las tasks pueden afectar a epics
      if (cardData.epic) {
        document.querySelectorAll('epic-card').forEach(card => {
          if (card.requestUpdate) {
            card.requestUpdate();
          }
        });
      }
      break;
  }
}

/**
 * Actualiza el cache de la tabla en el ViewFactory si está disponible
 * @param {Object} cardData - Datos de la card que se está guardando
 */
export function updateTableCache(cardData) {
  // Actualizar el cache de la tabla en ViewFactory si está disponible
  if (window.appController && window.appController.viewFactory) {
    const viewFactory = window.appController.viewFactory;

    // Actualizar cache de tabla de tasks
    if (viewFactory._tableCardsCache && cardData.group === 'tasks') {
      const taskId = cardData.id;
      if (taskId) {
        viewFactory._tableCardsCache[taskId] = {
          ...viewFactory._tableCardsCache[taskId],
          ...cardData
        };
}
    }

    // Actualizar cache de tabla de bugs
    if (viewFactory._bugsTableCardsCache && cardData.group === 'bugs') {
      const bugId = cardData.id;
      if (bugId) {
        viewFactory._bugsTableCardsCache[bugId] = {
          ...viewFactory._bugsTableCardsCache[bugId],
          ...cardData
        };
}
    }
  }
}
