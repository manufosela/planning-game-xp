#!/usr/bin/env node
/**
 * Instance Manager for Planning Game XP V2
 *
 * Manages multiple Firebase instance configurations from a single codebase.
 * Each instance lives in planning-game-instances/<name>/ and contains
 * all environment-specific files (.env, rules, emulator data, etc.).
 *
 * Subcommands:
 *   select         - Interactive instance selector (runs before dev/build/deploy)
 *   verify         - Check all instances and report missing/misconfigured files
 *   use <name>     - Activate an instance non-interactively (for CI/scripts)
 *   create <name>  - Create a new instance from templates
 *   list           - List all instances
 *   verify-deploy  - Check dist/ matches active instance before deploying
 *
 * Usage:
 *   node scripts/instance-manager.js select
 *   node scripts/instance-manager.js verify
 *   node scripts/instance-manager.js use manufosela
 *   node scripts/instance-manager.js create my-company
 *   node scripts/instance-manager.js list
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const INSTANCES_DIR = path.join(ROOT_DIR, 'planning-game-instances');
const LAST_INSTANCE_FILE = path.join(ROOT_DIR, '.last-instance');

/**
 * Files symlinked from instance to project root.
 * 'required' files cause warnings during verify if missing.
 *
 * V2 differences from V1:
 *   - Uses Astro .env.development / .env.production (not .env.dev/.env.prod)
 *   - No RTDB (database.rules.json removed)
 *   - No storage.rules (not used yet)
 *   - manifest.json maps to public/manifest.json
 *   - mcp.user.json for Planning Game MCP identity
 */
export const INSTANCE_FILES = [
  { src: '.env.development', dest: '.env.development', required: true, desc: 'Dev environment variables (Astro)' },
  { src: '.env.production', dest: '.env.production', required: true, desc: 'Production environment variables (Astro)' },
  { src: '.env.test', dest: '.env.test', required: false, desc: 'Test environment variables' },
  { src: '.firebaserc', dest: '.firebaserc', required: true, desc: 'Firebase project config' },
  { src: 'firestore.rules', dest: 'firestore.rules', required: true, desc: 'Firestore security rules' },
  { src: 'serviceAccountKey.json', dest: 'serviceAccountKey.json', required: false, desc: 'Service account key' },
  { src: 'sonar-project.properties', dest: 'sonar-project.properties', required: false, desc: 'SonarQube config' },
  { src: 'functions/.env', dest: 'functions/.env', required: false, desc: 'Cloud Functions env vars' },
  { src: 'manifest.json', dest: 'public/manifest.json', required: false, desc: 'PWA manifest' },
  { src: 'mcp.user.json', dest: 'mcp.user.json', required: false, desc: 'Planning Game MCP user identity' },
];

const EMULATOR_DATA = { src: 'emulator-data', dest: 'emulator-data' };

/**
 * Required env vars that must exist in .env.development for the app to work.
 * V2: no RTDB, no AUTH_PROVIDER — only core Firebase config.
 */
export const REQUIRED_ENV_VARS = [
  'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_AUTH_DOMAIN',
  'PUBLIC_FIREBASE_PROJECT_ID',
  'PUBLIC_FIREBASE_APP_ID',
];

// ============================================================================
// Helpers (exported for testing)
// ============================================================================

export function isWindows() {
  return process.platform === 'win32';
}

export function isTTY() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function createLink(target, linkPath, isDirectory = false) {
  // Remove existing file/symlink/broken symlink
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      fs.rmSync(linkPath, { recursive: true });
    } else {
      fs.unlinkSync(linkPath);
    }
  } catch {
    // Does not exist, fine
  }

  const parentDir = path.dirname(linkPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  if (isWindows()) {
    if (isDirectory) {
      fs.cpSync(target, linkPath, { recursive: true });
    } else {
      fs.copyFileSync(target, linkPath);
    }
  } else {
    const relativePath = path.relative(parentDir, target);
    fs.symlinkSync(relativePath, linkPath, isDirectory ? 'dir' : 'file');
  }
}

export function getLastInstance(filePath = LAST_INSTANCE_FILE) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8').trim();
}

export function saveLastInstance(name, filePath = LAST_INSTANCE_FILE) {
  fs.writeFileSync(filePath, name + '\n');
}

