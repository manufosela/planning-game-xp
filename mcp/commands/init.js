import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { resolve, basename, isAbsolute } from 'path';
import { execSync } from 'child_process';
import { ask, confirm, printHeader, printSuccess, printError, printWarning, printInfo } from '../utils/wizard.js';
import { readConfig, writeConfig, resolveConfigPath } from '../utils/pg-config.js';
import { syncGuidelines } from '../tools/sync-guidelines.js';

/**
 * Run the interactive setup wizard.
 * @param {object} options
 * @param {boolean} [options.nonInteractive=false]
 */
export async function runInit({ nonInteractive = false } = {}) {
  printHeader('Planning Game MCP — Setup Wizard');

  // ── Step 0: Detect existing instances and ask what to do ──
  let existing = null;
  let reconfigureInstance = null;

  if (!nonInteractive) {
    const existingInstances = listExistingInstances();

    if (existingInstances.length > 0) {
      printInfo(`Found ${existingInstances.length} existing instance${existingInstances.length > 1 ? 's' : ''}:`);
      existingInstances.forEach((inst, i) => {
        printInfo(`  ${i + 1}. ${inst.name} → ${inst.project || 'unknown project'}`);
      });
      console.log('');

      const options = [
        ...existingInstances.map((inst, i) => ({
          label: `Reconfigure "${inst.name}"`,
          value: `reconfig-${i}`
        })),
        { label: 'Add a new instance', value: 'new' }
      ];

      process.stderr.write('What would you like to do?\n');
      options.forEach((opt, i) => {
        process.stderr.write(`  ${i + 1}. ${opt.label}\n`);
      });

      const choice = await ask('Select option', {
        defaultValue: String(options.length),
        validate: (val) => {
          const num = parseInt(val, 10);
          if (isNaN(num) || num < 1 || num > options.length) {
            return `Enter a number between 1 and ${options.length}`;
          }
          return null;
        }
      });

      const selectedIdx = parseInt(choice, 10) - 1;
      const selected = options[selectedIdx];

      if (selected.value.startsWith('reconfig-')) {
        const instIdx = parseInt(selected.value.split('-')[1], 10);
        reconfigureInstance = existingInstances[instIdx];
        if (reconfigureInstance.dir) {
          const configPath = resolve(reconfigureInstance.dir, 'pg.config.yml');
          existing = readConfig(configPath);
        }
      }
      // If 'new', existing stays null — fresh setup
    }
  } else {
    const configPath = resolveConfigPath();
    existing = readConfig(configPath);
  }

  // ── Step 1: Prerequisites ──
  printHeader('Step 1/7 — Prerequisites');
  checkPrerequisites();

  // ── Step 2: Instance name & directory ──
  printHeader('Step 2/7 — Instance Name');
  const { instanceName, instanceDescription } = await resolveInstanceIdentity(existing, nonInteractive);
  const instanceDir = reconfigureInstance?.dir
    ? resolve(reconfigureInstance.dir)
    : await resolveInstanceDirectory(instanceName, nonInteractive);

  // ── Step 3: Firebase credentials ──
  printHeader('Step 3/7 — Firebase Credentials');
  const { credentialsPath, projectId } = await resolveCredentials(existing, nonInteractive, instanceDir);

  // ── Step 4: Database URL + connectivity ──
  printHeader('Step 4/7 — Firebase Database');
  const databaseUrl = await resolveDatabaseUrl(projectId, existing, nonInteractive);
  await testConnectivity(credentialsPath, databaseUrl);

  // ── Step 5: User identity ──
  printHeader('Step 5/7 — User Identity');
  const user = await resolveUser(existing, nonInteractive, credentialsPath, databaseUrl);

  // ── Step 6: Generate config ──
  printHeader('Step 6/7 — Save Configuration');
  const serverName = `planning-game-${instanceName}`;

  const userConfig = {
    name: user.name,
    email: user.email
  };
  if (user.developerId) userConfig.developerId = user.developerId;
  if (user.stakeholderId) userConfig.stakeholderId = user.stakeholderId;

  // Point credentialsPath to the copy inside the instance directory
  const instanceCredentialsPath = resolve(instanceDir, 'serviceAccountKey.json');

  const config = {
    instance: { name: instanceName, description: instanceDescription },
    firebase: {
      projectId,
      databaseUrl,
      credentialsPath: instanceCredentialsPath
    },
    user: userConfig,
    mcp: {
      serverName,
      autoUpdate: true
    }
  };

  // Write config to the instance directory
  const instanceConfigPath = resolve(instanceDir, 'pg.config.yml');
  writeConfig(config, instanceConfigPath);
  printSuccess(`Config saved to: ${instanceConfigPath}`);

  // Write mcp.user.json for backwards compatibility
  writeMcpUserCompat(config, instanceDir);

  // Offer to register in Claude Code
  if (!nonInteractive) {
    await offerClaudeRegistration(config, instanceDir);
  }

  // ── Step 7: Sync Guidelines ──
  printHeader('Step 7/7 — Sync Guidelines');
  await syncGuidelinesStep(credentialsPath, databaseUrl, nonInteractive);

  // Final summary
  printHeader('Setup Complete');
  printSuccess(`Instance: ${instanceName}`);
  printSuccess(`Firebase project: ${projectId}`);
  printSuccess(`Database URL: ${databaseUrl}`);
  const userRoles = [
    user.developerId ? user.developerId : null,
    user.stakeholderId ? user.stakeholderId : null
  ].filter(Boolean).join(' / ');
  printSuccess(`User: ${user.name} (${userRoles})`);
  printSuccess(`Instance dir: ${instanceDir}`);
  printSuccess(`Config: ${instanceConfigPath}`);
  printInfo('Run "planning-game-mcp --version" to verify installation.');
  printInfo('To add another instance, run "planning-game-mcp init" again with a different name.');
}

