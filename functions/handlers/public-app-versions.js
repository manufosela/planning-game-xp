/**
 * Public API for reading app version metadata from projects with apps enabled.
 * No authentication required - only exposes safe fields via whitelist.
 */
'use strict';

// Fields allowed in the public API response (whitelist approach)
const PUBLIC_VERSION_FIELDS = ['fileName', 'type', 'status', 'changelog', 'uploadedAt', 'approvedAt'];

/**
 * Project a version to only include public-safe fields + downloadCount.
 * @param {object} version - Full version metadata from RTDB
 * @param {number} downloadCount - Download count from /appDownloads
 * @returns {object} Version with only public fields
 */
function projectPublicVersionFields(version, downloadCount) {
  const projected = {};
  for (const field of PUBLIC_VERSION_FIELDS) {
    if (version[field] !== undefined) {
      projected[field] = version[field];
    }
  }
  projected.downloadCount = downloadCount || 0;
  return projected;
}

/**
 * Handle GET /api/apps/:projectId/versions[/:fileKey]
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {object} deps - { db, logger }
 */
async function handlePublicAppVersions(req, res, { db, logger }) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse path: /{projectId}/versions or /{projectId}/versions/{fileKey}
  const pathParts = req.path.split('/').filter(Boolean);
  let projectId = null;
  let fileKey = null;

  // Expected patterns:
  // [projectId, 'versions']           → list
  // [projectId, 'versions', fileKey]  → detail
  // ['api', 'apps', projectId, 'versions']           → list (via rewrite)
  // ['api', 'apps', projectId, 'versions', fileKey]  → detail (via rewrite)
  const versionsIdx = pathParts.indexOf('versions');
  if (versionsIdx >= 1) {
    projectId = pathParts[versionsIdx - 1];
    if (versionsIdx + 1 < pathParts.length) {
      fileKey = pathParts[versionsIdx + 1];
    }
  }

  if (!projectId) {
    return res.status(400).json({ error: 'Missing projectId. Use: /api/apps/{projectId}/versions' });
  }

  projectId = decodeURIComponent(projectId);
  if (fileKey) fileKey = decodeURIComponent(fileKey);

  try {
    // Load project
    const projectSnap = await db.ref(`/projects/${projectId}`).once('value');
    if (!projectSnap.exists()) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectSnap.val();

    // Access control: only projects with apps enabled
    if (project.allowExecutables !== true) {
      return res.status(403).json({ error: 'This project does not have apps enabled.' });
    }

    if (fileKey) {
      // ── Detail endpoint ──
      const versionSnap = await db.ref(`/appMetadata/${projectId}/${fileKey}`).once('value');
      if (!versionSnap.exists()) {
        return res.status(404).json({ error: 'Version not found' });
      }

      const version = versionSnap.val();
      if (version.status !== 'approved') {
        return res.status(404).json({ error: 'Version not found' });
      }

      // Get download count
      const dlSnap = await db.ref(`/appDownloads/${projectId}/${fileKey}`).once('value');
      const dlData = dlSnap.exists() ? dlSnap.val() : {};

      const projected = projectPublicVersionFields(version, dlData.count || 0);
      projected.fileKey = fileKey;

      logger.info('publicAppVersions: served detail', { projectId, fileKey });
      return res.status(200).json({ projectId, projectName: project.name || projectId, version: projected });
    }

    // ── List endpoint ──
    const metadataSnap = await db.ref(`/appMetadata/${projectId}`).once('value');
    const metadataData = metadataSnap.exists() ? metadataSnap.val() : {};

    // Load all download stats in one read
    const dlSnap = await db.ref(`/appDownloads/${projectId}`).once('value');
    const dlData = dlSnap.exists() ? dlSnap.val() : {};

    const versions = [];
    for (const [key, version] of Object.entries(metadataData)) {
      if (!version || version.status !== 'approved') continue;
      const downloadCount = dlData[key]?.count || 0;
      const projected = projectPublicVersionFields(version, downloadCount);
      projected.fileKey = key;
      versions.push(projected);
    }

    logger.info('publicAppVersions: served list', { projectId, count: versions.length });
    return res.status(200).json({ projectId, projectName: project.name || projectId, versions });

  } catch (error) {
    logger.error('publicAppVersions: error', { projectId, error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  handlePublicAppVersions,
  projectPublicVersionFields,
  PUBLIC_VERSION_FIELDS
};
