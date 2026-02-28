import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock firebase-config
vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  auth: { currentUser: { email: 'test@example.com' } },
  ref: vi.fn((db, path) => ({ path })),
  push: vi.fn(() => ({ key: 'mock-id' })),
  get: vi.fn(),
  set: vi.fn(),
  onValue: vi.fn()
}));

// Mock services
vi.mock('@/services/state-transition-service.js', () => ({
  stateTransitionService: {
    subscribeToTransitions: vi.fn((projectId, cardType, cardId, callback) => {
      // Simulate immediate callback with test data
      callback({
        firstInProgressDate: '2026-01-15',
        validationCycles: 2,
        transitions: [
          {
            id: 't1',
            timestamp: '2026-01-15T10:00:00Z',
            fromStatus: 'To Do',
            toStatus: 'In Progress',
            changedBy: 'dev@test.com',
            durationInPrevious: 86400000
          },
          {
            id: 't2',
            timestamp: '2026-01-16T14:00:00Z',
            fromStatus: 'In Progress',
            toStatus: 'To Validate',
            changedBy: 'dev@test.com',
            durationInPrevious: 100800000
          }
        ]
      });
      return () => {}; // Unsubscribe function
    }),
    calculateTimeMetrics: vi.fn(() => ({
      totalDevelopmentTime: 100800000,
      timeByStatus: {
        'to do': 86400000,
        'in progress': 100800000
      },
      averageValidationTime: 3600000,
      timesRejected: 2
    })),
    formatDuration: vi.fn((ms) => {
      if (!ms || ms <= 0) return '-';
      const hours = Math.floor(ms / 3600000);
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ${hours % 24}h`;
      return `${hours}h`;
    })
  }
}));

vi.mock('@/services/entity-directory-service.js', () => ({
  entityDirectoryService: {
    getDeveloperDisplayName: vi.fn((email) => email ? email.split('@')[0] : 'Unknown'),
    getStakeholderDisplayName: vi.fn(() => null)
  }
}));

describe('StateHistoryViewer', () => {
  let StateHistoryViewer;

  beforeEach(async () => {
    // Dynamic import to ensure mocks are in place
    const module = await import('@/wc/state-history-viewer.js');
    StateHistoryViewer = module.StateHistoryViewer;
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up any elements from the DOM
    document.querySelectorAll('state-history-viewer').forEach(el => el.remove());
  });

  describe('component creation', () => {
    it('should be defined as a custom element', () => {
      expect(customElements.get('state-history-viewer')).toBeDefined();
    });

    it('should have default properties', () => {
      const viewer = new StateHistoryViewer();
      expect(viewer.projectId).toBe('');
      expect(viewer.cardType).toBe('task-card');
      expect(viewer.cardId).toBe('');
      expect(viewer.activeTab).toBe('timeline');
      expect(viewer.loading).toBe(true);
    });
  });

  describe('data loading', () => {
    it('should load transition data when connected', async () => {
      const viewer = document.createElement('state-history-viewer');
      viewer.projectId = 'TestProject';
      viewer.cardType = 'task-card';
      viewer.cardId = 'TST-TSK-0001';

      document.body.appendChild(viewer);

      // Wait for component to update
      await viewer.updateComplete;

      const { stateTransitionService } = await import('@/services/state-transition-service.js');
      expect(stateTransitionService.subscribeToTransitions).toHaveBeenCalledWith(
        'TestProject',
        'task-card',
        'TST-TSK-0001',
        expect.any(Function)
      );
    });

    it('should not load data if projectId is missing', async () => {
      const viewer = document.createElement('state-history-viewer');
      viewer.cardId = 'TST-TSK-0001';

      document.body.appendChild(viewer);
      await viewer.updateComplete;

      expect(viewer.loading).toBe(false);
    });
  });

  describe('helper methods', () => {
    let viewer;

    beforeEach(() => {
      viewer = new StateHistoryViewer();
    });

    it('should format timestamps correctly', () => {
      const result = viewer._formatTimestamp('2026-01-15T10:30:00Z');
      expect(result).toContain('15');
      expect(result).toContain('01');
      expect(result).toContain('2026');
    });

    it('should return "-" for empty timestamp', () => {
      expect(viewer._formatTimestamp(null)).toBe('-');
      expect(viewer._formatTimestamp('')).toBe('-');
    });

    it('should format date correctly', () => {
      const result = viewer._formatDate('2026-01-15');
      expect(result).toContain('15');
      expect(result).toContain('01');
      expect(result).toContain('2026');
    });

    it('should get user display name', () => {
      const result = viewer._getUserDisplayName('test@example.com');
      expect(result).toBe('test');
    });

    it('should return "Sistema" for empty email', () => {
      expect(viewer._getUserDisplayName(null)).toBe('Sistema');
      expect(viewer._getUserDisplayName('')).toBe('Sistema');
    });

    it('should get status colors from theme system', () => {
      expect(viewer._getStatusColor('To Do')).toBe('#449bd3');
      expect(viewer._getStatusColor('In Progress')).toBe('#cce500');
      expect(viewer._getStatusColor('To Validate')).toBe('#ff6600');
      expect(viewer._getStatusColor('Done&Validated')).toBe('#d4edda');
      expect(viewer._getStatusColor('Blocked')).toBe('#f8d7da');
      expect(viewer._getStatusColor('Unknown')).toBe('#6c757d');
    });

    it('should filter rejection transitions', () => {
      viewer.transitionData = {
        transitions: [
          { fromStatus: 'To Do', toStatus: 'In Progress' },
          { fromStatus: 'In Progress', toStatus: 'To Validate' },
          { fromStatus: 'To Validate', toStatus: 'To Do' }, // Rejection
          { fromStatus: 'To Do', toStatus: 'In Progress' },
          { fromStatus: 'In Progress', toStatus: 'To Validate' },
          { fromStatus: 'To Validate', toStatus: 'Done&Validated' }
        ]
      };

      const rejections = viewer._getRejectionTransitions();
      expect(rejections.length).toBe(1);
      expect(rejections[0].fromStatus).toBe('To Validate');
      expect(rejections[0].toStatus).toBe('To Do');
    });
  });

  describe('tab switching', () => {
    it('should switch tabs', () => {
      const viewer = new StateHistoryViewer();
      expect(viewer.activeTab).toBe('timeline');

      viewer._setActiveTab('metrics');
      expect(viewer.activeTab).toBe('metrics');

      viewer._setActiveTab('cycles');
      expect(viewer.activeTab).toBe('cycles');
    });
  });

  describe('close functionality', () => {
    it('should remove itself from DOM when closed', async () => {
      const viewer = document.createElement('state-history-viewer');
      viewer.projectId = 'TestProject';
      viewer.cardId = 'TST-TSK-0001';

      document.body.appendChild(viewer);
      await viewer.updateComplete;

      expect(document.querySelector('state-history-viewer')).not.toBeNull();

      viewer._close();

      expect(document.querySelector('state-history-viewer')).toBeNull();
    });
  });

  describe('bar width calculation', () => {
    it('should calculate bar width percentage', () => {
      const viewer = new StateHistoryViewer();
      const metrics = {
        timeByStatus: {
          'in progress': 50000,
          'to validate': 100000
        }
      };

      expect(viewer._calculateBarWidth(100000, metrics)).toBe(100);
      expect(viewer._calculateBarWidth(50000, metrics)).toBe(50);
      expect(viewer._calculateBarWidth(25000, metrics)).toBe(25);
    });

    it('should return 0 if max time is 0', () => {
      const viewer = new StateHistoryViewer();
      const metrics = {
        timeByStatus: {}
      };

      expect(viewer._calculateBarWidth(0, metrics)).toBe(0);
    });
  });
});
