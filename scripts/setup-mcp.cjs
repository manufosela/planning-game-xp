#!/usr/bin/env node
/**
 * Standalone MCP Setup Script
 *
 * Registers a Planning Game MCP instance in Claude Code with a unique name
 * derived from the instance directory name (e.g. "planning-game-personal").
 *
 * Usage:
 *   npm run setup:mcp                 # Uses active instance
 *   npm run setup:mcp -- my-instance  # Uses specified instance
 *   node scripts/setup-mcp.cjs [instanceName]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const INSTANCES_DIR = path.join(ROOT_DIR, 'planning-game-instances');
const MCP_DIR = path.join(ROOT_DIR, 'mcp');
const MCP_INDEX = path.join(MCP_DIR, 'index.js');

function print(msg) {
  console.log(msg);
}

function question(rl, prompt, defaultValue = '') {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${prompt}${defaultText}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Detect the active instance from .last-instance file.
 */
function getActiveInstance() {
  const lastInstanceFile = path.join(ROOT_DIR, '.last-instance');
  if (fs.existsSync(lastInstanceFile)) {
    return fs.readFileSync(lastInstanceFile, 'utf8').trim();
  }
  return null;
}

/**
 * List available instances.
 */
function listInstances() {
  if (!fs.existsSync(INSTANCES_DIR)) return [];
  return fs.readdirSync(INSTANCES_DIR).filter(name => {
    const dir = path.join(INSTANCES_DIR, name);
    return fs.statSync(dir).isDirectory() && name !== 'example';
  });
}

/**
 * Fetch users from centralized /users/ model in Firebase RTDB.
 * Returns an array of { devId, stakeholderId, name, email }.
 * Falls back to /projects/ if /users/ is empty (legacy).
 */
async function fetchUsers(keyPath, databaseURL) {
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    return null; // firebase-admin not available
  }

  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const app = admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL
  }, 'setup-mcp-user-' + Date.now());

  try {
    const db = app.database();

    // Try centralized /users/ model first
    const usersSnapshot = await db.ref('/users').once('value');
    const usersData = usersSnapshot.val();

    if (usersData) {
      const users = [];
      for (const [, userData] of Object.entries(usersData)) {
        if (!userData || typeof userData !== 'object') continue;
        if (!userData.developerId) continue;
        if (userData.active === false) continue;
        users.push({
          devId: userData.developerId,
          stakeholderId: userData.stakeholderId || null,
          name: userData.name || '',
          email: (userData.email || '').toLowerCase()
        });
      }
      if (users.length > 0) return users;
    }

    // Fallback: read from /projects/ (legacy, no stakeholder info)
    const projSnapshot = await db.ref('/projects').once('value');
    const projects = projSnapshot.val();
    if (!projects) return [];

    const users = [];
    const seen = new Set();
    for (const [, projData] of Object.entries(projects)) {
      const devs = projData.developers || {};
      for (const [devId, devData] of Object.entries(devs)) {
        if (seen.has(devId)) continue;
        seen.add(devId);
        if (devData && typeof devData === 'object') {
          users.push({
            devId,
            stakeholderId: null,
            name: devData.name || devData.displayName || '',
            email: (devData.email || '').toLowerCase()
          });
        }
      }
    }
    return users;
  } finally {
    await app.delete();
  }
}

/**
 * Setup mcp.user.json during MCP installation.
 */
