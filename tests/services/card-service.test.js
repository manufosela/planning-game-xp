import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestCard } from '../utils/test-helpers.js';

const mockGetCard = vi.fn();
const mockUpdateCard = vi.fn();
const mockFindCardByCardId = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    cards: {
      getCard: (...args) => mockGetCard(...args),
      updateCard: (...args) => mockUpdateCard(...args),
      findCardByCardId: (...args) => mockFindCardByCardId(...args),
    },
  },
}));

// Minimal firebase-config mock to prevent import errors
vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: vi.fn(),
  onValue: vi.fn(),
  auth: {},
  databaseFirestore: {},
  doc: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  firebaseConfig: {},
  superAdminEmail: '',
}));

const { CardService } = await import('../../public/js/services/card-service.js');

describe('CardService', () => {
  let cardService;

  beforeEach(() => {
    vi.clearAllMocks();
    cardService = new CardService();
  });

  describe('orderCards', () => {
    it('debería ordenar task cards correctamente', () => {
      const task1 = createTestCard('task', { cardId: 'task1', businessPoints: 10, devPoints: 5, sprintId: 'sprint1', blocked: false, startDate: '2024-01-01', desiredDate: '2024-01-15' });
      const task2 = createTestCard('task', { cardId: 'task2', businessPoints: 5, devPoints: 2, sprintId: 'sprint1', blocked: true, startDate: '2024-01-02', desiredDate: '2024-01-10' });
      const cards = { task1, task2 };
      const result = cardService.orderCards(cards, 'task-card');
      const resultArray = Object.values(result);
      expect(resultArray[0].cardId).toBe('task2');
    });
    it('debería ordenar bug cards correctamente', () => {
      const bug1 = createTestCard('bug', { cardId: 'bug1', bugpriorityList: 2, blocked: false, startDate: '2024-01-01', desiredDate: '2024-01-15' });
      const bug2 = createTestCard('bug', { cardId: 'bug2', bugpriorityList: 1, blocked: true, startDate: '2024-01-02', desiredDate: '2024-01-10' });
      const cards = { bug1, bug2 };
      const result = cardService.orderCards(cards, 'bug-card');
      const resultArray = Object.values(result);
      expect(resultArray[0].cardId).toBe('bug2');
    });
    it('debería retornar cards sin ordenar para tipos no soportados', () => {
      const epic1 = createTestCard('epic', { cardId: 'epic1' });
      const epic2 = createTestCard('epic', { cardId: 'epic2' });
      const cards = { epic1, epic2 };
      const result = cardService.orderCards(cards, 'epic-card');
      expect(result).toEqual(cards);
    });
  });

  describe('compareCards', () => {
    it('debería comparar task cards correctamente', () => {
      const task1 = createTestCard('task', { businessPoints: 10, devPoints: 5, sprintId: 'sprint1', blocked: false, startDate: '2024-01-01', desiredDate: '2024-01-15' });
      const task2 = createTestCard('task', { businessPoints: 5, devPoints: 2, sprintId: 'sprint1', blocked: true, startDate: '2024-01-02', desiredDate: '2024-01-10' });
      const result = cardService.compareCards(task1, task2, 'task-card');
      expect(result).toBeGreaterThan(0);
    });
    it('debería comparar bug cards correctamente', () => {
      const bug1 = createTestCard('bug', { bugpriorityList: 2, blocked: false, startDate: '2024-01-01', desiredDate: '2024-01-15' });
      const bug2 = createTestCard('bug', { bugpriorityList: 1, blocked: true, startDate: '2024-01-02', desiredDate: '2024-01-10' });
      const result = cardService.compareCards(bug1, bug2, 'bug-card');
      expect(result).toBeGreaterThan(0);
    });
    it('debería manejar cards sin sprint correctamente', () => {
      const task1 = createTestCard('task', { sprintId: 'sprint1' });
      const task2 = createTestCard('task', { sprintId: null });
      const result = cardService.compareCards(task1, task2, 'task-card');
      expect(result).toBeLessThan(0);
    });
  });

  describe('moveCardToStatus', () => {
    it('debería mover una card a nuevo status exitosamente', async () => {
      mockGetCard.mockResolvedValue({ status: 'To Do', title: 'Test' });
      mockUpdateCard.mockResolvedValue(undefined);

      const result = await cardService.moveCardToStatus('test-project', 'tasks', 'test-card', 'In Progress');

      expect(result.success).toBe(true);
      expect(mockGetCard).toHaveBeenCalledWith('test-project', 'task', 'test-card');
      expect(mockUpdateCard).toHaveBeenCalledWith('test-project', 'task', 'test-card', { status: 'In Progress' });
    });

    it('debería manejar error cuando la card no existe', async () => {
      mockGetCard.mockResolvedValue(null);

      const result = await cardService.moveCardToStatus('test-project', 'tasks', 'non-existent', 'In Progress');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Card not found');
      expect(mockUpdateCard).not.toHaveBeenCalled();
    });

    it('debería manejar errores de Firebase', async () => {
      mockGetCard.mockRejectedValue(new Error('Firebase error'));

      const result = await cardService.moveCardToStatus('test-project', 'tasks', 'test-card', 'In Progress');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Firebase error');
    });

    it('debería convertir section UPPERCASE a type correctamente', async () => {
      mockGetCard.mockResolvedValue({ status: 'Created' });
      mockUpdateCard.mockResolvedValue(undefined);

      await cardService.moveCardToStatus('test-project', 'BUGS', 'bug-1', 'Assigned');

      expect(mockGetCard).toHaveBeenCalledWith('test-project', 'bug', 'bug-1');
      expect(mockUpdateCard).toHaveBeenCalledWith('test-project', 'bug', 'bug-1', { status: 'Assigned' });
    });
  });

  describe('moveCardToPriority', () => {
    it('debería ignorar cambio de prioridad para tasks', async () => {
      const result = await cardService.moveCardToPriority('test-project', 'TASKS', 'test-card', 'High');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Priority is calculated for tasks, no update needed');
      expect(mockGetCard).not.toHaveBeenCalled();
    });

    it('debería actualizar prioridad para bugs', async () => {
      mockGetCard.mockResolvedValue({ priority: 'Low' });
      mockUpdateCard.mockResolvedValue(undefined);

      const result = await cardService.moveCardToPriority('test-project', 'BUGS', 'test-bug', 'High');

      expect(result.success).toBe(true);
      expect(mockGetCard).toHaveBeenCalledWith('test-project', 'bug', 'test-bug');
      expect(mockUpdateCard).toHaveBeenCalledWith('test-project', 'bug', 'test-bug', { priority: 'High' });
    });
  });

  describe('moveCardToSprint', () => {
    it('debería mover una card a un sprint exitosamente', async () => {
      mockGetCard.mockResolvedValue({ sprint: 'old-sprint', title: 'Test' });
      mockUpdateCard.mockResolvedValue(undefined);

      const result = await cardService.moveCardToSprint('test-project', 'test-card', 'new-sprint');

      expect(result.success).toBe(true);
      expect(mockGetCard).toHaveBeenCalledWith('test-project', 'task', 'test-card');
      expect(mockUpdateCard).toHaveBeenCalledWith('test-project', 'task', 'test-card', { sprint: 'new-sprint' });
    });

    it('debería buscar por cardId si no se encuentra como firebaseId', async () => {
      mockGetCard.mockResolvedValue(null); // direct lookup fails
      mockFindCardByCardId.mockResolvedValue({
        firebaseId: '-abc123',
        data: { sprint: 'old', title: 'Test' }
      });
      mockUpdateCard.mockResolvedValue(undefined);

      const result = await cardService.moveCardToSprint('test-project', 'PRJ-TSK-0001', 'new-sprint');

      expect(result.success).toBe(true);
      expect(mockFindCardByCardId).toHaveBeenCalledWith('test-project', 'PRJ-TSK-0001', 'task');
      expect(mockUpdateCard).toHaveBeenCalledWith('test-project', 'task', '-abc123', { sprint: 'new-sprint' });
    });

    it('debería incluir year en la actualización si se proporciona', async () => {
      mockGetCard.mockResolvedValue({ sprint: 'old', title: 'Test' });
      mockUpdateCard.mockResolvedValue(undefined);

      const result = await cardService.moveCardToSprint('test-project', 'card-1', 'new-sprint', 2027);

      expect(result.success).toBe(true);
      expect(mockUpdateCard).toHaveBeenCalledWith('test-project', 'task', 'card-1', { sprint: 'new-sprint', year: 2027 });
    });

    it('debería manejar error cuando la card no existe', async () => {
      mockGetCard.mockResolvedValue(null);
      mockFindCardByCardId.mockResolvedValue(null);

      const result = await cardService.moveCardToSprint('test-project', 'PRJ-TSK-9999', 'new-sprint');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Card not found');
    });
  });
});
