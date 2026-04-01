import { describe, it, expect, vi } from 'vitest';

const { handlePublicAppVersions, projectPublicVersionFields, PUBLIC_VERSION_FIELDS } = await import('../../functions/handlers/public-app-versions.js');

function createMockDb(data = {}) {
  return {
    ref: vi.fn((path) => ({
      once: vi.fn(async () => {
        const parts = path.split('/').filter(Boolean);
        let current = data;
        for (const part of parts) {
          current = current?.[part];
        }
        return {
          exists: () => current !== undefined && current !== null,
          val: () => current || null
        };
      })
    }))
  };
}

function createMockReq({ method = 'GET', path = '', query = {} } = {}) {
  return { method, path, query };
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status: vi.fn((code) => { res.statusCode = code; return res; }),
    json: vi.fn((body) => { res.body = body; return res; })
  };
  return res;
}

const mockLogger = { info: vi.fn(), error: vi.fn() };

describe('publicAppVersions', () => {
  describe('projectPublicVersionFields', () => {
    it('should only include whitelisted fields', () => {
      const version = {
        fileName: 'app-v1.0.0.exe',
        type: 'release',
        status: 'approved',
        changelog: 'Initial release',
        uploadedAt: '2026-03-01T10:00:00Z',
        approvedAt: '2026-03-01T12:00:00Z',
        // Sensitive fields that should NOT appear
        uploadedBy: 'admin@secret.com',
        approvedBy: 'boss@secret.com',
        deprecatedBy: 'someone@secret.com',
        deprecatedAt: '2026-04-01T00:00:00Z',
        downloadURL: 'https://storage.googleapis.com/secret',
        storagePath: 'apps/MyProject/app-v1.0.0.exe'
      };
      const result = projectPublicVersionFields(version, 42);

      expect(result.fileName).toBe('app-v1.0.0.exe');
      expect(result.type).toBe('release');
      expect(result.status).toBe('approved');
      expect(result.changelog).toBe('Initial release');
      expect(result.downloadCount).toBe(42);
      // Sensitive fields excluded
      expect(result.uploadedBy).toBeUndefined();
      expect(result.approvedBy).toBeUndefined();
      expect(result.deprecatedBy).toBeUndefined();
      expect(result.deprecatedAt).toBeUndefined();
      expect(result.downloadURL).toBeUndefined();
      expect(result.storagePath).toBeUndefined();
    });

    it('should default downloadCount to 0', () => {
      const result = projectPublicVersionFields({ fileName: 'test.exe' }, undefined);
      expect(result.downloadCount).toBe(0);
    });
  });

  describe('PUBLIC_VERSION_FIELDS', () => {
    it('should contain exactly the expected fields', () => {
      expect(PUBLIC_VERSION_FIELDS).toEqual(['fileName', 'type', 'status', 'changelog', 'uploadedAt', 'approvedAt']);
    });

    it('should NOT contain sensitive fields', () => {
      const sensitive = ['uploadedBy', 'approvedBy', 'deprecatedBy', 'deprecatedAt', 'downloadURL', 'storagePath'];
      for (const field of sensitive) {
        expect(PUBLIC_VERSION_FIELDS).not.toContain(field);
      }
    });
  });

  describe('handlePublicAppVersions', () => {
    it('should return 405 for non-GET methods', async () => {
      const req = createMockReq({ method: 'POST' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db: createMockDb(), logger: mockLogger });
      expect(res.statusCode).toBe(405);
    });

    it('should return 400 for missing projectId', async () => {
      const req = createMockReq({ path: '/' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db: createMockDb(), logger: mockLogger });
      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for non-existent project', async () => {
      const req = createMockReq({ path: '/NonExistent/versions' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db: createMockDb({}), logger: mockLogger });
      expect(res.statusCode).toBe(404);
    });

    it('should return 403 when allowExecutables is not true', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'My Project', allowExecutables: false, publicAppApi: true } }
      });
      const req = createMockReq({ path: '/MyProject/versions' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(403);
    });

    it('should return 403 when allowExecutables is missing', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'My Project' } }
      });
      const req = createMockReq({ path: '/MyProject/versions' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(403);
    });

    it('should return 403 when publicAppApi is not true', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'My Project', allowExecutables: true, publicAppApi: false } }
      });
      const req = createMockReq({ path: '/MyProject/versions' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(403);
    });

    it('should return empty versions array when no metadata exists', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'My Project', allowExecutables: true, publicAppApi: true } }
      });
      const req = createMockReq({ path: '/MyProject/versions' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(200);
      expect(res.body.versions).toEqual([]);
    });

    it('should return only approved versions', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'Test App', allowExecutables: true, publicAppApi: true } },
        appMetadata: {
          MyProject: {
            '-key1': { fileName: 'app-v1.0.exe', type: 'release', status: 'approved', changelog: 'v1', uploadedAt: '2026-01-01' },
            '-key2': { fileName: 'app-v2.0.exe', type: 'beta', status: 'pending', changelog: 'v2', uploadedAt: '2026-02-01' },
            '-key3': { fileName: 'app-v3.0.exe', type: 'release', status: 'deprecated', changelog: 'v3', uploadedAt: '2026-03-01' },
            '-key4': { fileName: 'app-v4.0.exe', type: 'release', status: 'approved', changelog: 'v4', uploadedAt: '2026-04-01' }
          }
        },
        appDownloads: {
          MyProject: {
            '-key1': { count: 100 },
            '-key4': { count: 25 }
          }
        }
      });
      const req = createMockReq({ path: '/MyProject/versions' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });

      expect(res.statusCode).toBe(200);
      expect(res.body.projectName).toBe('Test App');
      expect(res.body.versions).toHaveLength(2);
      expect(res.body.versions[0].fileName).toBe('app-v1.0.exe');
      expect(res.body.versions[0].downloadCount).toBe(100);
      expect(res.body.versions[0].fileKey).toBe('-key1');
      expect(res.body.versions[1].fileName).toBe('app-v4.0.exe');
      expect(res.body.versions[1].downloadCount).toBe(25);
      // No sensitive fields
      expect(res.body.versions[0].uploadedBy).toBeUndefined();
    });

    it('should return version detail for approved version', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'Test App', allowExecutables: true, publicAppApi: true } },
        appMetadata: {
          MyProject: {
            '-key1': { fileName: 'app-v1.0.exe', type: 'release', status: 'approved', changelog: 'First release', uploadedAt: '2026-01-01', uploadedBy: 'secret@email.com' }
          }
        },
        appDownloads: {
          MyProject: { '-key1': { count: 55 } }
        }
      });
      const req = createMockReq({ path: '/MyProject/versions/-key1' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });

      expect(res.statusCode).toBe(200);
      expect(res.body.version.fileName).toBe('app-v1.0.exe');
      expect(res.body.version.downloadCount).toBe(55);
      expect(res.body.version.fileKey).toBe('-key1');
      expect(res.body.version.uploadedBy).toBeUndefined();
    });

    it('should return 404 for non-approved version detail', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'Test App', allowExecutables: true, publicAppApi: true } },
        appMetadata: {
          MyProject: {
            '-key1': { fileName: 'app-v1.0.exe', type: 'beta', status: 'pending' }
          }
        }
      });
      const req = createMockReq({ path: '/MyProject/versions/-key1' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for non-existent fileKey', async () => {
      const db = createMockDb({
        projects: { MyProject: { name: 'Test App', allowExecutables: true, publicAppApi: true } },
        appMetadata: { MyProject: {} }
      });
      const req = createMockReq({ path: '/MyProject/versions/-nonexistent' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(404);
    });

    it('should handle URL-encoded projectId', async () => {
      const db = createMockDb({
        projects: { 'My Project': { name: 'My Project', allowExecutables: true, publicAppApi: true } },
        appMetadata: { 'My Project': {} }
      });
      const req = createMockReq({ path: '/My%20Project/versions' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(200);
      expect(res.body.projectId).toBe('My Project');
    });

    it('should return 500 on internal error', async () => {
      const db = {
        ref: vi.fn(() => ({
          once: vi.fn(async () => { throw new Error('DB connection lost'); })
        }))
      };
      const req = createMockReq({ path: '/MyProject/versions' });
      const res = createMockRes();
      await handlePublicAppVersions(req, res, { db, logger: mockLogger });
      expect(res.statusCode).toBe(500);
    });
  });
});