// ── Step implementations ──

function checkPrerequisites() {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);

  if (major < 18) {
    printError(`Node.js ${nodeVersion} is too old. Minimum: v18.0.0`);
    process.exit(1);
  }
  printSuccess(`Node.js ${nodeVersion}`);

  try {
    execSync('git --version', { stdio: 'pipe', timeout: 5000 });
    printSuccess('Git available');
  } catch {
    printWarning('Git not available. Version checking will not work.');
  }
}

async function resolveInstanceIdentity(existing, nonInteractive) {
  const envInstanceDir = process.env.MCP_INSTANCE_DIR;
  const envName = envInstanceDir ? basename(envInstanceDir) : null;
  const defaultName = existing?.instance?.name || envName || 'default';
  const defaultDescription = existing?.instance?.description || '';

  if (nonInteractive) {
    printInfo(`Instance name: ${defaultName}`);
    if (defaultDescription) printInfo(`Description: ${defaultDescription}`);
    return { instanceName: defaultName, instanceDescription: defaultDescription };
  }

  // Detect and show existing instances
  const existingInstances = listExistingInstances();
  if (existingInstances.length > 0) {
    printInfo(`Existing instance${existingInstances.length > 1 ? 's' : ''}:`);
    for (const inst of existingInstances) {
      printInfo(`  ${inst.name} → ${inst.project || 'unknown project'}`);
    }
    console.log('');
    printInfo('Adding another instance? Just pick a different name.');
    console.log('');
  }

  const name = await ask('Instance name', {
    defaultValue: defaultName,
    validate: (val) => {
      if (!val) return 'Instance name is required';
      if (!/^[a-zA-Z0-9_-]+$/.test(val)) return 'Only letters, numbers, hyphens and underscores allowed';
      return null;
    }
  });

  const description = await ask('Instance description (what is this instance for?)', {
    defaultValue: defaultDescription
  });

  printSuccess(`Instance: ${name}`);
  if (description) printSuccess(`Description: ${description}`);
  return { instanceName: name, instanceDescription: description };
}

/**
 * List existing PG instances from ~/pg-instances/ and ~/.claude.json
 */
