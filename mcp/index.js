import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { basename } from 'path';
import { initFirebase } from './firebase-adapter.js';
import { createMcpServer } from './register-tools.js';
import { checkVersionAtStartup } from './version-check.js';

/**
 * Derive instance name from MCP_INSTANCE_DIR (last path segment).
 * Returns null if no instance directory is configured.
 */
function getInstanceName() {
  const instanceDir = process.env.MCP_INSTANCE_DIR;
  if (!instanceDir) return null;
  return basename(instanceDir);
}

// ── Pre-flight: Initialize Firebase ──
try {
  initFirebase();
} catch (err) {
  process.stderr.write(`\n[MCP] Failed to initialize Firebase: ${err.message}\n`);
  process.stderr.write('[MCP] The MCP server cannot start without a valid Firebase connection.\n');
  process.stderr.write('[MCP] Run pg_doctor (or npm run mcp:test) to diagnose the issue.\n\n');
  process.exit(1);
}

// Check for updates at startup (logs to stderr if update available)
checkVersionAtStartup();

// Derive server name from instance directory
const instanceName = getInstanceName();
const serverName = instanceName ? `planning-game-${instanceName}` : 'planning-gamexp';

// Create and start the MCP server
try {
  const server = createMcpServer(serverName);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (err) {
  process.stderr.write(`\n[MCP] Failed to start MCP server: ${err.message}\n`);
  process.exit(1);
}
