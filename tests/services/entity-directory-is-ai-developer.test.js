import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGet = vi.fn();
const mockRef = vi.fn(() => 'mock-ref');
const mockOnValue = vi.fn();

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: (...args) => mockRef(...args),
  get: (...args) => mockGet(...args),
  set: vi.fn(),
  push: vi.fn(),
  onValue: (...args) => mockOnValue(...args),
  update: vi.fn(),
  databaseFirestore: {},
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
  auth: { currentUser: { email: 'testuser@example.com' } },
  firebaseConfig: {},
  superAdminEmail: 'superadmin@example.com',
}));

vi.mock('../../public/js/utils/project-people-utils.js', () => ({
  normalizeProjectPeople: vi.fn((arr) => arr || []),
}));

const sampleDevelopers = {
  dev_005: { email: 'carlos@example.com', name: 'Carlos Dev', active: true },
  dev_010: { email: 'manu@example.com', name: 'Manu Fosela', active: true },
  dev_016: { email: 'becaria@ia.local', name: 'BecarIA', active: true },
  dev_017: { email: 'another-ai@ia.local', name: 'AnotherBot', active: true },
};

const emptySnap = { exists: () => false, val: () => null };

function makeSnap(data) {
  return { exists: () => true, val: () => data };
}

describe('EntityDirectoryService.isAIDeveloper', () => {
  let entityDirectoryService;

  beforeEach(async () => {
    vi.resetModules();

    mockGet.mockReset();
    mockRef.mockReset();
    mockRef.mockReturnValue('mock-ref');
    mockOnValue.mockReset();

    // Mock Firebase responses: developers, stakeholders, teams, projects
    mockGet
      .mockResolvedValueOnce(makeSnap(sampleDevelopers))  // developers
      .mockResolvedValueOnce(emptySnap)                     // stakeholders
      .mockResolvedValueOnce(emptySnap)                     // teams
      .mockResolvedValueOnce(emptySnap);                    // projects

    const module = await import('../../public/js/services/entity-directory-service.js');
    // Get a fresh instance via the class
    const ServiceClass = module.EntityDirectoryService || module.entityDirectoryService?.constructor;

    if (ServiceClass) {
      entityDirectoryService = new ServiceClass();
    } else {
      entityDirectoryService = module.entityDirectoryService;
    }

    await entityDirectoryService.init();
  });

  it('should return true for BecarIA (dev_016 with @ia.local email)', () => {
    expect(entityDirectoryService.isAIDeveloper('dev_016')).toBe(true);
  });

  it('should return true for any developer with @ia.local email domain', () => {
    expect(entityDirectoryService.isAIDeveloper('dev_017')).toBe(true);
  });

  it('should return false for a regular developer', () => {
    expect(entityDirectoryService.isAIDeveloper('dev_005')).toBe(false);
  });

  it('should return false for another regular developer', () => {
    expect(entityDirectoryService.isAIDeveloper('dev_010')).toBe(false);
  });

  it('should return true when referenced by AI email directly', () => {
    expect(entityDirectoryService.isAIDeveloper('becaria@ia.local')).toBe(true);
  });

  it('should return false when referenced by regular email', () => {
    expect(entityDirectoryService.isAIDeveloper('carlos@example.com')).toBe(false);
  });

  it('should return false for null/undefined/empty', () => {
    expect(entityDirectoryService.isAIDeveloper(null)).toBe(false);
    expect(entityDirectoryService.isAIDeveloper(undefined)).toBe(false);
    expect(entityDirectoryService.isAIDeveloper('')).toBe(false);
  });

  it('should return false for an unknown developer ID', () => {
    expect(entityDirectoryService.isAIDeveloper('dev_999')).toBe(false);
  });

  it('should return false for a non-developer string', () => {
    expect(entityDirectoryService.isAIDeveloper('random-string')).toBe(false);
  });
});
