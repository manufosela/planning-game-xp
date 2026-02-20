#!/usr/bin/env node
/**
 * Instance Manager for Planning Game XP
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
 *
 * Usage:
 *   node scripts/instance-manager.cjs select
 *   node scripts/instance-manager.cjs verify
 *   node scripts/instance-manager.cjs use geniova
 *   node scripts/instance-manager.cjs create my-company
 *   node scripts/instance-manager.cjs list
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const INSTANCES_DIR = path.join(ROOT_DIR, 'planning-game-instances');
const LAST_INSTANCE_FILE = path.join(ROOT_DIR, '.last-instance');

/**
 * Files that get symlinked from the instance directory to the project root.
 * 'required' files cause warnings during verify if missing.
 */
const INSTANCE_FILES = [
  { src: '.env.dev', dest: '.env.dev', required: true, desc: 'Dev environment variables' },
  { src: '.env.pre', dest: '.env.pre', required: false, desc: 'Pre-production env vars' },
  { src: '.env.prod', dest: '.env.prod', required: true, desc: 'Production env vars' },
  { src: '.env.e2e', dest: '.env.e2e', required: false, desc: 'E2E test env vars' },
  { src: '.env.test', dest: '.env.test', required: false, desc: 'Unit test env vars' },
  { src: '.firebaserc', dest: '.firebaserc', required: true, desc: 'Firebase project config' },
  { src: 'database.rules.json', dest: 'database.rules.json', required: true, desc: 'RTDB rules (production)' },
  { src: 'database.test.rules.json', dest: 'database.test.rules.json', required: false, desc: 'RTDB rules (tests)' },
  { src: 'database.emulator.rules', dest: 'database.emulator.rules', required: false, desc: 'RTDB rules (emulator)' },
  { src: 'firestore.rules', dest: 'firestore.rules', required: false, desc: 'Firestore rules' },
  { src: 'firestore.rules.dev', dest: 'firestore.rules.dev', required: false, desc: 'Firestore rules (dev)' },
  { src: 'storage.rules', dest: 'storage.rules', required: true, desc: 'Storage rules' },
  { src: 'storage.emulator.rules', dest: 'storage.emulator.rules', required: false, desc: 'Storage rules (emulator)' },
  { src: 'serviceAccountKey.json', dest: 'serviceAccountKey.json', required: false, desc: 'Service account key' },
  { src: 'sonar-project.properties', dest: 'sonar-project.properties', required: false, desc: 'SonarQube config' },
  { src: 'functions/.env', dest: 'functions/.env', required: false, desc: 'Cloud Functions env vars' },
  { src: 'theme-config.json', dest: 'public/theme-config.json', required: false, desc: 'Theme configuration (colors, branding)' },
];

const EMULATOR_DATA = { src: 'emulator-data', dest: 'emulator-data' };

const ORG_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
const ORG_LOGO_DEST = path.join('public', 'images', 'org-logo');

/**
 * Required env vars that must exist in .env.dev for the app to work.
 */
const REQUIRED_ENV_VARS = [
  'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_AUTH_DOMAIN',
  'PUBLIC_FIREBASE_DATABASE_URL',
  'PUBLIC_FIREBASE_PROJECT_ID',
  'PUBLIC_FIREBASE_STORAGE_BUCKET',
  'PUBLIC_FIREBASE_APP_ID',
  'PUBLIC_AUTH_PROVIDER',
];

// ============================================================================
// Helpers
// ============================================================================

function isWindows() {
  return process.platform === 'win32';
}

function isTTY() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

