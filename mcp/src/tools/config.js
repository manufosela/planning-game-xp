/**
 * MCP tools for server configuration and diagnostics.
 * @module mcp/tools/config
 */

import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveCredentialsPath, getFirebaseProjectId, getFirestore } from '../firebase-adapter.js';
import { resolveUserConfigPath, isMcpUserConfigured, getMcpUser } from '../user.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_DIR = resolve(__dirname, '..');

/**
 * Read the MCP package version.
 * @returns {string}
 */
function getLocalVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(MCP_DIR, '..', 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// pg_config
// ---------------------------------------------------------------------------

export const pgConfigSchema = z.object({
  action: z.enum(['view', 'get']).default('view').describe('Action: "view" all config, "get" specific key'),
  key: z.string().optional().describe('Config key (for action "get")'),
});

export async function pgConfig({ action, key }) {
  const config = {
    version: getLocalVersion(),
    firebaseProjectId: getFirebaseProjectId(),
    credentialsPath: resolveCredentialsPath(),
    userConfigPath: resolveUserConfigPath(),
    userConfigured: isMcpUserConfigured(),
    backend: 'Firestore (V2)',
    env: {
      MCP_INSTANCE_DIR: process.env.MCP_INSTANCE_DIR || '(not set)',
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || '(not set)',
      NODE_ENV: process.env.NODE_ENV || '(not set)',
    },
  };

  if (isMcpUserConfigured()) {
    const user = getMcpUser();
    config.user = {
      developerId: user.developerId,
      name: user.name,
      email: user.email,
    };
  }

  if (action === 'get' && key) {
    const value = config[key];
    if (value === undefined) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Unknown key: "${key}"`, availableKeys: Object.keys(config) }, null, 2),
        }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ [key]: value }, null, 2) }] };
  }

  return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
}

// ---------------------------------------------------------------------------
// pg_doctor
// ---------------------------------------------------------------------------

export const pgDoctorSchema = z.object({});

export async function pgDoctor() {
  const checks = [];

  // 1. Node.js version
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  checks.push({
    name: 'Node.js version',
    status: major >= 20 ? 'pass' : major >= 18 ? 'warn' : 'fail',
    value: version,
  });

  // 2. Service account key
  const credPath = resolveCredentialsPath();
  if (!existsSync(credPath)) {
    checks.push({ name: 'serviceAccountKey.json', status: 'fail', path: credPath, message: 'File not found.' });
  } else {
    try {
      const content = JSON.parse(readFileSync(credPath, 'utf8'));
      checks.push({
        name: 'serviceAccountKey.json',
        status: content.project_id ? 'pass' : 'fail',
        path: credPath,
        projectId: content.project_id,
      });
    } catch (err) {
      checks.push({ name: 'serviceAccountKey.json', status: 'fail', path: credPath, message: err.message });
    }
  }

  // 3. Firestore connectivity
  try {
    const db = getFirestore();
    const snap = await db.collection('projects').limit(1).get();
    checks.push({
      name: 'Firestore connectivity',
      status: 'pass',
      projectId: getFirebaseProjectId(),
      message: snap.empty ? 'Connected but no projects found' : 'Connected successfully',
    });
  } catch (err) {
    checks.push({
      name: 'Firestore connectivity',
      status: 'fail',
      message: `Cannot connect: ${err.message}`,
    });
  }

  // 4. Dependencies
  const nodeModules = resolve(MCP_DIR, '..', 'node_modules');
  const required = ['@modelcontextprotocol/sdk', 'firebase-admin', 'zod'];
  const missing = required.filter((p) => !existsSync(resolve(nodeModules, ...p.split('/'))));
  checks.push({
    name: 'MCP dependencies',
    status: missing.length === 0 ? 'pass' : 'fail',
    missing: missing.length > 0 ? missing : undefined,
  });

  // 5. User config
  checks.push({
    name: 'MCP user config',
    status: isMcpUserConfigured() ? 'pass' : 'warn',
    path: resolveUserConfigPath(),
    user: isMcpUserConfigured() ? getMcpUser() : undefined,
    message: isMcpUserConfigured() ? undefined : 'Not configured. Run setup_mcp_user.',
  });

  // 6. Git
  try {
    const gitVersion = execSync('git --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    checks.push({ name: 'Git', status: 'pass', value: gitVersion });
  } catch {
    checks.push({ name: 'Git', status: 'warn', message: 'Git not available.' });
  }

  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const overall = failed > 0 ? 'UNHEALTHY' : warned > 0 ? 'DEGRADED' : 'HEALTHY';

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: overall,
        summary: `${passed} passed, ${warned} warnings, ${failed} failed`,
        checks,
      }, null, 2),
    }],
  };
}

// ---------------------------------------------------------------------------
// get_mcp_status
// ---------------------------------------------------------------------------

export const getMcpStatusSchema = z.object({});

export async function getMcpStatus() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        version: getLocalVersion(),
        firebaseProjectId: getFirebaseProjectId(),
        backend: 'Firestore (V2)',
        userConfigured: isMcpUserConfigured(),
      }, null, 2),
    }],
  };
}

// ---------------------------------------------------------------------------
// update_mcp
// ---------------------------------------------------------------------------

export const updateMcpSchema = z.object({});

export async function updateMcp() {
  try {
    const result = execSync('git pull', { encoding: 'utf-8', timeout: 30000, cwd: resolve(MCP_DIR, '..', '..') });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: 'MCP updated. Restart the session to use the new version.',
          output: result.trim(),
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Update failed: ${err.message}` }, null, 2),
      }],
    };
  }
}
