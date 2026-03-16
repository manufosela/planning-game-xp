import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserInstance, assignClaims, removeClaims } from '../../src/callable/approve-user.js';

const mockGetUser = vi.fn();
const mockSetClaims = vi.fn();

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    getUser: mockGetUser,
    setCustomUserClaims: mockSetClaims,
  })),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((opts, handler) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

describe('approve-user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserInstance', () => {
    it('returns instance name from claims', async () => {
      mockGetUser.mockResolvedValue({ customClaims: { instance: 'geniova' } });
      const result = await getUserInstance('uid-1');
      expect(result).toBe('geniova');
    });

    it('returns null when no instance claim', async () => {
      mockGetUser.mockResolvedValue({ customClaims: {} });
      const result = await getUserInstance('uid-2');
      expect(result).toBeNull();
    });

    it('returns null when no claims at all', async () => {
      mockGetUser.mockResolvedValue({});
      const result = await getUserInstance('uid-3');
      expect(result).toBeNull();
    });
  });

  describe('assignClaims', () => {
    it('assigns instance and role claims', async () => {
      mockGetUser.mockResolvedValue({ customClaims: {} });
      mockSetClaims.mockResolvedValue(undefined);

      await assignClaims('uid-1', 'geniova', 'developer');

      expect(mockSetClaims).toHaveBeenCalledWith('uid-1', {
        instance: 'geniova',
        instanceRole: 'developer',
      });
    });

    it('preserves existing non-instance claims', async () => {
      mockGetUser.mockResolvedValue({ customClaims: { platformAdmin: true } });
      mockSetClaims.mockResolvedValue(undefined);

      await assignClaims('uid-1', 'demo', 'admin');

      expect(mockSetClaims).toHaveBeenCalledWith('uid-1', {
        platformAdmin: true,
        instance: 'demo',
        instanceRole: 'admin',
      });
    });

    it('throws when user already in different instance', async () => {
      mockGetUser.mockResolvedValue({ customClaims: { instance: 'geniova' } });

      await expect(
        assignClaims('uid-1', 'other-org', 'developer'),
      ).rejects.toThrow('already belongs to instance');
    });

    it('allows reassignment with force=true', async () => {
      mockGetUser.mockResolvedValue({ customClaims: { instance: 'geniova' } });
      mockSetClaims.mockResolvedValue(undefined);

      await assignClaims('uid-1', 'other-org', 'developer', true);

      expect(mockSetClaims).toHaveBeenCalledWith('uid-1', {
        instance: 'other-org',
        instanceRole: 'developer',
      });
    });

    it('allows same instance reassignment without force', async () => {
      mockGetUser.mockResolvedValue({ customClaims: { instance: 'geniova' } });
      mockSetClaims.mockResolvedValue(undefined);

      await assignClaims('uid-1', 'geniova', 'admin');

      expect(mockSetClaims).toHaveBeenCalled();
    });
  });

  describe('removeClaims', () => {
    it('removes instance claims, preserves others', async () => {
      mockGetUser.mockResolvedValue({
        customClaims: { instance: 'geniova', instanceRole: 'admin', platformAdmin: true },
      });
      mockSetClaims.mockResolvedValue(undefined);

      await removeClaims('uid-1');

      expect(mockSetClaims).toHaveBeenCalledWith('uid-1', { platformAdmin: true });
    });
  });
});
