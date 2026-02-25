/**
 * Servicio genérico de filtros que elimina la duplicación de lógica
 * entre TaskFilters, BugFilters, etc.
 */
export class FilterService {
  constructor() {
    this.filterConfigs = new Map();
    this.activeFilters = new Map();
    this.listeners = new Map();
  }

  /**
   * Registra una configuración de filtros para un tipo específico
   * @param {string} cardType - Tipo de tarjeta (task, bug, etc.)
   * @param {Object} config - Configuración de filtros
   */
  registerFilterConfig(cardType, config) {
    this.filterConfigs.set(cardType, {
      ...config,
      cardType
    });
  }

  /**
   * Obtiene la configuración de filtros para un tipo
   */
  getFilterConfig(cardType) {
    return this.filterConfigs.get(cardType) || this.getDefaultConfig(cardType);
  }

  /**
   * Configuración por defecto para cualquier tipo de tarjeta
   */
  getDefaultConfig(cardType) {
    return {
      cardType,
      filters: {
        search: {
          type: 'text',
          placeholder: 'Search...',
          fields: ['title', 'description']
        },
        status: {
          type: 'select',
          label: 'Status',
          multiple: true,
          options: []
        }
      },
      sortOptions: ['title', 'createdDate', 'status'],
      defaultSort: 'createdDate',
      defaultView: 'list'
    };
  }

  /**
   * Aplica filtros a un conjunto de tarjetas
   * @param {string} cardType - Tipo de tarjeta
   * @param {Array} cards - Array de tarjetas
   * @param {Object} filters - Filtros a aplicar
   * @returns {Array} Tarjetas filtradas
   */
  applyFilters(cardType, cards, filters = {}) {
    if (!Array.isArray(cards) || cards.length === 0) {
      return [];
    }

    const config = this.getFilterConfig(cardType);
    let filteredCards = [...cards];

    // Aplicar cada filtro
    for (const [filterKey, filterValue] of Object.entries(filters)) {
      if (!filterValue || filterValue === 'All' || 
          (Array.isArray(filterValue) && filterValue.length === 0)) {
        continue;
      }

      filteredCards = this.applyIndividualFilter(
        filteredCards, 
        filterKey, 
        filterValue, 
        config
      );
    }

    // Aplicar ordenación si está definida
    if (filters.sort) {
      filteredCards = this.applySorting(filteredCards, filters.sort, config);
    }

    return filteredCards;
  }

  /**
   * Aplica un filtro individual
   */
  applyIndividualFilter(cards, filterKey, filterValue, config) {
    const filterConfig = config.filters[filterKey];
    
    if (!filterConfig) {
      // Filtro personalizado basado en propiedades de la tarjeta
      return this.applyPropertyFilter(cards, filterKey, filterValue);
    }

    switch (filterConfig.type) {
      case 'text':
      case 'search':
        return this.applyTextFilter(cards, filterValue, filterConfig);
      
      case 'select':
        return this.applySelectFilter(cards, filterKey, filterValue, filterConfig);
      
      case 'date':
        return this.applyDateFilter(cards, filterKey, filterValue, filterConfig);
      
      case 'boolean':
        return this.applyBooleanFilter(cards, filterKey, filterValue);
      
      default:
        return this.applyPropertyFilter(cards, filterKey, filterValue);
    }
  }

  /**
   * Filtro de texto/búsqueda
   */
  applyTextFilter(cards, searchTerm, config) {
    const searchLower = searchTerm.toLowerCase();
    const fieldsToSearch = config.fields || ['title', 'description'];

    return cards.filter(card => {
      return fieldsToSearch.some(field => {
        const value = this.getNestedProperty(card, field);
        return value && value.toString().toLowerCase().includes(searchLower);
      });
    });
  }

  /**
   * Filtro de select (simple o múltiple)
   */
  applySelectFilter(cards, filterKey, filterValue, config) {
    const values = Array.isArray(filterValue) ? filterValue : [filterValue];
    
    return cards.filter(card => {
      const cardValue = this.getNestedProperty(card, filterKey);
      
      if (!cardValue) return false;
      
      // Manejar valores especiales
      if (values.includes('No Sprint') && (!cardValue || cardValue === '')) {
        return true;
      }
      
      if (values.includes('Sin épica') && (!cardValue || cardValue === '')) {
        return true;
      }

      return values.some(value => {
        if (typeof cardValue === 'string') {
          return cardValue === value;
        }
        
        if (typeof cardValue === 'object') {
          return cardValue.title === value || cardValue.name === value;
        }
        
        return cardValue == value;
      });
    });
  }

  /**
   * Filtro de fecha
   */
  applyDateFilter(cards, filterKey, filterValue, config) {
    const targetDate = new Date(filterValue);
    
    return cards.filter(card => {
      const cardDate = new Date(this.getNestedProperty(card, filterKey));
      
      switch (config.operator || 'equals') {
        case 'after':
          return cardDate > targetDate;
        case 'before':
          return cardDate < targetDate;
        case 'equals':
        default:
          return cardDate.toDateString() === targetDate.toDateString();
      }
    });
  }

