#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { buildDevInnerCommand, buildEmulatorsExecCommand } from './dev-command-builder.js';

const innerCommand = buildDevInnerCommand({
  envFile: '.env.dev',
  seedFile: 'emulator-data/minimal-rtdb-seed.json'
});
const command = buildEmulatorsExecCommand(innerCommand);

const child = spawn(command, {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Error running dev with emulators:', error.message);
  process.exit(1);
});

