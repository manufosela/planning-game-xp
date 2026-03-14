import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/firestore.js', () => ({
  getProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
}));

import { FirebaseProjectRepository } from '../../../src/infrastructure/firebase/project-repository.js';
import * as firestore from '../../../src/lib/firestore.js';

describe('FirebaseProjectRepository', () => {
  /** @type {FirebaseProjectRepository} */
  let repo;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new FirebaseProjectRepository();
  });

  describe('getProjects', () => {
    it('delegates to firestore.getProjects', async () => {
      const projects = [{ projectId: 'p1', name: 'Project 1' }];
      firestore.getProjects.mockResolvedValue(projects);

      const result = await repo.getProjects();

      expect(firestore.getProjects).toHaveBeenCalledOnce();
      expect(result).toEqual(projects);
    });

    it('propagates errors', async () => {
      firestore.getProjects.mockRejectedValue(new Error('network'));
      await expect(repo.getProjects()).rejects.toThrow('network');
    });
  });

  describe('getProject', () => {
    it('delegates to firestore.getProject with correct id', async () => {
      const project = { projectId: 'p1', name: 'Test' };
      firestore.getProject.mockResolvedValue(project);

      const result = await repo.getProject('p1');

      expect(firestore.getProject).toHaveBeenCalledWith('p1');
      expect(result).toEqual(project);
    });

    it('returns null when project not found', async () => {
      firestore.getProject.mockResolvedValue(null);
      const result = await repo.getProject('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('saveProject', () => {
    it('calls createProject for new projects (no projectId)', async () => {
      firestore.createProject.mockResolvedValue('new-id');
      const project = { name: 'New Project' };

      await repo.saveProject(project);

      expect(firestore.createProject).toHaveBeenCalledWith(project);
      expect(firestore.updateProject).not.toHaveBeenCalled();
    });

    it('calls updateProject for existing projects (with projectId)', async () => {
      firestore.updateProject.mockResolvedValue(undefined);
      const project = { projectId: 'p1', name: 'Updated' };

      await repo.saveProject(project);

      expect(firestore.updateProject).toHaveBeenCalledWith('p1', { name: 'Updated' });
      expect(firestore.createProject).not.toHaveBeenCalled();
    });
  });

  describe('archiveProject', () => {
    it('delegates to firestore.archiveProject', async () => {
      firestore.archiveProject.mockResolvedValue(undefined);

      await repo.archiveProject('p1');

      expect(firestore.archiveProject).toHaveBeenCalledWith('p1');
    });
  });
});