function listExistingInstances() {
  const instances = [];
  const homedir = process.env.HOME || process.env.USERPROFILE;

  // Check ~/pg-instances/
  const pgInstancesDir = resolve(homedir, 'pg-instances');
  if (existsSync(pgInstancesDir)) {
    try {
      for (const entry of readdirSync(pgInstancesDir)) {
        const fullPath = resolve(pgInstancesDir, entry);
        if (!statSync(fullPath).isDirectory()) continue;

        let project = null;
        const configPath = resolve(fullPath, 'pg.config.yml');
        if (existsSync(configPath)) {
          const config = readConfig(configPath);
          project = config?.firebase?.projectId || null;
        }
        instances.push({ name: entry, dir: fullPath, project });
      }
    } catch { /* ignore */ }
  }

  // Also check ~/.claude.json for planning-game-* servers
  if (instances.length === 0) {
    try {
      const claudeConfigPath = resolve(homedir, '.claude.json');
      if (existsSync(claudeConfigPath)) {
        const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
        const servers = claudeConfig.mcpServers || {};
        for (const [name, config] of Object.entries(servers)) {
          if (name.startsWith('planning-game')) {
            const instanceDir = config.env?.MCP_INSTANCE_DIR || null;
            instances.push({ name, dir: instanceDir, project: null });
          }
        }
      }
    } catch { /* ignore */ }
  }

  return instances;
}

async function resolveCredentials(existing, nonInteractive, instanceDir) {
  const defaultPath = existing?.firebase?.credentialsPath || findServiceAccountKey();

  if (nonInteractive) {
    if (!defaultPath || !existsSync(defaultPath)) {
      printError('serviceAccountKey.json not found. Provide path via pg.config.yml or GOOGLE_APPLICATION_CREDENTIALS.');
      process.exit(1);
    }
    const result = validateCredentialsFile(defaultPath);
    copyCredentialsToInstance(result.credentialsPath, instanceDir);
    return result;
  }

  // Explain why this is mandatory before asking
  printInfo('The serviceAccountKey.json is REQUIRED to connect to Firebase.');
  printInfo('Get it from: Firebase Console > Project Settings > Service Accounts > Generate new private key.');
  console.log('');

  // Keep asking until we get a valid file — no way to skip this step
  while (true) {
    let credPath = await ask('Path to serviceAccountKey.json', {
      defaultValue: defaultPath || '',
      validate: (val) => {
        if (!val) return 'Path is required. Cannot continue without a serviceAccountKey.json.';
        const resolved = isAbsolute(val) ? val : resolve(process.cwd(), val);
        if (!existsSync(resolved)) return `File not found: ${resolved}. Check the path and try again.`;
        return null;
      }
    });

    credPath = isAbsolute(credPath) ? credPath : resolve(process.cwd(), credPath);

    try {
      const result = validateCredentialsFile(credPath);
      copyCredentialsToInstance(result.credentialsPath, instanceDir);
      return result;
    } catch {
      // validateCredentialsFile calls process.exit on invalid JSON/missing project_id.
      // If we somehow get here, ask again.
      const retry = await confirm('Try again with a different file?', true);
      if (!retry) {
        printError('Cannot continue without valid Firebase credentials.');
        process.exit(1);
      }
    }
  }
}

