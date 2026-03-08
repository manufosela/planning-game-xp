/**
 * @deprecated Use UnifiedFilterService + filter matchers instead.
 * Kept for backward compatibility — will be removed in a future version.
 */
import { BaseFilter } from '../base-filter-system.js';
import '@manufosela/multi-select';

/**
 * Clase para manejar los filtros de tasks
 * Hereda de BaseFilter para aprovechar la funcionalidad común
 */
export class TaskFilters extends BaseFilter {
  constructor() {
    super('tasks');
  }

  /**
   * Configuración específica de filtros para tasks
   * @returns {Object} Configuración de filtros
   */
  getFilterConfig() {
    return {
      status: {
        label: 'Estado',
        isMultiSelect: true,
        optionsMethod: () => this.getStatusOptions()
      },
      sprint: {
        label: 'Sprint',
        isMultiSelect: true,
        optionsMethod: () => this.getSprintOptions(),
        cardValueGetter: (card) => card.sprint
      },
      epic: {
        label: 'Épica',
        isMultiSelect: true,
        optionsMethod: () => this.getEpicOptions(),
        cardValueGetter: (card) => this.getEpicValueFromCard(card)
      },
      developer: {
        label: 'Desarrollador',
        isMultiSelect: true,
        optionsMethod: () => this.getDeveloperOptions()
      },
      createdBy: {
        label: 'Creado por',
        isMultiSelect: true,
        optionsMethod: () => this.getCreatedByOptions()
      }
    };
  }

  /**
   * Método de conveniencia para mantener compatibilidad con código existente
   */
  setupTaskFilters() {
    this.setupFilters();
  }

  /**
   * Método de conveniencia para mantener compatibilidad con código existente
   */
  applyTaskFilters() {
    this.applyFilters();
  }

  /**
   * Obtiene el valor de épica de una tarjeta considerando múltiples propiedades
   * @param {HTMLElement} card - Tarjeta de task
   * @returns {string} Valor de la épica
   */
  getEpicValueFromCard(card) {
    // Intentar obtener el valor de épica de múltiples formas
    let cardEpic = card.epic || card.epicId || card.getAttribute('epic') || card.getAttribute('epic-id');
    
    if (card.selectedEpicId && typeof card.selectedEpicId === 'string') {
      cardEpic = card.selectedEpicId;
    } else if (card.selectedEpicId && typeof card.selectedEpicId === 'function') {
      try {
        cardEpic = card.selectedEpicId();
      } catch (e) {
        // Silenciosamente continuar con otros métodos
      }
    }
    
    return cardEpic;
  }

  /**
   * Sobrescribe el método de aplicación de filtro multi-select para épicas
   * con lógica específica de tasks
   */
  applyMultiSelectFilter(card, filterType, filterValues, config) {
    if (filterType === 'epic') {
      return this.applyEpicFilter(card, filterValues);
    } else if (filterType === 'sprint') {
      return this.applySprintFilter(card, filterValues);
    } else {
      return super.applyMultiSelectFilter(card, filterType, filterValues, config);
    }
  }

  /**
   * Aplica filtro específico para épicas
   * @param {HTMLElement} card - Tarjeta a filtrar
   * @param {Array} filterValues - Valores del filtro
   * @returns {boolean} true si la tarjeta pasa el filtro
   */
  applyEpicFilter(card, filterValues) {
    if (filterValues.includes('no-epic')) {
      const cardEpic = this.getEpicValueFromCard(card);
      const hasEpic = cardEpic && cardEpic.trim() !== '' && 
                     cardEpic !== 'Sin épica' && cardEpic !== 'Sin Épica';
      
      const hasOtherEpicSelected = filterValues.some(e => e !== 'no-epic');
      
      if (hasEpic && hasOtherEpicSelected) {
        // Si la tarjeta tiene épica y hay otras épicas seleccionadas, verificar si coincide
        return filterValues.includes(cardEpic);
      } else if (hasEpic && !hasOtherEpicSelected) {
        // Si solo está seleccionado "Sin Épica" y la tarjeta tiene épica
        return false;
      }
      // Si no tiene épica, pasa el filtro de "Sin Épica"
      return true;
    } else {
      // Verificar épicas normales
      const cardEpic = this.getEpicValueFromCard(card);
      return filterValues.includes(cardEpic);
    }
  }

