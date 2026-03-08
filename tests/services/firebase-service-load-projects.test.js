import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockListProjects = vi.fn();
const mockGetProject = vi.fn();
const mockGetUserProjects = vi.fn();
const mockGetDefaultProjects = vi.fn();
const mockSetUserProjects = vi.fn();

vi.mock('../../public/js/services/dal-service.js', () => ({
  dalService: {
    projects: {
      listProjects: (...args) => mockListProjects(...args),
      getProject: (...args) => mockGetProject(...args),
    },
    config: {
      getUserProjects: (...args) => mockGetUserProjects(...args),
      getDefaultProjects: (...args) => mockGetDefaultProjects(...args),
      setUserProjects: (...args) => mockSetUserProjects(...args),
    },
  },
}));

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: vi.fn(),
  onValue: vi.fn(),
  databaseFirestore: {},
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
  auth: { currentUser: { email: 'testuser@example.com' } },
  firebaseConfig: {},
  superAdminEmail: 'superadmin@example.com',
}));

vi.mock('../../public/js/utils/email-sanitizer.js', () => ({
  encodeEmailForFirebase: (email) => email.replace(/[@.]/g, '_'),
  decodeEmailFromFirebase: (encoded) => encoded,
  sanitizeEmailForFirebase: (email) => email.replace(/[@.]/g, '_'),
}));

vi.mock('../../public/js/services/permission-service.js', () => ({
  permissionService: {},
}));

vi.mock('../../public/js/services/history-service.js', () => ({
  historyService: {},
}));

vi.mock('../../public/js/services/user-directory-service.js', () => ({
  userDirectoryService: { load: vi.fn() },
}));

vi.mock('../../public/js/services/entity-directory-service.js', () => ({
  entityDirectoryService: {},
}));

vi.mock('../../public/js/services/developer-backlog-service.js', () => ({
  developerBacklogService: {},
}));

vi.mock('../../public/js/utils/developer-normalizer.js', () => ({
  normalizeDeveloperEntry: vi.fn(),
}));

vi.mock('../../public/js/utils/project-people-utils.js', () => ({
  normalizeProjectPeople: vi.fn(),
}));

describe('FirebaseService.loadProjects', () => {
  let FirebaseService;

  const allProjects = {
    'project-a': { name: 'Project A' },
    'project-b': { name: 'Project B' },
    'project-c': { name: 'Project C' },
  };

  beforeEach(async () => {
    vi.resetModules();
    window.projects = {};
    window.isAppAdmin = false;

    mockListProjects.mockReset();
    mockGetProject.mockReset();
    mockGetUserProjects.mockReset();
    mockGetDefaultProjects.mockReset();

    const module = await import('../../public/js/services/firebase-service.js');
    FirebaseService = module.FirebaseService;
  });

  afterEach(() => {
    delete window.projects;
    delete window.isAppAdmin;
  });

  it('should return all projects when userEmail is null', async () => {
    mockListProjects.mockResolvedValueOnce(allProjects);

    await FirebaseService.loadProjects(null);

    expect(window.projects).toEqual(allProjects);
  });

  it('should return all projects when window.isAppAdmin is true', async () => {
    window.isAppAdmin = true;
    mockListProjects.mockResolvedValueOnce(allProjects);

    await FirebaseService.loadProjects('regular@example.com');

    expect(window.projects).toEqual(allProjects);
  });

  it('should return all projects when userEmail is the superAdmin without calling getUserProjects', async () => {
    mockListProjects.mockResolvedValueOnce(allProjects);

    await FirebaseService.loadProjects('superadmin@example.com');

    expect(window.projects).toEqual(allProjects);
    expect(mockListProjects).toHaveBeenCalledTimes(1);
    expect(mockGetUserProjects).not.toHaveBeenCalled();
  });

  it('should return all projects when userEmail is the superAdmin (case insensitive)', async () => {
    mockListProjects.mockResolvedValueOnce(allProjects);

    await FirebaseService.loadProjects('SuperAdmin@Example.com');

    expect(window.projects).toEqual(allProjects);
    expect(mockListProjects).toHaveBeenCalledTimes(1);
  });

  it('should return filtered projects for regular user with specific assignments', async () => {
    // getUserProjects returns the raw value from DB
    mockGetUserProjects.mockResolvedValueOnce('project-a,project-c');
    // Individual project loads
    mockGetProject
      .mockResolvedValueOnce(allProjects['project-a'])
      .mockResolvedValueOnce(allProjects['project-c']);

    await FirebaseService.loadProjects('regular@example.com');

    expect(window.projects).toEqual({
      'project-a': { name: 'Project A' },
      'project-c': { name: 'Project C' },
    });
  });

  it('should return all projects for regular user with "All" assignment', async () => {
    // getUserProjects returns "All"
    mockGetUserProjects.mockResolvedValueOnce('All');
    // listProjects for "All" access
    mockListProjects.mockResolvedValueOnce(allProjects);

    await FirebaseService.loadProjects('regular@example.com');

    expect(window.projects).toEqual(allProjects);
  });

  it('should return empty object when no projects exist in database', async () => {
    mockListProjects.mockResolvedValueOnce(null);

    await FirebaseService.loadProjects(null);

    expect(window.projects).toEqual({});
  });
});
