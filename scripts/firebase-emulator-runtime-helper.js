export function parseHostPort(value, defaultPort) {
  const raw = String(value || '').trim();
  if (!raw) return { host: 'localhost', port: defaultPort };

  const parts = raw.split(':');
  if (parts.length < 2) return { host: parts[0] || 'localhost', port: defaultPort };

  const host = parts.slice(0, -1).join(':') || 'localhost';
  const parsedPort = Number(parts[parts.length - 1]);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : defaultPort;
  return { host, port };
}

export function resolveFirebaseWebEmulatorRuntime(env = {}) {
  const firestore = parseHostPort(env.FIRESTORE_EMULATOR_HOST || 'localhost:8080', 8080);
  const database = parseHostPort(env.FIREBASE_DATABASE_EMULATOR_HOST || 'localhost:9001', 9001);
  const storage = parseHostPort(env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199', 9199);
  return { firestore, database, storage };
}
