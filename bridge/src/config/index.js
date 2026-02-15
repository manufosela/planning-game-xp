/**
 * Bridge Server Configuration
 *
 * All configuration is read from environment variables.
 * No fallback chains - missing required vars throw errors.
 */

function loadConfig() {
  const port = parseInt(process.env.BRIDGE_PORT || '3100', 10);
  const databaseUrl = process.env.DATABASE_URL;
  const apiKey = process.env.BRIDGE_API_KEY;
  const kjHome = process.env.KJ_HOME;
  const googleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  if (!apiKey) {
    throw new Error('BRIDGE_API_KEY environment variable is required');
  }

  return {
    port,
    databaseUrl,
    apiKey,
    kjHome: kjHome || null,
    googleCredentials: googleCredentials || null,
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:4321', 'http://localhost:3000'],
  };
}

module.exports = { loadConfig };
