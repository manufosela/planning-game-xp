import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const EMULATOR_TARGETS = ['firestore', 'database', 'storage', 'ui'];

function toAbsoluteRulePath(rulePath, rootDir) {
  const value = String(rulePath || '').trim();
  if (!value) return value;
  if (path.isAbsolute(value)) return value;
  return path.join(rootDir, value);
}

export function getPreferredEmulatorPorts(firebaseConfig) {
  const emulators = firebaseConfig?.emulators || {};
  const preferred = {};
  for (const key of EMULATOR_TARGETS) {
    const port = Number(emulators?.[key]?.port);
    if (Number.isInteger(port) && port > 0) {
      preferred[key] = port;
    }
  }
  return preferred;
}

export function applyEmulatorPorts(firebaseConfig, portsByEmulator) {
  const next = JSON.parse(JSON.stringify(firebaseConfig || {}));
  next.emulators = next.emulators || {};
  for (const [emulator, port] of Object.entries(portsByEmulator || {})) {
    next.emulators[emulator] = next.emulators[emulator] || {};
    next.emulators[emulator].port = port;
  }
  return next;
}

export function normalizeConfigForEmulators(firebaseConfig) {
  const next = JSON.parse(JSON.stringify(firebaseConfig || {}));
  if (Array.isArray(next.database)) {
    const emulatorRulesFile = 'database.emulator.rules';
    const fallbackRules = next.database.find((entry) => entry?.rules)?.rules || 'database.rules.json';
    next.database = { rules: emulatorRulesFile || fallbackRules };
  }
  return next;
}

export function normalizeRulesPathsForRuntime(firebaseConfig, rootDir) {
  const next = JSON.parse(JSON.stringify(firebaseConfig || {}));
  if (!rootDir) return next;

  if (next.firestore?.rules) {
    next.firestore.rules = toAbsoluteRulePath(next.firestore.rules, rootDir);
  }
  if (next.storage?.rules) {
    next.storage.rules = toAbsoluteRulePath(next.storage.rules, rootDir);
  }
  if (next.database?.rules) {
    next.database.rules = toAbsoluteRulePath(next.database.rules, rootDir);
  }

  if (next.emulators?.firestore?.rules) {
    next.emulators.firestore.rules = toAbsoluteRulePath(next.emulators.firestore.rules, rootDir);
  }
  if (next.emulators?.database?.rules) {
    next.emulators.database.rules = toAbsoluteRulePath(next.emulators.database.rules, rootDir);
  }
  if (next.emulators?.storage?.rules) {
    next.emulators.storage.rules = toAbsoluteRulePath(next.emulators.storage.rules, rootDir);
  }

  return next;
}

export async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(startPort, taken = new Set()) {
  let port = Number(startPort);
  while (taken.has(port) || !(await isPortAvailable(port))) {
    port += 1;
  }
  return port;
}

export async function resolveDynamicEmulatorPorts(preferredPorts) {
  const taken = new Set();
  const resolved = {};
  let changed = false;

  for (const [emulator, preferred] of Object.entries(preferredPorts || {})) {
    const chosen = await findAvailablePort(preferred, taken);
    taken.add(chosen);
    resolved[emulator] = chosen;
    if (chosen !== preferred) changed = true;
  }

  return { resolved, changed };
}

export async function createRuntimeFirebaseConfig(rootDir) {
  const baseConfigPath = path.join(rootDir, 'firebase.json');
  const rawConfig = JSON.parse(fs.readFileSync(baseConfigPath, 'utf8'));
  const config = normalizeRulesPathsForRuntime(normalizeConfigForEmulators(rawConfig), rootDir);
  const preferred = getPreferredEmulatorPorts(config);
  const { resolved, changed } = await resolveDynamicEmulatorPorts(preferred);
  const baseChanged = JSON.stringify(rawConfig) !== JSON.stringify(config);
  const runtimeConfig = applyEmulatorPorts(config, resolved);
  const runtimeChanged = baseChanged || changed;

  if (!runtimeChanged) {
    return { configPath: null, cleanup: () => {}, ports: resolved, changed: false };
  }

  const tmpFile = path.join(os.tmpdir(), `planning-game-firebase-${Date.now()}-${process.pid}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(runtimeConfig, null, 2), 'utf8');

  return {
    configPath: tmpFile,
    ports: resolved,
    changed: runtimeChanged,
    cleanup: () => {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    },
  };
}

export {
  toAbsoluteRulePath,
};
