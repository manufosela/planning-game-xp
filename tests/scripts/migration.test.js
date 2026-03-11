/**
 * Tests for migration transformation functions.
 *
 * Tests pure functions only — no Firebase dependency.
 */

import { describe, it, expect } from 'vitest';
import {
  transformProjects,
  transformCards,
  transformTeam,
  buildCounters,
} from '../../scripts/migrate-v1-to-v2.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const V1_SAMPLE = {
  projects: {
    TestProject: {
      name: 'Test Project',
      abbreviation: 'TST',
      description: 'A test project',
      repoUrl: 'https://github.com/test/test',
      scoringSystem: '1-5',
      archived: false,
      order: 1,
      createdAt: '2025-01-01T00:00:00Z',
      createdBy: 'admin',
      developers: [
        { id: 'dev_001', name: 'Alice', email: 'alice@test.com' },
        { id: 'dev_002', name: 'Bob', email: 'bob@test.com' },
      ],
      stakeholders: [
        { id: 'stk_001', name: 'Charlie', email: 'charlie@test.com' },
      ],
    },
  },
  cards: {
    TestProject: {
      TASKS_TestProject: {
        '-abc123': {
          cardId: 'TST-TSK-0001',
          cardType: 'task-card',
          title: 'First task',
          description: 'A test task',
          status: 'To Do',
          year: 2025,
          devPoints: 3,
          businessPoints: 4,
          descriptionStructured: [{ role: 'developer', goal: 'test', benefit: 'coverage' }],
          acceptanceCriteriaStructured: [{ given: 'setup', when: 'action', then: 'result' }],
          createdAt: '2025-01-15T10:00:00Z',
          createdBy: 'alice@test.com',
        },
        '-def456': {
          cardId: 'TST-TSK-0002',
          cardType: 'task-card',
          title: 'Second task',
          status: 'In Progress',
          year: 2025,
          devPoints: 2,
          businessPoints: 5,
          developer: 'dev_001',
          validator: 'stk_001',
          startDate: '2025-01-20',
          pipelineStatus: {
            committed: { branch: 'feat/test' },
            prCreated: { prUrl: 'https://github.com/test/test/pull/1', prNumber: 1 },
          },
          createdAt: '2025-01-16T10:00:00Z',
        },
      },
      BUGS_TestProject: {
        '-bug001': {
          cardId: 'TST-BUG-0001',
          cardType: 'bug-card',
          title: 'A bug',
          status: 'Created',
          year: 2025,
          priority: 'APPLICATION BLOCKER',
          registerDate: '2025-02-01',
          createdAt: '2025-02-01T08:00:00Z',
        },
      },
      EPICS_TestProject: {
        '-epic001': {
          cardId: 'TST-EPC-0001',
          cardType: 'epic-card',
          title: 'Main Epic',
          status: 'To Do',
          year: 2025,
          createdAt: '2025-01-01T00:00:00Z',
        },
      },
      SPRINTS_TestProject: {
        '-spr001': {
          cardId: 'TST-SPR-0001',
          cardType: 'sprint-card',
          title: 'Sprint 1',
          status: 'Planning',
          year: 2025,
          startDate: '2025-01-01',
          endDate: '2025-01-14',
          createdAt: '2025-01-01T00:00:00Z',
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('transformProjects', () => {
  it('should transform V1 projects to V2 format', () => {
    const result = transformProjects(V1_SAMPLE);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('TestProject');
    expect(result[0].data.name).toBe('Test Project');
    expect(result[0].data.abbreviation).toBe('TST');
    expect(result[0].data.description).toBe('A test project');
    expect(result[0].data.repoUrl).toBe('https://github.com/test/test');
    expect(result[0].data.scoringSystem).toBe('1-5');
    expect(result[0].data.archived).toBe(false);
    expect(result[0].data.sortOrder).toBe(1);
    expect(result[0].data.developerCount).toBe(0); // Will be updated after team write
    expect(result[0].data.stakeholderCount).toBe(0);
  });

  it('should handle empty project data', () => {
    const result = transformProjects({ projects: {} });
    expect(result).toHaveLength(0);
  });

  it('should handle missing projects key', () => {
    const result = transformProjects({});
    expect(result).toHaveLength(0);
  });
});

describe('transformCards', () => {
  it('should transform tasks with all fields', () => {
    const result = transformCards(V1_SAMPLE, 'TestProject');
    const tasks = result.filter((c) => c.data.type === 'task');

    expect(tasks).toHaveLength(2);

    // First task
    const task1 = tasks.find((t) => t.cardId === 'TST-TSK-0001');
    expect(task1).toBeDefined();
    expect(task1.data.title).toBe('First task');
    expect(task1.data.status).toBe('To Do');
    expect(task1.data.year).toBe(2025);
    expect(task1.data.devPoints).toBe(3);
    expect(task1.data.businessPoints).toBe(4);
    expect(task1.data.priority).toBe(Math.round((4 / 3) * 100));
    expect(task1.data.userStory).toEqual({ role: 'developer', goal: 'test', benefit: 'coverage' });
    expect(task1.data.acceptanceCriteria).toEqual([{ given: 'setup', when: 'action', then: 'result' }]);

    // Second task with developer, pipeline
    const task2 = tasks.find((t) => t.cardId === 'TST-TSK-0002');
    expect(task2).toBeDefined();
    expect(task2.data.developer).toEqual({ id: 'dev_001', name: '', email: '' });
    expect(task2.data.pipeline.branch).toBe('feat/test');
    expect(task2.data.pipeline.prUrl).toBe('https://github.com/test/test/pull/1');
    expect(task2.data.pipeline.prNumber).toBe(1);
  });

  it('should transform bugs', () => {
    const result = transformCards(V1_SAMPLE, 'TestProject');
    const bugs = result.filter((c) => c.data.type === 'bug');

    expect(bugs).toHaveLength(1);
    expect(bugs[0].data.title).toBe('A bug');
    expect(bugs[0].data.bugPriority).toBe('APPLICATION BLOCKER');
    expect(bugs[0].data.registeredAt).toBe('2025-02-01');
  });

  it('should transform epics', () => {
    const result = transformCards(V1_SAMPLE, 'TestProject');
    const epics = result.filter((c) => c.data.type === 'epic');

    expect(epics).toHaveLength(1);
    expect(epics[0].data.title).toBe('Main Epic');
  });

  it('should transform sprints', () => {
    const result = transformCards(V1_SAMPLE, 'TestProject');
    const sprints = result.filter((c) => c.data.type === 'sprint');

    expect(sprints).toHaveLength(1);
    expect(sprints[0].data.title).toBe('Sprint 1');
    expect(sprints[0].data.startDate).toBe('2025-01-01');
    expect(sprints[0].data.endDate).toBe('2025-01-14');
    expect(sprints[0].data.locked).toBe(false);
  });

  it('should handle non-existent project', () => {
    const result = transformCards(V1_SAMPLE, 'NonExistent');
    expect(result).toHaveLength(0);
  });
});

describe('transformTeam', () => {
  it('should transform developers and stakeholders', () => {
    const result = transformTeam(V1_SAMPLE, 'TestProject');

    expect(result).toHaveLength(3);

    const devs = result.filter((m) => m.data.role === 'developer');
    expect(devs).toHaveLength(2);
    expect(devs[0].data.name).toBe('Alice');
    expect(devs[0].data.email).toBe('alice@test.com');

    const stks = result.filter((m) => m.data.role === 'stakeholder');
    expect(stks).toHaveLength(1);
    expect(stks[0].data.name).toBe('Charlie');
  });

  it('should merge developer+stakeholder with same email as "both"', () => {
    const data = {
      projects: {
        Proj: {
          developers: [{ id: 'dev_001', name: 'Alice', email: 'alice@test.com' }],
          stakeholders: [{ id: 'stk_001', name: 'Alice', email: 'alice@test.com' }],
        },
      },
    };

    const result = transformTeam(data, 'Proj');
    expect(result).toHaveLength(1);
    expect(result[0].data.role).toBe('both');
  });

  it('should handle missing project', () => {
    const result = transformTeam(V1_SAMPLE, 'NonExistent');
    expect(result).toHaveLength(0);
  });
});

describe('buildCounters', () => {
  it('should find max card numbers per type', () => {
    const cards = [
      { cardId: 'TST-TSK-0001', data: { type: 'task', cardId: 'TST-TSK-0001' } },
      { cardId: 'TST-TSK-0042', data: { type: 'task', cardId: 'TST-TSK-0042' } },
      { cardId: 'TST-BUG-0003', data: { type: 'bug', cardId: 'TST-BUG-0003' } },
      { cardId: 'TST-EPC-0001', data: { type: 'epic', cardId: 'TST-EPC-0001' } },
    ];

    const result = buildCounters(cards);

    expect(result.task).toBe(42);
    expect(result.bug).toBe(3);
    expect(result.epic).toBe(1);
    expect(result.sprint).toBe(0);
    expect(result.proposal).toBe(0);
    expect(result.qa).toBe(0);
  });

  it('should handle empty card list', () => {
    const result = buildCounters([]);
    expect(result).toEqual({ task: 0, bug: 0, epic: 0, sprint: 0, proposal: 0, qa: 0 });
  });
});
