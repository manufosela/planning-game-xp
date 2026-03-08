import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateTransitionService } from '@/services/state-transition-service.js';

// Mock dalService
const mockGetTransitionData = vi.fn();
const mockGetTransitionField = vi.fn();
const mockSetTransitionField = vi.fn();
const mockAddTransition = vi.fn();
const mockSubscribeToTransitions = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    stateTransitions: {
      getTransitionData: (...args) => mockGetTransitionData(...args),
      getTransitionField: (...args) => mockGetTransitionField(...args),
      setTransitionField: (...args) => mockSetTransitionField(...args),
      addTransition: (...args) => mockAddTransition(...args),
      subscribeToTransitions: (...args) => mockSubscribeToTransitions(...args)
    }
  }
}));

// Mock firebase-config.js (only auth is used)
vi.mock('../../public/firebase-config.js', () => ({
  auth: { currentUser: { email: 'test@example.com' } }
}));

describe('StateTransitionService', () => {
  let service;

  beforeEach(() => {
    service = new StateTransitionService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize correctly', () => {
      expect(service._initialized).toBe(false);
      service.init();
      expect(service._initialized).toBe(true);
    });

    it('should not reinitialize if already initialized', () => {
      service.init();
      service._initialized = true;
      service.init();
      expect(service._initialized).toBe(true);
    });
  });

  describe('getCardTypeForPath', () => {
    it('should normalize task-card to tasks', () => {
      expect(service.getCardTypeForPath('task-card')).toBe('tasks');
    });

    it('should normalize bug-card to bugs', () => {
      expect(service.getCardTypeForPath('bug-card')).toBe('bugs');
    });

    it('should normalize proposal-card to proposals', () => {
      expect(service.getCardTypeForPath('proposal-card')).toBe('proposals');
    });

    it('should return input if not in map', () => {
      expect(service.getCardTypeForPath('unknown')).toBe('unknown');
    });
  });

  describe('getTransitionPath', () => {
    it('should build correct path', () => {
      const path = service.getTransitionPath('TestProject', 'task-card', 'TST-TSK-0001');
      expect(path).toBe('/stateTransitions/TestProject/tasks/TST-TSK-0001');
    });
  });

  describe('recordTransition', () => {
    it('should return null if projectId is missing', async () => {
      const result = await service.recordTransition(
        { cardId: 'TST-TSK-0001' },
        'To Do',
        'In Progress',
        'user@test.com'
      );
      expect(result).toBeNull();
    });

    it('should return null if cardId is missing', async () => {
      const result = await service.recordTransition(
        { projectId: 'TestProject' },
        'To Do',
        'In Progress',
        'user@test.com'
      );
      expect(result).toBeNull();
    });

    it('should return null if status did not change', async () => {
      const result = await service.recordTransition(
        { projectId: 'TestProject', cardId: 'TST-TSK-0001' },
        'In Progress',
        'In Progress',
        'user@test.com'
      );
      expect(result).toBeNull();
    });

    it('should record a transition successfully', async () => {
      mockGetTransitionData.mockResolvedValueOnce(null);
      mockAddTransition.mockResolvedValueOnce('mock-transition-id');

      const result = await service.recordTransition(
        { projectId: 'TestProject', cardId: 'TST-TSK-0001', cardType: 'task-card' },
        'To Do',
        'In Progress',
        'user@test.com'
      );

      expect(result).toBeTruthy();
      expect(result.fromStatus).toBe('To Do');
      expect(result.toStatus).toBe('In Progress');
      expect(result.changedBy).toBe('user@test.com');
      expect(result.id).toBe('mock-transition-id');
      expect(mockAddTransition).toHaveBeenCalledWith('TestProject', 'tasks', 'TST-TSK-0001', expect.any(Object));
    });

    it('should set firstInProgressDate when entering In Progress for the first time', async () => {
      mockGetTransitionData.mockResolvedValueOnce({
        firstInProgressDate: null,
        validationCycles: 0,
        transitions: {}
      });
      mockAddTransition.mockResolvedValueOnce('mock-id');
      mockSetTransitionField.mockResolvedValue(undefined);

      await service.recordTransition(
        { projectId: 'TestProject', cardId: 'TST-TSK-0001', cardType: 'task-card' },
        'To Do',
        'In Progress',
        'user@test.com'
      );

      expect(mockSetTransitionField).toHaveBeenCalledWith(
        'TestProject', 'tasks', 'TST-TSK-0001', 'firstInProgressDate', expect.any(String)
      );
    });

    it('should NOT overwrite firstInProgressDate if already set', async () => {
      mockGetTransitionData.mockResolvedValueOnce({
        firstInProgressDate: '2026-01-01',
        validationCycles: 0,
        transitions: {}
      });
      mockAddTransition.mockResolvedValueOnce('mock-id');

      await service.recordTransition(
        { projectId: 'TestProject', cardId: 'TST-TSK-0001', cardType: 'task-card' },
        'To Do',
        'In Progress',
        'user@test.com'
      );

      // setTransitionField should NOT be called for firstInProgressDate
      const firstInProgressCalls = mockSetTransitionField.mock.calls.filter(
        call => call[3] === 'firstInProgressDate'
      );
      expect(firstInProgressCalls.length).toBe(0);
    });

    it('should increment validationCycles when rejected (To Validate -> To Do)', async () => {
      mockGetTransitionData.mockResolvedValueOnce({
        firstInProgressDate: '2026-01-01',
        validationCycles: 1,
        transitions: {}
      });
      mockAddTransition.mockResolvedValueOnce('mock-id');
      mockSetTransitionField.mockResolvedValue(undefined);

      await service.recordTransition(
        { projectId: 'TestProject', cardId: 'TST-TSK-0001', cardType: 'task-card' },
        'To Validate',
        'To Do',
        'user@test.com'
      );

      expect(mockSetTransitionField).toHaveBeenCalledWith(
        'TestProject', 'tasks', 'TST-TSK-0001', 'validationCycles', 2
      );
    });

    it('should calculate durationInPrevious from last transition', async () => {
      const lastTimestamp = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago

      mockGetTransitionData.mockResolvedValueOnce({
        firstInProgressDate: '2026-01-01',
        validationCycles: 0,
        transitions: {
          'trans-1': {
            timestamp: lastTimestamp,
            fromStatus: 'To Do',
            toStatus: 'In Progress'
          }
        }
      });
      mockAddTransition.mockResolvedValueOnce('mock-id');

      const result = await service.recordTransition(
        { projectId: 'TestProject', cardId: 'TST-TSK-0001', cardType: 'task-card' },
        'In Progress',
        'To Validate',
        'user@test.com'
      );

      expect(result.durationInPrevious).toBeGreaterThan(0);
    });
  });

  describe('getFirstInProgressDate', () => {
    it('should return null if projectId is missing', async () => {
      const result = await service.getFirstInProgressDate(null, 'task-card', 'TST-TSK-0001');
      expect(result).toBeNull();
    });

    it('should return null if cardId is missing', async () => {
      const result = await service.getFirstInProgressDate('TestProject', 'task-card', null);
      expect(result).toBeNull();
    });

    it('should return the date if it exists', async () => {
      mockGetTransitionField.mockResolvedValueOnce('2026-01-15');

      const result = await service.getFirstInProgressDate('TestProject', 'task-card', 'TST-TSK-0001');
      expect(result).toBe('2026-01-15');
    });

    it('should return null if date does not exist', async () => {
      mockGetTransitionField.mockResolvedValueOnce(null);

      const result = await service.getFirstInProgressDate('TestProject', 'task-card', 'TST-TSK-0001');
      expect(result).toBeNull();
    });
  });

  describe('getValidationCycles', () => {
    it('should return 0 if projectId is missing', async () => {
      const result = await service.getValidationCycles(null, 'task-card', 'TST-TSK-0001');
      expect(result).toBe(0);
    });

    it('should return the count if it exists', async () => {
      mockGetTransitionField.mockResolvedValueOnce(3);

      const result = await service.getValidationCycles('TestProject', 'task-card', 'TST-TSK-0001');
      expect(result).toBe(3);
    });

    it('should return 0 if count does not exist', async () => {
      mockGetTransitionField.mockResolvedValueOnce(null);

      const result = await service.getValidationCycles('TestProject', 'task-card', 'TST-TSK-0001');
      expect(result).toBe(0);
    });
  });

  describe('getTransitions', () => {
    it('should return empty array if projectId is missing', async () => {
      const result = await service.getTransitions(null, 'task-card', 'TST-TSK-0001');
      expect(result).toEqual([]);
    });

    it('should return transitions sorted by timestamp descending', async () => {
      mockGetTransitionData.mockResolvedValueOnce({
        transitions: {
          'trans-1': { timestamp: '2026-01-10T10:00:00Z', fromStatus: 'To Do', toStatus: 'In Progress' },
          'trans-2': { timestamp: '2026-01-15T10:00:00Z', fromStatus: 'In Progress', toStatus: 'To Validate' },
          'trans-3': { timestamp: '2026-01-12T10:00:00Z', fromStatus: 'To Validate', toStatus: 'To Do' }
        }
      });

      const result = await service.getTransitions('TestProject', 'task-card', 'TST-TSK-0001');

      expect(result.length).toBe(3);
      expect(result[0].timestamp).toBe('2026-01-15T10:00:00Z');
      expect(result[1].timestamp).toBe('2026-01-12T10:00:00Z');
      expect(result[2].timestamp).toBe('2026-01-10T10:00:00Z');
    });

    it('should return empty array if no transitions exist', async () => {
      mockGetTransitionData.mockResolvedValueOnce(null);

      const result = await service.getTransitions('TestProject', 'task-card', 'TST-TSK-0001');
      expect(result).toEqual([]);
    });
  });

  describe('getTransitionData', () => {
    it('should return full transition data object', async () => {
      mockGetTransitionData.mockResolvedValueOnce({
        firstInProgressDate: '2026-01-10',
        validationCycles: 2,
        transitions: {
          'trans-1': { timestamp: '2026-01-10T10:00:00Z', fromStatus: 'To Do', toStatus: 'In Progress' }
        }
      });

      const result = await service.getTransitionData('TestProject', 'task-card', 'TST-TSK-0001');

      expect(result.firstInProgressDate).toBe('2026-01-10');
      expect(result.validationCycles).toBe(2);
      expect(result.transitions.length).toBe(1);
    });

    it('should return default values if no data exists', async () => {
      mockGetTransitionData.mockResolvedValueOnce(null);

      const result = await service.getTransitionData('TestProject', 'task-card', 'TST-TSK-0001');

      expect(result.firstInProgressDate).toBeNull();
      expect(result.validationCycles).toBe(0);
      expect(result.transitions).toEqual([]);
    });
  });

  describe('calculateTimeMetrics', () => {
    it('should return default metrics for empty transitions', () => {
      const result = service.calculateTimeMetrics([]);

      expect(result.totalDevelopmentTime).toBe(0);
      expect(result.timeByStatus).toEqual({});
      expect(result.averageValidationTime).toBe(0);
      expect(result.timesRejected).toBe(0);
    });

    it('should calculate time spent in each status', () => {
      const transitions = [
        { timestamp: '2026-01-10T10:00:00Z', fromStatus: 'To Do', toStatus: 'In Progress', durationInPrevious: 86400000 },
        { timestamp: '2026-01-11T10:00:00Z', fromStatus: 'In Progress', toStatus: 'To Validate', durationInPrevious: 28800000 },
        { timestamp: '2026-01-12T10:00:00Z', fromStatus: 'To Validate', toStatus: 'Done&Validated', durationInPrevious: 3600000 }
      ];

      const result = service.calculateTimeMetrics(transitions);

      expect(result.timeByStatus['to do']).toBe(86400000);
      expect(result.timeByStatus['in progress']).toBe(28800000);
      expect(result.timeByStatus['to validate']).toBe(3600000);
      expect(result.totalDevelopmentTime).toBe(28800000);
    });

    it('should count rejections correctly', () => {
      const transitions = [
        { timestamp: '2026-01-10T10:00:00Z', fromStatus: 'To Do', toStatus: 'In Progress', durationInPrevious: 1000 },
        { timestamp: '2026-01-11T10:00:00Z', fromStatus: 'In Progress', toStatus: 'To Validate', durationInPrevious: 1000 },
        { timestamp: '2026-01-12T10:00:00Z', fromStatus: 'To Validate', toStatus: 'To Do', durationInPrevious: 1000 },
        { timestamp: '2026-01-13T10:00:00Z', fromStatus: 'To Do', toStatus: 'In Progress', durationInPrevious: 1000 },
        { timestamp: '2026-01-14T10:00:00Z', fromStatus: 'In Progress', toStatus: 'To Validate', durationInPrevious: 1000 },
        { timestamp: '2026-01-15T10:00:00Z', fromStatus: 'To Validate', toStatus: 'To Do', durationInPrevious: 1000 }
      ];

      const result = service.calculateTimeMetrics(transitions);

      expect(result.timesRejected).toBe(2);
    });

    it('should calculate average validation time', () => {
      const transitions = [
        { timestamp: '2026-01-11T10:00:00Z', fromStatus: 'To Validate', toStatus: 'To Do', durationInPrevious: 3600000 },
        { timestamp: '2026-01-13T10:00:00Z', fromStatus: 'To Validate', toStatus: 'Done&Validated', durationInPrevious: 7200000 }
      ];

      const result = service.calculateTimeMetrics(transitions);

      expect(result.averageValidationTime).toBe(5400000);
    });

    it('should calculate totalPausedTime from Pausado status', () => {
      const transitions = [
        { timestamp: '2026-01-10T10:00:00Z', fromStatus: 'To Do', toStatus: 'In Progress', durationInPrevious: 86400000 },
        { timestamp: '2026-01-11T10:00:00Z', fromStatus: 'In Progress', toStatus: 'Pausado', durationInPrevious: 28800000 },
        { timestamp: '2026-01-12T10:00:00Z', fromStatus: 'Pausado', toStatus: 'In Progress', durationInPrevious: 7200000 },
        { timestamp: '2026-01-13T10:00:00Z', fromStatus: 'In Progress', toStatus: 'To Validate', durationInPrevious: 14400000 }
      ];

      const result = service.calculateTimeMetrics(transitions);

      expect(result.totalPausedTime).toBe(7200000);
      expect(result.totalDevelopmentTime).toBe(28800000 + 14400000);
      expect(result.effectiveWorkTime).toBe(28800000 + 14400000 - 7200000);
    });
  });

  describe('formatDuration', () => {
    it('should return "-" for null or zero', () => {
      expect(service.formatDuration(null)).toBe('-');
      expect(service.formatDuration(0)).toBe('-');
      expect(service.formatDuration(-1000)).toBe('-');
    });

    it('should format days, hours, minutes', () => {
      const twoDaysThreeHoursFifteenMinutes = (2 * 24 * 60 * 60 * 1000) + (3 * 60 * 60 * 1000) + (15 * 60 * 1000);
      expect(service.formatDuration(twoDaysThreeHoursFifteenMinutes)).toBe('2d 3h 15m');
    });

    it('should format hours and minutes', () => {
      const fiveHoursTwentyMinutes = (5 * 60 * 60 * 1000) + (20 * 60 * 1000);
      expect(service.formatDuration(fiveHoursTwentyMinutes)).toBe('5h 20m');
    });

    it('should format just minutes', () => {
      const fortyFiveMinutes = 45 * 60 * 1000;
      expect(service.formatDuration(fortyFiveMinutes)).toBe('45m');
    });

    it('should return "< 1m" for less than a minute', () => {
      expect(service.formatDuration(30000)).toBe('< 1m');
    });
  });

  describe('subscribeToTransitions', () => {
    it('should return empty data if projectId is missing', () => {
      const callback = vi.fn();
      const unsubscribe = service.subscribeToTransitions(null, 'task-card', 'TST-TSK-0001', callback);

      expect(callback).toHaveBeenCalledWith({
        firstInProgressDate: null,
        validationCycles: 0,
        reopenCycles: 0,
        transitions: []
      });
      expect(typeof unsubscribe).toBe('function');
    });

    it('should set up subscription correctly', () => {
      const callback = vi.fn();
      mockSubscribeToTransitions.mockImplementation((projectId, cardType, cardId, cb) => {
        cb({
          firstInProgressDate: '2026-01-10',
          validationCycles: 1,
          transitions: {
            't1': { timestamp: '2026-01-10T10:00:00Z', fromStatus: 'To Do', toStatus: 'In Progress' }
          }
        });
        return () => {};
      });

      const unsubscribe = service.subscribeToTransitions('TestProject', 'task-card', 'TST-TSK-0001', callback);

      expect(mockSubscribeToTransitions).toHaveBeenCalledWith(
        'TestProject', 'tasks', 'TST-TSK-0001', expect.any(Function)
      );
      expect(callback).toHaveBeenCalled();
      const callArg = callback.mock.calls[0][0];
      expect(callArg.firstInProgressDate).toBe('2026-01-10');
      expect(callArg.validationCycles).toBe(1);
      expect(callArg.transitions.length).toBe(1);
    });
  });

  describe('migrateFromExistingDates', () => {
    it('should return false if projectId or cardId is missing', async () => {
      expect(await service.migrateFromExistingDates({ cardId: 'test' })).toBe(false);
      expect(await service.migrateFromExistingDates({ projectId: 'test' })).toBe(false);
    });

    it('should not overwrite existing firstInProgressDate', async () => {
      mockGetTransitionData.mockResolvedValueOnce({ firstInProgressDate: '2026-01-01' });

      const result = await service.migrateFromExistingDates({
        projectId: 'TestProject',
        cardId: 'TST-TSK-0001',
        startDate: '2026-01-15'
      });

      expect(result).toBe(false);
      expect(mockSetTransitionField).not.toHaveBeenCalled();
    });

    it('should migrate startDate to firstInProgressDate', async () => {
      mockGetTransitionData.mockResolvedValueOnce(null);
      mockSetTransitionField.mockResolvedValue(undefined);

      const result = await service.migrateFromExistingDates({
        projectId: 'TestProject',
        cardId: 'TST-TSK-0001',
        cardType: 'task-card',
        startDate: '2026-01-15'
      });

      expect(result).toBe(true);
      expect(mockSetTransitionField).toHaveBeenCalledWith(
        'TestProject', 'tasks', 'TST-TSK-0001', 'firstInProgressDate', '2026-01-15'
      );
    });

    it('should return false if card has no startDate', async () => {
      mockGetTransitionData.mockResolvedValueOnce(null);

      const result = await service.migrateFromExistingDates({
        projectId: 'TestProject',
        cardId: 'TST-TSK-0001',
        cardType: 'task-card'
      });

      expect(result).toBe(false);
    });
  });
});
