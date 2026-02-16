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
const crypto = require('crypto');
const readline = require('readline');
const { execSync, spawn } = require('child_process');
const { AppInstanceManager } = require('./app-instance-manager.cjs');
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
const {
  parseFirebaseAccounts,
  parseActiveFirebaseAccount,
  appendFirebaseAccountFlag,
} = require('./firebase-account-helper.cjs');
const { buildDeployCommands } = require('./deploy-command-helper.cjs');
const {
  setDefaultFirebaseProject,
  isActiveFirebaseProject,
  isExpectedProjectInFirebaseUseOutput,
} = require('./firebase-project-context-helper.cjs');
const {
  ensureDatabaseTargets,
  ensureDatabaseTargetsInFirebaserc,
  hasDatabaseTargetConfigured,
} = require('./firebase-rtdb-target-helper.cjs');
const { shouldClearInstallState } = require('./setup-flow-helper.cjs');
const { ensureRequiredFirebaseRuleFiles } = require('./firebase-rules-files-helper.cjs');
const { ensureFunctionsDependencies, hasBlockingAuditVulnerabilities } = require('./functions-deploy-prep-helper.cjs');
const { enableRequiredProjectApis } = require('./firebase-api-enabler.cjs');
const { extractMissingApiFromErrorText } = require('./firebase-api-error-parser.cjs');
const {
  getMissingApiFromDeployError,
  getMissingSecretFromDeployError,
  shouldRetryFunctionsDeploy,
} = require('./deploy-retry-helper.cjs');
const { attemptAiRescue } = require('./ai-rescue-helper.cjs');
const {
  buildGcloudAdcPrintTokenCommand,
  buildGcloudAdcLoginCommand,
  buildGcloudAdcLoginNoBrowserCommand,
} = require('./gcloud-adc-helper.cjs');
const { formatMcpInstanceLabel, buildMcpActionOptions } = require('./mcp-setup-helper.cjs');
const { resolveInputPath, buildDefaultMcpUserIdentity } = require('./setup-input-helper.cjs');

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
      preClient: null,
      firebaseCliAccount: ''
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

    const canContinue = await this.ensureAppInstanceContext();
    if (!canContinue) {
      this.rl.close();
      return;
    }

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
      if (shouldClearInstallState('restart')) {
        installState.clear();
        this.print('  ✅ Estado de instalación parcial eliminado. Reiniciando desde cero.\n');
      }
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
      if (shouldClearInstallState(action)) {
        installState.clear();
        this.print('  ✅ Setup reiniciado desde cero (estado anterior limpiado).\n');
      }
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

  async ensureAppInstanceContext() {
    const appInstanceManager = new AppInstanceManager();
    if (appInstanceManager.isInstanceDirectory(ROOT_DIR)) {
      return true;
    }

    this.print('Este repositorio se trata como plantilla/base.');
    this.print('Para evitar mezclar secretos/configuración, el setup se ejecuta dentro de una instancia.\n');

    const instances = appInstanceManager.listInstances();
    if (instances.length === 0) {
      this.print('No hay instancias de Planning Game creadas todavía.\n');
      const created = await this.createAppInstance(appInstanceManager);
      if (!created) return false;
      await this.launchSetupInInstance(created.directory);
      return false;
    }

    this.print('Instancias existentes:\n');
    instances.forEach((inst, idx) => this.print(`  ${idx + 1}. ${this.formatAppInstanceLabel(inst)}`));
    this.print('\nOpciones:');
    this.print('  1. Usar una instancia existente (recomendado, se actualizará automáticamente)');
    this.print('  2. Crear nueva instancia');
    this.print('  3. Continuar en repo plantilla (avanzado, no recomendado)\n');

    const choice = await this.question('Selecciona [1-3]', '1');
    if (choice === '3') {
      this.print('⚠️  Continuando en repo plantilla por solicitud explícita.\n');
      return true;
    }

    if (choice === '2') {
      const created = await this.createAppInstance(appInstanceManager);
      if (!created) return false;
      await this.launchSetupInInstance(created.directory);
      return false;
    }

    const selected = await this.selectAppInstance(instances);
    if (!selected) {
      this.print('No se seleccionó instancia válida.');
      return false;
    }

    try {
      appInstanceManager.updateInstance(selected.name);
      this.print(`✅ Instancia "${selected.name}" actualizada.`);
    } catch (error) {
      this.print(`⚠️  No se pudo actualizar la instancia: ${error.message}`);
      this.print('   Se lanzará setup con la versión actual de la instancia.');
    }

    await this.launchSetupInInstance(selected.directory);
    return false;
  }

  async createAppInstance(manager) {
    this.print('Creación de nueva instancia de Planning Game.\n');
    const defaultName = 'personal';

    let name;
    while (true) {
      const input = await this.question('  Nombre de instancia (ej: personal, geniova)', defaultName);
      try {
        name = manager.validateInstanceName(input);
      } catch (error) {
        this.print(`  ⚠️  ${error.message}`);
        continue;
      }
      if (manager.instanceExists(name)) {
        this.print(`  ⚠️  Ya existe una instancia con ese nombre: ${name}`);
        continue;
      }
      break;
    }

    try {
      const instance = manager.createInstance(name, { baseRepoDir: ROOT_DIR });
      this.print(`\n✅ Instancia creada: ${instance.directory}\n`);
      return instance;
    } catch (error) {
      this.print(`\n❌ Error creando instancia: ${error.message}`);
      this.print('Verifica acceso Git (SSH/HTTPS) y vuelve a intentarlo.\n');
      return null;
    }
  }

  async selectAppInstance(instances) {
    if (!instances.length) return null;
    if (instances.length === 1) {
      const only = instances[0];
      this.print(`Instancia seleccionada automáticamente: ${this.formatAppInstanceLabel(only)}`);
      return only;
    }
    const choice = await this.question(`Selecciona instancia [1-${instances.length}]`, '1');
    const index = Number.parseInt(choice, 10);
    if (!Number.isInteger(index) || index < 1 || index > instances.length) return null;
    return instances[index - 1];
  }

  formatAppInstanceLabel(instance) {
    const name = instance?.name || 'unnamed';
    const projectId = instance?.firebaseProjectId ? `project=${instance.firebaseProjectId}` : 'project=(pendiente)';
    const directory = instance?.directory || '';
    return `${name} [${projectId}] ${directory}`;
  }

  async launchSetupInInstance(instanceDir) {
    this.print(`\nRelanzando setup dentro de la instancia:\n  ${instanceDir}\n`);
    execSync('npm run setup', { cwd: instanceDir, stdio: 'inherit' });
  }

  async showSetupBriefing() {
    const lines = buildSetupBriefingLines({
      firebaseCliInstalled: detectFirebaseCliInstalled(),
      repoUrl: process.env.PLANNING_GAME_REPO_URL || './INSTALL.md',
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

    await this.selectFirebaseCliAccount();
    await this.ensureFirebaseCliSessionForSelectedAccount();

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
    setDefaultFirebaseProject(ROOT_DIR, this.config.client.PUBLIC_FIREBASE_PROJECT_ID);
    this.print(`  ✅ .firebaserc actualizado (default=${this.config.client.PUBLIC_FIREBASE_PROJECT_ID})`);
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

    const firestore = checkFirestoreEnabled(projectId, {
      accountEmail: this.config.firebaseCliAccount,
    });
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

    const functions = checkFunctionsEnabled(projectId, {
      accountEmail: this.config.firebaseCliAccount,
    });
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

  getConfiguredSecretValue(secretName) {
    const fromConfig = this.config.functions?.[secretName];
    if (fromConfig !== undefined && fromConfig !== null && String(fromConfig).trim() !== '') {
      return String(fromConfig).trim();
    }

    const functionsEnvPath = path.join(ROOT_DIR, 'functions', '.env');
    if (fs.existsSync(functionsEnvPath)) {
      const envContent = fs.readFileSync(functionsEnvPath, 'utf8');
      const match = envContent.match(new RegExp(`^${secretName}=(.*)$`, 'm'));
      if (match?.[1] && String(match[1]).trim() !== '') {
        return String(match[1]).trim();
      }
    }

    if (secretName === 'IA_GLOBAL_ENABLE') return 'false';
    if (secretName === 'IA_API_KEY') return 'disabled-by-setup';
    if (secretName === 'CREATE_CARD_API_KEY') return crypto.randomBytes(24).toString('hex');
    return null;
  }

  async ensureFunctionSecret(secretName, projectId) {
    let value = this.getConfiguredSecretValue(secretName);
    if (!value) {
      value = await this.question(`  Valor para secreto ${secretName} (vacío para omitir)`);
    }

    if (!value || String(value).trim() === '') {
      this.print(`  ⚠️  No se pudo resolver valor para secreto ${secretName}.`);
      return false;
    }

    const tmpSecretPath = path.join(os.tmpdir(), `pgxp-secret-${secretName}-${Date.now()}.txt`);
    fs.writeFileSync(tmpSecretPath, String(value), 'utf8');

    try {
      const command = this.withFirebaseAccount(
        `firebase functions:secrets:set ${secretName} --project ${projectId} --data-file "${tmpSecretPath}" --force`
      );
      execSync(command, { stdio: 'inherit', cwd: ROOT_DIR, shell: '/bin/bash' });
      this.print(`  ✅ Secreto ${secretName} configurado automáticamente.`);
      return true;
    } catch (secretError) {
      this.print(`  ⚠️  Error configurando secreto ${secretName}: ${secretError.message}`);
      return false;
    } finally {
      try {
        fs.unlinkSync(tmpSecretPath);
      } catch {
        // ignore cleanup issues
      }
    }
  }

  async deploy() {
    this.print('Ahora se desplegará la aplicación a Firebase.\n');

    if (!await this.confirm('¿Deseas desplegar ahora?')) {
      this.print('  ⏭️  Puedes desplegar manualmente después con: npm run deploy');
      return;
    }

    const projectId = this.config.client['PUBLIC_FIREBASE_PROJECT_ID'];
    const deployCommands = buildDeployCommands(projectId, this.config.firebaseCliAccount);

    try {
      this.print('\n  Seleccionando proyecto Firebase...');
      const useOutput = String(execSync(this.withFirebaseAccount(`firebase use ${projectId}`), {
        stdio: 'pipe',
        cwd: ROOT_DIR,
        encoding: 'utf8',
      }) || '');
      if (useOutput.trim()) {
        this.print(useOutput.trim());
      }

      const directMatch = isExpectedProjectInFirebaseUseOutput(useOutput, projectId);
      const activeMatch = isActiveFirebaseProject(ROOT_DIR, projectId);
      if (!directMatch && !activeMatch) {
        throw new Error(`Proyecto activo distinto al esperado (${projectId}). Despliegue cancelado por seguridad.`);
      }

      this.print('\n  Configurando targets de Realtime Database (main/tests)...');
      try {
        const targetResult = ensureDatabaseTargets({
          projectId,
          databaseUrl: this.config.client.PUBLIC_FIREBASE_DATABASE_URL,
          accountEmail: this.config.firebaseCliAccount,
        });
        if (targetResult.instanceName) {
          ensureDatabaseTargetsInFirebaserc({
            rootDir: ROOT_DIR,
            projectId,
            instanceName: targetResult.instanceName,
          });
        }
        if (targetResult.configured) {
          this.print(`  ✅ Targets RTDB configurados automáticamente (instancia: ${targetResult.instanceName})`);
        } else {
          this.print('  ⚠️  No se pudieron configurar targets RTDB automáticamente (URL inválida).');
        }

        const hasMain = hasDatabaseTargetConfigured({ rootDir: ROOT_DIR, projectId, targetName: 'main' });
        const hasTests = hasDatabaseTargetConfigured({ rootDir: ROOT_DIR, projectId, targetName: 'tests' });
        if (!hasMain || !hasTests) {
          throw new Error('No se pudieron persistir targets RTDB en .firebaserc');
        }
      } catch (targetError) {
        this.print(`  ⚠️  Error configurando targets RTDB: ${targetError.message}`);
        this.print('  Continuamos con despliegue; si falla, revisa .firebaserc -> targets.database.main/tests');
      }

      this.print('\n  Desplegando reglas de base de datos...');
      const rulesPrep = ensureRequiredFirebaseRuleFiles(ROOT_DIR);
      if (rulesPrep.created.length > 0) {
        this.print(`  ✅ Archivos de reglas generados automáticamente: ${rulesPrep.created.join(', ')}`);
      }
      if (rulesPrep.repaired.length > 0) {
        this.print(`  ✅ Archivos de reglas reparados automáticamente: ${rulesPrep.repaired.join(', ')}`);
      }
      execSync(deployCommands.rules, { stdio: 'inherit', cwd: ROOT_DIR });

      this.print('\n  Desplegando Cloud Functions...');
      this.print('  Habilitando APIs requeridas para Functions/Extensions...');
      const apiEnable = enableRequiredProjectApis({
        projectId,
        accountEmail: this.config.firebaseCliAccount,
        services: [
          'cloudfunctions.googleapis.com',
          'cloudbuild.googleapis.com',
          'artifactregistry.googleapis.com',
          'firebaseextensions.googleapis.com',
          'secretmanager.googleapis.com',
        ],
      });
      if (apiEnable.enabled) {
        this.print('  ✅ APIs habilitadas/verificadas.');
      } else {
        this.print('  ⚠️  No se pudieron habilitar APIs automáticamente con gcloud.');
        if (apiEnable.reason) {
          this.print(`     Motivo: ${apiEnable.reason.split('\n')[0]}`);
        }
      }

      const functionsPrep = ensureFunctionsDependencies(ROOT_DIR);
      if (functionsPrep.installed) {
        this.print('  ✅ Dependencias de functions instaladas automáticamente.');
      }
      if (functionsPrep.auditFixApplied) {
        this.print('  ✅ npm audit fix ejecutado en functions.');
      }
      if (hasBlockingAuditVulnerabilities(functionsPrep.auditAfter)) {
        this.print('  ⚠️  Siguen vulnerabilidades MODERATE/HIGH/CRITICAL en functions tras audit fix.');
      }
      const maxFunctionsDeployAttempts = 6;
      let functionsDeployed = false;
      let lastFunctionsError = null;

      for (let attempt = 1; attempt <= maxFunctionsDeployAttempts; attempt++) {
        try {
          const functionsOutput = String(execSync(deployCommands.functions, {
            stdio: 'pipe',
            cwd: ROOT_DIR,
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 20,
          }) || '');
          if (functionsOutput.trim()) {
            this.print(functionsOutput.trim());
          }
          functionsDeployed = true;
          break;
        } catch (functionsError) {
          lastFunctionsError = functionsError;
          const stdout = String(functionsError?.stdout || '');
          const stderr = String(functionsError?.stderr || '');
          const merged = `${stdout}\n${stderr}`.trim();
          if (merged) this.print(merged);

          const missingSecret = getMissingSecretFromDeployError(merged);
          if (missingSecret) {
            this.print(`  ⚠️  Intento ${attempt}/${maxFunctionsDeployAttempts}: falta secreto ${missingSecret}. Intentando configurarlo...`);
            const secretConfigured = await this.ensureFunctionSecret(missingSecret, projectId);
            if (!secretConfigured) {
              throw functionsError;
            }
            const waitSecretSeconds = 8;
            this.print(`  ⏳ Esperando ${waitSecretSeconds}s para propagación del secreto antes del reintento...`);
            await new Promise((resolve) => setTimeout(resolve, waitSecretSeconds * 1000));
            continue;
          }

          if (!shouldRetryFunctionsDeploy(merged, attempt, maxFunctionsDeployAttempts)) {
            throw functionsError;
          }

          const missingApi = getMissingApiFromDeployError(merged);
          if (!missingApi) {
            throw functionsError;
          }

          this.print(`  ⚠️  Intento ${attempt}/${maxFunctionsDeployAttempts}: falta API ${missingApi}. Reintentando automáticamente...`);
          const missingApiEnable = enableRequiredProjectApis({
            projectId,
            accountEmail: this.config.firebaseCliAccount,
            services: [missingApi],
          });
          if (missingApiEnable.enabled) {
            this.print(`  ✅ API ${missingApi} habilitada/verificada.`);
          } else {
            this.print(`  ⚠️  No se pudo habilitar automáticamente ${missingApi}.`);
          }

          const waitSeconds = 40;
          this.print(`  ⏳ Esperando ${waitSeconds}s para propagación antes del reintento...`);
          await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        }
      }

      if (!functionsDeployed && lastFunctionsError) {
        throw lastFunctionsError;
      }

      this.print('\n  Construyendo aplicación...');
      execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });

      this.print('\n  Desplegando hosting...');
      execSync(deployCommands.hosting, { stdio: 'inherit', cwd: ROOT_DIR });

      this.print('\n  ✅ Despliegue completado!');
    } catch (error) {
      this.print(`\n  ❌ Error en el despliegue: ${error.message}`);
      const errText = String(error?.stderr || '') + '\n' + String(error?.stdout || '') + '\n' + String(error?.message || '');
      const missingApi = extractMissingApiFromErrorText(errText);
      if (missingApi && errText.includes('403')) {
        const projectId = this.config.client['PUBLIC_FIREBASE_PROJECT_ID'];
        this.print(`  ⚠️  La API ${missingApi} no está habilitada o no ha propagado permisos aún.`);
        this.print(`  Ejecuta: gcloud services enable ${missingApi} --project ${projectId}`);
        this.print('  Espera 2-5 minutos y reintenta el deploy.');
      }

      this.print('  Intentando rescate automático con IA...');
      const rescue = attemptAiRescue({
        step: 'PASO 8/10 · Despliegue inicial',
        rootDir: ROOT_DIR,
        errorText: errText,
      });
      if (rescue.attempted && rescue.success) {
        this.print(`  ✅ Rescate IA ejecutado con ${rescue.cli}. Revisa los cambios y reintenta npm run setup.`);
      } else if (rescue.attempted && !rescue.success) {
        this.print(`  ⚠️  El rescate IA con ${rescue.cli} falló: ${rescue.reason}`);
      } else {
        this.print('  ℹ️  No se encontró CLI de IA disponible (claude/codex).');
      }

      this.print('  Puedes intentar desplegar manualmente después.');
    }
  }

  withFirebaseAccount(command) {
    return appendFirebaseAccountFlag(command, this.config.firebaseCliAccount);
  }

  async selectFirebaseCliAccount() {
    let accounts = [];
    try {
      const output = execSync('firebase login:list', { stdio: 'pipe', encoding: 'utf8' });
      accounts = parseFirebaseAccounts(output);
    } catch {
      // ignore
    }

    if (accounts.length === 0) {
      const manual = await this.question('Cuenta Firebase CLI para esta instancia (email, opcional)');
      this.config.firebaseCliAccount = manual || '';
      if (this.config.firebaseCliAccount) {
        this.print(`  ✅ Cuenta Firebase seleccionada: ${this.config.firebaseCliAccount}`);
      }
      return;
    }

    this.print('Cuentas detectadas en Firebase CLI:');
    accounts.forEach((account, idx) => this.print(`  ${idx + 1}. ${account}`));
    this.print(`  ${accounts.length + 1}. Usar cuenta activa por defecto`);
    this.print(`  ${accounts.length + 2}. Escribir otro email`);

    const choice = await this.question(`Selecciona [1-${accounts.length + 2}]`, String(accounts.length + 1));
    const parsed = Number.parseInt(choice, 10);

    if (parsed >= 1 && parsed <= accounts.length) {
      this.config.firebaseCliAccount = accounts[parsed - 1];
    } else if (parsed === accounts.length + 2) {
      this.config.firebaseCliAccount = await this.question('Email de cuenta Firebase');
    } else {
      this.config.firebaseCliAccount = '';
    }

    if (this.config.firebaseCliAccount) {
      this.print(`  ✅ Cuenta Firebase seleccionada: ${this.config.firebaseCliAccount}`);
    } else {
      this.print('  ℹ️  Se usará la cuenta activa por defecto de Firebase CLI');
    }
  }

  async ensureFirebaseCliSessionForSelectedAccount() {
    const selectedAccount = String(this.config.firebaseCliAccount || '').trim();
    let loginListOutput = '';

    try {
      loginListOutput = String(execSync('firebase login:list', { stdio: 'pipe', encoding: 'utf8' }) || '');
    } catch {
      loginListOutput = '';
    }

    const availableAccounts = parseFirebaseAccounts(loginListOutput);
    const activeAccount = parseActiveFirebaseAccount(loginListOutput);

    if (!selectedAccount) {
      if (activeAccount) {
        this.print(`✅ Firebase autenticado con cuenta activa: ${activeAccount}\n`);
        return;
      }

      this.print('Necesitas autenticarte en Firebase...\n');
      if (await this.confirm('¿Ejecutar firebase login?')) {
        execSync('firebase login', { stdio: 'inherit' });
      }
      return;
    }

    if (!availableAccounts.includes(selectedAccount)) {
      this.print(`⚠️  La cuenta seleccionada (${selectedAccount}) no está autenticada en Firebase CLI.`);
      if (await this.confirm(`¿Autenticar ahora ${selectedAccount} con firebase login:add?`, true)) {
        execSync('firebase login:add', { stdio: 'inherit' });
      }
    }

    if (activeAccount && activeAccount !== selectedAccount) {
      this.print(`  Cambiando cuenta activa de Firebase CLI: ${activeAccount} -> ${selectedAccount}`);
      try {
        execSync(`firebase login:use ${selectedAccount}`, { stdio: 'inherit', cwd: ROOT_DIR });
      } catch (error) {
        this.print(`  ⚠️  No se pudo cambiar la cuenta activa automáticamente: ${error.message}`);
      }
    }

    try {
      execSync(this.withFirebaseAccount('firebase projects:list'), { stdio: 'pipe', cwd: ROOT_DIR });
      this.print(`✅ Firebase autenticado y validado para: ${selectedAccount}\n`);
    } catch {
      this.print(`⚠️  No se pudo validar acceso con la cuenta ${selectedAccount}.`);
      this.print('   Revisa credenciales/permisos antes de continuar.\n');
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
      this.print('  Para asignar App Admin se usa Firebase Admin SDK con credenciales ADC de gcloud.');
      this.print('  Esto NO autentica como Super Admin de la app; solo usa una cuenta con permisos de admin en Firebase.\n');

      const defaultGcloudAccount = this.config.firebaseCliAccount || '';
      const gcloudAccount = await this.question(
        '  Cuenta gcloud para esta operación (email instalador Firebase, vacío=cuenta activa)',
        defaultGcloudAccount
      );

      // Check if gcloud is authenticated
      try {
        execSync(buildGcloudAdcPrintTokenCommand(gcloudAccount), { stdio: 'pipe' });
      } catch {
        this.print('\n  Necesitas autenticarte con gcloud...');
        try {
          execSync(buildGcloudAdcLoginCommand(gcloudAccount), { stdio: 'inherit' });
        } catch (loginError) {
          this.print('\n  ⚠️  Falló autenticación web de gcloud.');
          this.print('  Prueba este comando manual (sin navegador):');
          this.print(`  ${buildGcloudAdcLoginNoBrowserCommand(gcloudAccount)}`);
          throw loginError;
        }
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

    // 1. Legacy migration (explicit opt-in only)
    if (mode === 'new' && !existingInstance) {
      try {
        const legacy = manager.detectLegacyInstallation();
        if (legacy.found) {
          this.print('  Detectada instalación MCP legacy: "planning-game".');
          this.print('  No se modificará nada automáticamente.\n');

          if (await this.confirm('  ¿Quieres migrar ahora esa instalación legacy a "planning-game-pro"?', false)) {
            const migrated = manager.migrateLegacy();
            if (migrated) {
              this.print('  ✅ Migrada a instancia "pro" (planning-game-pro)');
              if (!await this.confirm('\n¿Deseas crear una instancia MCP adicional?', false)) {
                this.mcpInstalled = true;
                this.mcpInstanceName = 'pro';
                return;
              }
            }
          } else {
            this.print('  ⏭️  Se mantiene la instalación legacy sin cambios.');
          }
        }
      } catch {
        // Legacy detection failed, continue normally
      }
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

    if (mode === 'new' && !existingInstance) {
      const existingInstances = manager.listInstances().filter((instance) => !instance?.stale);
      const options = buildMcpActionOptions(existingInstances);

      if (existingInstances.length > 0) {
        this.print('\n  Instancias MCP existentes:');
        existingInstances.forEach((instance, idx) => this.print(`  ${idx + 1}. ${formatMcpInstanceLabel(instance)}`));
        this.print('');
      }

      if (options.length > 1) {
        this.print('  ¿Qué quieres hacer con MCP?');
        options.forEach((opt) => this.print(`  ${opt.key}. ${opt.label}`));

        const actionChoice = await this.question('  Selecciona opción MCP', '1');
        const action = options.find((opt) => opt.key === actionChoice)?.action || 'use-existing';

        if (action === 'use-existing') {
          const selected = await this.selectExistingMcpInstance(existingInstances);
          if (!selected) {
            this.print('  ⏭️  No se seleccionó instancia válida. Se creará una nueva instancia MCP.');
          } else {
            this.mcpInstalled = true;
            this.mcpInstanceName = selected.name;
            this.print(`  ✅ Se usará la instancia MCP existente: planning-game-${selected.name}`);

            if (await this.confirm('  ¿Quieres actualizar ahora su configuración?', false)) {
              await this.updateExistingInstance(manager, selected);
            }
            return;
          }
        }
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

  async selectExistingMcpInstance(instances) {
    if (!Array.isArray(instances) || instances.length === 0) return null;

    this.print('\n  Selecciona una instancia existente:');
    instances.forEach((instance, idx) => {
      this.print(`  ${idx + 1}. ${formatMcpInstanceLabel(instance)}`);
    });

    const selection = await this.question(`  Instancia [1-${instances.length}]`, '1');
    const index = Number.parseInt(selection, 10);
    if (!Number.isInteger(index) || index < 1 || index > instances.length) return null;
    return instances[index - 1];
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

    const resolvedPath = resolveInputPath(keyPath, os.homedir());
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

    const developerName = await this.question('  Tu nombre');
    const developerEmail = await this.question('  Tu email');
    const identity = buildDefaultMcpUserIdentity({ developerName, developerEmail });

    if (identity.developerName && identity.developerEmail) {
      try {
        manager.writeMcpUserConfig(instanceName, identity);
        this.print(`  ℹ️  Developer ID asignado automáticamente: ${identity.developerId}`);
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
      this.print('  Karajan-Code es una instalación global compartida (no por instancia).\n');

      this.print('  Verificando prerequisitos para clonar desde GitHub...');
      const gitAvailable = kjManager.isGitAvailable();
      const sshAccess = kjManager.hasGithubSshAccess();
      this.print(`    Git CLI: ${gitAvailable ? '✅' : '❌'}`);
      this.print(`    Acceso SSH a GitHub: ${sshAccess ? '✅' : '❌'}`);

      if (!gitAvailable) {
        this.print('\n  ❌ Git no está disponible en este sistema.');
        this.print('  Instala Git y vuelve a ejecutar setup.');
        return;
      }

      if (!sshAccess) {
        this.print('\n  ⚠️  No hay acceso SSH a GitHub. El clone puede pedir credenciales.');
        this.print('  1. Reintentar verificación SSH');
        this.print('  2. Continuar (clone igualmente)');
        this.print('  3. Omitir Karajan por ahora');
        const sshChoice = await this.question('  Selecciona [1-3]', '1');

        if (sshChoice === '1') {
          const sshRetry = kjManager.hasGithubSshAccess();
          this.print(`  Reintento SSH: ${sshRetry ? '✅' : '❌'}`);
          if (!sshRetry) {
            this.print('  Omitiendo Karajan por ahora. Puedes configurarlo después desde "Gestionar Karajan + Bridge".');
            return;
          }
        } else if (sshChoice === '3') {
          this.print('  Omitiendo Karajan por ahora. Puedes configurarlo después desde "Gestionar Karajan + Bridge".');
          return;
        }
      }

      const defaultKjDir = path.join(path.dirname(ROOT_DIR), 'karajan-code');
      this.print('\n  ¿Cómo quieres continuar?');
      this.print('  1. Usar un Karajan-Code ya clonado');
      this.print('  2. Clonar Karajan-Code en una ruta nueva');
      const kjChoice = await this.question('  Selecciona [1-2]', '2');

      const inputDir = await this.question('  Directorio para Karajan-Code', defaultKjDir);
      const kjDir = resolveInputPath(inputDir, os.homedir());
      const useExisting = kjChoice === '1';

      if (useExisting && !kjManager.isKjInstalled(kjDir)) {
        this.print(`  ❌ No se encontró Karajan-Code válido en: ${kjDir}`);
        this.print('  Usa una ruta existente o elige clonar una ruta nueva.');
        return;
      }

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
