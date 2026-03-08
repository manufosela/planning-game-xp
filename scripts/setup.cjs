#!/usr/bin/env node
/**
 * Interactive Setup Script for Planning Game XP
 *
 * This script guides you through the complete setup process:
 * 1. Firebase project configuration
 * 2. Environment variables
 * 3. Microsoft Graph API (for emails)
 * 4. First App Admin
 * 5. Optional: MCP Server installation
 *
 * Usage:
 *   node scripts/setup.js
 *   npm run setup
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_TEMPLATE = {
  client: [
    { key: 'PUBLIC_FIREBASE_API_KEY', desc: 'Firebase API Key', required: true },
    { key: 'PUBLIC_FIREBASE_AUTH_DOMAIN', desc: 'Firebase Auth Domain (ej: tu-proyecto.firebaseapp.com)', required: true },
    { key: 'PUBLIC_FIREBASE_DATABASE_URL', desc: 'Firebase Realtime Database URL', required: true },
    { key: 'PUBLIC_FIREBASE_PROJECT_ID', desc: 'Firebase Project ID', required: true },
    { key: 'PUBLIC_FIREBASE_STORAGE_BUCKET', desc: 'Firebase Storage Bucket (ej: tu-proyecto.firebasestorage.app)', required: true },
    { key: 'PUBLIC_FIREBASE_MESSAGING_SENDER_ID', desc: 'Firebase Messaging Sender ID', required: true },
    { key: 'PUBLIC_FIREBASE_APP_ID', desc: 'Firebase App ID', required: true },
    { key: 'PUBLIC_FIREBASE_MEASUREMENT_ID', desc: 'Firebase Measurement ID (Google Analytics)', required: false },
    { key: 'PUBLIC_FIREBASE_VAPID_KEY', desc: 'Firebase VAPID Key (para push notifications)', required: false },
    { key: 'PUBLIC_SUPER_ADMIN_EMAIL', desc: 'Email del Super Admin', required: true },
    { key: 'PUBLIC_ORG_NAME', desc: 'Nombre de la organización/marca (ej: GENIOVA)', required: false },
    { key: 'PUBLIC_AUTH_PROVIDER', desc: 'Auth provider (google/microsoft/github/gitlab)', required: true, default: 'google' },
  ],
  functions: [
    { key: 'PUBLIC_SUPER_ADMIN_EMAIL', desc: 'Email del Super Admin (mismo que arriba)', required: true },
    { key: 'MS_CLIENT_ID', desc: 'Microsoft Azure Client ID (para emails)', required: false },
    { key: 'MS_CLIENT_SECRET', desc: 'Microsoft Azure Client Secret', required: false },
    { key: 'MS_TENANT_ID', desc: 'Microsoft Azure Tenant ID', required: false },
    { key: 'MS_FROM_EMAIL', desc: 'Email remitente para notificaciones', required: false },
  ]
};

const INSTANCES_DIR = path.join(ROOT_DIR, 'planning-game-instances');

class SetupWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.config = {
      client: {},
      functions: {}
    };
    this.instanceName = null;
    this.instanceDir = null;
  }

  async question(prompt, defaultValue = '') {
    return new Promise((resolve) => {
      const defaultText = defaultValue ? ` [${defaultValue}]` : '';
      this.rl.question(`${prompt}${defaultText}: `, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }

  async confirm(prompt, defaultYes = true) {
    const suffix = defaultYes ? ' [S/n]' : ' [s/N]';
    const answer = await this.question(prompt + suffix);
    if (!answer) return defaultYes;
    return answer.toLowerCase().startsWith('s') || answer.toLowerCase().startsWith('y');
  }

  print(msg) {
    console.log(msg);
  }

  printHeader(title) {
    console.log('\n' + '='.repeat(60));
    console.log(`  ${title}`);
    console.log('='.repeat(60) + '\n');
  }

  printStep(step, total, description) {
    console.log(`\n[${step}/${total}] ${description}\n`);
  }

  async run() {
    this.printHeader('🎮 Planning Game XP - Setup Wizard');
    this.print('Este asistente te guiará a través de la configuración completa.\n');
    this.print('Necesitarás:');
    this.print('  - Un proyecto de Firebase creado');
    this.print('  - (Opcional) Credenciales de Microsoft Azure para emails');
    this.print('  - (Opcional) API Key de OpenAI para IA\n');

    if (!await this.confirm('¿Deseas continuar?')) {
      this.print('\nSetup cancelado.');
      this.rl.close();
      return;
    }

    const totalSteps = 9;

    // Step 1: Instance name
    this.printStep(1, totalSteps, 'Nombre de la instancia');
    await this.configureInstance();

    // Step 2: Check prerequisites
    this.printStep(2, totalSteps, 'Verificando prerequisitos...');
    await this.checkPrerequisites();

    // Step 3: Auth provider selection
    this.printStep(3, totalSteps, 'Selección de proveedor de autenticación');
    await this.configureAuth();

    // Step 4: Firebase configuration
    this.printStep(4, totalSteps, 'Configuración de Firebase');
    await this.configureFirebase();

    // Step 5: Environment files
    this.printStep(5, totalSteps, 'Generando archivos de entorno');
    await this.generateEnvFiles();

    // Step 6: Email service (optional)
    this.printStep(6, totalSteps, 'Configuración de servicio de emails (opcional)');
    await this.configureMicrosoftGraph();

    // Step 7: Deploy
    this.printStep(7, totalSteps, 'Despliegue inicial');
    await this.deploy();

    // Step 8: First App Admin
    this.printStep(8, totalSteps, 'Configuración del primer App Admin');
    await this.setupFirstAdmin();

    // Step 9: MCP Server (optional)
    this.printStep(9, totalSteps, 'MCP Server (opcional)');
    await this.setupMCP();

    // Done
    this.printHeader('✅ Setup completado!');
    this.printNextSteps();

    this.rl.close();
  }

  async configureInstance() {
    this.print('Cada despliegue de Planning Game necesita un nombre de instancia.');
    this.print('Ejemplos: "personal", "mi-empresa", "geniova"\n');

    let name = '';
    while (!name) {
      name = await this.question('Nombre de la instancia (minúsculas, sin espacios)');
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        this.print('  El nombre debe ser alfanumérico en minúsculas con guiones (ej: "mi-empresa")');
        name = '';
      }
    }

    this.instanceName = name;
    this.instanceDir = path.join(INSTANCES_DIR, name);

    // Create the instance directory
    if (!fs.existsSync(this.instanceDir)) {
      fs.mkdirSync(path.join(this.instanceDir, 'functions'), { recursive: true });
      fs.mkdirSync(path.join(this.instanceDir, 'emulator-data'), { recursive: true });
      this.print(`\n  Creado: planning-game-instances/${name}/`);
    } else {
      this.print(`\n  La instancia "${name}" ya existe, se actualizará.`);
    }
  }

  async checkPrerequisites() {
    const checks = [
      { name: 'Node.js', cmd: 'node --version', required: true },
      { name: 'npm', cmd: 'npm --version', required: true },
      { name: 'Firebase CLI', cmd: 'firebase --version', required: true },
      { name: 'gcloud CLI', cmd: 'gcloud --version', required: false },
    ];

    let allPassed = true;

    for (const check of checks) {
      try {
        const version = execSync(check.cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n')[0];
        this.print(`  ✅ ${check.name}: ${version}`);
      } catch {
        if (check.required) {
          this.print(`  ❌ ${check.name}: NO ENCONTRADO (requerido)`);
          allPassed = false;
        } else {
          this.print(`  ⚠️  ${check.name}: no encontrado (opcional)`);
        }
      }
    }

    if (!allPassed) {
      this.print('\n❌ Faltan prerequisitos requeridos. Instálalos antes de continuar.');
      this.print('\nPara instalar Firebase CLI: npm install -g firebase-tools');
      process.exit(1);
    }
  }

  async configureAuth() {
    this.print('Elige el proveedor de autenticación OAuth.\n');
    this.print('  1. Google (recomendado - más fácil de configurar)');
    this.print('  2. Microsoft (Azure AD - para organizaciones Microsoft 365)');
    this.print('  3. GitHub (para equipos de desarrollo)');
    this.print('  4. GitLab (OIDC - para instancias self-hosted)\n');

    const choice = await this.question('Selecciona [1-4]', '1');
    const providers = { '1': 'google', '2': 'microsoft', '3': 'github', '4': 'gitlab' };
    const provider = providers[choice] || 'google';

    this.config.client['PUBLIC_AUTH_PROVIDER'] = provider;

    const instructions = {
      google: [
        '  → Ve a Firebase Console → Authentication → Sign-in method',
        '  → Habilita "Google" como proveedor',
        '  → No necesitas configuración adicional'
      ],
      microsoft: [
        '  → Crea una App Registration en Azure Portal',
        '  → Configura redirect URI: https://tu-proyecto.firebaseapp.com/__/auth/handler',
        '  → Habilita Microsoft en Firebase Console → Authentication → Sign-in method'
      ],
      github: [
        '  → Ve a GitHub Settings → Developer settings → OAuth Apps → New OAuth App',
        '  → Authorization callback URL: https://tu-proyecto.firebaseapp.com/__/auth/handler',
        '  → Habilita GitHub en Firebase Console con Client ID y Secret'
      ],
      gitlab: [
        '  → Configura OIDC en tu instancia GitLab',
        '  → Habilita OpenID Connect en Firebase Console → Authentication → Sign-in method'
      ]
    };

    this.print(`\nProveedor seleccionado: ${provider.toUpperCase()}`);
    this.print('Instrucciones para configurar en Firebase:\n');
    instructions[provider].forEach(line => this.print(line));

    if (provider === 'gitlab') {
      const issuer = await this.question('\n  URL de tu instancia GitLab', 'https://gitlab.com');
      this.config.client['PUBLIC_GITLAB_ISSUER_URL'] = issuer;
    }

    this.print('');
  }

  async configureFirebase() {
    this.print('Necesitas los datos de configuración de tu proyecto Firebase.');
    this.print('Los encuentras en: Firebase Console → Project Settings → Your apps\n');

    // Check if already logged in
    try {
      execSync('firebase projects:list', { stdio: 'pipe' });
      this.print('✅ Ya estás autenticado en Firebase\n');
    } catch {
      this.print('Necesitas autenticarte en Firebase...\n');
      if (await this.confirm('¿Ejecutar firebase login?')) {
        execSync('firebase login', { stdio: 'inherit' });
      }
    }

    // Get Firebase config values
    for (const item of ENV_TEMPLATE.client) {
      const value = await this.question(`  ${item.desc}${item.required ? ' *' : ''}`);
      if (item.required && !value) {
        this.print(`    ⚠️  Este campo es requerido`);
        const retry = await this.question(`  ${item.desc} *`);
        this.config.client[item.key] = retry;
      } else {
        this.config.client[item.key] = value;
      }
    }

    // Copy super admin email to functions config
    this.config.functions['PUBLIC_SUPER_ADMIN_EMAIL'] = this.config.client['PUBLIC_SUPER_ADMIN_EMAIL'];
  }

  async generateEnvFiles() {
    const targetDir = this.instanceDir || ROOT_DIR;
    const environments = ['dev', 'pre', 'prod'];

    for (const env of environments) {
      const envPath = path.join(targetDir, `.env.${env}`);
      let content = '# Firebase Configuration\n';

      for (const [key, value] of Object.entries(this.config.client)) {
        if (value) {
          content += `${key}=${value}\n`;
        }
      }

      // Add emulator config for dev
      if (env === 'dev') {
        content += '\n# Emulators (development only)\n';
        content += 'USE_FIREBASE_EMULATOR=true\n';
        content += 'FIREBASE_DATABASE_EMULATOR_HOST=localhost:9001\n';
        content += 'FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199\n';
        content += 'FIRESTORE_EMULATOR_HOST=localhost:8081\n';
      }

      fs.writeFileSync(envPath, content);
      this.print(`  ✅ Creado: .env.${env}`);
    }

    // Functions .env
    const functionsDir = path.join(targetDir, 'functions');
    if (!fs.existsSync(functionsDir)) {
      fs.mkdirSync(functionsDir, { recursive: true });
    }
    const functionsEnvPath = path.join(functionsDir, '.env');
    let functionsContent = '# Cloud Functions Environment\n';
    for (const [key, value] of Object.entries(this.config.functions)) {
      if (value) {
        functionsContent += `${key}=${value}\n`;
      }
    }
    fs.writeFileSync(functionsEnvPath, functionsContent);
    this.print(`  ✅ Creado: functions/.env`);

    // Generate .firebaserc in the instance directory
    if (this.instanceDir) {
      const projectId = this.config.client['PUBLIC_FIREBASE_PROJECT_ID'];
      if (projectId) {
        const firebaserc = {
          projects: { default: projectId },
          targets: {
            [projectId]: {
              database: {
                main: [`${projectId}-default-rtdb`],
                tests: [`${projectId}-tests-rtdb`]
              }
            }
          }
        };
        fs.writeFileSync(
          path.join(this.instanceDir, '.firebaserc'),
          JSON.stringify(firebaserc, null, 2) + '\n'
        );
        this.print(`  ✅ Creado: .firebaserc`);
      }

      // Copy rule templates
      const rulesCopies = [
        { src: 'database.rules.example.json', dest: 'database.rules.json' },
        { src: 'storage.rules.example', dest: 'storage.rules' },
      ];
      for (const rule of rulesCopies) {
        const srcPath = path.join(ROOT_DIR, rule.src);
        const destPath = path.join(this.instanceDir, rule.dest);
        if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
          this.print(`  ✅ Copiado: ${rule.dest}`);
        }
      }

      // Activate the instance
      this.print(`\n  Activando instancia "${this.instanceName}"...`);
      try {
        execSync(`node scripts/instance-manager.cjs use ${this.instanceName}`, {
          stdio: 'inherit',
          cwd: ROOT_DIR
        });
      } catch (error) {
        this.print(`  ⚠️  Error activando instancia: ${error.message}`);
        this.print(`  Ejecuta después: npm run instance:use -- ${this.instanceName}`);
      }
    }
  }

  async configureMicrosoftGraph() {
    this.print('Microsoft Graph permite enviar emails de notificación.');
    this.print('Si no lo configuras ahora, las notificaciones por email no funcionarán.\n');

    if (!await this.confirm('¿Deseas configurar Microsoft Graph?', false)) {
      this.print('  ⏭️  Saltando configuración de Microsoft Graph');
      return;
    }

    this.print('\nNecesitas crear una App Registration en Azure Portal:');
    this.print('  1. Ir a portal.azure.com');
    this.print('  2. Azure Active Directory → App registrations');
    this.print('  3. New registration\n');

    for (const item of ENV_TEMPLATE.functions.filter(i => i.key.startsWith('MS_'))) {
      const value = await this.question(`  ${item.desc}`);
      this.config.functions[item.key] = value;
    }

    // Update functions .env
    const targetDir = this.instanceDir || ROOT_DIR;
    const functionsEnvPath = path.join(targetDir, 'functions', '.env');
    let content = fs.readFileSync(functionsEnvPath, 'utf8');
    for (const [key, value] of Object.entries(this.config.functions)) {
      if (value && key.startsWith('MS_')) {
        content += `${key}=${value}\n`;
      }
    }
    fs.writeFileSync(functionsEnvPath, content);
    this.print('  ✅ Configuración de Microsoft Graph guardada');
  }

  async deploy() {
    this.print('Ahora se desplegará la aplicación a Firebase.\n');

    if (!await this.confirm('¿Deseas desplegar ahora?')) {
      this.print('  ⏭️  Puedes desplegar manualmente después con: npm run deploy');
      return;
    }

    const projectId = this.config.client['PUBLIC_FIREBASE_PROJECT_ID'];

    try {
      this.print('\n  Seleccionando proyecto Firebase...');
      execSync(`firebase use ${projectId}`, { stdio: 'inherit', cwd: ROOT_DIR });

      this.print('\n  Desplegando reglas de base de datos...');
      execSync('npm run deploy:rules', { stdio: 'inherit', cwd: ROOT_DIR });

      this.print('\n  Desplegando Cloud Functions...');
      execSync('npm run deploy:functions', { stdio: 'inherit', cwd: ROOT_DIR });

      this.print('\n  Construyendo aplicación...');
      execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });

      this.print('\n  Desplegando hosting...');
      execSync('npm run deploy:hosting', { stdio: 'inherit', cwd: ROOT_DIR });

      this.print('\n  ✅ Despliegue completado!');
    } catch (error) {
      this.print(`\n  ❌ Error en el despliegue: ${error.message}`);
      this.print('  Puedes intentar desplegar manualmente después.');
    }
  }

  async setupFirstAdmin() {
    const superAdminEmail = this.config.client['PUBLIC_SUPER_ADMIN_EMAIL'];

    this.print(`El primer App Admin será: ${superAdminEmail}\n`);

    if (!await this.confirm('¿Configurar este usuario como App Admin?')) {
      this.print('  ⏭️  Puedes hacerlo después con: npm run setup:app-admin -- email@example.com');
      return;
    }

    try {
      // Check if gcloud is authenticated
      try {
        execSync('gcloud auth application-default print-access-token', { stdio: 'pipe' });
      } catch {
        this.print('\n  Necesitas autenticarte con gcloud...');
        execSync('gcloud auth application-default login', { stdio: 'inherit' });
      }

      execSync(`node scripts/setup-app-admin.js ${superAdminEmail}`, {
        stdio: 'inherit',
        cwd: ROOT_DIR
      });
    } catch (error) {
      this.print(`\n  ⚠️  No se pudo configurar el App Admin automáticamente.`);
      this.print(`  Ejecuta después: npm run setup:app-admin -- ${superAdminEmail}`);
    }
  }

  async setupMCP() {
    this.print('El MCP Server permite gestionar el proyecto desde Claude Code.');
    this.print('Se registrará como "planning-game-' + (this.instanceName || 'default') + '".\n');

    if (!await this.confirm('¿Deseas instalar el MCP Server?', false)) {
      this.print('  ⏭️  Puedes instalarlo después con: npm run setup:mcp');
      return;
    }

    const mcpDir = path.join(ROOT_DIR, 'mcp');
    const instanceDir = this.instanceDir || ROOT_DIR;
    const instanceName = this.instanceName || 'default';
    const serverName = `planning-game-${instanceName}`;

    // Step 1: Install MCP dependencies
    this.print('\n  Instalando dependencias del MCP...');
    try {
      execSync('npm install --ignore-scripts', { stdio: 'pipe', cwd: mcpDir });
      this.print('  ✅ Dependencias instaladas');
    } catch (error) {
      this.print(`  ❌ Error instalando dependencias: ${error.message}`);
      this.print('  Ejecuta manualmente: cd mcp && npm install');
      return;
    }

    // Step 2: Verify serviceAccountKey.json
    const keyPath = path.join(instanceDir, 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) {
      this.print(`\n  ⚠️  No se encontró serviceAccountKey.json en ${instanceDir}`);
      this.print('  Para obtenerlo:');
      this.print('    1. Ve a Firebase Console > Project Settings > Service Accounts');
      this.print('    2. Haz clic en "Generate new private key"');
      this.print(`    3. Guarda el archivo como: ${keyPath}`);
      this.print(`    4. Después ejecuta: npm run setup:mcp`);
      return;
    }
    this.print('  ✅ serviceAccountKey.json encontrado');

    // Step 3: Read project ID and build database URL
    let projectId;
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      projectId = serviceAccount.project_id;
    } catch (error) {
      this.print(`  ❌ Error leyendo serviceAccountKey.json: ${error.message}`);
      return;
    }

    // Try to get database URL from .env files or derive from project ID
    let databaseURL = '';
    const envDevPath = path.join(instanceDir, '.env.dev');
    const envProdPath = path.join(instanceDir, '.env.prod');
    for (const envPath of [envProdPath, envDevPath]) {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/PUBLIC_FIREBASE_DATABASE_URL=(.+)/);
        if (match) {
          databaseURL = match[1].trim();
          break;
        }
      }
    }
    if (!databaseURL) {
      databaseURL = `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`;
      this.print(`  ℹ️  Database URL derivada: ${databaseURL}`);
      const customUrl = await this.question('  ¿URL correcta? (Enter para aceptar, o escribe otra)', databaseURL);
      databaseURL = customUrl;
    }

    // Step 4: Register MCP server with Claude Code CLI
    this.print(`\n  Registrando MCP server como "${serverName}"...`);
    const mcpIndexPath = path.join(mcpDir, 'index.js');

    try {
      // Check if claude CLI is available
      execSync('which claude', { stdio: 'pipe' });
    } catch {
      this.print('  ⚠️  Claude CLI no encontrado. Registra manualmente:');
      this.printManualMcpConfig(serverName, mcpIndexPath, instanceDir, keyPath, databaseURL);
      return;
    }

    try {
      // Remove existing entry if present (to allow re-registration)
      try {
        execSync(`claude mcp remove "${serverName}" -s user`, { stdio: 'pipe' });
      } catch {
        // Ignore — may not exist yet
      }

      const addCmd = [
        'claude', 'mcp', 'add',
        '-e', `MCP_INSTANCE_DIR=${instanceDir}`,
        '-e', `GOOGLE_APPLICATION_CREDENTIALS=${keyPath}`,
        '-e', `FIREBASE_DATABASE_URL=${databaseURL}`,
        '-s', 'user',
        `"${serverName}"`,
        '--', 'node', `"${mcpIndexPath}"`
      ].join(' ');

      execSync(addCmd, { stdio: 'pipe', cwd: ROOT_DIR });
      this.print(`  ✅ MCP server "${serverName}" registrado en Claude Code`);
    } catch (error) {
      this.print(`  ⚠️  Error registrando MCP: ${error.message}`);
      this.print('  Registra manualmente:');
      this.printManualMcpConfig(serverName, mcpIndexPath, instanceDir, keyPath, databaseURL);
      return;
    }

    // Step 5: Configure mcp.user.json (developer identity)
    const { setupMcpUser } = require('./setup-mcp-helpers.cjs');
    await setupMcpUser({
      question: (prompt, defaultValue) => this.question(prompt, defaultValue),
      print: (msg) => this.print(msg),
      instanceDir,
      keyPath,
      databaseURL
    });

    // Step 6: Run smoke test
    this.print('\n  Ejecutando test de verificación...');
    try {
      const smokeResult = execSync('node mcp/scripts/smoke-test.js', {
        stdio: 'pipe',
        cwd: ROOT_DIR,
        env: {
          ...process.env,
          MCP_INSTANCE_DIR: instanceDir,
          GOOGLE_APPLICATION_CREDENTIALS: keyPath,
          FIREBASE_DATABASE_URL: databaseURL,
        }
      });
      this.print(smokeResult.toString());
      this.print('  ✅ MCP Server verificado correctamente');
    } catch (error) {
      this.print(`  ⚠️  El test de verificación falló.`);
      this.print('  Puedes reintentar con: npm run mcp:test');
    }
  }

  printManualMcpConfig(serverName, mcpIndexPath, instanceDir, keyPath, databaseURL) {
    this.print(`\n  claude mcp add \\`);
    this.print(`    -e MCP_INSTANCE_DIR=${instanceDir} \\`);
    this.print(`    -e GOOGLE_APPLICATION_CREDENTIALS=${keyPath} \\`);
    this.print(`    -e FIREBASE_DATABASE_URL=${databaseURL} \\`);
    this.print(`    -s user "${serverName}" -- node "${mcpIndexPath}"\n`);
  }

  printNextSteps() {
    this.print('Próximos pasos:\n');
    this.print('  1. Inicia sesión en la aplicación con el email del Super Admin');
    this.print('  2. Cierra sesión y vuelve a entrar para cargar los permisos');
    this.print('  3. Ve a la sección de Apps para gestionar aplicaciones\n');
    this.print('Comandos útiles:\n');
    this.print('  npm run dev              # Iniciar en desarrollo');
    this.print('  npm run emulator         # Iniciar emuladores de Firebase');
    this.print('  npm run build            # Construir para producción');
    this.print('  npm run deploy           # Desplegar a Firebase');
    this.print('  npm run instance:list    # Ver instancias disponibles');
    this.print('  npm run instance:current # Ver instancia activa\n');
    this.print('Documentación:\n');
    this.print('  README.md            # Visión general');
    this.print('  INSTALL.md           # Guía de instalación detallada');
    this.print('  ENV_VARIABLES.md     # Variables de entorno');
    this.print('  CLAUDE.md            # Guía para desarrollo con IA\n');
  }
}

// Run the wizard
const wizard = new SetupWizard();
wizard.run().catch(console.error);