export function getProjectIdFromFirebaserc(instanceDir) {
  const firebasercPath = path.join(instanceDir, '.firebaserc');
  if (!fs.existsSync(firebasercPath)) return null;
  try {
    const content = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
    const projectId = content.projects?.default;
    if (!projectId || projectId.includes('YOUR_')) return null;
    return projectId;
  } catch {
    return null;
  }
}

export function getEnvVar(instanceDir, envFile, varName) {
  const filePath = path.join(instanceDir, envFile);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(new RegExp(`^${varName}=(.+)$`, 'm'));
  if (!match) return null;
  const value = match[1].trim();
  if (value.includes('YOUR_')) return null;
  return value;
}

export function listInstanceNames(instancesDir = INSTANCES_DIR) {
  if (!fs.existsSync(instancesDir)) return [];
  return fs.readdirSync(instancesDir).filter((name) => {
    const fullPath = path.join(instancesDir, name);
    return fs.statSync(fullPath).isDirectory() && !name.startsWith('.');
  });
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Checks if a dev server is running on port 4321 with a different instance.
 * Returns the conflicting instance name, or null if no conflict.
 */
function checkDevServerConflict(targetInstance) {
  const lastUsed = getLastInstance();
  if (!lastUsed || lastUsed === targetInstance) return null;

  try {
    execSync('lsof -ti:4321', { stdio: 'pipe' });
    return lastUsed;
  } catch {
    return null;
  }
}

// ============================================================================
// .env Template Generator (exported for testing)
// ============================================================================

export function generateEnvTemplate(env) {
  const lines = [
    '# Firebase Configuration',
    `# Environment: ${env}`,
    '#',
    '# Get these values from Firebase Console > Project Settings > Your Apps',
    '',
    'PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY',
    'PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com',
    'PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID',
    'PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.firebasestorage.app',
    'PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID',
    'PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID',
    '# PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX',
  ];

  if (env === 'development') {
    lines.push(
      '',
      '# Database',
      'PUBLIC_FIREBASE_DATABASE_ID=test',
      '',
      '# Emulators (development only)',
      'USE_FIREBASE_EMULATOR=true',
      'FIRESTORE_EMULATOR_HOST=localhost:8081',
    );
  } else {
    lines.push(
      '',
      '# Database',
      'PUBLIC_FIREBASE_DATABASE_ID=(default)',
    );
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// Core: activate an instance (create symlinks)
// ============================================================================

function activateInstance(name, { verbose = true } = {}) {
  const instanceDir = path.join(INSTANCES_DIR, name);
  if (!fs.existsSync(instanceDir)) {
    console.error(`Error: instance "${name}" not found.`);
    process.exit(1);
  }

  let linked = 0;
  let skipped = 0;

  for (const entry of INSTANCE_FILES) {
    if (!entry.dest) continue;

    const srcPath = path.join(instanceDir, entry.src);
    const destPath = path.join(ROOT_DIR, entry.dest);

    if (!fs.existsSync(srcPath)) {
      skipped++;
      if (entry.required && verbose) {
        console.warn(`  Warning: missing required file: ${entry.src}`);
      }
      continue;
    }

    createLink(srcPath, destPath);
    if (verbose) console.log(`  Linked: ${entry.dest}`);
    linked++;
  }

  // Symlink emulator-data directory
  const emulatorSrc = path.join(instanceDir, EMULATOR_DATA.src);
  const emulatorDest = path.join(ROOT_DIR, EMULATOR_DATA.dest);
  if (fs.existsSync(emulatorSrc)) {
    const emulatorFiles = fs.readdirSync(emulatorSrc);
    if (emulatorFiles.length > 0) {
      createLink(emulatorSrc, emulatorDest, true);
      if (verbose) console.log(`  Linked: ${EMULATOR_DATA.dest}/`);
      linked++;
    } else {
      skipped++;
    }
  } else {
    skipped++;
  }

  // Sync Firebase CLI: switch project
  const projectId = getProjectIdFromFirebaserc(instanceDir);
  if (projectId) {
    try {
      execSync('firebase use default', { cwd: ROOT_DIR, stdio: 'pipe' });
    } catch {
      // Firebase CLI not logged in or not installed, not critical
    }
  }

  saveLastInstance(name);

  if (verbose) {
    console.log(`  ${linked} linked, ${skipped} skipped`);
    if (isWindows()) {
      console.log('  (Windows: files copied, not symlinked)');
    }
  }

  return { linked, skipped, projectId };
}

// ============================================================================
// Core: verify an instance (exported for testing)
// ============================================================================

export function verifyInstance(name, instancesDir = INSTANCES_DIR) {
  const instanceDir = path.join(instancesDir, name);
  const issues = [];
  const warnings = [];

  // Check required files
  for (const entry of INSTANCE_FILES) {
    const filePath = path.join(instanceDir, entry.src);
    if (!fs.existsSync(filePath)) {
      if (entry.required) {
        issues.push(`Missing: ${entry.src} (${entry.desc})`);
      }
    }
  }

  // Check .firebaserc has a real projectId
  const projectId = getProjectIdFromFirebaserc(instanceDir);
  if (!projectId) {
    issues.push('.firebaserc: no valid project ID (still has placeholder)');
  }

  // Check .env.development has required vars with real values
  const envDevPath = path.join(instanceDir, '.env.development');
  if (fs.existsSync(envDevPath)) {
    for (const varName of REQUIRED_ENV_VARS) {
      const value = getEnvVar(instanceDir, '.env.development', varName);
      if (!value) {
        issues.push(`.env.development: ${varName} missing or has placeholder value`);
      }
    }
  }

  // Check .env.production has required project ID
  const envProdPath = path.join(instanceDir, '.env.production');
  if (fs.existsSync(envProdPath)) {
    const prodProjectId = getEnvVar(instanceDir, '.env.production', 'PUBLIC_FIREBASE_PROJECT_ID');
    if (!prodProjectId) {
      issues.push('.env.production: PUBLIC_FIREBASE_PROJECT_ID missing or placeholder');
    }
  }

  // Check emulator-data
  const emulatorDir = path.join(instanceDir, 'emulator-data');
  if (!fs.existsSync(emulatorDir) || fs.readdirSync(emulatorDir).filter((f) => f.endsWith('.json')).length === 0) {
    warnings.push('emulator-data/: no JSON files (emulator will start empty)');
  }

  return { projectId, issues, warnings };
}

// ============================================================================
// Commands
// ============================================================================

async function cmdSelect() {
  const instances = listInstanceNames();

  if (instances.length === 0) {
    console.error('\nNo instances found.');
    console.error('Create one with: npm run instance:create -- <name>\n');
    process.exit(1);
  }

  const lastUsed = getLastInstance();

  // Single instance: auto-select
  if (instances.length === 1) {
    const name = instances[0];
    const conflict = checkDevServerConflict(name);
    if (conflict) {
      console.error(`\nError: Dev server running on port 4321 with instance "${conflict}".`);
      console.error(`Cannot switch to "${name}" while another instance is serving.`);
      console.error('Stop the running dev server first, then try again.\n');
      process.exit(1);
    }
    const projectId = getProjectIdFromFirebaserc(path.join(INSTANCES_DIR, name));
    console.log(`\nUsing instance: ${name} (${projectId || 'no project ID'})`);
    activateInstance(name, { verbose: false });
    console.log('');
    return;
  }

  // Multiple instances: prompt
  if (!isTTY()) {
    if (lastUsed && instances.includes(lastUsed)) {
      const projectId = getProjectIdFromFirebaserc(path.join(INSTANCES_DIR, lastUsed));
      console.log(`Using last instance: ${lastUsed} (${projectId || '?'})`);
      activateInstance(lastUsed, { verbose: false });
      return;
    }
    console.error('Error: no instance selected and not in interactive terminal.');
    console.error('Run "npm run instance:use -- <name>" first, or use an interactive terminal.');
    process.exit(1);
  }

  console.log('\nAvailable instances:\n');
  instances.forEach((name, i) => {
    const dir = path.join(INSTANCES_DIR, name);
    const projectId = getProjectIdFromFirebaserc(dir);
    const marker = name === lastUsed ? ' (last used)' : '';
    console.log(`  ${i + 1}) ${name}  ${projectId || '(not configured)'}${marker}`);
  });

  const defaultLabel = lastUsed && instances.includes(lastUsed)
    ? ` [${lastUsed}]`
    : ` [${instances[0]}]`;

  const answer = await prompt(`\nSelect instance${defaultLabel}: `);

  let selected;
  if (!answer) {
    selected = lastUsed && instances.includes(lastUsed) ? lastUsed : instances[0];
  } else if (/^\d+$/.test(answer)) {
    const idx = parseInt(answer, 10) - 1;
    if (idx < 0 || idx >= instances.length) {
      console.error('Invalid selection.');
      process.exit(1);
    }
    selected = instances[idx];
  } else {
    if (!instances.includes(answer)) {
      console.error(`Instance "${answer}" not found.`);
      process.exit(1);
    }
    selected = answer;
  }

  const conflict = checkDevServerConflict(selected);
  if (conflict) {
    console.error(`\nError: Dev server running on port 4321 with instance "${conflict}".`);
    console.error(`Cannot switch to "${selected}" while another instance is serving.`);
    console.error('Stop the running dev server first, then try again.\n');
    process.exit(1);
  }

  const projectId = getProjectIdFromFirebaserc(path.join(INSTANCES_DIR, selected));
  console.log(`\nUsing: ${selected} (${projectId || 'no project ID'})\n`);
  activateInstance(selected, { verbose: false });
  console.log('');
}

function cmdVerify() {
  const instances = listInstanceNames();

  if (instances.length === 0) {
    console.log('\nNo instances found.');
    console.log('Create one with: npm run instance:create -- <name>\n');
    return;
  }

  console.log('\nInstance Verification\n');

  let allOk = true;

  for (const name of instances) {
    const { projectId, issues, warnings } = verifyInstance(name);
    const status = issues.length === 0 ? 'OK' : 'ISSUES';
    const projectLabel = projectId || 'NOT CONFIGURED';

    console.log(`  ${status === 'OK' ? 'OK' : 'XX'}  ${name}  (${projectLabel})`);

    if (issues.length > 0) {
      allOk = false;
      issues.forEach((issue) => console.log(`      ERROR: ${issue}`));
    }
    if (warnings.length > 0) {
      warnings.forEach((warn) => console.log(`      warn:  ${warn}`));
    }
  }

  console.log('');
  if (allOk) {
    console.log('  All instances are properly configured.\n');
  } else {
    console.log('  Fix the errors above before using those instances.\n');
  }
}

function cmdUse(name) {
  if (!name) {
    console.error('Usage: npm run instance:use -- <name>');
    process.exit(1);
  }

  const instances = listInstanceNames();
  if (!instances.includes(name)) {
    console.error(`Error: instance "${name}" not found.`);
    if (instances.length > 0) {
      console.error(`Available: ${instances.join(', ')}`);
    }
    process.exit(1);
  }

  console.log(`\nActivating instance: ${name}\n`);
  const { projectId } = activateInstance(name);
  console.log(`\nInstance "${name}" ready (project: ${projectId || 'not configured'})\n`);
}

function cmdCreate(name) {
  if (!name) {
    console.error('Usage: npm run instance:create -- <name>');
    process.exit(1);
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    console.error('Error: name must be lowercase alphanumeric with hyphens (e.g. "my-company")');
    process.exit(1);
  }

  const instanceDir = path.join(INSTANCES_DIR, name);
  if (fs.existsSync(instanceDir)) {
    console.error(`Error: instance "${name}" already exists.`);
    process.exit(1);
  }

  console.log(`\nCreating instance: ${name}\n`);

  fs.mkdirSync(path.join(instanceDir, 'functions'), { recursive: true });
  fs.mkdirSync(path.join(instanceDir, 'emulator-data'), { recursive: true });

  // Generate template files
  const templates = [
    { dest: '.env.development', content: generateEnvTemplate('development') },
    { dest: '.env.production', content: generateEnvTemplate('production') },
    {
      dest: '.firebaserc',
      content: JSON.stringify({
        projects: { default: 'YOUR_FIREBASE_PROJECT_ID' },
      }, null, 2) + '\n',
    },
    {
      dest: 'functions/.env',
      content: [
        '# Cloud Functions Environment',
        'PUBLIC_SUPER_ADMIN_EMAIL=admin@yourdomain.com',
        '',
      ].join('\n'),
    },
  ];

  // Copy firestore.rules from project root if it exists
  const firestoreRulesSrc = path.join(ROOT_DIR, 'firestore.rules');
  if (fs.existsSync(firestoreRulesSrc)) {
    templates.push({
      dest: 'firestore.rules',
      content: fs.readFileSync(firestoreRulesSrc, 'utf8'),
    });
  }

  // Copy public/manifest.json from project root if it exists
  const manifestSrc = path.join(ROOT_DIR, 'public', 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    templates.push({
      dest: 'manifest.json',
      content: fs.readFileSync(manifestSrc, 'utf8'),
    });
  }

  for (const tpl of templates) {
    const destPath = path.join(instanceDir, tpl.dest);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.writeFileSync(destPath, tpl.content);
    console.log(`  Created: ${tpl.dest}`);
  }

  console.log(`\nInstance "${name}" created at: planning-game-instances/${name}/`);
  console.log('\nNext steps:');
  console.log('  1. Edit .firebaserc with your Firebase project ID');
  console.log('  2. Edit .env.development and .env.production with your Firebase config');
  console.log('  3. Edit firestore.rules for your domain');
  console.log('  4. Run: npm run instance:verify');
  console.log('');
}

function cmdList() {
  const instances = listInstanceNames();
  const lastUsed = getLastInstance();

  if (instances.length === 0) {
    console.log('\nNo instances found.');
    console.log('Create one with: npm run instance:create -- <name>\n');
    return;
  }

  console.log('\nInstances:\n');
  for (const name of instances) {
    const dir = path.join(INSTANCES_DIR, name);
    const projectId = getProjectIdFromFirebaserc(dir);
    const marker = name === lastUsed ? ' (last used)' : '';
    console.log(`  ${name}  ${projectId || '(not configured)'}${marker}`);
  }
  console.log('');
}

/**
 * verify-deploy: Checks that the active instance matches the one used during build.
 */
function cmdVerifyDeploy() {
  const versionJsonPath = path.join(ROOT_DIR, 'version.json');
  const distDir = path.join(ROOT_DIR, 'dist');

  if (!fs.existsSync(distDir)) {
    console.error('\nError: dist/ directory not found. Run `npm run build` first.\n');
    process.exit(1);
  }

  let buildInstance = null;
  let buildVersion = null;
  if (fs.existsSync(versionJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
      buildInstance = data.instance || null;
      buildVersion = data.version || null;
    } catch { /* corrupt file */ }
  }

  const activeInstance = getLastInstance();

  if (!buildInstance) {
    console.warn('\nWarning: Build was created before instance tracking was added.');
    console.warn('Cannot verify which instance was used for this build.');
    if (activeInstance) {
      const dir = path.join(INSTANCES_DIR, activeInstance);
      const projectId = getProjectIdFromFirebaserc(dir);
      console.warn(`Active instance: ${activeInstance} (${projectId || '?'})`);
    }
    console.warn('Proceeding with deploy...\n');
    return;
  }

  const buildDir = path.join(INSTANCES_DIR, buildInstance);
  const buildProjectId = getProjectIdFromFirebaserc(buildDir);

  if (activeInstance && activeInstance !== buildInstance) {
    console.error('\nError: Instance mismatch!');
    console.error(`  Built with:    ${buildInstance} (${buildProjectId || '?'})`);
    console.error(`  Active now:    ${activeInstance}`);
    console.error(`\nThe dist/ was built for "${buildInstance}" but you switched to "${activeInstance}".`);
    console.error(`Run 'npm run build' again or switch back with 'npm run instance:use -- ${buildInstance}'.\n`);
    process.exit(1);
  }

  console.log(`\nDeploying v${buildVersion || '?'} (instance: ${buildInstance}, project: ${buildProjectId || '?'})\n`);
}

// ============================================================================
// Main (top-level await)
// ============================================================================

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'select':
    await cmdSelect();
    break;
  case 'verify':
    cmdVerify();
    break;
  case 'use':
    cmdUse(args[0]);
    break;
  case 'create':
    cmdCreate(args[0]);
    break;
  case 'list':
    cmdList();
    break;
  case 'verify-deploy':
    cmdVerifyDeploy();
    break;
  default:
    if (!command) break; // imported as module (tests)
    console.log(`
Planning Game XP V2 - Instance Manager

Commands:
  select          Interactive instance selector (used by dev/build)
  verify          Check all instances for missing or misconfigured files
  verify-deploy   Verify dist/ matches active instance (used by deploy)
  use <name>      Activate an instance non-interactively (for CI/scripts)
  create <name>   Create a new instance from templates
  list            List all available instances

npm scripts:
  npm run instance:select    Select instance interactively
  npm run instance:verify    Verify all instances
  npm run instance:use       Activate instance (non-interactive)
  npm run instance:create    Create new instance
  npm run instance:list      List instances
`);
    if (command) {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
}
