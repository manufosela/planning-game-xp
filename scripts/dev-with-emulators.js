#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { buildDevInnerCommand, buildEmulatorsExecCommand } from './dev-command-builder.js';
import { cleanupEmulatorPorts } from './emulator-port-cleanup.js';
import { createRuntimeFirebaseConfig } from './emulator-port-resolver.js';

async function main() {
  const innerCommand = buildDevInnerCommand({
    envFile: '.env.dev',
    seedFile: 'emulator-data/minimal-rtdb-seed.json'
  });

  try {
    cleanupEmulatorPorts();
  } catch {
    // Best-effort cleanup; continue with startup attempt
  }

  const runtimeConfig = await createRuntimeFirebaseConfig(process.cwd());
  if (runtimeConfig.changed) {
    const pairs = Object.entries(runtimeConfig.ports).map(([name, port]) => `${name}:${port}`).join(', ');
    console.log(`Using dynamic emulator ports (${pairs})`);
  }

  const command = buildEmulatorsExecCommand(innerCommand, {
    configPath: runtimeConfig.configPath || ''
  });

  const child = spawn(command, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true
  });

  const finalize = () => {
    runtimeConfig.cleanup();
  };

  child.on('exit', (code) => {
    finalize();
    process.exit(code || 0);
  });

  child.on('error', (error) => {
    finalize();
    console.error('Error running dev with emulators:', error.message);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('Error preparing emulator runtime:', error.message);
  process.exit(1);
});
