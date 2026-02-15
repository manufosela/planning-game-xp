const fs = require('fs');
const path = require('path');
const { McpInstanceManager } = require('./mcp-instance-manager.cjs');

function detectExistingState(rootDir, deps = {}) {
  const state = {
    hasExistingSetup: false,
    envFiles: {},
    firebaseProjectId: null,
    firebaseDatabaseUrl: null,
    mcpInstances: [],
    matchingInstance: null,
  };

  for (const env of ['dev', 'pre', 'prod']) {
    const envPath = path.join(rootDir, `.env.${env}`);
    if (!fs.existsSync(envPath)) continue;

    state.envFiles[env] = true;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const projectMatch = content.match(/^PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m);
      const dbMatch = content.match(/^PUBLIC_FIREBASE_DATABASE_URL=(.+)$/m);
      if (projectMatch) state.firebaseProjectId = projectMatch[1].trim();
      if (dbMatch) state.firebaseDatabaseUrl = dbMatch[1].trim();
    } catch {
      // Ignore parse errors
    }
  }

  try {
    const manager = deps.managerFactory ? deps.managerFactory() : new McpInstanceManager();
    state.mcpInstances = manager.listInstances();
    if (state.firebaseProjectId) {
      state.matchingInstance = manager.findByFirebaseProject(state.firebaseProjectId);
    }
    state.hasExistingSetup = state.mcpInstances.length > 0;
  } catch {
    // Manager not available or no instances
  }

  return state;
}

module.exports = { detectExistingState };
