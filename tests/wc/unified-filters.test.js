/**
 * Tests for UnifiedFilters component — the missing coverage that let
 * PLN-BUG-0117 ship: the component listened for '@selection-changed'
 * while @manufosela/multi-select only emits 'change', so no filter
 * selection ever reached the service and every view rendered unfiltered.
 *
 * Two layers of protection:
 *  1. Source guard: the template must bind '@change' on <multi-select>
 *     and the dead event name must not reappear.
 *  2. Handler contract: _handleFilterChange consumes exactly the event
 *     shape multi-select emits ({ detail: { selectedValues } }) and
 *     forwards it to the service + re-emits 'filters-changed'.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock LitElement and html
vi.mock('lit', () => ({
  LitElement: class LitElement {
    static get properties() { return {}; }
    connectedCallback() {}
    disconnectedCallback() {}
    requestUpdate() {}
    render() { return ''; }
    dispatchEvent() { return true; }
  },
  html: () => ''
}));

// Mock the multi-select custom element registration
vi.mock('@manufosela/multi-select', () => ({}));

// Mock styles
vi.mock('@/wc/unified-filters-styles.js', () => ({
  unifiedFiltersStyles: ''
}));

// Spy-able filter service
const mockSetFilter = vi.fn();
const mockGetActiveFilters = vi.fn().mockReturnValue({ status: ['To Do'] });
const mockClearAllFilters = vi.fn();
vi.mock('@/services/unified-filter-service.js', () => ({
  getUnifiedFilterService: () => ({
    setFilter: mockSetFilter,
    getActiveFilters: mockGetActiveFilters,
    clearAllFilters: mockClearAllFilters,
    getAllFilterOptions: vi.fn().mockResolvedValue({})
  })
}));

const { UnifiedFilters } = await import('../../public/js/wc/UnifiedFilters.js');

const SOURCE = readFileSync(
  resolve(process.cwd(), 'public/js/wc/UnifiedFilters.js'),
  'utf8'
);

describe('UnifiedFilters — event binding guard (PLN-BUG-0117)', () => {
  it('binds @change on multi-select (the only event the component emits)', () => {
    expect(SOURCE).toMatch(/@change=\$\{\(e\) => this\._handleFilterChange\(/);
  });

  it('does NOT listen for the phantom selection-changed event', () => {
    // multi-select never emitted this. If it reappears, filters die silently
    // again in every view. See orphaned fix commit aaa834b.
    expect(SOURCE).not.toContain('selection-changed');
  });
});

describe('UnifiedFilters — _handleFilterChange contract', () => {
  let component;

  beforeEach(() => {
    vi.clearAllMocks();
    component = new UnifiedFilters();
    component.projectId = 'TestProject';
    component.cardType = 'task';
    component._service = {
      setFilter: mockSetFilter,
      getActiveFilters: mockGetActiveFilters
    };
    component.dispatchEvent = vi.fn();
  });

  it('forwards the multi-select change payload to service.setFilter', () => {
    // Exact shape @manufosela/multi-select emits on 'change':
    // new CustomEvent('change', { detail: { selectedValues } })
    component._handleFilterChange('status', { detail: { selectedValues: ['To Do'] } });

    expect(mockSetFilter).toHaveBeenCalledWith('TestProject', 'task', 'status', ['To Do']);
  });

  it('re-emits filters-changed with project/cardType/filters for parents', () => {
    component._handleFilterChange('status', { detail: { selectedValues: ['To Do'] } });

    expect(component.dispatchEvent).toHaveBeenCalledTimes(1);
    const evt = component.dispatchEvent.mock.calls[0][0];
    expect(evt.type).toBe('filters-changed');
    expect(evt.detail).toEqual({
      projectId: 'TestProject',
      cardType: 'task',
      filters: { status: ['To Do'] }
    });
  });

  it('treats a missing detail as empty selection (clears the filter)', () => {
    component._handleFilterChange('status', {});
    expect(mockSetFilter).toHaveBeenCalledWith('TestProject', 'task', 'status', []);
  });
});