  /**
   * Aplica filtro específico para sprints
   * @param {HTMLElement} card - Tarjeta a filtrar
   * @param {Array} filterValues - Valores del filtro
   * @returns {boolean} true si la tarjeta pasa el filtro
   */
  applySprintFilter(card, filterValues) {
    if (filterValues.includes('no-sprint')) {
      const hasOtherSprintSelected = filterValues.some(s => s !== 'no-sprint');
      if (card.sprint && hasOtherSprintSelected) {
        // Si la tarea tiene sprint y hay otros sprints seleccionados, verificar si coincide
        return filterValues.includes(card.sprint);
      } else if (card.sprint && !hasOtherSprintSelected) {
        // Si solo está seleccionado "Sin Sprint" y la tarea tiene sprint
        return false;
      }
      // Si no tiene sprint, pasa el filtro
      return true;
    } else {
      return filterValues.includes(card.sprint);
    }
  }

  /**
   * Obtiene las opciones de estado
   * @returns {Promise<Array>} Opciones de estado
   */
  async getStatusOptions() {
    return this.getGlobalListOptions('statusTasksList');
  }

  /**
   * Obtiene las opciones de sprint filtradas por año seleccionado
   * @returns {Promise<Array>} Opciones de sprint
   */
  async getSprintOptions() {
    const sprintList = window.globalSprintList || {};
    const selectedYear = this._getSelectedYear();

    // Filtrar sprints por año seleccionado
    const options = Object.entries(sprintList)
      .filter(([id, sprint]) => {
        // Si el sprint no tiene year, mostrarlo (compatibilidad pre-migración)
        if (!sprint.year) return true;
        // Comparar como números para evitar problemas de tipos
        return Number(sprint.year) === selectedYear;
      })
      // Ordenar por startDate descendente (más recientes primero)
      .sort((a, b) => {
        const sprintA = a[1];
        const sprintB = b[1];
        const dateA = sprintA.startDate ? new Date(sprintA.startDate) : null;
        const dateB = sprintB.startDate ? new Date(sprintB.startDate) : null;

        if (dateA && dateB) return dateB - dateA;
        if (dateA) return -1;
        if (dateB) return 1;

        const labelA = (sprintA.title || sprintA.name || a[0]).toLowerCase();
        const labelB = (sprintB.title || sprintB.name || b[0]).toLowerCase();
        return labelB.localeCompare(labelA);
      })
      .map(([id, sprint]) => ({
        value: id,
        label: sprint.title || sprint.name || id
      }));

    // Añadir opción para tareas sin sprint
    options.unshift({
      value: 'no-sprint',
      label: 'Sin Sprint'
    });

    return options;
  }

  /**
   * Obtiene el año seleccionado desde localStorage
   * @returns {number} Año seleccionado
   */
  _getSelectedYear() {
    const savedYear = localStorage.getItem('selectedYear');
    return savedYear ? Number(savedYear) : new Date().getFullYear();
  }

  /**
   * Obtiene las opciones de épica
   * @returns {Promise<Array>} Opciones de épica
   */
  async getEpicOptions() {
    try {
      let epics = [];

      // OPTIMIZACIÓN: Usar GlobalDataManager primero para evitar llamadas redundantes a Firebase
      if (window.globalEpicList && window.globalEpicList.length > 0) {
        epics = window.globalEpicList.map(epic => ({
          id: epic.id,
          title: epic.name || epic.title || epic.id
        }));
} else if (window.appController && window.appController.getFirebaseService) {
        // Solo hacer llamada a Firebase si no hay datos en cache
        try {
          const projectId = window.appController.getCurrentProjectId();
          const firebaseService = window.appController.getFirebaseService();
          const epicData = await firebaseService.getCards(projectId, 'epics');
          epics = Object.entries(epicData || {}).map(([id, epic]) => ({
            id: epic.cardId || id,
            title: epic.title || epic.name || id
          }));
        } catch (firebaseError) {
          // Silently ignore - will fallback to DOM
        }
      }

      // Fallback al DOM solo si no hay datos
      if (epics.length === 0) {
        const epicCards = document.querySelectorAll('epic-card');
        epics = Array.from(epicCards).map(card => ({
          id: card.cardId || card.id || card.getAttribute('card-id'),
          title: card.title || card.textContent.trim()
        })).filter(epic => epic.id && epic.title);
}

      const options = epics.map(epic => ({
        value: epic.id,
        label: epic.title || epic.name || epic.id
      }));

      // Añadir opción para tareas sin épica
      options.unshift({
        value: 'no-epic',
        label: 'Sin Épica'
      });

      return options;
    } catch (error) {
return [{
        value: 'no-epic',
        label: 'Sin Épica'
      }];
    }
  }

  /**
   * Obtiene las opciones de desarrollador
   * @returns {Promise<Array>} Opciones de desarrollador
   */
  async getDeveloperOptions() {
    return this.getGlobalListOptions('globalDeveloperList');
  }

  /**
   * Obtiene las opciones de "creado por"
   * @returns {Promise<Array>} Opciones de creado por
   */
  async getCreatedByOptions() {
    return this.getCreatedByOptionsFromDOM();
  }
}