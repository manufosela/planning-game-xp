/**
 * @deprecated Use UnifiedFilterService + filter matchers instead.
 * Kept for backward compatibility — will be removed in a future version.
 */
import { BaseFilter } from '../base-filter-system.js';

/**
 * Clase para manejar los filtros de bugs
 * Hereda de BaseFilter para aprovechar la funcionalidad común
 */
export class BugFilters extends BaseFilter {
  constructor() {
    super('bugs');
  }

  /**
   * Configuración específica de filtros para bugs
   * @returns {Object} Configuración de filtros
   */
  getFilterConfig() {
    return {
      status: {
        label: 'Estado',
        isMultiSelect: false,
        optionsMethod: () => this.getStatusOptions()
      },
      priority: {
        label: 'Prioridad',
        isMultiSelect: false,
        optionsMethod: () => this.getPriorityOptions()
      },
      developer: {
        label: 'Desarrollador',
        isMultiSelect: false,
        optionsMethod: () => this.getDeveloperOptions()
      },
      createdBy: {
        label: 'Creado por',
        isMultiSelect: false,
        optionsMethod: () => this.getCreatedByOptions()
      }
    };
  }

  /**
   * Método de conveniencia para mantener compatibilidad con código existente
   */
  setupBugFilters() {
    this.setupFilters();
  }

  /**
   * Método de conveniencia para mantener compatibilidad con código existente
   */
  applyBugFilters() {
    this.applyFilters();
  }

  /**
   * Obtiene las opciones de estado
   * @returns {Promise<Array>} Opciones de estado
   */
  async getStatusOptions() {
    return this.getGlobalListOptions('statusBugList');
  }

  /**
   * Obtiene las opciones de prioridad
   * @returns {Promise<Array>} Opciones de prioridad
   */
  async getPriorityOptions() {
    return this.getGlobalListOptions('globalBugPriorityList');
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