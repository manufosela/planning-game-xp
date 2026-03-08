import { dalService } from './dal-service.js';

const SECTION_TO_TYPE = {
  tasks: 'task', TASKS: 'task',
  bugs: 'bug', BUGS: 'bug',
  epics: 'epic', EPICS: 'epic',
  proposals: 'proposal', PROPOSALS: 'proposal',
  sprints: 'sprint', SPRINTS: 'sprint',
  qa: 'qa', QA: 'qa'
};

export class CardService {
  constructor() {
  }

  orderCards(cards, cardType) {
    if (cardType !== 'task-card' && cardType !== 'bug-card') {
      return cards;
    }

    return Object.fromEntries(
      Object.entries(cards).sort(([idA, cardA], [idB, cardB]) => {
        return this.compareCards(cardA, cardB, cardType);
      })
    );
  }

  compareCards(cardA, cardB, cardType) {
    // 1. Order by sprint (most recent first, tasks without sprint at the end)
    const sprintCompare = this.compareBySprint(cardA, cardB);
    if (sprintCompare !== 0) return sprintCompare;

    // 2. Order by priority points
    if (cardType === 'task-card') {
      return this.compareTaskCards(cardA, cardB);
    }

    if (cardType === 'bug-card') {
      return this.compareBugCards(cardA, cardB);
    }

    return 0;
  }

  compareBySprint(cardA, cardB) {
    const sprintA = cardA.sprint ?? cardA.sprintId ?? '';
    const sprintB = cardB.sprint ?? cardB.sprintId ?? '';

    // Tasks without sprint go to the end
    if (!sprintA && !sprintB) return 0;
    if (!sprintA) return 1;
    if (!sprintB) return -1;

    // Extract sprint number for comparison (e.g., "Sprint 3" -> 3)
    const getSprintNumber = (sprintName) => {
      const match = sprintName.match(/sprint[\s_-]*(\d+)/i);
      return match ? parseInt(match[1]) : 0;
    };

    const numberA = getSprintNumber(sprintA);
    const numberB = getSprintNumber(sprintB);

    // If both have numbers, sort by number (descending - most recent first)
    if (numberA && numberB) {
      return numberB - numberA;
    }

    // If only one has a number, prioritize the numbered one
    if (numberA && !numberB) return -1;
    if (!numberA && numberB) return 1;

    // If neither has numbers, sort alphabetically (descending)
    return sprintB.localeCompare(sprintA);
  }

  compareTaskCards(cardA, cardB) {
    const priorityA = cardA.devPoints > 0 ? (cardA.businessPoints / cardA.devPoints) : -1;
    const priorityB = cardB.devPoints > 0 ? (cardB.businessPoints / cardB.devPoints) : -1;

    if (priorityA !== priorityB) return priorityB - priorityA;
    if (cardA.businessPoints !== cardB.businessPoints) return cardB.businessPoints - cardA.businessPoints;

    return this.compareByCommonCriteria(cardA, cardB);
  }

  compareBugCards(cardA, cardB) {
    const priorityA = typeof cardA.bugpriorityList === 'number' ? cardA.bugpriorityList : 999;
    const priorityB = typeof cardB.bugpriorityList === 'number' ? cardB.bugpriorityList : 999;

    if (priorityA !== priorityB) return priorityA - priorityB;

    return this.compareByCommonCriteria(cardA, cardB);
  }

  compareByCommonCriteria(cardA, cardB) {
    // Priority by blocked status
    const isBlockedA = !!cardA.blocked;
    const isBlockedB = !!cardB.blocked;
    if (isBlockedA !== isBlockedB) return isBlockedA - isBlockedB;

    // Priority by startDate
    const hasStartDateA = !!cardA.startDate;
    const hasStartDateB = !!cardB.startDate;
    if (hasStartDateA !== hasStartDateB) return hasStartDateB - hasStartDateA;

    // Priority by desiredDate
    const hasDesiredDateA = !!cardA.desiredDate;
    const hasDesiredDateB = !!cardB.desiredDate;
    if (hasDesiredDateA !== hasDesiredDateB) return hasDesiredDateB - hasDesiredDateA;

    // Final tie-breaker with desiredDate
    return new Date(cardA.desiredDate || '9999-12-31') - new Date(cardB.desiredDate || '9999-12-31');
  }

  async moveCardToStatus(projectId, section, cardId, newStatus) {
    try {
      const type = SECTION_TO_TYPE[section] || section.toLowerCase();
      const card = await dalService.cards.getCard(projectId, type, cardId);

      if (!card) {
        console.warn(`[CardService] moveCardToStatus: Card not found`, { projectId, section, cardId });
        return { success: false, error: 'Card not found' };
      }

      await dalService.cards.updateCard(projectId, type, cardId, { status: newStatus });
      return { success: true };
    } catch (error) {
      console.error(`[CardService] moveCardToStatus failed:`, {
        projectId, section, cardId, newStatus,
        error: error.message,
        stack: error.stack
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Mueve una card a una nueva prioridad (solo aplicable a bugs)
   * @param {string} projectId - ID del proyecto
   * @param {string} section - Sección de la card (BUGS, TASKS, etc.)
   * @param {string} cardId - ID de la card
   * @param {string} newPriority - Nueva prioridad
   * @returns {Promise<Object>} Resultado de la operación
   */
  async moveCardToPriority(projectId, section, cardId, newPriority) {
    try {
      // Tasks tienen priority calculada, no guardada - ignorar operación silenciosamente
      if (section === 'TASKS') {
        return { success: true, message: 'Priority is calculated for tasks, no update needed' };
      }

      const type = SECTION_TO_TYPE[section] || section.toLowerCase();
      const card = await dalService.cards.getCard(projectId, type, cardId);

      if (!card) {
        console.warn(`[CardService] moveCardToPriority: Card not found`, { projectId, section, cardId });
        return { success: false, error: 'Card not found' };
      }

      await dalService.cards.updateCard(projectId, type, cardId, { priority: newPriority });
      return { success: true };
    } catch (error) {
      console.error(`[CardService] moveCardToPriority failed:`, {
        projectId, section, cardId, newPriority,
        error: error.message,
        stack: error.stack
      });
      return { success: false, error: error.message };
    }
  }

  async moveCardToSprint(projectId, cardIdentifier, sprintId, newYear = null) {
    try {
      // First try as Firebase ID (direct lookup)
      let card = await dalService.cards.getCard(projectId, 'task', cardIdentifier);
      let firebaseId = cardIdentifier;

      // If not found and looks like a display cardId, search by cardId field
      if (!card && (cardIdentifier.includes('-') || cardIdentifier.includes('_'))) {
        const found = await dalService.cards.findCardByCardId(projectId, cardIdentifier, 'task');
        if (found) {
          firebaseId = found.firebaseId;
          card = found.data;
        }
      }

      if (card) {
        const updates = { sprint: sprintId };

        // Update year if provided (when moving to a sprint in a different year)
        if (newYear !== null && typeof newYear === 'number') {
          updates.year = newYear;
        }

        await dalService.cards.updateCard(projectId, 'task', firebaseId, updates);
        return { success: true };
      }

      console.warn(`[CardService] moveCardToSprint: Card not found`, { projectId, cardIdentifier, sprintId });
      return { success: false, error: 'Card not found' };
    } catch (error) {
      console.error(`[CardService] moveCardToSprint failed:`, {
        projectId, cardIdentifier, sprintId, newYear,
        error: error.message,
        stack: error.stack
      });
      return { success: false, error: error.message };
    }
  }
}
