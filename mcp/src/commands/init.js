/**
 * Setup wizard for Planning Game MCP V2.
 *
 * Generates a pg.config.yml with Firebase credentials path,
 * tests the Firestore connection, and creates a default project structure.
 *
 * @module mcp/commands/init
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Ask a question and return the answer.
 * @param {string} question
 * @param {string} [defaultValue]
 * @returns {Promise<string>}
 */
function ask(question, defaultValue) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Run the setup wizard.
 */
export async function runInit() {
  console.log('\n=== Planning Game MCP V2 — Setup Wizard ===\n');

  // Step 1: Instance name
  const instanceName = await ask('Instance name (e.g., "personal", "geniova")', 'default');

  // Step 2: Service account key path
  const defaultCredPath = resolve(process.cwd(), 'serviceAccountKey.json');
  const credPath = await ask('Path to serviceAccountKey.json', defaultCredPath);

  if (!existsSync(credPath)) {
    console.error(`\n[ERROR] File not found: ${credPath}`);
    console.error('Download from: Firebase Console > Project Settings > Service Accounts > Generate new private key\n');
    process.exit(1);
  }

  // Validate the key
  let projectId;
  try {
    const key = JSON.parse(readFileSync(credPath, 'utf8'));
    projectId = key.project_id;
    if (!projectId) {
      console.error('\n[ERROR] serviceAccountKey.json is missing "project_id" field.\n');
      process.exit(1);
    }
    console.log(`\n  Firebase project: ${projectId}`);
  } catch (err) {
    console.error(`\n[ERROR] Invalid JSON: ${err.message}\n`);
    process.exit(1);
  }

  // Step 3: User identity (optional)
  const userName = await ask('Your name (optional)', '');
  const userEmail = await ask('Your email (optional)', '');

  // Step 4: Test connection
  console.log('\n  Testing Firestore connection...');
  try {
    const admin = (await import('firebase-admin')).default;
    const app = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(credPath, 'utf8'))),
    }, 'init-test');
    const db = admin.firestore(app);
    const snap = await db.collection('projects').limit(1).get();
    console.log(`  Connected successfully. ${snap.size} project(s) found.`);
    await app.delete();
  } catch (err) {
    console.error(`\n  [WARNING] Could not connect to Firestore: ${err.message}`);
    console.error('  The config will be saved anyway. Fix the connection before using the MCP.\n');
  }

  // Step 5: Generate config
  const config = {
    instance: {
      name: instanceName,
      description: `Planning Game V2 — ${instanceName}`,
    },
    firebase: {
      projectId,
      credentialsPath: credPath,
    },
    mcp: {
      serverName: `planning-game-${instanceName}`,
      version: '2.0.0',
    },
  };

  if (userName || userEmail) {
    config.user = {};
    if (userName) config.user.name = userName;
    if (userEmail) config.user.email = userEmail;
  }

  const configPath = resolve(process.cwd(), 'pg.config.yml');
  writeFileSync(configPath, YAML.stringify(config), 'utf8');
  console.log(`\n  Config saved to: ${configPath}`);

  // Step 6: Write mcp.user.json if user info provided
  if (userName && userEmail) {
    const userConfigPath = resolve(process.cwd(), 'mcp.user.json');
    writeFileSync(userConfigPath, JSON.stringify({
      name: userName,
      email: userEmail,
    }, null, 2) + '\n', 'utf8');
    console.log(`  User config saved to: ${userConfigPath}`);
  }

  console.log('\n  Setup complete. Start the MCP server with: node mcp/src/index.js\n');
}