function validateCredentialsFile(credPath) {
  let content;
  try {
    content = JSON.parse(readFileSync(credPath, 'utf-8'));
  } catch (err) {
    printError(`Invalid JSON in ${credPath}: ${err.message}`);
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  if (!content.project_id) {
    printError('serviceAccountKey.json is missing the "project_id" field.');
    printInfo('Download a fresh key from Firebase Console > Project Settings > Service Accounts.');
    throw new Error('Missing project_id');
  }

  printSuccess(`Credentials valid — project: ${content.project_id}`);
  return { credentialsPath: credPath, projectId: content.project_id };
}

/**
 * Create or resolve the instance directory at ~/pg-instances/{name}/.
 */
async function resolveInstanceDirectory(instanceName, nonInteractive) {
  const envDir = process.env.MCP_INSTANCE_DIR;
  if (envDir && existsSync(envDir)) {
    printInfo(`Using existing instance directory: ${envDir}`);
    return resolve(envDir);
  }

  const homedir = process.env.HOME || process.env.USERPROFILE;
  const defaultDir = resolve(homedir, 'pg-instances', instanceName);

  if (nonInteractive) {
    mkdirSync(defaultDir, { recursive: true });
    return defaultDir;
  }

  const dir = await ask('Instance directory', {
    defaultValue: defaultDir,
    validate: (val) => {
      if (!val) return 'Directory is required';
      return null;
    }
  });

  const resolved = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  mkdirSync(resolved, { recursive: true });
  printSuccess(`Instance directory: ${resolved}`);
  return resolved;
}

/**
 * Copy serviceAccountKey.json to the instance directory if it's not already there.
 */
function copyCredentialsToInstance(credPath, instanceDir) {
  const target = resolve(instanceDir, 'serviceAccountKey.json');
  const source = resolve(credPath);

  // Already in the instance dir
  if (source === target) return;

  try {
    copyFileSync(source, target);
    printSuccess(`Credentials copied to: ${target}`);
  } catch (err) {
    printWarning(`Could not copy credentials to instance dir: ${err.message}`);
  }
}

/**
 * Search common locations for serviceAccountKey.json.
 */
function findServiceAccountKey() {
  const candidates = [];

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    candidates.push(resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  }

  const instanceDir = process.env.MCP_INSTANCE_DIR;
  if (instanceDir) {
    candidates.push(resolve(instanceDir, 'serviceAccountKey.json'));
  }

  candidates.push(resolve(process.cwd(), 'serviceAccountKey.json'));

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return null;
}

async function resolveDatabaseUrl(projectId, existing, nonInteractive) {
  const autoUrl = `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`;
  const defaultUrl = existing?.firebase?.databaseUrl || process.env.FIREBASE_DATABASE_URL || autoUrl;

  if (nonInteractive) {
    printInfo(`Database URL: ${defaultUrl}`);
    return defaultUrl;
  }

  printInfo(`Auto-detected URL: ${autoUrl}`);
  const url = await ask('Firebase Database URL', {
    defaultValue: defaultUrl,
    validate: (val) => {
      if (!val) return 'URL is required';
      if (!val.startsWith('https://')) return 'URL must start with https://';
      return null;
    }
  });

  return url;
}

async function testConnectivity(credentialsPath, databaseUrl) {
  printInfo('Testing Firebase connectivity...');

  try {
    const admin = (await import('firebase-admin')).default;

    const testApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(credentialsPath, 'utf-8'))),
      databaseURL: databaseUrl
    }, `init-test-${Date.now()}`);

    const db = testApp.database();
    const snapshot = await Promise.race([
      db.ref('/projects').limitToFirst(1).once('value'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000))
    ]);

    const data = snapshot.val();
    if (data) {
      printSuccess('Connected to Firebase — projects found');
    } else {
      printWarning('Connected to Firebase but no projects found at /projects');
    }

    await testApp.delete();
  } catch (err) {
    printError(`Firebase connection failed: ${err.message}`);
    printInfo('Possible causes:');
    printInfo('  - Database URL is incorrect');
    printInfo('  - Credentials belong to a different Firebase project');
    printInfo('  - Realtime Database is not enabled in this project');
    printInfo('  - Network/firewall issue');
    printWarning('Config will be saved but the MCP may not work until this is fixed.');
  }
}

/**
 * Fetch user list from Firebase /users.
 * Returns array of { name, email, developerId, stakeholderId } or empty on failure.
 */
