import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RtdbAppDistributionRepository } from '../../shared/dal/rtdb/rtdb-app-distribution-repository.js';

describe('RtdbAppDistributionRepository', () => {
  let repo;
  let mockBase;

  beforeEach(() => {
    mockBase = {
      read: vi.fn(),
      write: vi.fn(),
      push: vi.fn(),
      subscribe: vi.fn(),
      transaction: vi.fn(),
    };
    repo = new RtdbAppDistributionRepository(mockBase);
  });

  describe('download stats', () => {
    it('getDownloadStats reads correct path', async () => {
      mockBase.read.mockResolvedValue({ file1: { count: 5 } });
      const result = await repo.getDownloadStats('ProjectA');
      expect(mockBase.read).toHaveBeenCalledWith('/appDownloads/ProjectA');
      expect(result).toEqual({ file1: { count: 5 } });
    });

    it('trackDownload calls transaction on correct path', async () => {
      const updateFn = vi.fn();
      await repo.trackDownload('ProjectA', 'file1', updateFn);
      expect(mockBase.transaction).toHaveBeenCalledWith('/appDownloads/ProjectA/file1', updateFn);
    });

    it('subscribeToDownloadStats subscribes to correct path', () => {
      const cb = vi.fn();
      repo.subscribeToDownloadStats('ProjectA', cb);
      expect(mockBase.subscribe).toHaveBeenCalledWith('/appDownloads/ProjectA', cb);
    });
  });

  describe('download events', () => {
    it('getDownloadEvents reads correct path', async () => {
      mockBase.read.mockResolvedValue({});
      await repo.getDownloadEvents('ProjectA');
      expect(mockBase.read).toHaveBeenCalledWith('/appDownloadEvents/ProjectA');
    });

    it('pushDownloadEvent pushes to correct path', async () => {
      const eventData = { downloadedAt: '2026-01-01' };
      await repo.pushDownloadEvent('ProjectA', 'file1', eventData);
      expect(mockBase.push).toHaveBeenCalledWith('/appDownloadEvents/ProjectA/file1', eventData);
    });

    it('subscribeToDownloadEvents subscribes to correct path', () => {
      const cb = vi.fn();
      repo.subscribeToDownloadEvents('ProjectA', cb);
      expect(mockBase.subscribe).toHaveBeenCalledWith('/appDownloadEvents/ProjectA', cb);
    });
  });

  describe('app metadata', () => {
    it('getAppMetadata reads correct path', async () => {
      mockBase.read.mockResolvedValue({ f1: {} });
      await repo.getAppMetadata('ProjectA');
      expect(mockBase.read).toHaveBeenCalledWith('/appMetadata/ProjectA');
    });

    it('getAppMetadataEntry reads correct path', async () => {
      mockBase.read.mockResolvedValue({ type: 'release' });
      await repo.getAppMetadataEntry('ProjectA', 'file1');
      expect(mockBase.read).toHaveBeenCalledWith('/appMetadata/ProjectA/file1');
    });

    it('setAppMetadata writes correct path', async () => {
      const data = { type: 'beta' };
      await repo.setAppMetadata('ProjectA', 'file1', data);
      expect(mockBase.write).toHaveBeenCalledWith('/appMetadata/ProjectA/file1', data);
    });

    it('subscribeToAppMetadata subscribes to correct path', () => {
      const cb = vi.fn();
      repo.subscribeToAppMetadata('ProjectA', cb);
      expect(mockBase.subscribe).toHaveBeenCalledWith('/appMetadata/ProjectA', cb);
    });
  });

  describe('user permissions', () => {
    it('getUserAppPermission reads correct path', async () => {
      mockBase.read.mockResolvedValue(true);
      const result = await repo.getUserAppPermission('user|email', 'ProjectA', 'upload');
      expect(mockBase.read).toHaveBeenCalledWith('/users/user|email/projects/ProjectA/appPermissions/upload');
      expect(result).toBe(true);
    });

    it('getAppUploader reads correct path', async () => {
      mockBase.read.mockResolvedValue(true);
      await repo.getAppUploader('ProjectA', 'user|email');
      expect(mockBase.read).toHaveBeenCalledWith('/data/appUploaders/ProjectA/user|email');
    });

    it('getAppAdmin reads correct path', async () => {
      await repo.getAppAdmin('user|email');
      expect(mockBase.read).toHaveBeenCalledWith('/data/appAdmins/user|email');
    });

    it('setAppAdmin writes correct path', async () => {
      await repo.setAppAdmin('user|email', true);
      expect(mockBase.write).toHaveBeenCalledWith('/data/appAdmins/user|email', true);
    });

    it('getBetaUser reads correct path', async () => {
      await repo.getBetaUser('ProjectA', 'user|email');
      expect(mockBase.read).toHaveBeenCalledWith('/data/betaUsers/ProjectA/user|email');
    });
  });

  describe('public sharing', () => {
    it('createPublicShare writes correct path', async () => {
      const data = { shareId: 'abc', projectId: 'ProjectA' };
      await repo.createPublicShare('abc', data);
      expect(mockBase.write).toHaveBeenCalledWith('/publicAppShares/abc', data);
    });
  });
});
