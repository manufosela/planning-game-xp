/**
 * MCP user configuration management.
 *
 * Handles reading/writing the local mcp.user.json file that stores
 * the current user's identity for auto-assignment and tracking.
 *
 * @module mcp/user
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Resolve the path to mcp.user.json.
 * @returns {string}
 */
export function resolveUserConfigPath() {
  const instanceDir = process.env.MCP_INSTANCE_DIR;
  if (instanceDir) {
    return resolve(instanceDir, 'mcp.user.json');
  }
  return resolve(process.cwd(), 'mcp.user.json');
}

/** @type {{ developerId?: string; name?: string; email?: string } | null} */
let mcpUser = null;
let loaded = false;

/**
 * Load user config from mcp.user.json.
 */
function loadUser() {
  if (loaded) return;
  loaded = true;

  try {
    const raw = readFileSync(resolveUserConfigPath(), 'utf8');
    mcpUser = JSON.parse(raw);
  } catch {
    mcpUser = null;
  }
}

/**
 * Check if the MCP user is configured.
 * @returns {boolean}
 */
export function isMcpUserConfigured() {
  loadUser();
  return mcpUser !== null && !!mcpUser.developerId;
}

/**
 * Get the current MCP user config.
 * @returns {{ developerId?: string; name?: string; email?: string } | null}
 */
export function getMcpUser() {
  loadUser();
  return mcpUser;
}

/**
 * Get the user ID for createdBy/updatedBy fields.
 * @returns {string}
 */
export function getMcpUserId() {
  loadUser();
  if (mcpUser && mcpUser.email) return mcpUser.email;
  return 'mcp-v2';
}

/**
 * Write user config to mcp.user.json.
 * @param {{ developerId: string; name: string; email: string }} userData
 */
export function writeMcpUser(userData) {
  writeFileSync(resolveUserConfigPath(), JSON.stringify(userData, null, 2) + '\n', 'utf8');
  mcpUser = userData;
  loaded = true;
}
