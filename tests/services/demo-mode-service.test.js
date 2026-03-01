/**
 * Tests for demo-mode-service.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ThemeLoaderService
vi.mock('@/services/theme-loader-service.js', () => ({
  ThemeLoaderService: {
    getConfigValue: vi.fn(),
  },
}));

const { ThemeLoaderService } = await import('@/services/theme-loader-service.js');

describe('DemoModeService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    // Clean up DOM
    const bar = document.getElementById('demo-mode-bar');
    if (bar) bar.remove();
    document.querySelectorAll('slide-notification').forEach(n => n.remove());
    document.body.style.paddingTop = '';
  });

  async function createFreshService(demoConfig) {
    ThemeLoaderService.getConfigValue.mockReturnValue(demoConfig);
    // Re-import to get fresh instance
    const mod = await import('@/services/demo-mode-service.js');
    const service = new mod.demoModeService.constructor();
    return service;
  }

  describe('isDemo', () => {
    it('should return true when demo.enabled is true', async () => {
      const service = await createFreshService({ enabled: true, maxProjects: 1 });
      service.init();
      expect(service.isDemo()).toBe(true);
    });

    it('should return false when demo config is null', async () => {
      const service = await createFreshService(null);
      service.init();
      expect(service.isDemo()).toBe(false);
    });

    it('should return false when demo.enabled is false', async () => {
      const service = await createFreshService({ enabled: false });
      service.init();
      expect(service.isDemo()).toBe(false);
    });

    it('should return false when demo config is undefined', async () => {
      const service = await createFreshService(undefined);
      service.init();
      expect(service.isDemo()).toBe(false);
    });
  });

  describe('config getters', () => {
    it('should expose maxProjects from config', async () => {
      const service = await createFreshService({ enabled: true, maxProjects: 1, maxTasksPerProject: 20 });
      service.init();
      expect(service.maxProjects).toBe(1);
    });

    it('should expose maxTasksPerProject from config', async () => {
      const service = await createFreshService({ enabled: true, maxProjects: 1, maxTasksPerProject: 20 });
      service.init();
      expect(service.maxTasksPerProject).toBe(20);
    });

    it('should return 0 for maxProjects when not set', async () => {
      const service = await createFreshService({ enabled: true });
      service.init();
      expect(service.maxProjects).toBe(0);
    });

    it('should return default bannerText when not set', async () => {
      const service = await createFreshService({ enabled: true });
      service.init();
      expect(service.bannerText).toBe('Demo Instance');
    });

    it('should return custom bannerText from config', async () => {
      const service = await createFreshService({ enabled: true, bannerText: 'Test Demo' });
      service.init();
      expect(service.bannerText).toBe('Test Demo');
    });
  });

  describe('banner rendering', () => {
    it('should create banner element when demo is enabled', async () => {
      const service = await createFreshService({ enabled: true, bannerText: 'Demo' });
      service.init();
      const bar = document.getElementById('demo-mode-bar');
      expect(bar).toBeTruthy();
      expect(bar.textContent).toContain('Demo');
    });

    it('should NOT create banner when demo is disabled', async () => {
      const service = await createFreshService({ enabled: false });
      service.init();
      const bar = document.getElementById('demo-mode-bar');
      expect(bar).toBeNull();
    });

    it('should include install link in banner', async () => {
      const service = await createFreshService({ enabled: true });
      service.init();
      const link = document.querySelector('#demo-mode-bar a');
      expect(link).toBeTruthy();
      expect(link.href).toContain('github.com');
      expect(link.target).toBe('_blank');
    });

    it('should add padding to body', async () => {
      const service = await createFreshService({ enabled: true });
      service.init();
      expect(parseInt(document.body.style.paddingTop, 10)).toBeGreaterThanOrEqual(32);
    });

    it('should be idempotent (calling init twice creates only one banner)', async () => {
      const service = await createFreshService({ enabled: true });
      service.init();
      // Reset _initialized to simulate re-call
      service._initialized = false;
      service.init();
      const bars = document.querySelectorAll('#demo-mode-bar');
      expect(bars.length).toBe(1);
    });
  });

  describe('showLimitReached', () => {
    it('should create a slide-notification with warning type', async () => {
      const service = await createFreshService({ enabled: true, maxProjects: 1 });
      service.init();
      service.showLimitReached('projects');
      const notification = document.querySelector('slide-notification');
      expect(notification).toBeTruthy();
      expect(notification.type).toBe('warning');
      expect(notification.message).toContain('1 project');
    });
  });

  describe('showFeatureDisabled', () => {
    it('should create a slide-notification with info type', async () => {
      const service = await createFreshService({ enabled: true });
      service.init();
      service.showFeatureDisabled('Admin Panel');
      const notification = document.querySelector('slide-notification');
      expect(notification).toBeTruthy();
      expect(notification.type).toBe('info');
      expect(notification.message).toContain('Admin Panel');
    });
  });
});