async function fetchUsersFromFirebase(credentialsPath, databaseUrl) {
  try {
    const admin = (await import('firebase-admin')).default;
    const tempApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(credentialsPath, 'utf-8'))),
      databaseURL: databaseUrl
    }, `init-users-${Date.now()}`);

    const snapshot = await Promise.race([
      tempApp.database().ref('/users').once('value'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
    ]);

    const usersData = snapshot.val();
    await tempApp.delete();

    if (!usersData) return [];

    const users = [];
    for (const userData of Object.values(usersData)) {
      if (!userData || typeof userData !== 'object') continue;
      if (userData.active === false) continue;
      if (!userData.developerId && !userData.stakeholderId) continue;
      users.push({
        name: userData.name || '',
        email: userData.email || '',
        developerId: userData.developerId || null,
        stakeholderId: userData.stakeholderId || null
      });
    }
    return users.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Try to auto-detect the user from the list by name or email match.
 */
function findMatchingUser(users, name, email) {
  if (!users.length) return null;

  if (email) {
    const match = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (match) return match;
  }

  if (name) {
    const lower = name.toLowerCase();
    const exact = users.find(u => u.name.toLowerCase() === lower);
    if (exact) return exact;
    const partial = users.find(u => u.name.toLowerCase().includes(lower) || lower.includes(u.name.toLowerCase()));
    if (partial) return partial;
  }

  return null;
}

async function resolveUser(existing, nonInteractive, credentialsPath, databaseUrl) {
  const defaults = {
    name: existing?.user?.name || '',
    email: existing?.user?.email || '',
    developerId: existing?.user?.developerId || '',
    stakeholderId: existing?.user?.stakeholderId || ''
  };

  if (nonInteractive) {
    if (!defaults.developerId && !defaults.stakeholderId) {
      printWarning('User not configured. Run "planning-game-mcp init" interactively to set up.');
    }
    return defaults;
  }

  // Fetch users from Firebase to help identify the user
  printInfo('Fetching user list from Firebase...');
  const users = await fetchUsersFromFirebase(credentialsPath, databaseUrl);

  if (users.length > 0) {
    printSuccess(`Found ${users.length} user(s):`);
    for (const u of users) {
      const roles = [
        u.developerId ? u.developerId : null,
        u.stakeholderId ? u.stakeholderId : null
      ].filter(Boolean).join(' / ');
      printInfo(`  ${roles} — ${u.name} <${u.email}>`);
    }
    console.log('');
  } else {
    printWarning('Could not fetch developer list. You will need to enter your ID manually.');
  }

  // Ask name and email first
  const name = await ask('Your name', {
    defaultValue: defaults.name,
    validate: (val) => val ? null : 'Name is required'
  });

  const email = await ask('Your email', {
    defaultValue: defaults.email,
    validate: (val) => {
      if (!val) return 'Email is required';
      if (!val.includes('@')) return 'Invalid email';
      return null;
    }
  });

  // Try auto-detect from user list
  if (users.length > 0) {
    const match = findMatchingUser(users, name, email);
    if (match) {
      const roles = [
        match.developerId ? `developer: ${match.developerId}` : null,
        match.stakeholderId ? `stakeholder: ${match.stakeholderId}` : null
      ].filter(Boolean).join(', ');

      const confirmed = await confirm(`Are you ${match.name} (${roles})?`, true);
      if (confirmed) {
        printSuccess(`User: ${match.name} <${email}> (${roles})`);
        return {
          name: match.name,
          email,
          developerId: match.developerId || '',
          stakeholderId: match.stakeholderId || ''
        };
      }
    }
  }

  // Manual entry — ask for roles
  printInfo('Enter your IDs. Leave blank if you don\'t have that role.');

  const allDevIds = users.filter(u => u.developerId).map(u => u.developerId);
  const allStkIds = users.filter(u => u.stakeholderId).map(u => u.stakeholderId);

  const developerId = await ask('Your developer ID (e.g., dev_001) — leave empty if stakeholder only', {
    defaultValue: defaults.developerId,
    validate: (val) => {
      if (!val) return null; // optional
      if (!val.startsWith('dev_')) return 'Developer ID must start with "dev_"';
      if (allDevIds.length > 0 && !allDevIds.includes(val)) {
        return `Developer "${val}" not found. Available: ${allDevIds.join(', ')}`;
      }
      return null;
    }
  });

  const stakeholderId = await ask('Your stakeholder ID (e.g., stk_001) — leave empty if developer only', {
    defaultValue: defaults.stakeholderId,
    validate: (val) => {
      if (!val) return null; // optional
      if (!val.startsWith('stk_')) return 'Stakeholder ID must start with "stk_"';
      if (allStkIds.length > 0 && !allStkIds.includes(val)) {
        return `Stakeholder "${val}" not found. Available: ${allStkIds.join(', ')}`;
      }
      return null;
    }
  });

  if (!developerId && !stakeholderId) {
    printError('You must have at least one role (developer or stakeholder).');
    process.exit(1);
  }

  const roles = [
    developerId ? `developer: ${developerId}` : null,
    stakeholderId ? `stakeholder: ${stakeholderId}` : null
  ].filter(Boolean).join(', ');
  printSuccess(`User: ${name} <${email}> (${roles})`);

  return { name, email, developerId: developerId || '', stakeholderId: stakeholderId || '' };
}

function writeMcpUserCompat(config, instanceDir) {
  try {
    const userConfigPath = resolve(instanceDir, 'mcp.user.json');
    const userData = {
      developerId: config.user.developerId || null,
      stakeholderId: config.user.stakeholderId || null,
      name: config.user.name,
      email: config.user.email
    };
    writeFileSync(userConfigPath, JSON.stringify(userData, null, 2) + '\n', 'utf-8');
    printSuccess(`mcp.user.json updated at: ${userConfigPath}`);
  } catch {
    // Not critical — pg.config.yml is the source of truth
  }
}

async function syncGuidelinesStep(credentialsPath, databaseUrl, nonInteractive) {
  let shouldSync = true;

  if (!nonInteractive) {
    shouldSync = await confirm('Sync project guidelines from Firebase?', true);
  }

  if (!shouldSync) {
    printInfo('Guidelines sync skipped.');
    return;
  }

  let tempApp;
  try {
    const admin = (await import('firebase-admin')).default;

    tempApp = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(credentialsPath, 'utf-8'))),
      databaseURL: databaseUrl
    }, `init-guidelines-${Date.now()}`);

    const db = tempApp.database();
    const result = await syncGuidelines({ force: true, db });

    const parsed = JSON.parse(result.content[0].text);

    if (parsed.synced > 0) {
      printSuccess(`${parsed.synced} guideline(s) synced successfully.`);
      for (const detail of parsed.details || []) {
        if (detail.action !== 'skipped') {
          printInfo(`  → ${detail.targetFile} (${detail.name || detail.configId})`);
        }
      }
    } else if (parsed.errors > 0) {
      printWarning(`Guidelines sync completed with ${parsed.errors} error(s).`);
    } else {
      printInfo('No guidelines found in Firebase. You can add them later.');
    }
  } catch (err) {
    printWarning(`Could not sync guidelines: ${err.message}`);
    printInfo('You can sync later with the sync_guidelines MCP tool.');
  } finally {
    if (tempApp) {
      try { await tempApp.delete(); } catch { /* ignore cleanup errors */ }
    }
  }
}

