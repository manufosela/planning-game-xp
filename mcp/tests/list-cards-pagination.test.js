/**
 * PLN-TSK-0367: list_cards pagination (offset/limit) and extra fields, so a
 * client can read every card of a big project through the MCP.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMockData, setMockRtdbData } from './__mocks__/firebase.js';

vi.mock('../firebase-adapter.js', async () => {
  const mock = await import('./__mocks__/firebase.js');
  return { getDatabase: mock.getDatabase, getFirestore: mock.getFirestore };
});

const { listCards, listCardsSchema } = await import('../tools/cards.js');
const { compressResponse } = await import('../response-compressor.js');

const TASKS_PATH = '/cards/TestProject/TASKS_TestProject';
const parse = (result) => JSON.parse(result.content[0].text);

function seedTasks(count) {
  const tasks = {};
  // Insert in reverse so the test proves the listing sorts by firebaseId
  for (let i = count; i >= 1; i--) {
    const n = String(i).padStart(4, '0');
    tasks[`-key${n}`] = { cardId: `TP-TSK-${n}`, title: `Task ${i}`, status: i % 2 ? 'To Do' : 'In Progress', notes: `Ref: KJ-${i}` };
  }
  setMockRtdbData(TASKS_PATH, tasks);
}

describe('listCards pagination (PLN-TSK-0367)', () => {
  beforeEach(() => {
    resetMockData();
    setMockRtdbData('/projects/TestProject/abbreviation', 'TP');
  });

  it('should keep returning a plain array when no offset, limit or fields are given', async () => {
    seedTasks(3);
    const cards = parse(await listCards({ projectId: 'TestProject', type: 'task' }));
    expect(Array.isArray(cards)).toBe(true);
    expect(cards).toHaveLength(3);
    expect(cards[0]).not.toHaveProperty('notes');
  });

  it('should return the requested page with total, hasMore and nextOffset', async () => {
    seedTasks(5);
    const res = parse(await listCards({ projectId: 'TestProject', type: 'task', offset: 0, limit: 2 }));
    expect(res.cards.map(c => c.cardId)).toEqual(['TP-TSK-0001', 'TP-TSK-0002']);
    expect(res.pagination).toEqual({ offset: 0, limit: 2, total: 5, hasMore: true, nextOffset: 2 });
  });

  it('should end with hasMore false and nextOffset null on the last page', async () => {
    seedTasks(5);
    const res = parse(await listCards({ projectId: 'TestProject', type: 'task', offset: 4, limit: 2 }));
    expect(res.cards.map(c => c.cardId)).toEqual(['TP-TSK-0005']);
    expect(res.pagination).toEqual({ offset: 4, limit: 2, total: 5, hasMore: false, nextOffset: null });
  });

  it('should return every card exactly once when walking the pages', async () => {
    seedTasks(7);
    const seen = [];
    let offset = 0;
    while (offset !== null) {
      const res = parse(await listCards({ projectId: 'TestProject', type: 'task', offset, limit: 3 }));
      seen.push(...res.cards.map(c => c.cardId));
      offset = res.pagination.nextOffset;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('should count the total after filters', async () => {
    seedTasks(5);
    const res = parse(await listCards({ projectId: 'TestProject', type: 'task', status: 'To Do', limit: 10 }));
    expect(res.pagination.total).toBe(3);
    expect(res.cards.every(c => c.status === 'To Do')).toBe(true);
  });

  it('should default limit to 50 when only offset is given', async () => {
    seedTasks(3);
    const res = parse(await listCards({ projectId: 'TestProject', type: 'task', offset: 1 }));
    expect(res.pagination).toMatchObject({ offset: 1, limit: 50, total: 3, hasMore: false });
    expect(res.cards).toHaveLength(2);
  });

  it('should add the requested fields to each card, null when missing', async () => {
    seedTasks(2);
    const res = parse(await listCards({ projectId: 'TestProject', type: 'task', fields: ['notes', 'startDate'] }));
    expect(res.cards[0]).toMatchObject({ notes: 'Ref: KJ-1', startDate: null });
    expect(res.pagination.offset).toBe(0);
  });

  it('should return an empty page with the pagination block for an empty project', async () => {
    const res = parse(await listCards({ projectId: 'TestProject', type: 'task', limit: 10 }));
    expect(res).toEqual({ cards: [], pagination: { offset: 0, limit: 10, total: 0, hasMore: false, nextOffset: null } });
  });

  it('should reject invalid offset and limit in the schema', () => {
    const base = { projectId: 'TestProject', type: 'task' };
    expect(listCardsSchema.safeParse({ ...base, offset: -1 }).success).toBe(false);
    expect(listCardsSchema.safeParse({ ...base, limit: 0 }).success).toBe(false);
    expect(listCardsSchema.safeParse({ ...base, limit: 201 }).success).toBe(false);
    expect(listCardsSchema.safeParse({ ...base, offset: 1.5 }).success).toBe(false);
    expect(listCardsSchema.safeParse({ ...base, offset: 0, limit: 200, fields: ['notes'] }).success).toBe(true);
  });
});

describe('compressResponse with paginated list_cards', () => {
  it('should not truncate nor strip fields of a paginated response', () => {
    const cards = Array.from({ length: 30 }, (_, i) => ({ cardId: `TP-TSK-${i}`, description: 'asked for' }));
    const data = { cards, pagination: { offset: 0, limit: 30, total: 30, hasMore: false, nextOffset: null } };
    const out = compressResponse(data);
    expect(out.cards).toHaveLength(30);
    expect(out.cards[0].description).toBe('asked for');
  });

  it('should still truncate a plain array (unchanged behaviour)', () => {
    const arr = Array.from({ length: 30 }, (_, i) => ({ cardId: `TP-TSK-${i}` }));
    const out = compressResponse(arr);
    expect(out).toHaveLength(21);
    expect(out[20]).toMatchObject({ _truncated: true, _totalItems: 30 });
  });
});