async function setupMcpUser(rl, instanceDir, keyPath, databaseURL) {
  const mcpUserPath = path.join(instanceDir, 'mcp.user.json');

  print('\n=== Configuracion de identidad MCP ===\n');

  // Check existing config
  if (fs.existsSync(mcpUserPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(mcpUserPath, 'utf8'));
      print(`Configuracion actual encontrada:`);
      print(`  Developer: ${existing.name || existing.developerName || 'N/A'} (${existing.developerId || 'N/A'})`);
      print(`  Email: ${existing.email || existing.developerEmail || 'N/A'}`);
      if (existing.stakeholderId) print(`  Stakeholder: ${existing.stakeholderId}`);
      const update = await question(rl, 'Actualizar configuracion? (s/N)', 'N');
      if (update.toLowerCase() !== 's') {
        print('  Manteniendo configuracion actual.');
        return;
      }
    } catch {
      // Corrupted file, regenerate
    }
  }

  // Ask for email
  const email = await question(rl, 'Tu email de desarrollador');
  if (!email) {
    print('  Email vacio, saltando configuracion de identidad.');
    return;
  }

  // Try to find user in Firebase
  let matchedUser = null;
  print('  Buscando usuario en Firebase...');

  try {
    const users = await fetchUsers(keyPath, databaseURL);
    if (users && users.length > 0) {
      const normalizedEmail = email.toLowerCase().trim();
      matchedUser = users.find(d => d.email === normalizedEmail);

      if (matchedUser) {
        const stkLabel = matchedUser.stakeholderId ? `, stakeholder: ${matchedUser.stakeholderId}` : '';
        print(`  Encontrado: ${matchedUser.name} (${matchedUser.devId}${stkLabel})`);
      } else {
        print('  Email no encontrado en la lista de usuarios.');
        print('  Usuarios disponibles:');
        for (const u of users) {
          const stkLabel = u.stakeholderId ? `, ${u.stakeholderId}` : '';
          print(`    ${u.devId}: ${u.name} (${u.email || 'sin email'}${stkLabel})`);
        }
        const devId = await question(rl, 'Introduce tu developer ID (ej: dev_001)');
        if (devId) {
          const found = users.find(u => u.devId === devId);
          matchedUser = {
            devId,
            stakeholderId: found ? found.stakeholderId : null,
            name: found ? found.name : '',
            email: normalizedEmail
          };
        }
      }
    }
  } catch (error) {
    print(`  No se pudo conectar a Firebase: ${error.message}`);
    print('  Puedes configurar manualmente mas tarde.');
  }

  if (!matchedUser) {
    const devId = await question(rl, 'Developer ID (ej: dev_001)');
    const name = await question(rl, 'Tu nombre');
    if (devId) {
      matchedUser = { devId, stakeholderId: null, name, email: email.toLowerCase().trim() };
    }
  }

  if (matchedUser) {
    const userData = {
      developerId: matchedUser.devId,
      stakeholderId: matchedUser.stakeholderId || null,
      name: matchedUser.name,
      email: matchedUser.email || email.toLowerCase().trim()
    };
    fs.writeFileSync(mcpUserPath, JSON.stringify(userData, null, 2) + '\n');
    print(`  mcp.user.json generado en: ${mcpUserPath}`);
    print(`  Developer: ${userData.name} (${userData.developerId})`);
    if (userData.stakeholderId) {
      print(`  Stakeholder: ${userData.stakeholderId}`);
    }
  } else {
    print('  Saltando generacion de mcp.user.json.');
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  print('\n=== Planning Game MCP - Setup ===\n');

  // Determine instance name
  let instanceName = process.argv[2];

  if (!instanceName) {
    const active = getActiveInstance();
    const instances = listInstances();

    if (instances.length === 0) {
      print('No se encontraron instancias en planning-game-instances/.');
      print('Ejecuta primero: npm run setup');
      rl.close();
      process.exit(1);
    }

    if (instances.length === 1) {
      instanceName = instances[0];
      print(`Instancia detectada: ${instanceName}`);
    } else {
      print('Instancias disponibles:');
      instances.forEach((name, i) => {
        const marker = name === active ? ' (activa)' : '';
        print(`  ${i + 1}. ${name}${marker}`);
      });
      print('');

      const choice = await question(rl, 'Selecciona instancia (número o nombre)', active || '');
      const num = parseInt(choice, 10);
      if (num >= 1 && num <= instances.length) {
        instanceName = instances[num - 1];
      } else if (instances.includes(choice)) {
        instanceName = choice;
      } else {
        print(`Instancia "${choice}" no encontrada.`);
        rl.close();
        process.exit(1);
      }
    }
  }

  const instanceDir = path.join(INSTANCES_DIR, instanceName);
  if (!fs.existsSync(instanceDir)) {
    print(`Error: directorio ${instanceDir} no existe.`);
    rl.close();
    process.exit(1);
  }

  const serverName = `planning-game-${instanceName}`;
  print(`\nConfigurando MCP server: ${serverName}`);
  print(`Instancia: ${instanceDir}\n`);

  // Install MCP dependencies
  print('Instalando dependencias del MCP...');
  try {
    execSync('npm install --ignore-scripts', { stdio: 'pipe', cwd: MCP_DIR });
    print('  OK: dependencias instaladas');
  } catch (error) {
    print(`  Error: ${error.message}`);
    print('  Ejecuta: cd mcp && npm install');
    rl.close();
    process.exit(1);
  }

  // Check serviceAccountKey.json
  const keyPath = path.join(instanceDir, 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    print(`\nNo se encontro serviceAccountKey.json en ${instanceDir}`);
    print('Para obtenerlo:');
    print('  1. Firebase Console > Project Settings > Service Accounts');
    print('  2. "Generate new private key"');
    print(`  3. Guardar como: ${keyPath}`);
    print('  4. Ejecutar: npm run setup:mcp');
    rl.close();
    process.exit(1);
  }
  print('  OK: serviceAccountKey.json encontrado');

  // Read project ID
  let projectId;
  try {
    const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    projectId = sa.project_id;
    print(`  OK: proyecto Firebase: ${projectId}`);
  } catch (error) {
    print(`  Error leyendo serviceAccountKey.json: ${error.message}`);
    rl.close();
    process.exit(1);
  }

  // Determine database URL
  let databaseURL = '';
  for (const envFile of ['.env.prod', '.env.dev']) {
    const envPath = path.join(instanceDir, envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/PUBLIC_FIREBASE_DATABASE_URL=(.+)/);
      if (match) {
        databaseURL = match[1].trim();
        break;
      }
    }
  }
  if (!databaseURL) {
    databaseURL = `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`;
  }

  const confirmedUrl = await question(rl, 'Database URL', databaseURL);
  databaseURL = confirmedUrl;

  // Register with Claude Code CLI
  print(`\nRegistrando MCP server "${serverName}"...`);

  let claudeAvailable = true;
  try {
    execSync('which claude', { stdio: 'pipe' });
  } catch {
    claudeAvailable = false;
  }

  if (claudeAvailable) {
    try {
      // Remove existing entry
      try {
        execSync(`claude mcp remove "${serverName}" -s user`, { stdio: 'pipe' });
      } catch { /* may not exist */ }

      const addCmd = [
        'claude', 'mcp', 'add',
        '-e', `MCP_INSTANCE_DIR=${instanceDir}`,
        '-e', `GOOGLE_APPLICATION_CREDENTIALS=${keyPath}`,
        '-e', `FIREBASE_DATABASE_URL=${databaseURL}`,
        '-s', 'user',
        `"${serverName}"`,
        '--', 'node', `"${MCP_INDEX}"`
      ].join(' ');

      execSync(addCmd, { stdio: 'pipe', cwd: ROOT_DIR });
      print(`  OK: "${serverName}" registrado en Claude Code`);
    } catch (error) {
      print(`  Error registrando: ${error.message}`);
      claudeAvailable = false;
    }
  }

  if (!claudeAvailable) {
    print('\nClaude CLI no disponible. Registra manualmente:');
    print(`  claude mcp add \\`);
    print(`    -e MCP_INSTANCE_DIR=${instanceDir} \\`);
    print(`    -e GOOGLE_APPLICATION_CREDENTIALS=${keyPath} \\`);
    print(`    -e FIREBASE_DATABASE_URL=${databaseURL} \\`);
    print(`    -s user "${serverName}" -- node "${MCP_INDEX}"`);
  }

  // Configure mcp.user.json
  await setupMcpUser(rl, instanceDir, keyPath, databaseURL);

  // Run smoke test
  print('\nEjecutando test de verificacion...');
  try {
    const result = execSync('node mcp/scripts/smoke-test.js', {
      stdio: 'pipe',
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        MCP_INSTANCE_DIR: instanceDir,
        GOOGLE_APPLICATION_CREDENTIALS: keyPath,
        FIREBASE_DATABASE_URL: databaseURL,
      }
    });
    print(result.toString());
  } catch (error) {
    print('  El test de verificacion fallo. Reintenta con: npm run mcp:test');
  }

  print('Setup MCP completado.\n');
  rl.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
