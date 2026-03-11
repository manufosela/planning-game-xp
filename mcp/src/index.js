#!/usr/bin/env node

/**
 * Planning Game MCP Server V2 — Entry point.
 *
 * Initializes Firebase Admin SDK with Firestore backend,
 * creates the MCP server, and connects via stdio transport.
 *
 * @module mcp/index
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initFirebase } from './firebase-adapter.js';
import { createMcpServer } from './register-tools.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Read the local package version.
 * @returns {string}
 */
function getLocalVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── CLI flags ──
const arg = process.argv[2];

if (arg === '--version' || arg === '-v') {
  console.log(getLocalVersion());
  process.exit(0);
}

if (arg === '--help' || arg === '-h') {
  console.log(`planning-game-mcp v${getLocalVersion()} (V2 — Firestore backend)`);
  console.log('');
  console.log('Usage: planning-game-mcp [command] [options]');
  console.log('');
  console.log('Commands:');
  console.log('  init             Interactive setup wizard (generates pg.config.yml)');
  console.log('  (no command)     Start MCP server');
  console.log('');
  console.log('Options:');
  console.log('  -v, --version    Show version');
  console.log('  -h, --help       Show this help');
  console.log('');
  console.log('Environment variables:');
  console.log('  GOOGLE_APPLICATION_CREDENTIALS  Path to serviceAccountKey.json');
  console.log('  MCP_INSTANCE_DIR                Instance directory (multi-instance)');
  process.exit(0);
}

if (arg === 'init') {
  const { runInit } = await import('./commands/init.js');
  await runInit();
  process.exit(0);
}

/**
 * Derive instance name from MCP_INSTANCE_DIR.
 * @returns {string | null}
 */
function getInstanceName() {
  const instanceDir = process.env.MCP_INSTANCE_DIR;
  if (!instanceDir) return null;
  return basename(instanceDir);
}

// ── Initialize Firebase ──
try {
  initFirebase();
} catch (err) {
  process.stderr.write(`\n[MCP] Failed to initialize Firebase: ${err.message}\n`);
  process.stderr.write('[MCP] Run pg_doctor to diagnose the issue.\n\n');
  process.exit(1);
}

// ── Create and start the MCP server ──
const instanceName = getInstanceName();
const serverName = instanceName ? `planning-game-${instanceName}` : 'planning-game-v2';

try {
  const server = createMcpServer(serverName);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (err) {
  process.stderr.write(`\n[MCP] Failed to start MCP server: ${err.message}\n`);
  process.exit(1);
}
