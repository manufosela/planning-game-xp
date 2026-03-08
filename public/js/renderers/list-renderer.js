import { UIUtils } from '../utils/ui-utils.js';

export class ListRenderer {
  constructor() {
    this.sortOrder = { field: null, direction: 'asc' };
  }

  renderListView(container, cards, config) {
    container.innerHTML = '';

    if (!cards || Object.keys(cards).length === 0) {
      const emptyMessage = UIUtils.createElement('p', {
        style: { textAlign: 'center', padding: '2rem', color: '#64748b' }
      }, 'No cards found');
      container.appendChild(emptyMessage);
      return;
    }

    // Render cards
    const cardsContainer = UIUtils.createElement('div', {
      className: 'cards-list-container',
      style: {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: '1rem',
        justifyContent: 'flex-start',
        alignContent: 'flex-start',
        width: '100%'
      }
    });

    // Cards arrive pre-filtered by UnifiedFilterService, only apply sorting
    const sortedCards = this.applySorting(cards);

    Object.entries(sortedCards).forEach(([id, cardData]) => {
      if (cardData.deletedAt) return;

      const cardElement = this.createListCard(cardData, id, config);
      cardsContainer.appendChild(cardElement);
    });

    container.appendChild(cardsContainer);
  }

  createListCard(cardData, id, config) {
    const card = document.createElement(cardData.cardType || config.projectCardElement[config.section]);

    // Configure card properties
    Object.assign(card, cardData);
    card.firebaseId = id;  // Asignar Firebase ID explícitamente
    card.projectId = config.projectId;
    card.userEmail = config.userEmail;
    card.group = config.section;
    card.section = config.section;

    return card;
  }

  applySorting(cards) {
    const entries = Object.entries(cards);
    
    
    entries.sort(([idA, cardA], [idB, cardB]) => {
      // Default sorting: by sprint (most recent first), tasks without sprint at the end
      if (!this.sortOrder.field) {
        return this.sortBySprint(cardA, cardB);
      }

      // Custom field sorting
      let valueA = cardA[this.sortOrder.field];
      let valueB = cardB[this.sortOrder.field];

      // Handle special sorting cases
      if (this.sortOrder.field === 'priority') {
        valueA = this.calculatePriority(cardA);
        valueB = this.calculatePriority(cardB);
      }

      // Convert to comparable values
      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();

      let comparison = 0;
      if (valueA < valueB) comparison = -1;
      if (valueA > valueB) comparison = 1;

      return this.sortOrder.direction === 'desc' ? -comparison : comparison;
    });

    return Object.fromEntries(entries);
  }

  sortBySprint(cardA, cardB) {
    const sprintA = cardA.sprint || '';
    const sprintB = cardB.sprint || '';

    // Tasks without sprint go to the end
    if (!sprintA && !sprintB) return 0;
    if (!sprintA) return 1;
    if (!sprintB) return -1;

    // Extract sprint number for comparison (e.g., "Sprint 3" -> 3)
    const getSprintNumber = (sprintName) => {
      const match = sprintName.match(/sprint\s*(\d+)/i);
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

  cleanup() {
    this.sortOrder = { field: null, direction: 'asc' };
  }
}