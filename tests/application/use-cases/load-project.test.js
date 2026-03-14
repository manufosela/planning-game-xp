/**
 * Tests for LoadProject use case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoadProject } from '../../../src/application/use-cases/load-project.js';

describe('LoadProject', () => {
  /** @type {any} */
  let projectRepo;
  /** @type {any} */
  let cardRepo;
  /** @type {any} */
  let teamRepo;
  /** @type {any} */
  let realtimePort;
  /** @type {LoadProject} */
  let useCase;

  const mockProject = { id: 'proj1', name: 'Test Project', abbreviation: 'TST' };
  const mockTeam = [{ id: 'dev_001', name: 'Dev' }];
  const mockCards = [{ cardId: 'TST-TSK-0001', type: 'task', title: 'Task 1' }];

  beforeEach(() => {
    projectRepo = {
      get: vi.fn().mockResolvedValue(mockProject),
    };
    cardRepo = {
      getAll: vi.fn().mockResolvedValue(mockCards),
    };
    teamRepo = {
      getAll: vi.fn().mockResolvedValue(mockTeam),
    };
    realtimePort = {
      subscribeToCards: vi.fn().mockReturnValue(vi.fn()),
    };
    useCase = new LoadProject({
      projectRepository: projectRepo,
      cardRepository: cardRepo,
      teamRepository: teamRepo,
      realtimePort: realtimePort,
    });
  });

  it('should load project, team, and cards in parallel', async () => {
    const result = await useCase.execute('proj1');

    expect(result.project).toEqual(mockProject);
    expect(result.team).toEqual(mockTeam);
    expect(result.cards).toEqual(mockCards);
    expect(projectRepo.get).toHaveBeenCalledWith('proj1');
    expect(cardRepo.getAll).toHaveBeenCalledWith('proj1');
    expect(teamRepo.getAll).toHaveBeenCalledWith('proj1');
  });

  it('should subscribe to realtime updates', async () => {
    const result = await useCase.execute('proj1');

    expect(realtimePort.subscribeToCards).toHaveBeenCalledWith('proj1', expect.any(Function));
    expect(typeof result.unsubscribe).toBe('function');
  });

  it('should throw if project not found', async () => {
    projectRepo.get.mockResolvedValue(null);
    await expect(useCase.execute('nope')).rejects.toThrow('Project not found');
  });

  it('should propagate realtime updates via onCardsUpdate callback (R-3)', async () => {
    const onCardsUpdate = vi.fn();
    const result = await useCase.execute('proj1', { onCardsUpdate });

    // Simulate the realtime port calling the internal callback with updated cards
    const realtimeCallback = realtimePort.subscribeToCards.mock.calls[0][1];
    const updatedCards = [
      { cardId: 'TST-TSK-0001', type: 'task', title: 'Task 1 updated' },
      { cardId: 'TST-TSK-0002', type: 'task', title: 'Task 2' },
    ];
    realtimeCallback(updatedCards);

    expect(onCardsUpdate).toHaveBeenCalledWith(updatedCards);
    expect(result.cards).toEqual(mockCards); // initial load unchanged
  });

  it('should work without onCardsUpdate callback (backwards compatible)', async () => {
    const result = await useCase.execute('proj1');

    expect(result.cards).toEqual(mockCards);
    expect(realtimePort.subscribeToCards).toHaveBeenCalled();
  });
});