  /**
   * Filtro booleano
   */
  applyBooleanFilter(cards, filterKey, filterValue) {
    return cards.filter(card => {
      const cardValue = this.getNestedProperty(card, filterKey);
      return Boolean(cardValue) === Boolean(filterValue);
    });
  }

  /**
   * Filtro genérico por propiedad
   */
  applyPropertyFilter(cards, property, value) {
    return cards.filter(card => {
      const cardValue = this.getNestedProperty(card, property);
      
      if (Array.isArray(value)) {
        return value.includes(cardValue);
      }
      
      return cardValue === value;
    });
  }

  /**
   * Aplica ordenación
   */
  applySorting(cards, sortKey, config) {
    const sortConfig = config.sortOptions?.find(opt => 
      typeof opt === 'object' ? opt.key === sortKey : opt === sortKey
    );

    return cards.sort((a, b) => {
      const aValue = this.getNestedProperty(a, sortKey);
      const bValue = this.getNestedProperty(b, sortKey);

      if (sortConfig?.type === 'date') {
        return new Date(bValue) - new Date(aValue);
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue);
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return aValue - bValue;
      }

      return String(aValue).localeCompare(String(bValue));
    });
  }

  /**
   * Obtiene una propiedad anidada de un objeto
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key];
    }, obj);
  }

  /**
   * Establece filtros activos para un tipo
   */
  setActiveFilters(cardType, filters) {
    this.activeFilters.set(cardType, { ...filters });
    this.notifyListeners(cardType, filters);
  }

  /**
   * Obtiene filtros activos para un tipo
   */
  getActiveFilters(cardType) {
    return this.activeFilters.get(cardType) || {};
  }

  /**
   * Limpia filtros para un tipo
   */
  clearFilters(cardType) {
    this.activeFilters.delete(cardType);
    this.notifyListeners(cardType, {});
  }

  /**
   * Registra un listener para cambios de filtros
   */
  addListener(cardType, callback) {
    if (!this.listeners.has(cardType)) {
      this.listeners.set(cardType, new Set());
    }
    this.listeners.get(cardType).add(callback);
  }

  /**
   * Remueve un listener
   */
  removeListener(cardType, callback) {
    const typeListeners = this.listeners.get(cardType);
    if (typeListeners) {
      typeListeners.delete(callback);
    }
  }

  /**
   * Notifica a los listeners sobre cambios
   */
  notifyListeners(cardType, filters) {
    const typeListeners = this.listeners.get(cardType);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(filters);
        } catch (error) {
          console.error(`Error in filter listener for ${cardType}:`, error);
        }
      }
    }
  }

  /**
   * Genera configuraciones de filtros para tipos de tarjetas conocidos
   */
  initializeDefaultConfigs() {
    // Configuración para tasks
    this.registerFilterConfig('task', {
      filters: {
        search: {
          type: 'text',
          placeholder: 'Search tasks...',
          fields: ['title', 'description', 'acceptanceCriteria']
        },
        status: {
          type: 'select',
          label: 'Status',
          multiple: true,
          options: ['TO DO', 'IN PROGRESS', 'TO VALIDATE', 'DONE&VALIDATED', 'BLOCKED']
        },
        developer: {
          type: 'select',
          label: 'Developer',
          multiple: true,
          options: []
        },
        priority: {
          type: 'select',
          label: 'Priority',
          multiple: true,
          options: ['High', 'Medium', 'Low', 'Not evaluated']
        }
      },
      sortOptions: ['title', 'createdDate', 'status', 'priority'],
      defaultSort: 'createdDate'
    });

    // Configuración para bugs
    this.registerFilterConfig('bug', {
      filters: {
        search: {
          type: 'text',
          placeholder: 'Search bugs...',
          fields: ['title', 'description', 'acceptanceCriteria']
        },
        status: {
          type: 'select',
          label: 'Status',
          multiple: true,
          options: ['CREATED', 'ASSIGNED', 'FIXED', 'VERIFIED', 'CLOSED']
        },
        priority: {
          type: 'select',
          label: 'Priority',
          multiple: true,
          options: ['Application Blocker', 'Department Blocker', 'Individual Blocker', 
                   'User Experience Issue', 'Workflow Improvement', 'Workaround Available Issue']
        }
      },
      sortOptions: ['title', 'createdDate', 'status', 'priority'],
      defaultSort: 'createdDate'
    });

  }

  /**
   * Obtiene estadísticas del servicio
   */
  getStats() {
    return {
      configsCount: this.filterConfigs.size,
      activeFiltersCount: this.activeFilters.size,
      listenersCount: Array.from(this.listeners.values())
        .reduce((total, set) => total + set.size, 0)
    };
  }
}

// Instancia global del servicio
export const filterService = new FilterService();