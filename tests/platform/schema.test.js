import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path) => `collection:${path.join('/')}`),
  doc: vi.fn((ref, id) => `doc:${ref}/${id}`),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn((...args) => args),
  where: vi.fn((...args) => `where:${args.join(':')}`),
  orderBy: vi.fn((...args) => `orderBy:${args.join(':')}`),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

import {
  instancesRef,
  pendingRequestsRef,
  platformConfigRef,
  listInstances,
  getInstance,
  getInstanceByName,
  createInstance,
  updateInstance,
  listPendingRequests,
  getPendingRequest,
  createPendingRequest,
  updatePendingRequest,
  getPlatformConfig,
  setPlatformConfig,
  listPlatformConfig,
  validateInstanceName,
  INSTANCE_STATUSES,
  REQUEST_STATUSES,
} from '../../src/platform/schema.js';

import {
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
} from 'firebase/firestore';

const mockDb = 'mock-db';

describe('platform/schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Collection references
  // -----------------------------------------------------------------------

  describe('collection references', () => {
    it('instancesRef returns instances collection', () => {
      const ref = instancesRef(mockDb);
      expect(ref).toBe('collection:instances');
    });

    it('pendingRequestsRef returns pendingRequests collection', () => {
      const ref = pendingRequestsRef(mockDb);
      expect(ref).toBe('collection:pendingRequests');
    });

    it('platformConfigRef returns platformConfig collection', () => {
      const ref = platformConfigRef(mockDb);
      expect(ref).toBe('collection:platformConfig');
    });
  });

  // -----------------------------------------------------------------------
  // Instances
  // -----------------------------------------------------------------------

  describe('listInstances', () => {
    it('returns all instances ordered by createdAt desc', async () => {
      getDocs.mockResolvedValue({
        docs: [
          { id: 'i1', data: () => ({ name: 'geniova', status: 'active' }) },
          { id: 'i2', data: () => ({ name: 'demo', status: 'active' }) },
        ],
      });

      const result = await listInstances(mockDb);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'i1', name: 'geniova', status: 'active' });
    });
  });

  describe('getInstance', () => {
    it('returns instance by ID', async () => {
      getDoc.mockResolvedValue({
        exists: () => true,
        id: 'i1',
        data: () => ({ name: 'geniova', status: 'active' }),
      });

      const result = await getInstance(mockDb, 'i1');
      expect(result).toEqual({ id: 'i1', name: 'geniova', status: 'active' });
    });

    it('returns null when not found', async () => {
      getDoc.mockResolvedValue({ exists: () => false });
      const result = await getInstance(mockDb, 'nope');
      expect(result).toBeNull();
    });
  });

  describe('getInstanceByName', () => {
    it('returns instance matching name', async () => {
      getDocs.mockResolvedValue({
        empty: false,
        docs: [{ id: 'i1', data: () => ({ name: 'geniova' }) }],
      });

      const result = await getInstanceByName(mockDb, 'geniova');
      expect(result).toEqual({ id: 'i1', name: 'geniova' });
    });

    it('returns null when no match', async () => {
      getDocs.mockResolvedValue({ empty: true, docs: [] });
      const result = await getInstanceByName(mockDb, 'nope');
      expect(result).toBeNull();
    });
  });

  describe('createInstance', () => {
    it('creates a new instance', async () => {
      getDocs.mockResolvedValue({ empty: true, docs: [] });
      addDoc.mockResolvedValue({ id: 'new-id' });

      const id = await createInstance(mockDb, {
        name: 'test-org',
        databaseId: 'test-org',
        ownerEmail: 'admin@test.com',
        ownerUid: 'uid-123',
      });

      expect(id).toBe('new-id');
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'test-org',
          databaseId: 'test-org',
          status: 'active',
          ownerEmail: 'admin@test.com',
          ownerUid: 'uid-123',
          userCount: 1,
        }),
      );
    });

    it('throws when name already exists', async () => {
      getDocs.mockResolvedValue({
        empty: false,
        docs: [{ id: 'existing', data: () => ({ name: 'taken' }) }],
      });

      await expect(
        createInstance(mockDb, {
          name: 'taken',
          databaseId: 'taken',
          ownerEmail: 'a@b.com',
          ownerUid: 'uid',
        }),
      ).rejects.toThrow('already exists');
    });
  });

  describe('updateInstance', () => {
    it('updates fields with timestamp', async () => {
      updateDoc.mockResolvedValue(undefined);

      await updateInstance(mockDb, 'i1', { status: 'suspended' });

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'suspended', updatedAt: 'mock-timestamp' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Pending Requests
  // -----------------------------------------------------------------------

  describe('listPendingRequests', () => {
    it('returns all requests', async () => {
      getDocs.mockResolvedValue({
        docs: [
          { id: 'r1', data: () => ({ email: 'a@b.com', status: 'pending' }) },
        ],
      });

      const result = await listPendingRequests(mockDb);
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('a@b.com');
    });

    it('filters by status', async () => {
      getDocs.mockResolvedValue({ docs: [] });
      await listPendingRequests(mockDb, { status: 'pending' });
      // Just verify it doesn't throw
    });
  });

  describe('createPendingRequest', () => {
    it('creates a pending request', async () => {
      addDoc.mockResolvedValue({ id: 'req-1' });

      const id = await createPendingRequest(mockDb, {
        email: 'user@org.com',
        uid: 'uid-456',
        orgName: 'My Org',
        reason: 'Need project management',
      });

      expect(id).toBe('req-1');
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'user@org.com',
          status: 'pending',
          orgName: 'My Org',
        }),
      );
    });
  });

  describe('updatePendingRequest', () => {
    it('updates request with reviewedAt timestamp', async () => {
      updateDoc.mockResolvedValue(undefined);

      await updatePendingRequest(mockDb, 'r1', {
        status: 'approved',
        assignedInstance: 'my-org',
        reviewedBy: 'admin-uid',
      });

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'approved',
          assignedInstance: 'my-org',
          reviewedAt: 'mock-timestamp',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Platform Config
  // -----------------------------------------------------------------------

  describe('getPlatformConfig', () => {
    it('returns config by ID', async () => {
      getDoc.mockResolvedValue({
        exists: () => true,
        id: 'maxInstances',
        data: () => ({ value: 100 }),
      });

      const result = await getPlatformConfig(mockDb, 'maxInstances');
      expect(result).toEqual({ id: 'maxInstances', value: 100 });
    });

    it('returns null when not found', async () => {
      getDoc.mockResolvedValue({ exists: () => false });
      const result = await getPlatformConfig(mockDb, 'nope');
      expect(result).toBeNull();
    });
  });

  describe('setPlatformConfig', () => {
    it('sets config with merge', async () => {
      setDoc.mockResolvedValue(undefined);

      await setPlatformConfig(mockDb, 'maxInstances', 100, 'Max allowed instances');

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          configId: 'maxInstances',
          value: 100,
          description: 'Max allowed instances',
        }),
        { merge: true },
      );
    });
  });

  describe('listPlatformConfig', () => {
    it('returns all config entries', async () => {
      getDocs.mockResolvedValue({
        docs: [
          { id: 'c1', data: () => ({ value: 'v1' }) },
          { id: 'c2', data: () => ({ value: 'v2' }) },
        ],
      });

      const result = await listPlatformConfig(mockDb);
      expect(result).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  describe('validateInstanceName', () => {
    it('accepts valid names', () => {
      expect(validateInstanceName('geniova').valid).toBe(true);
      expect(validateInstanceName('my-org').valid).toBe(true);
      expect(validateInstanceName('test123').valid).toBe(true);
    });

    it('rejects empty name', () => {
      expect(validateInstanceName('').valid).toBe(false);
    });

    it('rejects too short', () => {
      expect(validateInstanceName('a').valid).toBe(false);
    });

    it('rejects too long', () => {
      expect(validateInstanceName('a'.repeat(31)).valid).toBe(false);
    });

    it('rejects names starting with number', () => {
      expect(validateInstanceName('123abc').valid).toBe(false);
    });

    it('rejects uppercase', () => {
      expect(validateInstanceName('MyOrg').valid).toBe(false);
    });

    it('rejects reserved names', () => {
      expect(validateInstanceName('default').valid).toBe(false);
      expect(validateInstanceName('platform').valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------

  describe('constants', () => {
    it('INSTANCE_STATUSES has expected values', () => {
      expect(INSTANCE_STATUSES).toContain('active');
      expect(INSTANCE_STATUSES).toContain('suspended');
      expect(INSTANCE_STATUSES).toContain('pending');
    });

    it('REQUEST_STATUSES has expected values', () => {
      expect(REQUEST_STATUSES).toContain('pending');
      expect(REQUEST_STATUSES).toContain('approved');
      expect(REQUEST_STATUSES).toContain('rejected');
    });
  });
});
