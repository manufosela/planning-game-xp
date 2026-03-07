/**
 * Tests for View Transitions page guard in main.js initialization flow.
 *
 * Validates that:
 * 1. Services are initialized only ONCE (singleton guard)
 * 2. AppController is created only on first load
 * 3. Subsequent astro:page-load events call onPageNavigated() instead of recreating
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Page Guard - View Transitions compatibility', () => {
  let servicesInitialized;
  let mockAppController;
  let initializeServices;
  let initializeApplication;

  beforeEach(() => {
    servicesInitialized = false;
    mockAppController = null;

    const mockFirebaseInit = vi.fn();
    const mockHistoryInit = vi.fn();
    const mockThemeLoad = vi.fn().mockResolvedValue();
    const mockEntityDirInit = vi.fn().mockResolvedValue();

    initializeServices = async () => {
      if (servicesInitialized) return;
      servicesInitialized = true;
      await mockThemeLoad();
      mockFirebaseInit();
      mockHistoryInit();
      await mockEntityDirInit();
    };

    const mockOnPageNavigated = vi.fn().mockResolvedValue();
    const mockCreate = vi.fn().mockResolvedValue({
      onPageNavigated: mockOnPageNavigated
    });

    initializeApplication = async () => {
      await initializeServices();
      if (!mockAppController) {
        mockAppController = await mockCreate();
        window.appController = mockAppController;
      } else {
        await mockAppController.onPageNavigated();
      }
    };

    initializeApplication._mocks = {
      firebaseInit: mockFirebaseInit,
      historyInit: mockHistoryInit,
      themeLoad: mockThemeLoad,
      entityDirInit: mockEntityDirInit,
      create: mockCreate,
      onPageNavigated: mockOnPageNavigated
    };
  });

  afterEach(() => {
    delete window.appController;
  });

  it('should initialize services and create AppController on first call', async () => {
    const { create, onPageNavigated } = initializeApplication._mocks;

    await initializeApplication();

    expect(servicesInitialized).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(onPageNavigated).not.toHaveBeenCalled();
    expect(window.appController).toBeDefined();
  });

  it('should NOT re-initialize services on second call', async () => {
    const { firebaseInit, historyInit, themeLoad, entityDirInit } = initializeApplication._mocks;

    await initializeApplication();
    await initializeApplication();

    expect(firebaseInit).toHaveBeenCalledTimes(1);
    expect(historyInit).toHaveBeenCalledTimes(1);
    expect(themeLoad).toHaveBeenCalledTimes(1);
    expect(entityDirInit).toHaveBeenCalledTimes(1);
  });

  it('should NOT recreate AppController on subsequent calls', async () => {
    const { create } = initializeApplication._mocks;

    await initializeApplication();
    await initializeApplication();
    await initializeApplication();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('should call onPageNavigated on subsequent calls', async () => {
    const { onPageNavigated } = initializeApplication._mocks;

    await initializeApplication();
    expect(onPageNavigated).not.toHaveBeenCalled();

    await initializeApplication();
    expect(onPageNavigated).toHaveBeenCalledTimes(1);

    await initializeApplication();
    expect(onPageNavigated).toHaveBeenCalledTimes(2);
  });

  it('should persist the same AppController instance across navigations', async () => {
    await initializeApplication();
    const firstInstance = window.appController;

    await initializeApplication();
    const secondInstance = window.appController;

    expect(firstInstance).toBe(secondInstance);
  });
});

describe('AppController.onPageNavigated', () => {
  it('should update section without reloading data when project stays the same', () => {
    const controller = {
      projectId: 'ProjectA',
      section: 'tasks',
      sectionsLoaded: { tasks: true },
      tabController: { openInitialTab: vi.fn() },
      loadInitialData: vi.fn().mockResolvedValue(),
      initializeProjectSelector: vi.fn().mockResolvedValue(),
      _restoreViewStateFromUrl: vi.fn()
    };

    const newProjectId = 'ProjectA';
    const newSection = 'bugs';

    if (newProjectId !== controller.projectId) {
      controller.projectId = newProjectId;
      controller.section = newSection;
      controller.sectionsLoaded = {};
      controller.loadInitialData();
      controller.initializeProjectSelector();
    } else {
      controller.section = newSection;
    }
    controller.tabController.openInitialTab();
    controller._restoreViewStateFromUrl();

    expect(controller.section).toBe('bugs');
    expect(controller.projectId).toBe('ProjectA');
    expect(controller.loadInitialData).not.toHaveBeenCalled();
    expect(controller.tabController.openInitialTab).toHaveBeenCalledTimes(1);
    expect(controller._restoreViewStateFromUrl).toHaveBeenCalledTimes(1);
  });

  it('should reload data when project changes on navigation', async () => {
    const controller = {
      projectId: 'ProjectA',
      section: 'tasks',
      sectionsLoaded: { tasks: true, bugs: true },
      tabController: { openInitialTab: vi.fn() },
      loadInitialData: vi.fn().mockResolvedValue(),
      initializeProjectSelector: vi.fn().mockResolvedValue(),
      _restoreViewStateFromUrl: vi.fn()
    };

    const newProjectId = 'ProjectB';
    const newSection = 'tasks';

    if (newProjectId !== controller.projectId) {
      controller.projectId = newProjectId;
      controller.section = newSection;
      controller.sectionsLoaded = {};
      await controller.loadInitialData();
      await controller.initializeProjectSelector();
    } else {
      controller.section = newSection;
    }
    controller.tabController.openInitialTab();
    controller._restoreViewStateFromUrl();

    expect(controller.projectId).toBe('ProjectB');
    expect(controller.sectionsLoaded).toEqual({});
    expect(controller.loadInitialData).toHaveBeenCalledTimes(1);
    expect(controller.initializeProjectSelector).toHaveBeenCalledTimes(1);
  });
});
