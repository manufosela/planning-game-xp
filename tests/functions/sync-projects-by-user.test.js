/**
 * Tests for syncProjectsByUser helper function
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { syncProjectsByUser } = require('../../functions/handlers/admin-users.js');

describe('syncProjectsByUser', () => {
  let mockDb;
  let mockSet;
  let mockRemove;
  let mockOnce;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSet = vi.fn().mockResolvedValue();
    mockRemove = vi.fn().mockResolvedValue();
    mockOnce = vi.fn();

    mockDb = {
      ref: vi.fn((path) => {
        if (path.startsWith('/data/projectsByUser/')) {
          return { set: mockSet, remove: mockRemove };
        }
        return { once: mockOnce };
      })
    };
  });

  it('should write comma-separated project IDs for active projects', async () => {
    mockOnce.mockResolvedValue({
      val: () => ({
        PLN: { developer: true, stakeholder: false },
        C4D: { developer: false, stakeholder: true }
      })
    });

    await syncProjectsByUser(mockDb, 'test|example!com');

    expect(mockDb.ref).toHaveBeenCalledWith('/users/test|example!com/projects');
    expect(mockDb.ref).toHaveBeenCalledWith('/data/projectsByUser/test|example!com');
    expect(mockSet).toHaveBeenCalledWith('PLN,C4D');
  });

  it('should remove entry when no active projects', async () => {
    mockOnce.mockResolvedValue({
      val: () => ({
        PLN: { developer: false, stakeholder: false }
      })
    });

    await syncProjectsByUser(mockDb, 'test|example!com');

    expect(mockRemove).toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('should remove entry when projects is null', async () => {
    mockOnce.mockResolvedValue({
      val: () => null
    });

    await syncProjectsByUser(mockDb, 'test|example!com');

    expect(mockRemove).toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('should only include projects where developer or stakeholder is true', async () => {
    mockOnce.mockResolvedValue({
      val: () => ({
        PLN: { developer: true, stakeholder: false },
        C4D: { developer: false, stakeholder: false },
        NTR: { developer: false, stakeholder: true }
      })
    });

    await syncProjectsByUser(mockDb, 'user|test!com');

    expect(mockSet).toHaveBeenCalledWith('PLN,NTR');
  });

  it('should handle single project correctly', async () => {
    mockOnce.mockResolvedValue({
      val: () => ({
        PLN: { developer: true, stakeholder: true }
      })
    });

    await syncProjectsByUser(mockDb, 'solo|test!com');

    expect(mockSet).toHaveBeenCalledWith('PLN');
  });
});
