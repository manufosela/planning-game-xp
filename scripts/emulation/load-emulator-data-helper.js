export function resolveRtdbEmulatorConfig(env = process.env) {
  const host = String(env.FIREBASE_DATABASE_EMULATOR_HOST || 'localhost:9001').trim();
  const projectId = String(env.FIREBASE_EMULATOR_PROJECT_ID || 'planning-game-template').trim();
  const namespace = String(env.FIREBASE_EMULATOR_RTDB_NAMESPACE || `${projectId}-tests-rtdb`).trim();
  const databaseURL = `http://${host}?ns=${namespace}`;

  return {
    host,
    projectId,
    namespace,
    databaseURL,
  };
}
