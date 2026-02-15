import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env before importing the handler (APP_URL is resolved at import time)
process.env.PUBLIC_APP_URL = 'https://test.example.com';

// Import the handler module directly
const {
  handleCardToValidate,
  sanitizeEmailForKey,
  formatAcceptanceCriteriaHtml,
  generateValidationEmailHtml
} = require('../../functions/handlers/on-card-to-validate.js');

describe('onCardToValidate', () => {
  let mockDb;
  let mockSendEmail;
  let mockLogger;
  let mockPushRef;

  beforeEach(() => {
    mockPushRef = { set: vi.fn().mockResolvedValue(undefined) };

    mockDb = {
      ref: vi.fn().mockReturnValue({
        once: vi.fn().mockResolvedValue({ val: () => null }),
        push: vi.fn().mockReturnValue(mockPushRef)
      })
    };

    mockSendEmail = vi.fn().mockResolvedValue(undefined);
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
  });

  function getDeps() {
    return {
      db: mockDb,
      sendEmail: mockSendEmail,
      logger: mockLogger
    };
  }

  function setupStakeholderResolution(stakeholders) {
    mockDb.ref.mockImplementation((path) => {
      // Match stakeholder paths
      const stkMatch = path.match(/\/data\/stakeholders\/(stk_\w+)/);
      if (stkMatch) {
        const stkId = stkMatch[1];
        const data = stakeholders[stkId] || null;
        return {
          once: vi.fn().mockResolvedValue({ val: () => data }),
          push: vi.fn().mockReturnValue(mockPushRef)
        };
      }
      // Default: notifications path
      return {
        once: vi.fn().mockResolvedValue({ val: () => null }),
        push: vi.fn().mockReturnValue(mockPushRef)
      };
    });
  }

  describe('sanitizeEmailForKey', () => {
    it('should sanitize full email and replace special characters', () => {
      expect(sanitizeEmailForKey('john.doe@example.com')).toBe('john_doe@example_com');
      expect(sanitizeEmailForKey('user#1@test.com')).toBe('user_1@test_com');
      expect(sanitizeEmailForKey('simple@domain.com')).toBe('simple@domain_com');
    });

    it('should replace brackets and slashes', () => {
      expect(sanitizeEmailForKey('user[1]@test.com')).toBe('user_1_@test_com');
      expect(sanitizeEmailForKey('user/name@test.com')).toBe('user_name@test_com');
    });
  });

  describe('formatAcceptanceCriteriaHtml', () => {
    it('should return fallback message when no criteria', () => {
      const result = formatAcceptanceCriteriaHtml([]);
      expect(result).toContain('No hay criterios de aceptación definidos');
    });

    it('should return fallback message when criteria is not an array', () => {
      const result = formatAcceptanceCriteriaHtml(null);
      expect(result).toContain('No hay criterios de aceptación definidos');
    });

    it('should format Given/When/Then criteria', () => {
      const criteria = [
        { given: 'a user is logged in', when: 'they click logout', then: 'they are redirected to login', raw: '' }
      ];
      const result = formatAcceptanceCriteriaHtml(criteria);
      expect(result).toContain('a user is logged in');
      expect(result).toContain('they click logout');
      expect(result).toContain('they are redirected to login');
      expect(result).toContain('<strong>Given</strong>');
      expect(result).toContain('<strong>When</strong>');
      expect(result).toContain('<strong>Then</strong>');
    });

    it('should use raw text when no Given/When/Then', () => {
      const criteria = [{ given: '', when: '', then: '', raw: 'Simple criterion text' }];
      const result = formatAcceptanceCriteriaHtml(criteria);
      expect(result).toContain('Simple criterion text');
    });
  });

  describe('generateValidationEmailHtml', () => {
    it('should include task title and project info', () => {
      const cardData = { title: 'Test Task', acceptanceCriteriaStructured: [] };
      const html = generateValidationEmailHtml(cardData, 'ProjectX', 'PX-TSK-0001');
      expect(html).toContain('Test Task');
      expect(html).toContain('ProjectX');
      expect(html).toContain('PX-TSK-0001');
    });

    it('should include task URL with correct format', () => {
      const cardData = { title: 'Task', acceptanceCriteriaStructured: [] };
      const html = generateValidationEmailHtml(cardData, 'C4D', 'C4D-TSK-0042');
      expect(html).toContain('https://test.example.com/adminproject/?projectId=C4D&cardId=C4D-TSK-0042#tasks');
    });

    it('should include validation instructions', () => {
      const cardData = { title: 'Task', acceptanceCriteriaStructured: [] };
      const html = generateValidationEmailHtml(cardData, 'C4D', 'C4D-TSK-0001');
      expect(html).toContain('Done');
      expect(html).toContain('To Do');
      expect(html).toContain('comentario');
    });

    it('should include formatted acceptance criteria', () => {
      const cardData = {
        title: 'Task',
        acceptanceCriteriaStructured: [
          { given: 'context A', when: 'action B', then: 'result C', raw: '' }
        ]
      };
      const html = generateValidationEmailHtml(cardData, 'C4D', 'C4D-TSK-0001');
      expect(html).toContain('context A');
      expect(html).toContain('action B');
      expect(html).toContain('result C');
    });
  });

  describe('handleCardToValidate', () => {
    it('should skip non-task sections', async () => {
      const params = { projectId: 'C4D', section: 'bugs_C4D', cardId: 'key123' };
      const before = { status: 'In Progress' };
      const after = { status: 'To Validate', title: 'Bug', validator: 'stk_001' };

      const result = await handleCardToValidate(params, before, after, getDeps());
      expect(result).toBeNull();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should skip when status does not change to "To Validate"', async () => {
      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key123' };
      const before = { status: 'To Do' };
      const after = { status: 'In Progress', title: 'Task', validator: 'stk_001' };

      const result = await handleCardToValidate(params, before, after, getDeps());
      expect(result).toBeNull();
    });

    it('should skip when status was already "To Validate"', async () => {
      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key123' };
      const before = { status: 'To Validate' };
      const after = { status: 'To Validate', title: 'Task', validator: 'stk_001' };

      const result = await handleCardToValidate(params, before, after, getDeps());
      expect(result).toBeNull();
    });

    it('should skip when no validator is assigned', async () => {
      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key123' };
      const before = { status: 'In Progress' };
      const after = { status: 'To Validate', title: 'Task' };

      const result = await handleCardToValidate(params, before, after, getDeps());
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'onCardToValidate: No validator assigned',
        expect.objectContaining({ projectId: 'C4D' })
      );
    });

    it('should send notification and email to validator when task transitions to "To Validate"', async () => {
      setupStakeholderResolution({
        stk_001: { email: 'validator@example.com', name: 'Validator User' }
      });

      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key123' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'To Validate',
        title: 'Implement login',
        cardId: 'C4D-TSK-0042',
        validator: 'stk_001',
        acceptanceCriteriaStructured: [
          { given: 'a user', when: 'they login', then: 'they see dashboard', raw: '' }
        ]
      };

      const result = await handleCardToValidate(params, before, after, getDeps());

      expect(result).toEqual({ notified: ['validator@example.com'] });

      // Verify notification created
      expect(mockPushRef.set).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Tarea pendiente de validación',
        message: 'La tarea "Implement login" está lista para validar',
        type: 'validation-request',
        projectId: 'C4D',
        taskId: 'C4D-TSK-0042',
        read: false,
        data: { itemType: 'task', action: 'validation-request' }
      }));

      // Verify email sent
      expect(mockSendEmail).toHaveBeenCalledWith(
        ['validator@example.com'],
        '[C4D] Tarea pendiente de validación: Implement login',
        expect.stringContaining('Implement login')
      );
    });

    it('should send notifications and emails to both validator and co-validator', async () => {
      setupStakeholderResolution({
        stk_001: { email: 'validator@example.com', name: 'Validator' },
        stk_002: { email: 'covalidator@example.com', name: 'Co-Validator' }
      });

      const params = { projectId: 'NTR', section: 'tasks_NTR', cardId: 'key456' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'To Validate',
        title: 'Add feature',
        cardId: 'NTR-TSK-0010',
        validator: 'stk_001',
        coValidator: 'stk_002',
        acceptanceCriteriaStructured: []
      };

      const result = await handleCardToValidate(params, before, after, getDeps());

      expect(result).toEqual({
        notified: ['validator@example.com', 'covalidator@example.com']
      });

      // Two notifications created
      expect(mockPushRef.set).toHaveBeenCalledTimes(2);

      // Email sent to both
      expect(mockSendEmail).toHaveBeenCalledWith(
        ['validator@example.com', 'covalidator@example.com'],
        expect.stringContaining('[NTR]'),
        expect.any(String)
      );
    });

    it('should only notify validator when no co-validator is set', async () => {
      setupStakeholderResolution({
        stk_001: { email: 'solo-validator@example.com', name: 'Solo Validator' }
      });

      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key789' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'To Validate',
        title: 'Solo task',
        cardId: 'C4D-TSK-0099',
        validator: 'stk_001',
        acceptanceCriteriaStructured: []
      };

      const result = await handleCardToValidate(params, before, after, getDeps());

      expect(result).toEqual({ notified: ['solo-validator@example.com'] });
      expect(mockPushRef.set).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        ['solo-validator@example.com'],
        expect.any(String),
        expect.any(String)
      );
    });

    it('should still create notifications if email sending fails', async () => {
      setupStakeholderResolution({
        stk_001: { email: 'validator@example.com', name: 'Validator' }
      });
      mockSendEmail.mockRejectedValue(new Error('SMTP error'));

      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key111' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'To Validate',
        title: 'Failing email task',
        cardId: 'C4D-TSK-0050',
        validator: 'stk_001',
        acceptanceCriteriaStructured: []
      };

      const result = await handleCardToValidate(params, before, after, getDeps());

      // Notifications still created
      expect(result).toEqual({ notified: ['validator@example.com'] });
      expect(mockPushRef.set).toHaveBeenCalledTimes(1);

      // Error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'onCardToValidate: Failed to send email',
        expect.objectContaining({ error: 'SMTP error' })
      );
    });

    it('should use cardId from afterData when available', async () => {
      setupStakeholderResolution({
        stk_001: { email: 'v@example.com', name: 'V' }
      });

      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'firebaseKey123' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'To Validate',
        title: 'Task with cardId',
        cardId: 'C4D-TSK-0077',
        validator: 'stk_001',
        acceptanceCriteriaStructured: []
      };

      await handleCardToValidate(params, before, after, getDeps());

      expect(mockPushRef.set).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'C4D-TSK-0077' })
      );
    });

    it('should use notification URL with task link format', async () => {
      setupStakeholderResolution({
        stk_001: { email: 'v@example.com', name: 'V' }
      });

      const params = { projectId: 'TestProj', section: 'tasks_TestProj', cardId: 'key1' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'To Validate',
        title: 'URL task',
        cardId: 'TP-TSK-0001',
        validator: 'stk_001',
        acceptanceCriteriaStructured: []
      };

      await handleCardToValidate(params, before, after, getDeps());

      expect(mockPushRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.example.com/adminproject/?projectId=TestProj&cardId=TP-TSK-0001#tasks'
        })
      );
    });

    it('should skip when stakeholder has no email', async () => {
      setupStakeholderResolution({
        stk_001: { name: 'No Email Validator' } // no email field
      });

      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key999' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'To Validate',
        title: 'Task',
        cardId: 'C4D-TSK-0001',
        validator: 'stk_001',
        acceptanceCriteriaStructured: []
      };

      const result = await handleCardToValidate(params, before, after, getDeps());

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'onCardToValidate: Stakeholder not found or has no email',
        expect.objectContaining({ stkId: 'stk_001' })
      );
    });

    it('should handle transition from any status to "To Validate"', async () => {
      setupStakeholderResolution({
        stk_001: { email: 'v@example.com', name: 'V' }
      });

      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key1' };
      const after = {
        status: 'To Validate',
        title: 'From To Do',
        cardId: 'C4D-TSK-0001',
        validator: 'stk_001',
        developer: 'dev_001',
        epic: 'EPIC-001',
        sprint: 'SPR-001',
        devPoints: 3,
        businessPoints: 5,
        acceptanceCriteriaStructured: [{ given: 'a', when: 'b', then: 'c' }]
      };

      // From "To Do" with all required fields
      const result = await handleCardToValidate(params, { status: 'To Do' }, after, getDeps());
      expect(result).not.toBeNull();
    });

    it('should create notification with correct sanitized key for emails with dots', async () => {
      setupStakeholderResolution({
        stk_001: { email: 'john.doe.smith@example.com', name: 'John' }
      });

      const params = { projectId: 'C4D', section: 'tasks_C4D', cardId: 'key1' };
      const before = { status: 'In Progress' };
      const after = {
        status: 'To Validate',
        title: 'Task',
        cardId: 'C4D-TSK-0001',
        validator: 'stk_001',
        acceptanceCriteriaStructured: []
      };

      await handleCardToValidate(params, before, after, getDeps());

      // Verify the ref was called with sanitized key (full email, not just prefix)
      expect(mockDb.ref).toHaveBeenCalledWith('/notifications/john_doe_smith@example_com');
    });
  });
});
