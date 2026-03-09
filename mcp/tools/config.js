import { z } from 'zod';
import { resolveCredentialsPath, getFirebaseProjectId } from '../firebase-adapter.js';
import { resolveUserConfigPath, getMcpUser, isMcpUserConfigured } from '../user.js';
import { getLocalVersion } from '../version-check.js';

export const pgConfigSchema = z.object({
  action: z.enum(['view', 'get']).default('view')
    .describe('Action: "view" shows all config, "get" shows a specific key'),
  key: z.string().optional()
    .describe('Config key to get (for action "get"). Keys: instanceDir, instanceName, firebaseProjectId, credentialsPath, userConfigPath, user, version, databaseUrl, env')
});

/**
 * View or query MCP configuration.
 */
export async function pgConfig(params) {
  const { action, key } = params;

  const config = buildFullConfig();

  if (action === 'get' && key) {
    const value = config[key];
    if (value === undefined) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Unknown config key: "${key}"`,
            availableKeys: Object.keys(config)
          }, null, 2)
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ [key]: value }, null, 2)
      }]
    };
  }

  // Default: view all
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(config, null, 2)
    }]
  };
}

function buildFullConfig() {
  const instanceDir = process.env.MCP_INSTANCE_DIR || null;
  const instanceName = instanceDir ? instanceDir.split('/').pop() : null;

  const config = {
    version: getLocalVersion(),
    instanceName,
    instanceDir,
    firebaseProjectId: getFirebaseProjectId(),
    credentialsPath: resolveCredentialsPath(),
    userConfigPath: resolveUserConfigPath(),
    userConfigured: isMcpUserConfigured(),
    databaseUrl: process.env.FIREBASE_DATABASE_URL || '(auto-derived from serviceAccountKey)',
    env: {
      MCP_INSTANCE_DIR: process.env.MCP_INSTANCE_DIR || '(not set)',
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || '(not set)',
      FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || '(not set)',
      NODE_ENV: process.env.NODE_ENV || '(not set)'
    }
  };

  if (isMcpUserConfigured()) {
    const user = getMcpUser();
    config.user = {
      developerId: user.developerId,
      name: user.developerName || user.name,
      email: user.developerEmail || user.email
    };
  }

  return config;
}
