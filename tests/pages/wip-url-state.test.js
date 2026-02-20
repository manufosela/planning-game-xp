import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { URLStateManager } from '../../public/js/utils/url-utils.js';

describe('WIP Page - URL State for Developer Selection', () => {
  let originalUrl;
  let pushStateSpy;

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
  });

  it('should restore developer from URL when loading backlog tab', () => {
    window.history.pushState({}, '', 'http://localhost:3000/wip?tab=backlog&developer=dev_005');

    const urlState = URLStateManager.getState();

    expect(urlState.tab).toBe('backlog');
    expect(urlState.developer).toBe('dev_005');
  });

  it('should update URL with developer when changing dev tab', () => {
    window.history.pushState({}, '', 'http://localhost:3000/wip?tab=backlog');
    pushStateSpy = vi.spyOn(window.history, 'pushState');

    URLStateManager.updateState({ developer: 'dev_003' });

    const calledUrl = pushStateSpy.mock.calls[0][2];
    expect(calledUrl).toContain('developer=dev_003');
    expect(calledUrl).toContain('tab=backlog');
  });

  it('should clear developer from URL when switching to wip tab', () => {
    window.history.pushState({}, '', 'http://localhost:3000/wip?tab=backlog&developer=dev_003');
    pushStateSpy = vi.spyOn(window.history, 'pushState');

    URLStateManager.updateState({ tab: 'wip', developer: null });

    const calledUrl = pushStateSpy.mock.calls[0][2];
    expect(calledUrl).toContain('tab=wip');
    expect(calledUrl).not.toContain('developer=');
  });

  it('should preserve tab when updating developer', () => {
    window.history.pushState({}, '', 'http://localhost:3000/wip?tab=backlog');
    pushStateSpy = vi.spyOn(window.history, 'pushState');

    URLStateManager.updateState({ developer: 'dev_010' });

    const calledUrl = pushStateSpy.mock.calls[0][2];
    expect(calledUrl).toContain('tab=backlog');
    expect(calledUrl).toContain('developer=dev_010');
  });

  it('should handle URL with only developer param (no tab)', () => {
    window.history.pushState({}, '', 'http://localhost:3000/wip?developer=dev_001');

    const urlState = URLStateManager.getState();

    expect(urlState.developer).toBe('dev_001');
    expect(urlState.tab).toBeNull();
  });
});
