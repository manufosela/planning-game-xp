import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { URLUtils, URLStateManager } from '../../public/js/utils/url-utils.js';

describe('URLUtils', () => {
  let pushStateSpy;
  let originalUrl;

  beforeEach(() => {
    // Guardar la URL original
    originalUrl = window.location.href;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restaurar la URL original
    window.history.pushState({}, '', originalUrl);
    if (pushStateSpy) {
      pushStateSpy.mockRestore();
      pushStateSpy = undefined;
    }
  });

  describe('getProjectIdFromUrl', () => {
    it('debería extraer el projectId de la URL correctamente', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=test-project#tasks');
      const result = URLUtils.getProjectIdFromUrl();
      expect(result).toBe('test-project');
    });
    it('debería retornar string vacío cuando no hay projectId', () => {
      window.history.pushState({}, '', 'http://localhost:3000/#tasks');
      const result = URLUtils.getProjectIdFromUrl();
      expect(result).toBe('');
    });
    it('debería manejar URLs con múltiples parámetros', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=test-project&otherParam=value#tasks');
      const result = URLUtils.getProjectIdFromUrl();
      expect(result).toBe('test-project');
    });
  });

  describe('getSectionFromUrl', () => {
    it('debería extraer la sección del hash correctamente', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=test-project#bugs');
      const result = URLUtils.getSectionFromUrl();
      expect(result).toBe('bugs');
    });
    it('debería retornar "tasks" como valor por defecto cuando no hay hash', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=test-project');
      const result = URLUtils.getSectionFromUrl();
      expect(result).toBe('tasks');
    });
    it('debería manejar hash con múltiples valores', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=test-project#bugs#details');
      const result = URLUtils.getSectionFromUrl();
      expect(result).toBe('bugs#details');
    });
  });

  describe('updateUrl', () => {
    it('debería actualizar la URL con projectId y section', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=old-project#old-section');
      pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
      URLUtils.updateUrl('new-project', 'new-section');
      expect(pushStateSpy).toHaveBeenCalledWith(
        {},
        '',
        'http://localhost:3000/?projectId=new-project#new-section'
      );
    });
    it('debería actualizar solo el projectId cuando no se proporciona section', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=old-project#tasks');
      pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
      URLUtils.updateUrl('new-project');
      expect(pushStateSpy).toHaveBeenCalledWith(
        {},
        '',
        'http://localhost:3000/?projectId=new-project#tasks'
      );
    });
    it('debería actualizar solo la section cuando no se proporciona projectId', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=test-project#old-section');
      pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
      URLUtils.updateUrl(null, 'new-section');
      expect(pushStateSpy).toHaveBeenCalledWith(
        {},
        '',
        'http://localhost:3000/?projectId=test-project#new-section'
      );
    });
    it('debería manejar URLs sin parámetros existentes', () => {
      window.history.pushState({}, '', 'http://localhost:3000/');
      pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
      URLUtils.updateUrl('new-project', 'new-section');
      expect(pushStateSpy).toHaveBeenCalledWith(
        {},
        '',
        'http://localhost:3000/?projectId=new-project#new-section'
      );
    });
  });
});

