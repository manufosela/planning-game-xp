import { dalService } from './dal-service.js';

const TAG_TO_TYPE = {
  'task-card': 'task',
  'bug-card': 'bug',
  'epic-card': 'epic',
  'proposal-card': 'proposal',
  'qa-card': 'qa',
  'sprint-card': 'sprint'
};

/**
 * Servicio para gestionar reactividad en tiempo real de cards individuales
 * Permite que cards expandidas se actualicen automáticamente cuando cambian en Firebase
 */
export class CardRealtimeService {
  constructor() {
    this.activeSubscriptions = new Map(); // cardId -> unsubscribe function
    this.subscribedCards = new Map(); // cardId -> Set of card elements
    this.latestCardData = new Map(); // cardId -> last snapshot data
  }

  /**
   * Suscribe una card a cambios en tiempo real
   * @param {HTMLElement} cardElement - Elemento de la card
   */
  subscribeToCard(cardElement) {
    // Verificar si es una card temporal (nueva)
    const firebaseId = cardElement.firebaseId || cardElement.id;
    if (!firebaseId || firebaseId.startsWith('temp-') || firebaseId.includes('temp') || cardElement.cardId?.startsWith('temp-') || cardElement.cardId?.includes('temp')) {
return;
    }
if (!cardElement.cardId || !cardElement.projectId) {
return;
    }

    const cardKey = `${cardElement.projectId}_${cardElement.cardId}`;
    
    // Si ya existe una suscripción para esta card, solo agregar el elemento
    if (this.subscribedCards.has(cardKey)) {
      this.subscribedCards.get(cardKey).add(cardElement);
const cachedData = this.latestCardData.get(cardKey);
      if (cachedData) {
        this.updateCardElement(cardElement, cachedData);
      }
      return;
    }

    // Crear nueva suscripción
    const cardInfo = this.getCardInfo(cardElement);
    if (!cardInfo) {
return;
    }
// Crear set para elementos suscritos a esta card
    this.subscribedCards.set(cardKey, new Set([cardElement]));

    // Crear listener via DAL
    const unsubscribe = dalService.cards.subscribeToCard(
      cardInfo.projectId, cardInfo.type, cardInfo.firebaseId,
      (snapshot) => {
        this.handleCardDataUpdate(cardKey, snapshot, cardInfo);
      }
    );

    // Guardar función de cleanup
    this.activeSubscriptions.set(cardKey, unsubscribe);
  }

  /**
   * Desuscribe una card de cambios en tiempo real
   * @param {HTMLElement} cardElement - Elemento de la card
   */
  unsubscribeFromCard(cardElement) {
    if (!cardElement.cardId || !cardElement.projectId) {
      return;
    }

    const cardKey = `${cardElement.projectId}_${cardElement.cardId}`;
    const subscribedElements = this.subscribedCards.get(cardKey);

    if (!subscribedElements) {
      return;
    }

    // Remover el elemento específico
    subscribedElements.delete(cardElement);
// Si no quedan elementos suscritos, limpiar la suscripción
    if (subscribedElements.size === 0) {
      const unsubscribe = this.activeSubscriptions.get(cardKey);
      if (unsubscribe) {
        unsubscribe();
        this.activeSubscriptions.delete(cardKey);
        this.subscribedCards.delete(cardKey);
        this.latestCardData.delete(cardKey);
}
    }
  }

  /**
   * Maneja actualizaciones de datos de Firebase
   * @param {string} cardKey - Clave de la card
   * @param {Object} snapshot - Snapshot de Firebase
   */
  handleCardDataUpdate(cardKey, snapshot, cardInfo) {
    const subscribedElements = this.subscribedCards.get(cardKey);
    if (!subscribedElements || subscribedElements.size === 0) {
      return;
    }

    if (snapshot.exists()) {
      const cardData = snapshot.val();
      this.latestCardData.set(cardKey, cardData);

      // Detect Cloud Function validation reverts and notify the user
      if (cardData._validationReverted) {
        const errorMessage = cardData._validationError || 'Status change was reverted by validation';
        document.dispatchEvent(new CustomEvent('show-slide-notification', {
          detail: { options: { message: errorMessage, type: 'error' } }
        }));
        // Clean up the transient flags in Firebase so they don't trigger again on reload
        if (cardInfo) {
          dalService.cards.updateCard(cardInfo.projectId, cardInfo.type, cardInfo.firebaseId, {
            _validationReverted: null,
            _validationError: null
          });
        }
        delete cardData._validationReverted;
        delete cardData._validationError;
      }

      // Actualizar todos los elementos suscritos
      subscribedElements.forEach(cardElement => {
        this.updateCardElement(cardElement, cardData);
      });
    } else {
      // La card fue eliminada
subscribedElements.forEach(cardElement => {
        this.handleCardDeleted(cardElement);
      });
    }
  }

