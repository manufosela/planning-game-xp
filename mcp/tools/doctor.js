import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { resolveCredentialsPath, getDatabase, getFirebaseProjectId } from '../firebase-adapter.js';
import { resolveUserConfigPath, isMcpUserConfigured, getMcpUser } from '../user.js';
import { getLocalVersion } from '../version-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..', '..');
const MCP_DIR = resolve(__dirname, '..');

export const pgDoctorSchema = z.object({});

/**
 * Run all diagnostic checks and return a structured report.
 */
export async function pgDoctor() {
  const checks = [];

  // 1. Node.js version
  checks.push(checkNodeVersion());

  // 2. serviceAccountKey.json
  checks.push(checkServiceAccountKey());

  // 3. Firebase connectivity
  checks.push(await checkFirebaseConnectivity());

  // 4. MCP dependencies
  checks.push(checkDependencies());

  // 5. MCP user configuration
  checks.push(checkUserConfig());

  // 6. MCP version
  checks.push(checkMcpVersion());

  // 7. Instance configuration
  checks.push(checkInstanceConfig());

  // 8. Git status
  checks.push(checkGitAvailable());

  const passed = checks.filter(c => c.status === 'pass').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  const overall = failed > 0 ? 'UNHEALTHY' : warned > 0 ? 'DEGRADED' : 'HEALTHY';

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: overall,
        summary: `${passed} passed, ${warned} warnings, ${failed} failed`,
        checks,
        suggestion: failed > 0
          ? 'Fix the FAIL items above before using the MCP server.'
          : warned > 0
            ? 'The MCP server is functional but some items need attention.'
            : 'All checks passed. The MCP server is fully operational.'
      }, null, 2)
    }]
  };
}

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);

  if (major < 18) {
    return {
      name: 'Node.js version',
      status: 'fail',
      value: version,
      message: `Node.js ${version} is too old. Minimum required: v18.0.0`
    };
  }

  if (major < 20) {
    return {
      name: 'Node.js version',
      status: 'warn',
      value: version,
      message: `Node.js ${version} works but v20+ is recommended`
    };
  }

  return {
    name: 'Node.js version',
    status: 'pass',
    value: version
  };
}

function checkServiceAccountKey() {
  const credentialsPath = resolveCredentialsPath();

  if (!existsSync(credentialsPath)) {
    return {
      name: 'serviceAccountKey.json',
      status: 'fail',
      path: credentialsPath,
      message: 'File not found. Go to Firebase Console > Project Settings > Service Accounts > Generate new private key, and save it at the expected path.'
    };
  }

  try {
    const content = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    if (!content.project_id) {
      return {
        name: 'serviceAccountKey.json',
        status: 'fail',
        path: credentialsPath,
        message: 'File exists but is missing the "project_id" field. Re-download from Firebase Console.'
      };
    }

    return {
      name: 'serviceAccountKey.json',
      status: 'pass',
      path: credentialsPath,
      projectId: content.project_id
    };
  } catch (err) {
    return {
      name: 'serviceAccountKey.json',
      status: 'fail',
      path: credentialsPath,
      message: `File exists but is not valid JSON: ${err.message}`
    };
  }
}

async function checkFirebaseConnectivity() {
  try {
    const db = getDatabase();
    const snapshot = await db.ref('/projects').once('value');
    const data = snapshot.val();

    if (!data || typeof data !== 'object') {
      return {
        name: 'Firebase connectivity',
        status: 'warn',
        projectId: getFirebaseProjectId(),
        message: 'Connected to Firebase but no projects found in /projects'
      };
    }

    const projectCount = Object.keys(data).length;
    return {
      name: 'Firebase connectivity',
      status: 'pass',
      projectId: getFirebaseProjectId(),
      projects: projectCount
    };
  } catch (err) {
    return {
      name: 'Firebase connectivity',
      status: 'fail',
      projectId: getFirebaseProjectId(),
      message: `Cannot connect to Firebase RTDB: ${err.message}`
    };
  }
}

function checkDependencies() {
  const nodeModulesPath = resolve(MCP_DIR, 'node_modules');

  if (!existsSync(nodeModulesPath)) {
    return {
      name: 'MCP dependencies',
      status: 'fail',
      message: 'node_modules not found. Run: cd mcp && npm install'
    };
  }

  const requiredPackages = [
    '@modelcontextprotocol/sdk',
    'firebase-admin',
    'zod'
  ];

  const missing = requiredPackages.filter(pkg =>
    !existsSync(resolve(nodeModulesPath, ...pkg.split('/')))
  );

  if (missing.length > 0) {
    return {
      name: 'MCP dependencies',
      status: 'fail',
      missing,
      message: `Missing packages: ${missing.join(', ')}. Run: cd mcp && npm install`
    };
  }

  return {
    name: 'MCP dependencies',
    status: 'pass',
    message: 'All required packages installed'
  };
}

function checkUserConfig() {
  const userConfigPath = resolveUserConfigPath();

  if (!isMcpUserConfigured()) {
    return {
      name: 'MCP user config',
      status: 'warn',
      path: userConfigPath,
      message: 'User not configured. Run setup_mcp_user to set your identity for auto-assignment and tracking.'
    };
  }

  const user = getMcpUser();
  return {
    name: 'MCP user config',
    status: 'pass',
    path: userConfigPath,
    user: {
      developerId: user.developerId,
      name: user.developerName || user.name,
      email: user.developerEmail || user.email
    }
  };
}

function checkMcpVersion() {
  const version = getLocalVersion();

  if (version === 'unknown') {
    return {
      name: 'MCP version',
      status: 'warn',
      message: 'Could not determine MCP version from package.json'
    };
  }

  return {
    name: 'MCP version',
    status: 'pass',
    value: version
  };
}

function checkInstanceConfig() {
  const instanceDir = process.env.MCP_INSTANCE_DIR;

  if (!instanceDir) {
    return {
      name: 'Instance configuration',
      status: 'warn',
      message: 'MCP_INSTANCE_DIR not set. Using default paths. Multi-instance setup requires this env var.'
    };
  }

  if (!existsSync(instanceDir)) {
    return {
      name: 'Instance configuration',
      status: 'fail',
      instanceDir,
      message: `Instance directory does not exist: ${instanceDir}`
    };
  }

  const instanceName = instanceDir.split('/').pop();
  return {
    name: 'Instance configuration',
    status: 'pass',
    instanceName,
    instanceDir
  };
}

function checkGitAvailable() {
  try {
    const version = execSync('git --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    return {
      name: 'Git',
      status: 'pass',
      value: version
    };
  } catch {
    return {
      name: 'Git',
      status: 'warn',
      message: 'Git not available. Version checking and update_mcp will not work.'
    };
  }
}