/**
 * Decide how the MCP should be invoked from ~/.claude.json.
 *
 * If the module lives inside a node_modules/ tree (global, local or npx
 * cache install) we register it by binary name so the path stays portable.
 * Otherwise we are running from source and need an absolute path.
 *
 * The check uses the module dir (resolved by Node from symlinks) rather
 * than process.argv[1], which on globally-installed binaries can point to
 * /usr/local/bin/<bin> without "node_modules" in its path and would force
 * the wrong branch.
 *
 * @param {string} moduleDir Directory of this file, typically import.meta.dirname.
 * @returns {{ command: string, args: string[] }}
 */
export function resolveMcpRegistration(moduleDir) {
  // Split on both POSIX and Windows separators so the check works whether
  // moduleDir came from import.meta.dirname (native sep) or from a test
  // fixture using forward slashes.
  const installed = moduleDir.split(/[/\\]/).includes('node_modules');
  if (installed) {
    return { command: 'planning-game-mcp', args: [] };
  }
  return {
    command: 'node',
    args: [resolve(moduleDir, '..', 'index.js')]
  };
}

async function offerClaudeRegistration(config, instanceDir) {
  const register = await confirm('Register this MCP in Claude Code (~/.claude.json)?', true);
  if (!register) return;

  try {
    const homedir = process.env.HOME || process.env.USERPROFILE;
    const claudeConfigPath = resolve(homedir, '.claude.json');

    let claudeConfig = {};
    if (existsSync(claudeConfigPath)) {
      claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
    }

    if (!claudeConfig.mcpServers) {
      claudeConfig.mcpServers = {};
    }

    const serverName = config.mcp.serverName;
    const credentialsInInstance = resolve(instanceDir, 'serviceAccountKey.json');

    const { command, args } = resolveMcpRegistration(import.meta.dirname);

    claudeConfig.mcpServers[serverName] = {
      type: 'stdio',
      command,
      args,
      env: {
        MCP_INSTANCE_DIR: instanceDir,
        GOOGLE_APPLICATION_CREDENTIALS: credentialsInInstance
      }
    };

    writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2) + '\n', 'utf-8');
    printSuccess(`Registered "${serverName}" in ${claudeConfigPath}`);
    printInfo(`Instance dir: ${instanceDir}`);
  } catch (err) {
    printWarning(`Could not update Claude config: ${err.message}`);
    printInfo('You can register manually with: claude mcp add');
  }
}