describe('URLStateManager', () => {
  let pushStateSpy;
  let replaceStateSpy;
  let originalUrl;

  beforeEach(() => {
    originalUrl = window.location.href;
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.history.pushState({}, '', originalUrl);
    if (pushStateSpy) {
      pushStateSpy.mockRestore();
      pushStateSpy = undefined;
    }
    if (replaceStateSpy) {
      replaceStateSpy.mockRestore();
      replaceStateSpy = undefined;
    }
  });

  describe('getState', () => {
    it('should parse all URL parameters correctly', () => {
      window.history.pushState({}, '', 'http://localhost:3000/adminproject?projectId=C4D&view=kanban&tab=backlog&sprint=SPR-001#tasks');

      const state = URLStateManager.getState();

      expect(state.projectId).toBe('C4D');
      expect(state.view).toBe('kanban');
      expect(state.tab).toBe('backlog');
      expect(state.sprint).toBe('SPR-001');
      expect(state.section).toBe('tasks');
    });

    it('should decode filters from f parameter', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D&f=status:In%20Progress;developer:dev_001');

      const state = URLStateManager.getState();

      // Filters are always arrays, even for single values
      expect(state.filters).toEqual({
        status: ['In Progress'],
        developer: ['dev_001']
      });
    });

    it('should return section from hash', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D#bugs');

      const state = URLStateManager.getState();

      expect(state.section).toBe('bugs');
    });

    it('should return null section if no hash', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D');

      const state = URLStateManager.getState();

      expect(state.section).toBeNull();
    });

    it('should handle empty URL gracefully', () => {
      window.history.pushState({}, '', 'http://localhost:3000/');

      const state = URLStateManager.getState();

      expect(state.projectId).toBeNull();
      expect(state.view).toBeNull();
      expect(state.tab).toBeNull();
      expect(state.sprint).toBeNull();
      expect(state.developer).toBeNull();
      expect(state.filters).toEqual({});
      expect(state.section).toBeNull();
    });

    it('should parse developer param from URL', () => {
      window.history.pushState({}, '', 'http://localhost:3000/wip?tab=backlog&developer=dev_001');

      const state = URLStateManager.getState();

      expect(state.tab).toBe('backlog');
      expect(state.developer).toBe('dev_001');
    });
  });

  describe('updateState', () => {
    it('should update URL without page reload using pushState', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D');
      pushStateSpy = vi.spyOn(window.history, 'pushState');

      URLStateManager.updateState({ view: 'kanban' });

      expect(pushStateSpy).toHaveBeenCalled();
      const calledUrl = pushStateSpy.mock.calls[0][2];
      expect(calledUrl).toContain('view=kanban');
    });

    it('should use replaceState when replace=true', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D');
      replaceStateSpy = vi.spyOn(window.history, 'replaceState');
      pushStateSpy = vi.spyOn(window.history, 'pushState');

      URLStateManager.updateState({ view: 'table' }, true);

      expect(replaceStateSpy).toHaveBeenCalled();
      expect(pushStateSpy).not.toHaveBeenCalled();
    });

    it('should remove null/empty values from URL', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D&view=kanban&tab=backlog');
      pushStateSpy = vi.spyOn(window.history, 'pushState');

      URLStateManager.updateState({ view: null, tab: '' });

      const calledUrl = pushStateSpy.mock.calls[0][2];
      expect(calledUrl).not.toContain('view=');
      expect(calledUrl).not.toContain('tab=');
      expect(calledUrl).toContain('projectId=C4D');
    });

    it('should update hash for section parameter', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D');
      pushStateSpy = vi.spyOn(window.history, 'pushState');

      URLStateManager.updateState({ section: 'bugs' });

      const calledUrl = pushStateSpy.mock.calls[0][2];
      expect(calledUrl).toContain('#bugs');
    });

    it('should preserve existing parameters when updating', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D&view=list');
      pushStateSpy = vi.spyOn(window.history, 'pushState');

      URLStateManager.updateState({ tab: 'backlog' });

      const calledUrl = pushStateSpy.mock.calls[0][2];
      expect(calledUrl).toContain('projectId=C4D');
      expect(calledUrl).toContain('view=list');
      expect(calledUrl).toContain('tab=backlog');
    });

    it('should add developer param to URL', () => {
      window.history.pushState({}, '', 'http://localhost:3000/wip?tab=backlog');
      pushStateSpy = vi.spyOn(window.history, 'pushState');

      URLStateManager.updateState({ developer: 'dev_001' });

      const calledUrl = pushStateSpy.mock.calls[0][2];
      expect(calledUrl).toContain('tab=backlog');
      expect(calledUrl).toContain('developer=dev_001');
    });

    it('should remove developer param when set to null', () => {
      window.history.pushState({}, '', 'http://localhost:3000/wip?tab=wip&developer=dev_001');
      pushStateSpy = vi.spyOn(window.history, 'pushState');

      URLStateManager.updateState({ developer: null });

      const calledUrl = pushStateSpy.mock.calls[0][2];
      expect(calledUrl).not.toContain('developer=');
      expect(calledUrl).toContain('tab=wip');
    });
  });

  describe('_encodeFilters / _decodeFilters', () => {
    it('should encode filters to compact string', () => {
      const filters = {
        status: 'In Progress',
        developer: 'dev_001'
      };

      const encoded = URLStateManager._encodeFilters(filters);

      expect(encoded).toBe('status:In Progress;developer:dev_001');
    });

    it('should decode filters back to object', () => {
      const encoded = 'status:In Progress;developer:dev_001';

      const decoded = URLStateManager._decodeFilters(encoded);

      // Filters are always arrays, even for single values
      expect(decoded).toEqual({
        status: ['In Progress'],
        developer: ['dev_001']
      });
    });

    it('should handle array values', () => {
      const filters = {
        status: ['To Do', 'In Progress']
      };

      const encoded = URLStateManager._encodeFilters(filters);
      const decoded = URLStateManager._decodeFilters(encoded);

      expect(decoded.status).toEqual(['To Do', 'In Progress']);
    });

    it('should return null for empty filters', () => {
      const encoded = URLStateManager._encodeFilters({});
      expect(encoded).toBeNull();

      const encodedNull = URLStateManager._encodeFilters(null);
      expect(encodedNull).toBeNull();
    });

    it('should return empty object for null/empty encoded string', () => {
      expect(URLStateManager._decodeFilters(null)).toEqual({});
      expect(URLStateManager._decodeFilters('')).toEqual({});
    });

    it('should filter out empty array values', () => {
      const filters = {
        status: 'In Progress',
        developer: [],
        sprint: ''
      };

      const encoded = URLStateManager._encodeFilters(filters);

      expect(encoded).toBe('status:In Progress');
      expect(encoded).not.toContain('developer');
      expect(encoded).not.toContain('sprint');
    });
  });

  describe('onPopState', () => {
    it('should call callback when popstate event fires', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D&view=kanban');
      const callback = vi.fn();

      URLStateManager.onPopState(callback);

      // Simulate popstate event
      const event = new PopStateEvent('popstate', { state: { view: 'kanban' } });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });

    it('should pass current state and event state to callback', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D&view=kanban');
      const callback = vi.fn();

      URLStateManager.onPopState(callback);

      const eventState = { view: 'kanban' };
      const event = new PopStateEvent('popstate', { state: eventState });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'C4D', view: 'kanban' }),
        eventState
      );
    });
  });

  describe('clearState', () => {
    it('should remove specified parameters from URL', () => {
      window.history.pushState({}, '', 'http://localhost:3000/?projectId=C4D&view=kanban&tab=backlog&f=status:Done');
      pushStateSpy = vi.spyOn(window.history, 'pushState');

      URLStateManager.clearState(['view', 'tab', 'filters']);

      const calledUrl = pushStateSpy.mock.calls[0][2];
      expect(calledUrl).toContain('projectId=C4D');
      expect(calledUrl).not.toContain('view=');
      expect(calledUrl).not.toContain('tab=');
      expect(calledUrl).not.toContain('f=');
    });
  });
}); 