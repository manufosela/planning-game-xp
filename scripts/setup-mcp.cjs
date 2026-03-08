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

const { setupMcpUser } = require('./setup-mcp-helpers.cjs');

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
  await setupMcpUser({
    question: (prompt, defaultValue) => question(rl, prompt, defaultValue),
    print,
    instanceDir,
    keyPath,
    databaseURL
  });

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
