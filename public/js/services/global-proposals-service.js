import { dalService } from './dal-service.js';
/**
 * Servicio para gestionar el backlog global de propuestas
 * Permite cargar propuestas de múltiples proyectos y gestionar su orden global
 */
export const globalProposalsService = {
  _orderUnsubscribe: null,

  /**
   * Carga todas las propuestas de los proyectos especificados
   * @param {string[]} projectIds - Lista de IDs de proyectos
   * @returns {Promise<Array>} - Array de propuestas con información del proyecto
   */
  async loadAllProposals(projectIds) {
    const allProposals = [];

    const loadPromises = projectIds.map(async (projectId) => {
      try {
        const proposals = await dalService.cards.listCards(projectId, 'proposal');

        if (proposals) {
          Object.entries(proposals).forEach(([firebaseId, proposal]) => {
            allProposals.push({
              ...proposal,
              firebaseId,
              projectId,
              compositeKey: `${projectId}/${firebaseId}`
            });
          });
        }
      } catch (error) {
        // Silently ignore - project may not have proposals
      }
    });

    await Promise.all(loadPromises);
    return allProposals;
  },

  /**
   * Carga el orden global de propuestas desde Firebase
   * @returns {Promise<Object>} - Objeto con el orden y metadata
   */
  async loadGlobalOrder() {
    try {
      const data = await dalService.config.getGlobalProposalOrder();
      return data || { order: [], lastUpdatedBy: null, lastUpdatedAt: null };
    } catch (error) {
      return { order: [], lastUpdatedBy: null, lastUpdatedAt: null };
    }
  },

  /**
   * Guarda el nuevo orden global de propuestas
   * @param {Array} orderedProposals - Array de propuestas en el nuevo orden
   * @param {string} userEmail - Email del usuario que hace el cambio
   * @returns {Promise<void>}
   */
  async saveGlobalOrder(orderedProposals, userEmail) {
    const orderData = {
      order: orderedProposals.map(p => p.compositeKey || `${p.projectId}/${p.firebaseId}`),
      lastUpdatedBy: userEmail,
      lastUpdatedAt: new Date().toISOString()
    };

    await dalService.config.setGlobalProposalOrder(orderData);
  },

  /**
   * Combina propuestas con el orden almacenado
   * - Propuestas ordenadas primero (respetando el orden guardado)
   * - Propuestas nuevas (no en el orden) al final
   * - Propuestas eliminadas se ignoran
   * @param {Array} proposals - Todas las propuestas cargadas
   * @param {string[]} storedOrder - Array de compositeKeys en orden
   * @returns {Array} - Propuestas ordenadas
   */
  mergeWithOrder(proposals, storedOrder) {
    const proposalMap = new Map(
      proposals.map(p => [p.compositeKey, p])
    );

    const ordered = [];
    const usedKeys = new Set();

    // Añadir propuestas en el orden almacenado
    for (const key of storedOrder) {
      if (proposalMap.has(key)) {
        ordered.push(proposalMap.get(key));
        usedKeys.add(key);
      }
    }

    // Añadir propuestas nuevas que no están en el orden
    for (const [key, proposal] of proposalMap) {
      if (!usedKeys.has(key)) {
        ordered.push(proposal);
      }
    }

    return ordered;
  },

  /**
   * Suscribirse a cambios en el orden para actualizaciones en tiempo real
   * @param {Function} callback - Función a llamar cuando cambie el orden
   * @returns {Function} - Función para cancelar la suscripción
   */
  subscribeToOrderChanges(callback) {
    if (this._orderUnsubscribe) {
      this._orderUnsubscribe();
    }

    this._orderUnsubscribe = dalService.config.subscribeToGlobalProposalOrder((data) => {
      callback(data || { order: [] });
    });

    return this._orderUnsubscribe;
  },

  /**
   * Cancela la suscripción a cambios de orden
   */
  unsubscribe() {
    if (this._orderUnsubscribe) {
      this._orderUnsubscribe();
      this._orderUnsubscribe = null;
    }
  }
};

export default globalProposalsService;