  /**
   * Actualiza un elemento de card con nuevos datos
   * @param {HTMLElement} cardElement - Elemento de la card
   * @param {Object} cardData - Datos actualizados de la card
   */
  async updateCardElement(cardElement, cardData) {
    try {
      // Preservar estado de expansión
      const wasExpanded = cardElement.expanded;
      
      
      // Actualizar propiedades de la card una por una para detectar cambios
      let hasChanges = false;
      const changedFields = [];
      
      // Fields that should NEVER come from Firebase (UI state only)
      const uiOnlyFields = ['expanded', 'selected', 'isSaving', 'isEditable'];

      Object.keys(cardData).forEach(key => {
        // Skip UI-only fields that may have been saved by mistake
        if (uiOnlyFields.includes(key)) return;

        if (cardElement.hasOwnProperty(key) || cardElement.constructor.properties?.[key]) {
          const oldValue = cardElement[key];
          const newValue = cardData[key];
          
          // Solo actualizar si el valor realmente cambió
          if (oldValue !== newValue) {
            cardElement[key] = newValue;
            hasChanges = true;
            changedFields.push(key);
            
            // Log cambios significativos
            if (!['lastModified', 'lastModifiedBy'].includes(key)) {
}
          }
        }
      });

      // Restaurar estado de expansión
      cardElement.expanded = wasExpanded;

      // Solo forzar re-render si hubo cambios
      if (hasChanges && cardElement.requestUpdate) {
        cardElement.requestUpdate();
        
        // Esperar a que el update se complete
        if (cardElement.updateComplete) {
          await cardElement.updateComplete;
        }
        
        // NUEVA FUNCIONALIDAD: Forzar actualización de campos de formulario
        // Esto es necesario porque Lit's .value binding puede no reflejar cambios programáticos
        if (wasExpanded && changedFields.length > 0) {
          await this._forceFormFieldUpdates(cardElement, changedFields);
        }
}
} catch (error) {
      // Silently ignore card element update errors
    }
  }

  /**
   * Fuerza la actualización de campos de formulario en el DOM
   * Necesario porque Lit's .value binding puede no reflejar cambios programáticos
   * @param {HTMLElement} cardElement - Elemento de la card
   * @param {Array} changedFields - Lista de campos que cambiaron
   */
  async _forceFormFieldUpdates(cardElement, changedFields) {
    try {
// Esperar a que el shadow DOM esté actualizado
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Mapeo de propiedades a selectores de elementos DOM
      const fieldSelectors = {
        title: 'input.title-input, input[type="text"]',
        description: 'textarea[placeholder*="description"]',
        acceptanceCriteria: 'textarea[placeholder*="acceptance"]',
        businessPoints: 'select[class*="business"]',
        devPoints: 'select[class*="dev"]',
        status: 'select[class*="status"]',
        startDate: 'input[type="date"]:first-of-type',
        desiredDate: 'input[type="date"]:nth-of-type(2)',
        endDate: 'input[type="date"]:last-of-type',
        bbbWhy: 'textarea[placeholder*="razón del bloqueo"]:first-of-type',
        bbdWhy: 'textarea[placeholder*="razón del bloqueo"]:last-of-type',
        sprint: 'select[class*="sprint"]',
        epic: 'select[class*="epic"]',
        developer: 'select[class*="developer"]',
        validator: 'select[class*="validator"]'
      };
      
      // Actualizar cada campo que cambió
      changedFields.forEach(fieldName => {
        const selector = fieldSelectors[fieldName];
        if (selector) {
          const fieldElement = cardElement.shadowRoot?.querySelector(selector);
          if (fieldElement) {
            const newValue = cardElement[fieldName];
            
            // Para inputs y textareas, usar .value
            if (fieldElement.tagName === 'INPUT' || fieldElement.tagName === 'TEXTAREA') {
              if (fieldElement.value !== newValue) {
                fieldElement.value = newValue || '';
}
            }
            // Para selects, necesitamos verificar que la opción existe
            else if (fieldElement.tagName === 'SELECT') {
              const stringValue = String(newValue || '');
              if (fieldElement.value !== stringValue) {
                // Verificar que la opción existe antes de asignar
                const optionExists = Array.from(fieldElement.options).some(opt => opt.value === stringValue);
                if (optionExists) {
                  fieldElement.value = stringValue;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      // Silently handle update errors
    }
  }

  /**
   * Maneja cuando una card es eliminada
   * @param {HTMLElement} cardElement - Elemento de la card
   */
  handleCardDeleted(cardElement) {
    // Notificar que la card fue eliminada
    cardElement.dispatchEvent(new CustomEvent('card-deleted-remotely', {
      detail: { cardId: cardElement.cardId },
      bubbles: true,
      composed: true
    }));

    // Si está en un modal, cerrar el modal
    const modal = cardElement.closest('app-modal');
    if (modal && modal.close) {
      modal.close();
      
      // Mostrar notificación
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: {
          options: {
            message: 'Esta tarjeta fue eliminada por otro usuario',
            type: 'warning',
            timetohide: 5000
          }
        }
      }));
    }
  }

  /**
   * Extracts card info needed for DAL operations
   * @param {HTMLElement} cardElement - Card element
   * @returns {{projectId: string, type: string, firebaseId: string}|null}
   */
  getCardInfo(cardElement) {
    const { projectId, tagName } = cardElement;

    const firebaseId = cardElement.firebaseId || cardElement.id;

    if (!firebaseId || firebaseId.startsWith('temp-') || firebaseId.includes('temp')) {
      return null;
    }

    const type = TAG_TO_TYPE[tagName.toLowerCase()];
    if (!type) {
return null;
    }

    return { projectId, type, firebaseId };
  }

  /**
   * Limpia todas las suscripciones
   */
  cleanup() {
this.activeSubscriptions.forEach((unsubscribe, cardKey) => {
      try {
        unsubscribe();
      } catch (error) {
        // Silently ignore unsubscribe errors during cleanup
      }
    });

    this.activeSubscriptions.clear();
    this.subscribedCards.clear();
  }

  /**
   * Obtiene estadísticas del servicio
   */
  getStats() {
    return {
      activeSubscriptions: this.activeSubscriptions.size,
      subscribedCards: this.subscribedCards.size,
      totalElements: Array.from(this.subscribedCards.values())
        .reduce((total, set) => total + set.size, 0)
    };
  }
}

// Instancia global del servicio (se inicializará en el AppController)
export let cardRealtimeService = null;

/**
 * Inicializa el servicio global
 */
export function initCardRealtimeService() {
  if (!cardRealtimeService) {
    cardRealtimeService = new CardRealtimeService();
}
  return cardRealtimeService;
}
