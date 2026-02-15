#!/usr/bin/env node
/**
 * Interactive Setup Script for Planning Game XP
 *
 * This script guides you through the complete setup process:
 * 1. Firebase project configuration
 * 2. Environment variables
 * 3. Microsoft Graph API (for emails)
 * 4. First App Admin
 * 5. MCP Server installation (multi-instance)
 *
 * Usage:
 *   node scripts/setup.cjs
 *   npm run setup
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { execSync, spawn } = require('child_process');
const { McpInstanceManager } = require('./mcp-instance-manager.cjs');
const { InstallStateManager } = require('./install-state-manager.cjs');
const { KjInstanceManager } = require('./kj-instance-manager.cjs');
const { detectExistingState } = require('./setup-existing-state.cjs');
const { buildSetupBriefingLines, detectFirebaseCliInstalled } = require('./setup-briefing.cjs');
const { parseFirebaseWebConfigInput } = require('./firebase-web-config-parser.cjs');
const { shouldFinalizeMultilineInput } = require('./multiline-input-helpers.cjs');
const { formatStepHeader } = require('./setup-ui-formatters.cjs');
const { collectMultilineInput } = require('./readline-multiline.cjs');
const { checkFirestoreEnabled } = require('./firestore-status-checker.cjs');
const { checkFunctionsEnabled } = require('./functions-status-checker.cjs');
const { buildPreEnvironmentGuidance, shouldConfigurePreNowByDefault } = require('./pre-environment-guidance.cjs');

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
const REQUIRED_FIREBASE_CLIENT_KEYS = [
  'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_AUTH_DOMAIN',
  'PUBLIC_FIREBASE_DATABASE_URL',
  'PUBLIC_FIREBASE_PROJECT_ID',
  'PUBLIC_FIREBASE_STORAGE_BUCKET',
  'PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'PUBLIC_FIREBASE_APP_ID',
];

class SetupWizard {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.config = {
      client: {},
      functions: {},
      orgName: '',
      preClient: null
    };
    this.mcpInstalled = false;
    this.mcpInstanceName = null;
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

  async questionMultiline(prompt, endToken = 'END') {
    this.print(prompt);
    this.print('Pega el bloque y pulsa Enter en una línea vacía para continuar.');
    this.print(`(Opcional: también puedes escribir ${endToken} en una línea aparte)\n`);
    this.rl.setPrompt('  > ');
    return collectMultilineInput(this.rl, {
      endToken,
      shouldFinalize: ({ line, lines, endToken: finalToken }) => shouldFinalizeMultilineInput({
        line,
        lines,
        endToken: finalToken,
        validator: parseFirebaseWebConfigInput,
      }),
    });
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
    console.log('');
    formatStepHeader(step, total, description).forEach((line) => console.log(line));
    console.log('');
  }

  async run() {
    this.printHeader('Planning Game XP - Setup Wizard');

    // Check for interrupted installation
    const installState = new InstallStateManager();
    const pendingState = installState.load();
    if (pendingState && pendingState.status === 'in_progress') {
      this.print('Se detecta una instalacion interrumpida...\n');
      const progress = installState.getProgress(pendingState);
      this.print(`  Tier: ${pendingState.tier}`);
      this.print(`  Progreso: ${progress.completed}/${progress.total} pasos (${progress.percentage}%)`);
      this.print(`  Ultimo paso: ${pendingState.lastStep || '(ninguno)'}\n`);

      const action = await this.question('Continuar (c) o reiniciar (r)?', 'c');
      if (action.toLowerCase() === 'c') {
        await this.resumeInstallation(pendingState, installState);
        this.rl.close();
        return;
      }
      installState.clear();
    }

    // Detect existing installations BEFORE anything else
    const existingState = this.detectExistingState();

    if (existingState.hasExistingSetup) {
      const action = await this.offerExistingSetupOptions(existingState);

      if (action === 'mcp-update') {
        await this.setupMCP('update', existingState.matchingInstance);
        this.rl.close();
        return;
      }
      if (action === 'mcp-replace') {
        await this.setupMCP('replace', existingState.matchingInstance);
        this.rl.close();
        return;
      }
      if (action === 'mcp-new') {
        await this.setupMCP('new');
        this.rl.close();
        return;
      }
      if (action === 'kj-install') {
        const dbUrl = existingState.firebaseDatabaseUrl || await this.question('Firebase Database URL');
        await this.setupKarajanAndBridge(null, dbUrl);
        this.rl.close();
        return;
      }
      if (action === 'kj-manage') {
        await this.manageKarajanBridge();
        this.rl.close();
        return;
      }
      if (action === 'verify') {
        try {
          execSync('node scripts/verify-setup.cjs', { stdio: 'inherit', cwd: ROOT_DIR });
        } catch {
          // verify-setup exits with non-zero on errors, that's expected
        }
        this.rl.close();
        return;
      }
      // action === 'full' → continue with full setup
    }

    await this.showSetupBriefing();

    const totalSteps = 10;

    // Step 1: Check prerequisites
    this.printStep(1, totalSteps, 'Verificando prerequisitos...');
    await this.checkPrerequisites();

    // Step 2: Auth provider selection
    this.printStep(2, totalSteps, 'Selección de proveedor de autenticación');
    await this.configureAuth();

    // Step 3: Organization name
    this.printStep(3, totalSteps, 'Nombre de organización');
    await this.configureOrganizationName();

    // Step 4: Firebase configuration
    this.printStep(4, totalSteps, 'Configuración de Firebase');
    await this.configureFirebase();

    // Step 5: Pre environment guidance/config
    this.printStep(5, totalSteps, 'Entorno PRE (clon/snapshot recomendado)');
    await this.configurePreEnvironment();

    // Step 6: Environment files
    this.printStep(6, totalSteps, 'Generando archivos de entorno');
    await this.generateEnvFiles();

    // Step 7: Email service (optional)
    this.printStep(7, totalSteps, 'Configuración de servicio de emails (opcional)');
    await this.configureEmailProvider();

    // Step 8: Deploy
    this.printStep(8, totalSteps, 'Despliegue inicial');
    await this.deploy();

    // Step 9: First App Admin
    this.printStep(9, totalSteps, 'Configuración del primer App Admin');
    await this.setupFirstAdmin();

    // Step 10: Integrations (MCP, AI)
    this.printStep(10, totalSteps, 'Integraciones (MCP, IA)');
    await this.selectAndSetupTier();

    // Done
    this.printHeader('Setup completado!');
    this.printNextSteps();

    this.rl.close();
  }

  async showSetupBriefing() {
    const lines = buildSetupBriefingLines({
      firebaseCliInstalled: detectFirebaseCliInstalled(),
      repoUrl: 'https://github.com/manufosela/planning-game-xp',
    });
    lines.forEach((line) => this.print(line));
    this.print('');

    await this.question('Pulsa Enter para continuar o Ctrl+C para preparar requisitos primero');
  }

  // ─── Existing state detection ──────────────────────────────────────

  detectExistingState() {
    return detectExistingState(ROOT_DIR);
  }

  async offerExistingSetupOptions(state) {
    this.print('Se detectó una instalación existente:\n');

    if (state.firebaseProjectId) {
      this.print(`  - Firebase Project: ${state.firebaseProjectId}`);
    }

    const envList = Object.keys(state.envFiles).join(', ');
    if (envList) {
      this.print(`  - Entornos configurados: ${envList}`);
    }

    if (state.mcpInstances.length > 0) {
      const instanceList = state.mcpInstances
        .map(i => `${i.name}${i.firebaseProjectId ? ` (${i.firebaseProjectId})` : ''}`)
        .join(', ');
      this.print(`  - Instancias MCP: ${instanceList}`);
    }

    this.print('\n¿Qué deseas hacer?\n');

    const options = [];
    if (state.matchingInstance) {
      options.push({ key: '1', label: `Actualizar configuración de MCP existente "${state.matchingInstance.name}"`, action: 'mcp-update' });
      options.push({ key: '2', label: `Reinstalar MCP (borrando "${state.matchingInstance.name}")`, action: 'mcp-replace' });
    } else {
      options.push({ key: '1', label: 'Actualizar configuración de MCP existente', action: 'mcp-update', disabled: true });
      options.push({ key: '2', label: 'Reinstalar MCP', action: 'mcp-replace', disabled: true });
    }
    options.push({ key: '3', label: 'Añadir un nuevo MCP conectado a otro Planning Game', action: 'mcp-new' });

    // Check KJ/Bridge status
    const kjManager = new KjInstanceManager();
    const kjInstances = kjManager.listInstances();
    const bridgeRunning = kjManager.isBridgeRunning();

    if (kjInstances.length > 0 || bridgeRunning) {
      options.push({ key: '4', label: `Gestionar Karajan + Bridge${bridgeRunning ? ' (Bridge activo)' : ''}`, action: 'kj-manage' });
    } else {
      options.push({ key: '4', label: 'Instalar Karajan-Code + Bridge (IA desde UI)', action: 'kj-install' });
    }

    options.push({ key: '5', label: 'Verificar instalación', action: 'verify' });
    options.push({ key: '6', label: 'Ejecutar setup completo desde cero', action: 'full' });

    for (const opt of options) {
      if (opt.disabled) {
        this.print(`  ${opt.key}. ${opt.label} (no disponible)`);
      } else {
        this.print(`  ${opt.key}. ${opt.label}`);
      }
    }

    const maxOption = options[options.length - 1].key;
    const choice = await this.question(`\nSelecciona [1-${maxOption}]`, '5');
    const selected = options.find(o => o.key === choice);

    if (!selected || selected.disabled) {
      this.print('\nOpcion no disponible. Ejecutando verificacion...');
      return 'verify';
    }

    return selected.action;
  }

  // ─── Prerequisites ──────────────────────────────────────────────────

  async checkPrerequisites() {
    const checks = [
      { name: 'Node.js', cmd: 'node --version', required: true },
      { name: 'npm', cmd: 'npm --version', required: true },
      { name: 'Firebase CLI', cmd: 'firebase --version', required: true },
      { name: 'Git', cmd: 'git --version', required: true },
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
      this.print('Para instalar Git: https://git-scm.com/downloads');
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

  async configureOrganizationName() {
    this.print('Este nombre se mostrará en la cabecera, a la izquierda del logo.\n');
    const orgName = await this.question('Nombre de la organización (vacío para ocultar)');
    this.config.orgName = orgName || '';
  }

  async configureFirebase() {
    this.print('Necesitas los datos de configuración de tu proyecto Firebase.');
    this.print('Los encuentras en: Firebase Console → Project Settings → Your apps');
    this.print('Puedes introducirlos manualmente o pegar el bloque firebaseConfig.\n');

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

    this.print('¿Cómo quieres cargar la configuración de Firebase?');
    this.print('  1. Introducir valores uno a uno');
    this.print('  2. Pegar JSON/bloque firebaseConfig (recomendado)\n');

    const mode = await this.question('Selecciona [1-2]', '2');

    if (mode === '2') {
      const rawInput = await this.questionMultiline(
        'Pega aquí el JSON o bloque firebaseConfig (desde "const firebaseConfig = { ... }"):'
      );
      try {
        const parsed = parseFirebaseWebConfigInput(rawInput);
        Object.assign(this.config.client, parsed);
        this.print('  ✅ Configuración Firebase importada desde bloque JSON');
      } catch (error) {
        this.print(`  ⚠️  No se pudo parsear el bloque: ${error.message}`);
        this.print('  Continuamos con entrada manual.\n');
        await this.collectFirebaseConfigManually();
      }
    } else {
      await this.collectFirebaseConfigManually();
    }

    await this.ensureRequiredFirebaseClientFields();
    await this.verifyRequiredFirebaseServices();

    const superAdminEmail = await this.question(
      `  ${ENV_TEMPLATE.client.find(i => i.key === 'PUBLIC_SUPER_ADMIN_EMAIL').desc} *`,
      this.config.client.PUBLIC_SUPER_ADMIN_EMAIL || ''
    );
    this.config.client.PUBLIC_SUPER_ADMIN_EMAIL = superAdminEmail;
    this.config.client.PUBLIC_AUTH_PROVIDER = this.config.client.PUBLIC_AUTH_PROVIDER || 'google';

    // Copy super admin email to functions config
    this.config.functions['PUBLIC_SUPER_ADMIN_EMAIL'] = this.config.client['PUBLIC_SUPER_ADMIN_EMAIL'];
  }

  async collectFirebaseConfigManually() {
    const firebaseItems = ENV_TEMPLATE.client.filter((item) =>
      item.key.startsWith('PUBLIC_FIREBASE_')
    );

    for (const item of firebaseItems) {
      const currentValue = this.config.client[item.key] || item.default || '';
      const value = await this.question(`  ${item.desc}${item.required ? ' *' : ''}`, currentValue);
      if (item.required && !value) {
        this.print('    ⚠️  Este campo es requerido');
        const retry = await this.question(`  ${item.desc} *`, currentValue);
        this.config.client[item.key] = retry;
      } else {
        this.config.client[item.key] = value;
      }
    }
  }

  async ensureRequiredFirebaseClientFields() {
    for (const key of REQUIRED_FIREBASE_CLIENT_KEYS) {
      const hasValue = String(this.config.client[key] || '').trim().length > 0;
      if (hasValue) continue;
      const item = ENV_TEMPLATE.client.find((entry) => entry.key === key);
      const desc = item?.desc || key;
      const value = await this.question(`  ${desc} *`);
      this.config.client[key] = value;
    }
  }

  async verifyRequiredFirebaseServices() {
    const projectId = this.config.client.PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) return;

    this.print('\nVerificando servicios requeridos en Firebase...');

    const firestore = checkFirestoreEnabled(projectId);
    if (firestore.enabled === true) {
      this.print('  ✅ Firestore habilitado');
    } else if (firestore.enabled === false) {
      this.print('  ⚠️  Firestore no está habilitado en este proyecto.');
      this.print('     Actívalo en: Firebase Console → Firestore Database → Create database');
    } else {
      this.print('  ⚠️  No se pudo verificar Firestore automáticamente.');
      if (firestore.reason) {
        this.print(`     Motivo: ${firestore.reason.split('\n')[0]}`);
      }
    }

    const functions = checkFunctionsEnabled(projectId);
    if (functions.enabled === true) {
      this.print('  ✅ Cloud Functions habilitadas');
    } else if (functions.enabled === false) {
      this.print('  ⚠️  Cloud Functions API no está habilitada en este proyecto.');
      this.print('     Actívala en: Google Cloud Console → APIs & Services → Cloud Functions API');
      if (functions.reason) {
        this.print(`     Motivo: ${functions.reason.split('\n')[0]}`);
      }
    } else {
      this.print('  ⚠️  No se pudo verificar Cloud Functions automáticamente.');
      if (functions.reason) {
        this.print(`     Motivo: ${functions.reason.split('\n')[0]}`);
      }
    }

    const missingRequired = [firestore.enabled, functions.enabled].includes(false);
    if (missingRequired) {
      const continueAnyway = await this.confirm('¿Quieres continuar de todos modos?', false);
      if (!continueAnyway) {
        throw new Error('Setup detenido para habilitar servicios de Firebase requeridos.');
      }
    }
  }

  async configurePreEnvironment() {
    buildPreEnvironmentGuidance().forEach((line) => this.print(line));
    this.print('');

    const configureNow = await this.confirm(
      '¿Quieres configurar ahora valores específicos para .env.pre?',
      shouldConfigurePreNowByDefault()
    );
    if (!configureNow) {
      this.print('  ⏭️  Se usará la misma configuración base por ahora. Podrás editar .env.pre después.');
      return;
    }

    const overrides = {};
    const preKeys = [
      'PUBLIC_FIREBASE_API_KEY',
      'PUBLIC_FIREBASE_AUTH_DOMAIN',
      'PUBLIC_FIREBASE_DATABASE_URL',
      'PUBLIC_FIREBASE_PROJECT_ID',
      'PUBLIC_FIREBASE_STORAGE_BUCKET',
      'PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      'PUBLIC_FIREBASE_APP_ID'
    ];

    for (const key of preKeys) {
      const currentValue = this.config.client[key] || '';
      const value = await this.question(`  ${key}`, currentValue);
      overrides[key] = value;
    }

    const helpers = await import('./setup-wizard-helpers.js');
    this.config.preClient = helpers.mergePreClientConfig(this.config.client, overrides);
    this.print('  ✅ Configuración PRE almacenada');
  }

  async generateEnvFiles() {
    const environments = ['dev', 'pre', 'prod'];

    for (const env of environments) {
      const envPath = path.join(ROOT_DIR, `.env.${env}`);
      let content = '# Firebase Configuration\n';

      const sourceConfig = env === 'pre' && this.config.preClient
        ? this.config.preClient
        : this.config.client;

      for (const [key, value] of Object.entries(sourceConfig)) {
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
    const functionsEnvPath = path.join(ROOT_DIR, 'functions', '.env');
    let functionsContent = '# Cloud Functions Environment\n';
    for (const [key, value] of Object.entries(this.config.functions)) {
      if (value) {
        functionsContent += `${key}=${value}\n`;
      }
    }
    fs.writeFileSync(functionsEnvPath, functionsContent);
    this.print(`  ✅ Creado: functions/.env`);

    await this.updateThemeConfigOrgName();
  }

  async updateThemeConfigOrgName() {
    const themePath = path.join(ROOT_DIR, 'public', 'theme-config.json');
    if (!fs.existsSync(themePath)) return;

    try {
      const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
      theme.branding = theme.branding || {};
      theme.branding.orgName = this.config.orgName || '';
      fs.writeFileSync(themePath, JSON.stringify(theme, null, 2) + '\n');
      this.print('  ✅ Actualizado public/theme-config.json (branding.orgName)');
    } catch (error) {
      this.print(`  ⚠️  No se pudo actualizar theme-config.json: ${error.message}`);
    }
  }

  async configureEmailProvider() {
    this.print('Planning Game puede enviar notificaciones por email cuando hay tareas/bugs pendientes.\n');
    this.print('¿Cómo quieres configurar notificaciones?');
    this.print('  1. Push + Microsoft Graph');
    this.print('  2. Push + SMTP genérico');
    this.print('  3. Push + SendGrid');
    this.print('  4. Solo push (sin emails)\n');

    const helpers = await import('./setup-wizard-helpers.js');
    const choice = await this.question('Selecciona [1-4]', '4');
    const provider = helpers.resolveEmailProviderFromChoice(choice);
    this.config.functions.EMAIL_PROVIDER = provider;

    if (provider === 'none') {
      this.print('  ✅ Configurado: solo notificaciones push');
      await this.persistFunctionEnvUpdates({ EMAIL_PROVIDER: 'none' });
      return;
    }

    const secretsToSet = { EMAIL_PROVIDER: provider };

    if (provider === 'msgraph') {
      this.print('\nNecesitas App Registration en Azure AD.');
      secretsToSet.MS_CLIENT_ID = await this.question('  Microsoft Azure Client ID');
      secretsToSet.MS_CLIENT_SECRET = await this.question('  Microsoft Azure Client Secret');
      secretsToSet.MS_TENANT_ID = await this.question('  Microsoft Azure Tenant ID');
      secretsToSet.MS_FROM_EMAIL = await this.question('  Email remitente');
      const alertEmail = await this.question('  Email alertas IT (opcional)');
      if (alertEmail) secretsToSet.MS_ALERT_EMAIL = alertEmail;
    } else if (provider === 'smtp') {
      secretsToSet.SMTP_HOST = await this.question('  SMTP Host');
      secretsToSet.SMTP_PORT = await this.question('  SMTP Port', '587');
      secretsToSet.SMTP_SECURE = await this.question('  SMTP Secure (true/false)', 'false');
      secretsToSet.SMTP_USER = await this.question('  SMTP User');
      secretsToSet.SMTP_PASS = await this.question('  SMTP Password');
      secretsToSet.SMTP_FROM_EMAIL = await this.question('  SMTP From Email');
    } else if (provider === 'sendgrid') {
      secretsToSet.SENDGRID_API_KEY = await this.question('  SendGrid API Key');
      secretsToSet.SENDGRID_FROM_EMAIL = await this.question('  SendGrid From Email');
      secretsToSet.SENDGRID_FROM_NAME = await this.question('  SendGrid From Name', 'Planning Game XP');
    }

    await this.persistFunctionEnvUpdates(secretsToSet);

    const commands = helpers.buildSecretSetCommands(secretsToSet);
    const useAutoSecrets = await this.confirm('¿Quieres configurar estos secretos automáticamente con Firebase CLI?', true);

    if (useAutoSecrets) {
      for (const command of commands) {
        try {
          execSync(command, { stdio: 'inherit', cwd: ROOT_DIR, shell: '/bin/bash' });
        } catch (error) {
          this.print(`  ⚠️  Error configurando secreto. Puedes ejecutarlo manualmente: ${command}`);
        }
      }
      this.print('  ✅ Secretos configurados (si Firebase CLI estaba autenticado)');
    } else {
      this.print('\nEjecuta estos comandos manualmente para guardar secretos:');
      commands.forEach(cmd => this.print(`  ${cmd}`));
    }
  }

  async persistFunctionEnvUpdates(values) {
    const functionsEnvPath = path.join(ROOT_DIR, 'functions', '.env');
    let content = fs.existsSync(functionsEnvPath) ? fs.readFileSync(functionsEnvPath, 'utf8') : '# Cloud Functions Environment\n';

    for (const [key, value] of Object.entries(values)) {
      const lineRegex = new RegExp(`^${key}=.*$`, 'm');
      if (lineRegex.test(content)) {
        content = content.replace(lineRegex, `${key}=${value}`);
      } else {
        if (!content.endsWith('\n')) content += '\n';
        content += `${key}=${value}\n`;
      }
    }

    fs.writeFileSync(functionsEnvPath, content);
    this.print('  ✅ functions/.env actualizado');
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

      execSync(`node scripts/setup-app-admin.cjs ${superAdminEmail}`, {
        stdio: 'inherit',
        cwd: ROOT_DIR
      });
    } catch (error) {
      this.print(`\n  ⚠️  No se pudo configurar el App Admin automáticamente.`);
      this.print(`  Ejecuta después: npm run setup:app-admin -- ${superAdminEmail}`);
    }
  }

  // ─── MCP Server Setup ──────────────────────────────────────────────

  async setupMCP(mode = 'new', existingInstance = null) {
    const manager = new McpInstanceManager();

    // 1. Legacy migration (automatic, only on first detection)
    try {
      const legacy = manager.detectLegacyInstallation();
      if (legacy.found) {
        this.print('  Detectada instalación MCP legacy. Migrando a multi-instancia...');
        const migrated = manager.migrateLegacy();
        if (migrated) {
          this.print(`  ✅ Migrada a instancia "pro" (planning-game-pro)`);
          if (mode === 'new') {
            // If we just migrated, the user might not need another instance
            if (!await this.confirm('\n¿Deseas crear una instancia MCP adicional?', false)) {
              this.mcpInstalled = true;
              this.mcpInstanceName = 'pro';
              return;
            }
          }
        }
      }
    } catch {
      // Legacy detection failed, continue normally
    }

    // 2. Mode: replace → delete existing instance first
    if (mode === 'replace' && existingInstance) {
      this.print(`\n  Eliminando instancia "${existingInstance.name}"...`);
      try {
        manager.deleteInstance(existingInstance.name);
        this.print(`  ✅ Instancia "${existingInstance.name}" eliminada`);
      } catch (error) {
        this.print(`  ⚠️  Error eliminando: ${error.message}`);
      }
      mode = 'new';
    }

    // 3. Mode: update → modify existing instance config
    if (mode === 'update' && existingInstance) {
      await this.updateExistingInstance(manager, existingInstance);
      return;
    }

    // 4. Ask if user wants MCP (only during full setup, not direct MCP actions)
    if (mode === 'new' && !existingInstance) {
      this.print('El MCP Server permite gestionar el proyecto desde Claude Code.\n');
      if (!await this.confirm('¿Deseas instalar el MCP Server?', false)) {
        this.print('  ⏭️  Puedes instalarlo después con: npm run setup (opción 3)');
        return;
      }
    }

    // 5. Instance name
    const name = await this.askInstanceName();

    // 6. Engine (clone or update)
    await this.ensureMcpEngine(manager);

    // 7. Create instance
    const dbUrl = this.config.client?.PUBLIC_FIREBASE_DATABASE_URL
      || await this.question('  Firebase Database URL');
    const projectId = this.config.client?.PUBLIC_FIREBASE_PROJECT_ID
      || await this.question('  Firebase Project ID');

    this.print(`\n  Creando instancia "${name}"...`);
    manager.createInstance(name, { firebaseProjectId: projectId, firebaseDatabaseUrl: dbUrl });
    this.print(`  ✅ Instancia "${name}" creada`);

    // 8. serviceAccountKey.json
    await this.askServiceAccountKey(name, manager);

    // 9. mcp.user.json
    await this.askMcpUserIdentity(name, manager);

    // 10. Register with Claude
    await this.registerMcpWithClaude(name, dbUrl, manager);

    this.mcpInstalled = true;
    this.mcpInstanceName = name;

    this.print(`\n  ✅ MCP instalado como: planning-game-${name}`);
    this.print('  Reinicia Claude Code para usar el MCP.');
  }

  async askInstanceName() {
    // Suggest name based on environment
    let suggestion = 'pro';
    if (this.config.client?.PUBLIC_FIREBASE_PROJECT_ID) {
      const pid = this.config.client.PUBLIC_FIREBASE_PROJECT_ID;
      if (pid.includes('-dev')) suggestion = 'dev';
      else if (pid.includes('-pre') || pid.includes('-staging')) suggestion = 'pre';
    }

    const manager = new McpInstanceManager();
    if (manager.instanceExists(suggestion)) {
      suggestion = `${suggestion}-2`;
    }

    this.print('\n  Nombre para esta instancia MCP.');
    this.print('  Ejemplos: "pro", "dev", "staging", "client-name"\n');

    let name;
    let isValid = false;
    while (!isValid) {
      name = await this.question('  Nombre de instancia', suggestion);
      try {
        name = manager.validateInstanceName(name);
        if (manager.instanceExists(name)) {
          this.print(`  ⚠️  Ya existe una instancia "${name}". Elige otro nombre.`);
        } else {
          isValid = true;
        }
      } catch (error) {
        this.print(`  ⚠️  ${error.message}`);
      }
    }

    return name;
  }

  async ensureMcpEngine(manager) {
    if (manager.isEngineInstalled()) {
      const version = manager.getEngineVersion();
      this.print(`\n  MCP Engine encontrado (v${version})`);
      if (await this.confirm('  ¿Actualizar engine?', false)) {
        this.print('  Actualizando engine...');
        try {
          manager.updateEngine();
          this.print(`  ✅ Engine actualizado (v${manager.getEngineVersion()})`);
        } catch (error) {
          this.print(`  ⚠️  Error actualizando: ${error.message}`);
        }
      }
    } else {
      this.print('\n  Clonando MCP engine...');
      try {
        manager.cloneEngine();
        this.print(`  ✅ Engine instalado (v${manager.getEngineVersion()})`);
      } catch (error) {
        this.print(`\n  ❌ Error clonando el engine: ${error.message}`);
        this.print('  Verifica tu conexión a internet y permisos de Git.');
        throw error;
      }
    }
  }

  async askServiceAccountKey(instanceName, manager) {
    this.print('\n  El serviceAccountKey.json es necesario para que el MCP');
    this.print('  se conecte a Firebase. Lo puedes descargar desde:');
    this.print('  Firebase Console → Project Settings → Service accounts → Generate new key\n');

    const keyPath = await this.question('  Ruta al serviceAccountKey.json (dejar vacío para omitir)');
    if (!keyPath) {
      this.print('  ⏭️  Puedes añadirlo después copiándolo manualmente al directorio de la instancia');
      return;
    }

    const resolvedPath = path.resolve(keyPath);
    try {
      manager.copyServiceAccountKey(instanceName, resolvedPath);
      this.print('  ✅ serviceAccountKey.json copiado');
    } catch (error) {
      this.print(`  ⚠️  ${error.message}`);
      this.print('  Puedes añadirlo manualmente después.');
    }
  }

  async askMcpUserIdentity(instanceName, manager) {
    this.print('\n  Configurar tu identidad para el MCP (quién eres en Planning Game).\n');

    if (!await this.confirm('  ¿Configurar identidad ahora?')) {
      this.print('  ⏭️  Puedes configurarlo después ejecutando setup_mcp_user desde Claude Code');
      return;
    }

    const developerId = await this.question('  Developer ID (ej: dev_001)');
    const developerName = await this.question('  Tu nombre');
    const developerEmail = await this.question('  Tu email');

    if (developerId && developerName && developerEmail) {
      try {
        manager.writeMcpUserConfig(instanceName, {
          developerId,
          developerName,
          developerEmail,
        });
        this.print('  ✅ Identidad configurada');
      } catch (error) {
        this.print(`  ⚠️  ${error.message}`);
      }
    } else {
      this.print('  ⏭️  Datos incompletos. Puedes configurarlo después.');
    }
  }

  async registerMcpWithClaude(instanceName, dbUrl, manager) {
    if (!manager.isClaudeAvailable()) {
      this.print('\n  Claude CLI no encontrado. Configuración manual necesaria.');
      this.printManualMcpConfig(instanceName, dbUrl, manager);
      return;
    }

    this.print('\n  Registrando MCP en Claude Code...');
    try {
      manager.registerWithClaude(instanceName, dbUrl);
      this.print(`  ✅ Registrado como planning-game-${instanceName}`);
    } catch (error) {
      this.print(`  ⚠️  Error registrando: ${error.message}`);
      this.printManualMcpConfig(instanceName, dbUrl, manager);
    }
  }

  printManualMcpConfig(instanceName, dbUrl, manager) {
    const instance = manager.findByName(instanceName);
    const instanceDir = instance?.directory || path.join(manager.instancesDir, instanceName);

    this.print('\n  Para registrar manualmente, ejecuta:');
    this.print(`  claude mcp add planning-game-${instanceName} -s user \\`);
    this.print(`    -e DATABASE_URL=${dbUrl} \\`);
    this.print(`    -e GOOGLE_APPLICATION_CREDENTIALS=${path.join(instanceDir, 'serviceAccountKey.json')} \\`);
    this.print(`    -e MCP_USER_CONFIG=${path.join(instanceDir, 'mcp.user.json')} \\`);
    this.print(`    -- node ${path.join(manager.engineDir, 'index.js')}`);
  }

  async updateExistingInstance(manager, instance) {
    this.printHeader(`Actualizar instancia "${instance.name}"`);

    this.print('  Configuración actual:');
    this.print(`    Nombre: ${instance.name}`);
    this.print(`    Firebase Project: ${instance.firebaseProjectId || '(no configurado)'}`);
    this.print(`    Database URL: ${instance.firebaseDatabaseUrl || '(no configurado)'}`);
    this.print(`    serviceAccountKey: ${manager.hasServiceAccountKey(instance.name) ? '✅' : '❌'}`);
    this.print(`    mcp.user.json: ${manager.hasMcpUser(instance.name) ? '✅' : '❌'}`);
    this.print(`    Registrado en Claude: ${(instance.registeredClients || []).includes('claude') ? '✅' : '❌'}`);

    // Update engine
    this.print('');
    if (await this.confirm('  ¿Actualizar MCP engine?', false)) {
      await this.ensureMcpEngine(manager);
    }

    // Update serviceAccountKey
    if (await this.confirm('  ¿Actualizar serviceAccountKey.json?', false)) {
      await this.askServiceAccountKey(instance.name, manager);
    }

    // Update user identity
    if (await this.confirm('  ¿Actualizar identidad de usuario?', false)) {
      await this.askMcpUserIdentity(instance.name, manager);
    }

    // Re-register with Claude
    if (await this.confirm('  ¿Re-registrar en Claude Code?', false)) {
      const dbUrl = instance.firebaseDatabaseUrl || await this.question('  Firebase Database URL');
      await this.registerMcpWithClaude(instance.name, dbUrl, manager);
    }

    this.print('\n  ✅ Instancia actualizada');
  }

  // ─── Tier Selection ──────────────────────────────────────────────────

  async selectAndSetupTier() {
    this.print('Selecciona el nivel de integracion:\n');
    this.print('  1. Solo Planning Game (sin MCP, sin IA)');
    this.print('  2. Planning Game + MCP Server (gestionar PG desde Claude Code)');
    this.print('  3. Planning Game + MCP + Karajan-Code + Bridge (IA completa desde UI)\n');

    const choice = await this.question('Selecciona [1-3]', '1');
    const tier = parseInt(choice, 10);

    if (tier < 1 || tier > 3 || isNaN(tier)) {
      this.print('  Opcion no valida. Saltando integraciones.');
      return;
    }

    const installState = new InstallStateManager();
    const state = installState.createState(tier);

    installState.markStepCompleted(state, 'tier_selected');

    if (tier >= 2) {
      await this.setupMCP('new');
      installState.markStepCompleted(state, 'mcp_installed');
    }

    if (tier === 3) {
      const dbUrl = this.config.client?.PUBLIC_FIREBASE_DATABASE_URL
        || await this.question('Firebase Database URL');
      await this.setupKarajanAndBridge(state, dbUrl, installState);
    }

    installState.markStepCompleted(state, 'completed');
  }

  // ─── KJ + Bridge Setup ─────────────────────────────────────────────

  async setupKarajanAndBridge(state, dbUrl, installState) {
    if (!installState) installState = new InstallStateManager();
    if (!state) state = installState.createState(3);

    const kjManager = new KjInstanceManager();

    // Step: kj_cloned
    if (!installState.isStepCompleted(state, 'kj_cloned')) {
      this.print('\n  Configurando Karajan-Code...\n');

      const defaultKjDir = path.join(path.dirname(ROOT_DIR), 'karajan-code');
      const kjDir = await this.question('  Directorio para Karajan-Code', defaultKjDir);

      if (kjManager.isKjInstalled(kjDir)) {
        this.print('  Karajan-Code encontrado. Actualizando...');
        try {
          kjManager.updateKjRepo(kjDir);
          this.print('  Actualizado.');
        } catch (err) {
          this.print(`  Aviso: ${err.message}`);
        }
      } else {
        this.print('  Clonando Karajan-Code...');
        try {
          kjManager.cloneKjRepo(kjDir);
          this.print('  Clonado.');
        } catch (err) {
          this.print(`  Error clonando: ${err.message}`);
          throw err;
        }
      }

      installState.updateConfig(state, { kjRepoPath: kjDir });
      installState.markStepCompleted(state, 'kj_cloned');
    }

    const kjDir = state.config.kjRepoPath;

    // Step: kj_installed
    if (!installState.isStepCompleted(state, 'kj_installed')) {
      this.print('\n  Ejecutando instalador de Karajan-Code...');
      this.print('  (KJ tiene su propio wizard con SonarQube, agents, etc.)\n');

      try {
        const exitCode = await kjManager.runKjInstallerInteractive(kjDir);
        if (exitCode !== 0) {
          this.print(`  Aviso: instalador KJ termino con codigo ${exitCode}`);
        }
      } catch (err) {
        this.print(`  Error en instalador KJ: ${err.message}`);
        this.print('  Puedes ejecutarlo manualmente: cd ' + kjDir + ' && node scripts/setup.js');
      }

      const kjHome = path.join(os.homedir(), '.karajan');
      installState.updateConfig(state, { kjHome });
      installState.markStepCompleted(state, 'kj_installed');
    }

    // Step: bridge_built
    if (!installState.isStepCompleted(state, 'bridge_built')) {
      this.print('\n  Construyendo Bridge Server (Docker)...');

      if (!kjManager.isDockerAvailable()) {
        this.print('  Docker no disponible. Instala Docker para usar el Bridge.');
        this.print('  Puedes continuar sin Bridge (tier 2).');
        return;
      }

      try {
        kjManager.buildBridge(ROOT_DIR);
        this.print('  Bridge construido.');
      } catch (err) {
        this.print(`  Error construyendo Bridge: ${err.message}`);
        return;
      }

      installState.markStepCompleted(state, 'bridge_built');
    }

    // Step: bridge_started
    if (!installState.isStepCompleted(state, 'bridge_started')) {
      this.print('  Iniciando Bridge Server...');

      const bridgePort = 3100;
      const bridgeApiKey = require('crypto').randomBytes(32).toString('hex');

      try {
        kjManager.startBridge(ROOT_DIR, {
          bridgePort,
          databaseUrl: dbUrl,
          bridgeApiKey,
          kjHome: state.config.kjHome,
        });

        const healthy = await kjManager.waitForBridgeHealth(bridgePort, 30000);
        if (healthy) {
          this.print('  Bridge Server activo en puerto ' + bridgePort);
        } else {
          this.print('  Aviso: Bridge no respondio al health check');
        }
      } catch (err) {
        this.print(`  Error iniciando Bridge: ${err.message}`);
      }

      installState.updateConfig(state, { bridgePort, bridgeApiKey });
      installState.markStepCompleted(state, 'bridge_started');
    }

    // Step: mcp_kj_registered
    if (!installState.isStepCompleted(state, 'mcp_kj_registered')) {
      this.print('  Registrando MCP de Karajan-Code...');

      const instanceName = this.mcpInstanceName || 'pro';
      try {
        kjManager.registerMcpKj(instanceName, kjDir, state.config.kjHome);
        this.print(`  Registrado como karajan-${instanceName}`);
      } catch (err) {
        this.print(`  Aviso: ${err.message}`);
        this.print('  Puedes registrarlo manualmente despues.');
      }

      // Create KJ instance in manifest
      try {
        kjManager.createInstance(instanceName, {
          kjRepoPath: kjDir,
          kjHome: state.config.kjHome,
          bridgePort: state.config.bridgePort,
          bridgeApiKey: state.config.bridgeApiKey,
        });
      } catch {
        // Instance might already exist
      }

      installState.markStepCompleted(state, 'mcp_kj_registered');
    }

    this.print('\n  Karajan-Code + Bridge configurados.');
  }

  async resumeInstallation(state, installState) {
    this.print('\nReanudando instalacion...\n');

    const dbUrl = state.config?.databaseUrl
      || this.config.client?.PUBLIC_FIREBASE_DATABASE_URL
      || await this.question('Firebase Database URL');

    if (state.tier >= 2 && !installState.isStepCompleted(state, 'mcp_installed')) {
      await this.setupMCP('new');
      installState.markStepCompleted(state, 'mcp_installed');
    }

    if (state.tier === 3) {
      await this.setupKarajanAndBridge(state, dbUrl, installState);
    }

    installState.markStepCompleted(state, 'completed');
    this.print('\nInstalacion completada.');
  }

  async manageKarajanBridge() {
    const kjManager = new KjInstanceManager();
    const instances = kjManager.listInstances();
    const bridgeRunning = kjManager.isBridgeRunning();

    this.printHeader('Gestionar Karajan-Code + Bridge');

    this.print(`  Bridge: ${bridgeRunning ? 'Activo' : 'Detenido'}`);
    this.print(`  Instancias KJ: ${instances.length}\n`);

    this.print('  1. Actualizar Karajan-Code (git pull)');
    this.print(`  2. ${bridgeRunning ? 'Reiniciar' : 'Iniciar'} Bridge Server`);
    this.print('  3. Detener Bridge Server');
    this.print('  4. Reconstruir Bridge (docker compose build)');
    this.print('  5. Volver\n');

    const choice = await this.question('Selecciona [1-5]', '5');

    if (choice === '1') {
      for (const inst of instances) {
        if (inst.kjRepoPath && kjManager.isKjInstalled(inst.kjRepoPath)) {
          this.print(`  Actualizando ${inst.name}...`);
          try {
            kjManager.updateKjRepo(inst.kjRepoPath);
            this.print('  Actualizado.');
          } catch (err) {
            this.print(`  Error: ${err.message}`);
          }
        }
      }
    } else if (choice === '2') {
      if (bridgeRunning) {
        kjManager.stopBridge(ROOT_DIR);
      }
      const inst = instances[0];
      if (inst) {
        kjManager.startBridge(ROOT_DIR, {
          bridgePort: inst.bridgePort,
          bridgeApiKey: inst.bridgeApiKey,
          kjHome: inst.kjHome,
        });
        this.print('  Bridge iniciado.');
      }
    } else if (choice === '3') {
      kjManager.stopBridge(ROOT_DIR);
      this.print('  Bridge detenido.');
    } else if (choice === '4') {
      this.print('  Reconstruyendo Bridge...');
      try {
        kjManager.buildBridge(ROOT_DIR);
        this.print('  Bridge reconstruido.');
      } catch (err) {
        this.print(`  Error: ${err.message}`);
      }
    }
  }

  // ─── Final info ──────────────────────────────────────────────────────

  printNextSteps() {
    this.print('Próximos pasos:\n');
    this.print('  1. Inicia sesión en la aplicación con el email del Super Admin');
    this.print('  2. Cierra sesión y vuelve a entrar para cargar los permisos');
    this.print('  3. Ve a la sección de Apps para gestionar aplicaciones\n');

    if (this.mcpInstalled) {
      this.print('MCP Server:\n');
      this.print(`  Instancia: planning-game-${this.mcpInstanceName}`);
      this.print('  Reinicia Claude Code para activar el MCP');
      this.print('  Para añadir más instancias: npm run setup (opción 3)\n');
    }

    this.print('Comandos útiles:\n');
    this.print('  npm run dev          # Iniciar en desarrollo');
    this.print('  npm run emulator     # Iniciar emuladores de Firebase');
    this.print('  npm run build        # Construir para producción');
    this.print('  npm run deploy       # Desplegar a Firebase');
    this.print('  npm run verify-setup # Verificar la instalación\n');
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
