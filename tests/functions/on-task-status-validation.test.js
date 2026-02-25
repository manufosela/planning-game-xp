/**
 * Tests for onTaskStatusValidation handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the handler module
const mockDbRef = vi.fn();
const mockDbOnce = vi.fn();
const mockDbSet = vi.fn();
const mockDbPush = vi.fn();

const mockDb = {
  ref: mockDbRef
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Set env before importing the handler (APP_URL is resolved at import time)
process.env.PUBLIC_APP_URL = 'https://test.example.com';

// Import after setting up mocks
const {
  handleTaskStatusValidation,
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  VALIDATOR_ONLY_STATUSES,
  isEmailMatchingStakeholder
} = await import('../../functions/handlers/on-task-status-validation.js');

describe('onTaskStatusValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_APP_URL = 'https://test.example.com';
    mockDbRef.mockReturnValue({
      once: mockDbOnce,
      set: mockDbSet,
      push: mockDbPush.mockReturnValue({
        set: vi.fn().mockResolvedValue()
      })
    });
  });

  describe('REQUIRED_FIELDS_TO_LEAVE_TODO', () => {
    it('should include all mandatory fields to leave To Do', () => {
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('title');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('developer');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('validator');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('epic');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('sprint');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('devPoints');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('businessPoints');
      expect(REQUIRED_FIELDS_TO_LEAVE_TODO).toContain('acceptanceCriteria');
    });
  });

  describe('VALIDATOR_ONLY_STATUSES', () => {
    it('should include Done and Done&Validated', () => {
      expect(VALIDATOR_ONLY_STATUSES).toContain('Done');
      expect(VALIDATOR_ONLY_STATUSES).toContain('Done&Validated');
    });
  });

  describe('isEmailMatchingStakeholder', () => {
    const stakeholdersData = {
      stk_001: { email: 'validator@example.com', name: 'Validator' },
      stk_002: { email: 'covalidator@example.com', name: 'Co-Validator' }
    };

    it('should return true when email matches stakeholder', () => {
      expect(isEmailMatchingStakeholder('validator@example.com', 'stk_001', stakeholdersData)).toBe(true);
    });

    it('should return true with case-insensitive email', () => {
      expect(isEmailMatchingStakeholder('VALIDATOR@example.com', 'stk_001', stakeholdersData)).toBe(true);
    });

    it('should return false when email does not match', () => {
      expect(isEmailMatchingStakeholder('other@example.com', 'stk_001', stakeholdersData)).toBe(false);
    });

    it('should return false when stakeholder not found', () => {
      expect(isEmailMatchingStakeholder('validator@example.com', 'stk_999', stakeholdersData)).toBe(false);
    });

    it('should return false with null values', () => {
      expect(isEmailMatchingStakeholder(null, 'stk_001', stakeholdersData)).toBe(false);
      expect(isEmailMatchingStakeholder('email@test.com', null, stakeholdersData)).toBe(false);
      expect(isEmailMatchingStakeholder('email@test.com', 'stk_001', null)).toBe(false);
    });
  });

  describe('handleTaskStatusValidation', () => {
    it('should skip non-task sections', async () => {
      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'BUGS_Test', cardId: 'card1' },
        { status: 'In Progress' },
        { status: 'To Validate' },
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toBeNull();
    });

    it('should skip when status has not changed', async () => {
      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'In Progress' },
        { status: 'In Progress' },
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toBeNull();
    });

    it('should allow valid transition to To Validate when endDate is updated', async () => {
      const afterData = {
        status: 'To Validate',
        title: 'Test Task',
        developer: 'dev_001',
        startDate: '2026-01-25',
        endDate: '2026-01-30',
        validator: 'stk_001'
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'In Progress' },
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toBeNull();
      expect(mockDbSet).not.toHaveBeenCalled();
    });

    it('should reject transition to In Progress when startDate is not updated', async () => {
      mockDbOnce.mockResolvedValue({ val: () => ({}) });
      mockDbSet.mockResolvedValue();

      const beforeData = {
        status: 'Blocked',
        startDate: '2026-01-10'
      };

      const afterData = {
        status: 'In Progress',
        // startDate missing -> invalid
        title: 'Test Task',
        developer: 'dev_001',
        validator: 'stk_001',
        epic: 'EPC-001',
        sprint: 'SPR-001',
        devPoints: 3,
        businessPoints: 3,
        acceptanceCriteria: 'Some criteria',
        updatedBy: 'user@example.com'
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        beforeData,
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toEqual({
        reverted: true,
        error: expect.objectContaining({
          type: 'missing-start-date-update'
        })
      });
    });

    it('should reject transition to To Validate when endDate is not updated', async () => {
      mockDbOnce.mockResolvedValue({ val: () => ({}) });
      mockDbSet.mockResolvedValue();

      const beforeData = {
        status: 'In Progress',
        endDate: '2026-01-29'
      };

      const afterData = {
        status: 'To Validate',
        endDate: '2026-01-29', // unchanged -> invalid
        title: 'Test Task',
        developer: 'dev_001',
        startDate: '2026-01-25',
        validator: 'stk_001',
        updatedBy: 'user@example.com'
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        beforeData,
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toEqual({
        reverted: true,
        error: expect.objectContaining({
          type: 'missing-end-date-update'
        })
      });
    });

    it('should reject transition from To Do without validator', async () => {
      mockDbOnce.mockResolvedValue({ val: () => ({}) });
      mockDbSet.mockResolvedValue();

      const afterData = {
        status: 'In Progress', // Transitioning OUT of To Do
        title: 'Test Task',
        developer: 'dev_001',
        epic: 'EPC-001',
        sprint: 'SPR-001',
        devPoints: 3,
        businessPoints: 3,
        acceptanceCriteria: 'Some criteria',
        validator: '', // Missing validator
        updatedBy: 'user@example.com'
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'To Do' }, // From To Do
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toEqual({
        reverted: true,
        error: expect.objectContaining({
          type: 'missing-fields',
          missingFields: expect.arrayContaining(['validator'])
        })
      });
    });

    it('should reject transition to To Validate without title', async () => {
      mockDbOnce.mockResolvedValue({ val: () => ({}) });
      mockDbSet.mockResolvedValue();

      const afterData = {
        status: 'In Progress', // Transitioning OUT of To Do
        title: '', // Missing title
        developer: 'dev_001',
        validator: 'stk_001',
        epic: 'EPC-001',
        sprint: 'SPR-001',
        devPoints: 3,
        businessPoints: 3,
        acceptanceCriteria: 'Some criteria',
        updatedBy: 'user@example.com'
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'To Do' }, // From To Do
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toEqual({
        reverted: true,
        error: expect.objectContaining({
          type: 'missing-fields',
          missingFields: expect.arrayContaining(['title'])
        })
      });
    });

    it('should reject multiple missing fields when leaving To Do', async () => {
      mockDbOnce.mockResolvedValue({ val: () => ({}) });
      mockDbSet.mockResolvedValue();

      const afterData = {
        status: 'In Progress', // Transitioning OUT of To Do
        title: '', // Missing
        developer: '', // Missing
        validator: '', // Missing
        epic: '', // Missing
        sprint: '', // Missing
        devPoints: 0, // Missing (0 is not valid)
        businessPoints: 0, // Missing
        acceptanceCriteria: '', // Missing
        updatedBy: 'user@example.com'
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'To Do' }, // From To Do
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result.reverted).toBe(true);
      expect(result.error.missingFields.length).toBeGreaterThanOrEqual(4);
    });

    it('should allow validator to change status to Done', async () => {
      mockDbOnce.mockResolvedValue({
        val: () => ({
          stk_001: { email: 'validator@example.com', name: 'Validator' }
        })
      });

      const afterData = {
        status: 'Done',
        title: 'Test Task',
        developer: 'dev_001',
        startDate: '2026-01-25',
        validator: 'stk_001',
        updatedBy: 'validator@example.com'
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'To Validate' },
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toBeNull();
    });

    it('should allow coValidator to change status to Done&Validated', async () => {
      mockDbOnce.mockResolvedValue({
        val: () => ({
          stk_001: { email: 'validator@example.com', name: 'Validator' },
          stk_002: { email: 'covalidator@example.com', name: 'Co-Validator' }
        })
      });

      const afterData = {
        status: 'Done&Validated',
        title: 'Test Task',
        developer: 'dev_001',
        startDate: '2026-01-25',
        validator: 'stk_001',
        coValidator: 'stk_002',
        updatedBy: 'covalidator@example.com'
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'To Validate' },
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toBeNull();
    });

    it('should reject non-validator changing status to Done', async () => {
      mockDbOnce.mockResolvedValue({
        val: () => ({
          stk_001: { email: 'validator@example.com', name: 'Validator' }
        })
      });
      mockDbSet.mockResolvedValue();

      const afterData = {
        status: 'Done',
        title: 'Test Task',
        developer: 'dev_001',
        startDate: '2026-01-25',
        validator: 'stk_001',
        updatedBy: 'developer@example.com' // Not the validator
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'To Validate' },
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toEqual({
        reverted: true,
        error: expect.objectContaining({
          type: 'permission-denied'
        })
      });
    });

    it('should skip validator check for MCP updates', async () => {
      const afterData = {
        status: 'Done',
        title: 'Test Task',
        developer: 'dev_001',
        startDate: '2026-01-25',
        validator: 'stk_001',
        updatedBy: 'claude-code-mcp' // MCP user
      };

      const result = await handleTaskStatusValidation(
        { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
        { status: 'To Validate' },
        afterData,
        { db: mockDb, logger: mockLogger }
      );

      expect(result).toBeNull();
      expect(mockDbOnce).not.toHaveBeenCalled();
    });

    describe('Pausado status transitions', () => {
      it('should allow transition to Pausado when startDate exists', async () => {
        const afterData = {
          status: 'Pausado',
          title: 'Test Task',
          developer: 'dev_001',
          startDate: '2026-01-25',
          validator: 'stk_001',
          updatedBy: 'user@example.com'
        };

        const result = await handleTaskStatusValidation(
          { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
          { status: 'In Progress' },
          afterData,
          { db: mockDb, logger: mockLogger }
        );

        expect(result).toBeNull();
      });

      it('should reject transition to Pausado when startDate is missing', async () => {
        mockDbOnce.mockResolvedValue({ val: () => ({}) });
        mockDbSet.mockResolvedValue();

        const afterData = {
          status: 'Pausado',
          title: 'Test Task',
          developer: 'dev_001',
          validator: 'stk_001',
          updatedBy: 'user@example.com'
        };

        const result = await handleTaskStatusValidation(
          { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
          { status: 'In Progress' },
          afterData,
          { db: mockDb, logger: mockLogger }
        );

        expect(result).toEqual({
          reverted: true,
          error: expect.objectContaining({
            type: 'missing-start-date-for-pause'
          })
        });
      });

      it('should allow transition from Pausado to In Progress', async () => {
        const afterData = {
          status: 'In Progress',
          title: 'Test Task',
          developer: 'dev_001',
          startDate: '2026-01-25',
          validator: 'stk_001',
          epic: 'EPC-001',
          sprint: 'SPR-001',
          devPoints: 3,
          businessPoints: 3,
          acceptanceCriteria: 'Some criteria',
          updatedBy: 'user@example.com'
        };

        const result = await handleTaskStatusValidation(
          { projectId: 'Test', section: 'TASKS_Test', cardId: 'card1' },
          { status: 'Pausado' },
          afterData,
          { db: mockDb, logger: mockLogger }
        );

        expect(result).toBeNull();
      });
    });
  });
});
