import { describe, it, expect, vi, beforeEach } from 'vitest';

const { handlePublicProjectCards, projectPublicFields, PUBLIC_CARD_FIELDS } = await import('../../functions/handlers/public-project-cards.js');

function createMockDb(data = {}) {
  return {
    ref: vi.fn((path) => ({
      once: vi.fn(async () => {
        // Navigate the data object by path
        const parts = path.split('/').filter(Boolean);
        let current = data;
        for (const part of parts) {
          current = current?.[part];
        }
        return {
          exists: () => current !== undefined && current !== null,
          val: () => current || null
        };
      })
    }))
  };
}

function createMockReq({ method = 'GET', path = '', query = {} } = {}) {
  return { method, path, query };
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status: vi.fn((code) => { res.statusCode = code; return res; }),
    json: vi.fn((body) => { res.body = body; return res; })
  };
  return res;
}

const mockLogger = {
  info: vi.fn(),
  error: vi.fn()
};

describe('publicProjectCards', () => {
  describe('projectPublicFields', () => {
    it('should only include whitelisted fields', () => {
      const card = {
        cardId: 'PLN-TSK-0001',
        title: 'Test task',
        status: 'In Progress',
        cardType: 'task-card',
        epic: 'PLN-PCS-0001',
        year: 2026,
        sprint: 'PLN-SPR-0001',
        // Sensitive fields that should NOT appear
        description: 'Secret details',
        developer: 'dev_001',
        commits: [{ hash: 'abc' }],
        acceptanceCriteria: 'Given...',
        notes: 'Internal notes'
      };
      const result = projectPublicFields(card);
      expect(result.cardId).toBe('PLN-TSK-0001');
      expect(result.title).toBe('Test task');
      expect(result.status).toBe('In Progress');
      expect(result.description).toBeUndefined();
      expect(result.developer).toBeUndefined();
      expect(result.commits).toBeUndefined();
      expect(result.acceptanceCriteria).toBeUndefined();
      expect(result.notes).toBeUndefined();
    });

    it('should handle card with missing optional fields', () => {
      const card = { cardId: 'X-TSK-0001', title: 'Minimal', status: 'To Do' };
      const result = projectPublicFields(card);
      expect(result.cardId).toBe('X-TSK-0001');
      expect(result.epic).toBeUndefined();
    });
  });

  describe('handlePublicProjectCards', () => {
    it('should return 405 for non-GET methods', async () => {
      const req = createMockReq({ method: 'POST' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db: createMockDb(), logger: mockLogger });
      expect(res.statusCode).toBe(405);
    });

    it('should return 400 for missing projectId', async () => {
      const req = createMockReq({ path: '/' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db: createMockDb(), logger: mockLogger });
      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for non-existent project', async () => {
      const req = createMockReq({ path: '/NonExistent/cards' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db: createMockDb({}), logger: mockLogger });
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should return 403 for non-public project without token', async () => {
      const db = createMockDb({
        projects: {
          MyProject: { name: 'My Project', public: false }
        }
      });
      const req = createMockReq({ path: '/MyProject/cards' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(403);
    });

    it('should return 403 for project without public field', async () => {
      const db = createMockDb({
        projects: {
          MyProject: { name: 'My Project' }
        }
      });
      const req = createMockReq({ path: '/MyProject/cards' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(403);
    });

    it('should allow access when publicApi is true', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'My Project', publicApi: true } },
        cards: { MyProject: { TASKS_MyProject: { '-t1': { cardId: 'MP-TSK-0001', title: 'Task', status: 'To Do', cardType: 'task-card' } } } }
      });
      const req = createMockReq({ path: '/MyProject/cards' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(200);
      expect(res.body.cards).toHaveLength(1);
    });

    it('should allow access when publicView is true and source=view', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'My Project', publicView: true } },
        cards: { MyProject: { TASKS_MyProject: { '-t1': { cardId: 'MP-TSK-0001', title: 'Task', status: 'To Do', cardType: 'task-card' } } } }
      });
      const req = createMockReq({ path: '/MyProject/cards', query: { source: 'view' } });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(200);
    });

    it('should return 403 when publicView is true but source is not view', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'My Project', publicView: true } }
      });
      const req = createMockReq({ path: '/MyProject/cards' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(403);
    });

    it('should return 403 for protected project with wrong token', async () => {
      const db = createMockDb({
        projects: {
          MyProject: { name: 'My Project', public: false, publicToken: 'correct-token-123' }
        }
      });
      const req = createMockReq({ path: '/MyProject/cards', query: { token: 'wrong-token' } });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(403);
    });

    it('should allow access to protected project with valid token', async () => {
      const db = createMockDb({
        projects: {
          MyProject: { name: 'My Project', public: false, publicToken: 'secret-uuid-456' }
        },
        cards: {
          MyProject: {
            TASKS_MyProject: {
              '-t1': { cardId: 'MP-TSK-0001', title: 'Protected Task', status: 'In Progress', cardType: 'task-card' }
            }
          }
        }
      });
      const req = createMockReq({ path: '/MyProject/cards', query: { token: 'secret-uuid-456' } });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(200);
      expect(res.body.cards).toHaveLength(1);
      expect(res.body.cards[0].title).toBe('Protected Task');
    });

    it('should return cards for public project', async () => {
      const db = createMockDb({
        projects: {
          TestProj: { name: 'Test Project', public: true }
        },
        cards: {
          TestProj: {
            TASKS_TestProj: {
              '-abc1': { cardId: 'TP-TSK-0001', title: 'Task 1', status: 'To Do', cardType: 'task-card', description: 'Secret' },
              '-abc2': { cardId: 'TP-TSK-0002', title: 'Task 2', status: 'Done', cardType: 'task-card', developer: 'dev_001' }
            },
            BUGS_TestProj: {
              '-bug1': { cardId: 'TP-BUG-0001', title: 'Bug 1', status: 'Created', cardType: 'bug-card' }
            },
            EPICS_TestProj: {},
            PROPOSALS_TestProj: null
          }
        }
      });
      const req = createMockReq({ path: '/TestProj/cards' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });

      expect(res.statusCode).toBe(200);
      expect(res.body.projectId).toBe('TestProj');
      expect(res.body.projectName).toBe('Test Project');
      expect(res.body.cards).toHaveLength(3);

      // Verify no sensitive data leaked
      for (const card of res.body.cards) {
        expect(card.description).toBeUndefined();
        expect(card.developer).toBeUndefined();
      }
    });

    it('should filter by type when query param provided', async () => {
      const db = createMockDb({
        projects: {
          TestProj: { name: 'Test', public: true }
        },
        cards: {
          TestProj: {
            TASKS_TestProj: {
              '-t1': { cardId: 'TP-TSK-0001', title: 'Task', status: 'To Do', cardType: 'task-card' }
            }
          }
        }
      });
      const req = createMockReq({ path: '/TestProj/cards', query: { type: 'task' } });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });

      expect(res.statusCode).toBe(200);
      expect(res.body.cards).toHaveLength(1);
      expect(res.body.cards[0].type).toBe('task');
    });

    it('should return 400 for invalid type filter', async () => {
      const db = createMockDb({
        projects: {
          TestProj: { name: 'Test', public: true }
        }
      });
      const req = createMockReq({ path: '/TestProj/cards', query: { type: 'invalid' } });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid type');
    });

    it('should exclude deleted cards', async () => {
      const db = createMockDb({
        projects: {
          TestProj: { name: 'Test', public: true }
        },
        cards: {
          TestProj: {
            TASKS_TestProj: {
              '-t1': { cardId: 'TP-TSK-0001', title: 'Active', status: 'To Do', cardType: 'task-card' },
              '-t2': { cardId: 'TP-TSK-0002', title: 'Deleted', status: 'To Do', cardType: 'task-card', deletedAt: '2026-01-01' }
            },
            BUGS_TestProj: null,
            EPICS_TestProj: null,
            PROPOSALS_TestProj: null
          }
        }
      });
      const req = createMockReq({ path: '/TestProj/cards' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });

      expect(res.statusCode).toBe(200);
      expect(res.body.cards).toHaveLength(1);
      expect(res.body.cards[0].cardId).toBe('TP-TSK-0001');
    });

    it('should handle URL-encoded projectId', async () => {
      const db = createMockDb({
        projects: {
          'My Project': { name: 'My Project', public: true }
        },
        cards: {
          'My Project': {
            'TASKS_My Project': {},
            'BUGS_My Project': null,
            'EPICS_My Project': null,
            'PROPOSALS_My Project': null
          }
        }
      });
      const req = createMockReq({ path: '/My%20Project/cards' });
      const res = createMockRes();
      await handlePublicProjectCards(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(200);
      expect(res.body.projectId).toBe('My Project');
    });
  });

  describe('PUBLIC_CARD_FIELDS whitelist', () => {
    it('should not include sensitive fields', () => {
      const sensitiveFields = ['description', 'developer', 'commits', 'acceptanceCriteria',
        'notes', 'codeveloper', 'validator',
        'descriptionStructured', 'acceptanceCriteriaStructured', 'implementationPlan',
        'pipelineStatus', 'aiUsage', 'blockedByBusiness', 'blockedByDevelopment'];
      for (const field of sensitiveFields) {
        expect(PUBLIC_CARD_FIELDS).not.toContain(field);
      }
    });

    it('should include safe fields for public display', () => {
      expect(PUBLIC_CARD_FIELDS).toContain('cardId');
      expect(PUBLIC_CARD_FIELDS).toContain('title');
      expect(PUBLIC_CARD_FIELDS).toContain('status');
      expect(PUBLIC_CARD_FIELDS).toContain('cardType');
      expect(PUBLIC_CARD_FIELDS).toContain('epic');
      expect(PUBLIC_CARD_FIELDS).toContain('devPoints');
      expect(PUBLIC_CARD_FIELDS).toContain('businessPoints');
      expect(PUBLIC_CARD_FIELDS).toContain('startDate');
      expect(PUBLIC_CARD_FIELDS).toContain('endDate');
      expect(PUBLIC_CARD_FIELDS).toContain('priority');
    });
  });
});
