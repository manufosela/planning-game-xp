/**
 * Integration test: domain services called through application use cases.
 * Verifies that CreateCard uses domain CardValidator (canEditCard),
 * ChangeStatus uses domain TransitionService (canTransition) and PermissionService (canChangeStatus).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateCard } from '../../src/application/use-cases/create-card.js';
import { ChangeStatus } from '../../src/application/use-cases/change-status.js';

describe('integration: domain ↔ application', () => {
  // Shared mock repos
  const cardRepo = () => ({
    generateId: vi.fn().mockReturnValue('PLN-TSK-0042'),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    countByStatus: vi.fn().mockResolvedValue(0),
  });
  const historyRepo = () => ({ add: vi.fn().mockResolvedValue(undefined) });
  const backlogRepo = () => ({
    addCard: vi.fn().mockResolvedValue(undefined),
    removeCard: vi.fn().mockResolvedValue(undefined),
  });
  const transitionRepo = () => ({ getWipLimit: vi.fn().mockResolvedValue(10) });

  // Users
  const developer = { uid: 'dev_001', role: 'developer', projects: { proj1: 'developer' } };
  const consultant = { uid: 'con_001', role: 'user', projects: { proj1: 'consultant' } };
  const stakeholder = { uid: 'stk_001', role: 'user', projects: { proj1: 'stakeholder' } };
  const outsider = { uid: 'out_001', role: 'user', projects: {} };
  const project = { id: 'proj1' };

  describe('CreateCard validates via domain PermissionService', () => {
    let repos;
    let createCard;

    beforeEach(() => {
      repos = { cardRepository: cardRepo(), historyRepository: historyRepo(), backlogRepository: backlogRepo() };
      createCard = new CreateCard(repos);
    });

    it('developer can create a task (domain permission check passes)', async () => {
      const data = { title: 'New task', type: 'task', status: 'To Do', year: 2026 };
      const result = await createCard.execute('proj1', data, developer, project);

      expect(result.cardId).toBe('PLN-TSK-0042');
      expect(repos.cardRepository.save).toHaveBeenCalled();
    });

    it('consultant is blocked by domain canEditCard', async () => {
      const data = { title: 'Blocked', type: 'task', status: 'To Do', year: 2026 };

      await expect(createCard.execute('proj1', data, consultant, project))
        .rejects.toThrow('Permission denied');
    });

    it('outsider is blocked by domain canEditCard', async () => {
      const data = { title: 'Blocked', type: 'task', status: 'To Do', year: 2026 };

      await expect(createCard.execute('proj1', data, outsider, project))
        .rejects.toThrow('Permission denied');
    });

    it('stakeholder can create proposal but not task (domain role check)', async () => {
      const proposal = { title: 'Idea', type: 'proposal', status: 'Pending', year: 2026 };
      const result = await createCard.execute('proj1', proposal, stakeholder, project);
      expect(result.cardId).toBe('PLN-TSK-0042');

      const task = { title: 'Task', type: 'task', status: 'To Do', year: 2026 };
      await expect(createCard.execute('proj1', task, stakeholder, project))
        .rejects.toThrow('Permission denied');
    });
  });

  describe('ChangeStatus validates via domain TransitionService', () => {
    let repos;
    let changeStatus;

    const taskCard = {
      cardId: 'PLN-TSK-0001', type: 'task', title: 'Task',
      status: 'To Do', year: 2026, createdBy: 'dev_001',
      developer: { id: 'dev_001', name: 'Dev', email: 'd@t.com' },
      validator: { id: 'stk_001', name: 'Val', email: 'v@t.com' },
      epic: 'PLN-EPC-0001', sprint: 'PLN-SPR-0001',
      devPoints: 2, businessPoints: 3,
      acceptanceCriteria: ['AC1'],
    };

    beforeEach(() => {
      repos = {
        cardRepository: cardRepo(),
        historyRepository: historyRepo(),
        stateTransitionRepository: transitionRepo(),
        backlogRepository: backlogRepo(),
      };
      repos.cardRepository.get.mockResolvedValue({ ...taskCard });
      changeStatus = new ChangeStatus(repos);
    });

    it('valid transition To Do → In Progress succeeds via domain canTransition', async () => {
      const result = await changeStatus.execute('proj1', 'PLN-TSK-0001', 'In Progress', developer, project);

      expect(result.previousStatus).toBe('To Do');
      expect(result.newStatus).toBe('In Progress');
    });

    it('invalid transition To Do → Done is blocked by domain canTransition', async () => {
      await expect(
        changeStatus.execute('proj1', 'PLN-TSK-0001', 'Done', developer, project)
      ).rejects.toThrow();
    });

    it('consultant is blocked by domain canChangeStatus permission check', async () => {
      await expect(
        changeStatus.execute('proj1', 'PLN-TSK-0001', 'In Progress', consultant, project)
      ).rejects.toThrow();
    });

    it('domain TRANSITION_RULES validate required fields', async () => {
      // Card missing required fields for To Do → In Progress
      repos.cardRepository.get.mockResolvedValue({
        cardId: 'PLN-TSK-0002', type: 'task', title: 'Incomplete',
        status: 'To Do', year: 2026, createdBy: 'dev_001',
        // Missing: developer, validator, epic, sprint, devPoints, businessPoints, acceptanceCriteria
      });

      await expect(
        changeStatus.execute('proj1', 'PLN-TSK-0002', 'In Progress', developer, project)
      ).rejects.toThrow();
    });
  });

  describe('ChangeStatus validates proposal/epic via VALID_STATUSES', () => {
    let repos;
    let changeStatus;

    beforeEach(() => {
      repos = {
        cardRepository: cardRepo(),
        historyRepository: historyRepo(),
        stateTransitionRepository: transitionRepo(),
        backlogRepository: backlogRepo(),
      };
      changeStatus = new ChangeStatus(repos);
    });

    it('proposal Pending → Planned is valid', async () => {
      repos.cardRepository.get.mockResolvedValue({
        cardId: 'PLN-PRP-0001', type: 'proposal', title: 'Idea',
        status: 'Pending', year: 2026, createdBy: 'stk_001',
      });

      const result = await changeStatus.execute('proj1', 'PLN-PRP-0001', 'Planned', stakeholder, project);
      expect(result.newStatus).toBe('Planned');
    });

    it('proposal → invalid status is blocked', async () => {
      repos.cardRepository.get.mockResolvedValue({
        cardId: 'PLN-PRP-0001', type: 'proposal', title: 'Idea',
        status: 'Pending', year: 2026, createdBy: 'stk_001',
      });

      await expect(
        changeStatus.execute('proj1', 'PLN-PRP-0001', 'In Progress', stakeholder, project)
      ).rejects.toThrow(/Invalid status/);
    });

    it('epic Draft → Active is valid', async () => {
      repos.cardRepository.get.mockResolvedValue({
        cardId: 'PLN-EPC-0001', type: 'epic', title: 'Epic',
        status: 'Draft', year: 2026, createdBy: 'dev_001',
      });

      const result = await changeStatus.execute('proj1', 'PLN-EPC-0001', 'Active', developer, project);
      expect(result.newStatus).toBe('Active');
    });

    it('unknown card type is blocked', async () => {
      repos.cardRepository.get.mockResolvedValue({
        cardId: 'PLN-UNK-0001', type: 'mystery', title: 'Unknown',
        status: 'Open', year: 2026, createdBy: 'dev_001',
      });

      await expect(
        changeStatus.execute('proj1', 'PLN-UNK-0001', 'Closed', developer, project)
      ).rejects.toThrow(/No status rules defined/);
    });
  });
});
