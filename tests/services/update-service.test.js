import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock version.js
vi.mock('@/version.js', () => ({
  version: '1.50.0'
}));

// Mock client-config.js
vi.mock('@/config/client-config.js', () => ({
  CLIENT_CONFIG: { updates: { enabled: true } }
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();
vi.stubGlobal('localStorage', localStorageMock);

let UpdateService;

describe('UpdateService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();

    // Fresh import each time to avoid singleton state
    const mod = await import('../../public/js/services/update-service.js');
    UpdateService = mod.UpdateService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with current version from version.js', () => {
    const service = new UpdateService();
    expect(service.currentVersion).toBe('1.50.0');
  });

  it('should detect newer version', () => {
    const service = new UpdateService();
    expect(service._isNewer('1.51.0', '1.50.0')).toBe(true);
    expect(service._isNewer('2.0.0', '1.50.0')).toBe(true);
    expect(service._isNewer('1.50.1', '1.50.0')).toBe(true);
  });

  it('should detect same or older version', () => {
    const service = new UpdateService();
    expect(service._isNewer('1.50.0', '1.50.0')).toBe(false);
    expect(service._isNewer('1.49.0', '1.50.0')).toBe(false);
    expect(service._isNewer('0.99.0', '1.50.0')).toBe(false);
  });

  it('should handle null/undefined versions', () => {
    const service = new UpdateService();
    expect(service._isNewer(null, '1.0.0')).toBe(false);
    expect(service._isNewer('1.0.0', null)).toBe(false);
    expect(service._isNewer(undefined, undefined)).toBe(false);
  });

  it('should dispatch update-available event when newer version found', async () => {
    const service = new UpdateService();
    const eventSpy = vi.fn();
    document.addEventListener('update-available', eventSpy);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '2.0.0',
        date: '2026-03-08',
        changelog: 'New features',
        repoUrl: 'https://github.com/manufosela/planning-game-xp',
        releaseUrl: 'https://github.com/manufosela/planning-game-xp/releases/tag/v2.0.0'
      })
    });

    const result = await service.checkForUpdates();
    expect(result).not.toBeNull();
    expect(result.version).toBe('2.0.0');
    expect(eventSpy).toHaveBeenCalledTimes(1);

    const detail = eventSpy.mock.calls[0][0].detail;
    expect(detail.currentVersion).toBe('1.50.0');
    expect(detail.version).toBe('2.0.0');
    expect(detail.changelog).toBe('New features');

    document.removeEventListener('update-available', eventSpy);
  });

  it('should not dispatch event when version is same', async () => {
    const service = new UpdateService();
    const eventSpy = vi.fn();
    document.addEventListener('update-available', eventSpy);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '1.50.0' })
    });

    const result = await service.checkForUpdates();
    expect(result).toBeNull();
    expect(eventSpy).not.toHaveBeenCalled();

    document.removeEventListener('update-available', eventSpy);
  });

  it('should not dispatch event when version was dismissed', async () => {
    const service = new UpdateService();
    const eventSpy = vi.fn();
    document.addEventListener('update-available', eventSpy);

    localStorageMock.getItem.mockReturnValueOnce('2.0.0');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '2.0.0' })
    });

    const result = await service.checkForUpdates();
    expect(result).toBeNull();
    expect(eventSpy).not.toHaveBeenCalled();

    document.removeEventListener('update-available', eventSpy);
  });

  it('should save dismissed version to localStorage', () => {
    const service = new UpdateService();
    service.dismissVersion('2.0.0');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('pg-update-dismissed-version', '2.0.0');
  });

  it('should handle fetch errors gracefully', async () => {
    const service = new UpdateService();
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await service.checkForUpdates();
    expect(result).toBeNull();
  });

  it('should handle non-ok response gracefully', async () => {
    const service = new UpdateService();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await service.checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return correct status', async () => {
    const service = new UpdateService();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '2.0.0' })
    });

    await service.checkForUpdates();
    const status = service.getStatus();

    expect(status.currentVersion).toBe('1.50.0');
    expect(status.latestVersion).toBe('2.0.0');
    expect(status.updateAvailable).toBe(true);
    expect(status.lastCheck).toBeDefined();
  });
});
