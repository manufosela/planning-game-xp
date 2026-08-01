/**
 * Regression tests for PLN-BUG-0107 — orphan developer/stakeholder
 * preservation in the TaskCard <select> lists.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDeveloperOptions,
  buildStakeholderOptions
} from '../../public/js/utils/task-team-options.js';

// Simple registry the tests use to simulate entityDirectoryService.
const DEV_REGISTRY = {
  dev_001: { display: 'Mánu Fosela' },
  dev_016: { display: 'BecarIA' }
};
const STK_REGISTRY = {
  stk_001: { display: 'Mánu Fosela' },
  stk_018: { display: 'Reinaldo Aguilera' }
};

const resolveDev = id => (DEV_REGISTRY[id] ? id : null);
const getDevName = id => DEV_REGISTRY[id]?.display || null;
const resolveStk = id => (STK_REGISTRY[id] ? id : null);
const getStkName = id => STK_REGISTRY[id]?.display || null;

describe('buildDeveloperOptions', () => {
  it('returns unassigned + valid team members when no developer is assigned', () => {
    const opts = buildDeveloperOptions(
      [{ id: 'dev_001' }, { id: 'dev_016' }],
      null,
      resolveDev,
      getDevName
    );
    expect(opts.map(o => o.value)).toEqual(['', 'dev_001', 'dev_016']);
  });

  it('does NOT duplicate the current developer when already in the roster', () => {
    const opts = buildDeveloperOptions(
      [{ id: 'dev_001' }, { id: 'dev_016' }],
      'dev_001',
      resolveDev,
      getDevName
    );
    const dev001s = opts.filter(o => o.value === 'dev_001');
    expect(dev001s).toHaveLength(1);
    expect(dev001s[0].display).toBe('Mánu Fosela');
  });

  it('preserves an orphan developer (not in roster) as first team option', () => {
    // dev_010 exists on the task but not in the project's /developers list
    const opts = buildDeveloperOptions(
      [{ id: 'dev_001' }, { id: 'dev_016' }],
      'dev_010',
      resolveDev,
      getDevName
    );
    expect(opts.map(o => o.value)).toEqual(['', 'dev_010', 'dev_001', 'dev_016']);
    const orphan = opts.find(o => o.value === 'dev_010');
    expect(orphan.display).toMatch(/no en el equipo/);
  });

  it('still preserves the orphan when the project has no team at all', () => {
    const opts = buildDeveloperOptions([], 'dev_010', resolveDev, getDevName);
    expect(opts).toHaveLength(2);
    expect(opts[0].value).toBe('');
    expect(opts[1].value).toBe('dev_010');
  });

  it('does NOT add an orphan entry for unassigned aliases', () => {
    for (const alias of ['', 'unassigned', 'Sin Asignar', null, undefined]) {
      const opts = buildDeveloperOptions([{ id: 'dev_001' }], alias, resolveDev, getDevName);
      expect(opts).toHaveLength(2); // unassigned + dev_001
    }
  });

  it('accepts custom unassigned option and orphan suffix', () => {
    const opts = buildDeveloperOptions(
      [],
      'dev_999',
      resolveDev,
      getDevName,
      {
        unassignedOption: { value: '__none', display: '— none —' },
        orphanSuffix: ' (huérfano)'
      }
    );
    expect(opts[0]).toEqual({ value: '__none', display: '— none —' });
    expect(opts[1].display).toMatch(/huérfano/);
  });

  it('handles string entries in rawList (not only objects)', () => {
    const opts = buildDeveloperOptions(
      ['dev_001', 'dev_016'],
      null,
      resolveDev,
      getDevName
    );
    expect(opts.map(o => o.value)).toEqual(['', 'dev_001', 'dev_016']);
  });
});

describe('buildStakeholderOptions', () => {
  it('returns empty option + team when no current assignees', () => {
    const opts = buildStakeholderOptions(
      [{ id: 'stk_001' }, { id: 'stk_018' }],
      [null, null],
      resolveStk,
      getStkName
    );
    expect(opts.map(o => o.value)).toEqual(['', 'stk_001', 'stk_018']);
  });

  it('preserves orphan validator', () => {
    const opts = buildStakeholderOptions(
      [{ id: 'stk_001' }],
      ['stk_014', null], // stk_014 orphan
      resolveStk,
      getStkName
    );
    expect(opts.map(o => o.value)).toEqual(['', 'stk_014', 'stk_001']);
  });

  it('preserves BOTH orphan validator and coValidator without duplicates', () => {
    const opts = buildStakeholderOptions(
      [{ id: 'stk_001' }],
      ['stk_014', 'stk_099'],
      resolveStk,
      getStkName
    );
    const values = opts.map(o => o.value);
    expect(values).toContain('stk_014');
    expect(values).toContain('stk_099');
    expect(values).toContain('stk_001');
    // stk_014 appears only once
    expect(values.filter(v => v === 'stk_014')).toHaveLength(1);
  });

  it('does not add orphan option when the current assignee IS in the roster', () => {
    const opts = buildStakeholderOptions(
      [{ id: 'stk_001' }],
      ['stk_001', null],
      resolveStk,
      getStkName
    );
    expect(opts.map(o => o.value)).toEqual(['', 'stk_001']);
  });
});
