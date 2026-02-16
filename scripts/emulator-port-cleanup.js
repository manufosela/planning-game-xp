import { execSync } from 'node:child_process';

export function getEmulatorCleanupCommands() {
  return [
    'pkill -f "firebase.*emulators" 2>/dev/null || true',
    'pkill -f "java.*firestore" 2>/dev/null || true',
    'pkill -f "java.*database" 2>/dev/null || true',
  ];
}

export function cleanupEmulatorPorts({
  run = execSync,
} = {}) {
  const commands = getEmulatorCleanupCommands();
  for (const command of commands) {
    run(command, { stdio: 'pipe', shell: '/bin/bash' });
  }
}