function createLink(target, linkPath, isDirectory = false) {
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

function getLastInstance() {
  if (!fs.existsSync(LAST_INSTANCE_FILE)) return null;
  return fs.readFileSync(LAST_INSTANCE_FILE, 'utf8').trim();
}

function saveLastInstance(name) {
  fs.writeFileSync(LAST_INSTANCE_FILE, name + '\n');
}

function getProjectIdFromFirebaserc(instanceDir) {
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

function getEnvVar(instanceDir, envFile, varName) {
  const filePath = path.join(instanceDir, envFile);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(new RegExp(`^${varName}=(.+)$`, 'm'));
  if (!match) return null;
  const value = match[1].trim();
  if (value.includes('YOUR_')) return null;
  return value;
}

function listInstanceNames() {
  if (!fs.existsSync(INSTANCES_DIR)) return [];
  return fs.readdirSync(INSTANCES_DIR).filter((name) => {
    const fullPath = path.join(INSTANCES_DIR, name);
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
    // Check if port 4321 is in use
    execSync('lsof -ti:4321', { stdio: 'pipe' });
    // Port is in use — check if it's a different instance
    return lastUsed;
  } catch {
    // Port not in use, no conflict
    return null;
  }
}

/**
 * Finds an org logo image in the instance directory.
 * Looks for files matching common logo patterns with supported image extensions.
 * Returns the filename (not full path) or null.
 */
function findOrgLogo(instanceDir) {
  try {
    const files = fs.readdirSync(instanceDir);
    // First try: any file with a supported image extension
    const imageFiles = files.filter(f => ORG_LOGO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (imageFiles.length === 0) return null;
    // Prefer files named org-logo.* or logo.*
    const preferred = imageFiles.find(f => {
      const base = path.basename(f, path.extname(f)).toLowerCase();
      return base === 'org-logo' || base === 'logo';
    });
    // Otherwise pick the first image found
    return preferred || imageFiles[0];
  } catch {
    return null;
  }
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

  // Symlink org logo: find first image file matching org-logo.* or logo.*
  const orgLogoFile = findOrgLogo(instanceDir);
  if (orgLogoFile) {
    const ext = path.extname(orgLogoFile);
    const destPath = path.join(ROOT_DIR, ORG_LOGO_DEST + ext);
    // Remove any previous org-logo.* symlinks with different extensions
    for (const otherExt of ORG_LOGO_EXTENSIONS) {
      const otherDest = path.join(ROOT_DIR, ORG_LOGO_DEST + otherExt);
      try { fs.lstatSync(otherDest); fs.unlinkSync(otherDest); } catch { /* does not exist */ }
    }
    createLink(path.join(instanceDir, orgLogoFile), destPath);
    if (verbose) console.log(`  Linked: public/images/org-logo${ext}`);
    linked++;
  }

  // Symlink emulator-data directory
  const emulatorSrc = path.join(instanceDir, EMULATOR_DATA.src);
  const emulatorDest = path.join(ROOT_DIR, EMULATOR_DATA.dest);
  if (fs.existsSync(emulatorSrc)) {
    // Only link if directory has content
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

  // Sync Firebase CLI
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
// Core: verify an instance
// ============================================================================

function verifyInstance(name) {
  const instanceDir = path.join(INSTANCES_DIR, name);
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

  // Check .env.dev has required vars with real values
  const envDevPath = path.join(instanceDir, '.env.dev');
  if (fs.existsSync(envDevPath)) {
    for (const varName of REQUIRED_ENV_VARS) {
      const value = getEnvVar(instanceDir, '.env.dev', varName);
      if (!value) {
        issues.push(`.env.dev: ${varName} missing or has placeholder value`);
      }
    }
  }

  // Check .env.prod has required vars
  const envProdPath = path.join(instanceDir, '.env.prod');
  if (fs.existsSync(envProdPath)) {
    const prodProjectId = getEnvVar(instanceDir, '.env.prod', 'PUBLIC_FIREBASE_PROJECT_ID');
    if (!prodProjectId) {
      issues.push('.env.prod: PUBLIC_FIREBASE_PROJECT_ID missing or placeholder');
    }
    const prodDbUrl = getEnvVar(instanceDir, '.env.prod', 'PUBLIC_FIREBASE_DATABASE_URL');
    if (!prodDbUrl) {
      issues.push('.env.prod: PUBLIC_FIREBASE_DATABASE_URL missing or placeholder');
    }
  }

  // Check emulator-data has content
  const emulatorDir = path.join(instanceDir, 'emulator-data');
  if (!fs.existsSync(emulatorDir) || fs.readdirSync(emulatorDir).filter(f => f.endsWith('.json')).length === 0) {
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
    // Non-interactive: use last instance or fail
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
    // Enter pressed: use default
    selected = lastUsed && instances.includes(lastUsed) ? lastUsed : instances[0];
  } else if (/^\d+$/.test(answer)) {
    // Numeric selection
    const idx = parseInt(answer, 10) - 1;
    if (idx < 0 || idx >= instances.length) {
      console.error('Invalid selection.');
      process.exit(1);
    }
    selected = instances[idx];
  } else {
    // Name typed
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
      issues.forEach(issue => console.log(`      ERROR: ${issue}`));
    }
    if (warnings.length > 0) {
      warnings.forEach(warn => console.log(`      warn:  ${warn}`));
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
    { dest: '.env.dev', content: generateEnvTemplate('dev') },
    { dest: '.env.pre', content: generateEnvTemplate('pre') },
    { dest: '.env.prod', content: generateEnvTemplate('prod') },
    {
      dest: '.firebaserc',
      content: JSON.stringify({
        projects: { default: 'YOUR_FIREBASE_PROJECT_ID' },
        targets: {
          YOUR_FIREBASE_PROJECT_ID: {
            database: {
              main: ['YOUR_FIREBASE_PROJECT_ID-default-rtdb'],
              tests: ['YOUR_FIREBASE_PROJECT_ID-tests-rtdb'],
            },
          },
        },
      }, null, 2) + '\n',
    },
    {
      dest: 'functions/.env',
      content: [
        '# Cloud Functions Environment',
        'PUBLIC_SUPER_ADMIN_EMAIL=admin@yourdomain.com',
        '',
        '# Microsoft Graph (optional)',
        '# MS_CLIENT_ID=',
        '# MS_CLIENT_SECRET=',
        '# MS_TENANT_ID=',
        '# MS_FROM_EMAIL=',
        '',
      ].join('\n'),
    },
  ];

  const rulesCopies = [
    { src: 'database.rules.example.json', dest: 'database.rules.json' },
    { src: 'storage.rules.example', dest: 'storage.rules' },
  ];

  for (const tpl of templates) {
    fs.writeFileSync(path.join(instanceDir, tpl.dest), tpl.content);
    console.log(`  Created: ${tpl.dest}`);
  }

  for (const rule of rulesCopies) {
    const srcPath = path.join(ROOT_DIR, rule.src);
    const destPath = path.join(instanceDir, rule.dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  Copied:  ${rule.dest}`);
    }
  }

  console.log(`\nInstance "${name}" created at: planning-game-instances/${name}/`);
  console.log('\nNext steps:');
  console.log(`  1. Edit .firebaserc with your Firebase project ID`);
  console.log(`  2. Edit .env.dev and .env.prod with your Firebase config`);
  console.log(`  3. Edit database.rules.json and storage.rules for your domain`);
  console.log(`  4. Run: npm run instance:verify`);
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
 * Used by deploy scripts instead of 'select' to prevent deploying the wrong build.
 */
function cmdVerifyDeploy() {
  const versionJsonPath = path.join(ROOT_DIR, 'version.json');
  const distDir = path.join(ROOT_DIR, 'dist');

  // Check dist/ exists
  if (!fs.existsSync(distDir)) {
    console.error('\nError: dist/ directory not found. Run `npm run build` first.\n');
    process.exit(1);
  }

  // Read build instance from version.json
  let buildInstance = null;
  let buildVersion = null;
  if (fs.existsSync(versionJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
      buildInstance = data.instance || null;
      buildVersion = data.version || null;
    } catch { /* corrupt file */ }
  }

  // Read active instance
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

  // Verify active instance matches build
  if (activeInstance && activeInstance !== buildInstance) {
    console.error(`\nError: Instance mismatch!`);
    console.error(`  Built with:    ${buildInstance} (${buildProjectId || '?'})`);
    console.error(`  Active now:    ${activeInstance}`);
    console.error(`\nThe dist/ was built for "${buildInstance}" but you switched to "${activeInstance}".`);
    console.error(`Run 'npm run build' again or switch back with 'npm run instance:use -- ${buildInstance}'.\n`);
    process.exit(1);
  }

  console.log(`\nDeploying v${buildVersion || '?'} (instance: ${buildInstance}, project: ${buildProjectId || '?'})\n`);
}

// ============================================================================
// .env Template Generator
// ============================================================================

function generateEnvTemplate(env) {
  const lines = [
    '# Firebase Configuration',
    `# Environment: ${env}`,
    '#',
    '# Get these values from Firebase Console > Project Settings > Your Apps',
    '',
    'PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY',
    'PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com',
    'PUBLIC_FIREBASE_DATABASE_URL=https://YOUR_PROJECT-default-rtdb.REGION.firebasedatabase.app',
    'PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID',
    'PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.firebasestorage.app',
    'PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID',
    'PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID',
    '# PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX',
    '# PUBLIC_FIREBASE_VAPID_KEY=YOUR_VAPID_KEY',
    '',
    '# Application',
    'PUBLIC_SUPER_ADMIN_EMAIL=admin@yourdomain.com',
    '# PUBLIC_ORG_NAME=MyOrganization',
    '',
    '# Auth provider: google | microsoft | github | gitlab',
    'PUBLIC_AUTH_PROVIDER=google',
  ];

  if (env === 'dev') {
    lines.push(
      '',
      '# Emulators (development only)',
      'USE_FIREBASE_EMULATOR=true',
      'FIREBASE_DATABASE_EMULATOR_HOST=localhost:9001',
      'FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199',
      'FIRESTORE_EMULATOR_HOST=localhost:8081'
    );
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// Main
// ============================================================================

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'select':
    cmdSelect();
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
    console.log(`
Planning Game XP - Instance Manager

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
