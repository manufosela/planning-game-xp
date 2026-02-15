#!/usr/bin/env node
/**
 * Verification Script for Planning Game XP
 *
 * Checks that everything is properly configured:
 * - Environment files exist
 * - Firebase connection works
 * - Required dependencies installed
 * - Cloud Functions deployed
 *
 * Usage:
 *   node scripts/verify-setup.cjs
 *   npm run verify-setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { McpInstanceManager } = require('./mcp-instance-manager.cjs');
const { KjInstanceManager } = require('./kj-instance-manager.cjs');
const { InstallStateManager } = require('./install-state-manager.cjs');

const ROOT_DIR = path.join(__dirname, '..');

class SetupVerifier {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.passed = [];
  }

  check(name, fn) {
    try {
      const result = fn();
      if (result === true) {
        this.passed.push(name);
        console.log(`  ✅ ${name}`);
      } else if (result === 'warning') {
        this.warnings.push(name);
        console.log(`  ⚠️  ${name}`);
      } else {
        this.errors.push(name);
        console.log(`  ❌ ${name}`);
      }
    } catch (error) {
      this.errors.push(`${name}: ${error.message}`);
      console.log(`  ❌ ${name}: ${error.message}`);
    }
  }

  async run() {
    console.log('\n🔍 Verificando configuración de Planning Game XP...\n');

    // 1. Environment files
    console.log('📁 Archivos de entorno:');
    this.check('.env.dev existe', () => fs.existsSync(path.join(ROOT_DIR, '.env.dev')));
    this.check('.env.prod existe', () => fs.existsSync(path.join(ROOT_DIR, '.env.prod')));
    this.check('functions/.env existe', () => fs.existsSync(path.join(ROOT_DIR, 'functions', '.env')));

    // 2. Environment variables
    console.log('\n🔑 Variables de entorno:');
    this.checkEnvVariables();

    // 3. Dependencies
    console.log('\n📦 Dependencias:');
    this.check('node_modules existe', () => fs.existsSync(path.join(ROOT_DIR, 'node_modules')));
    this.check('functions/node_modules existe', () => {
      if (fs.existsSync(path.join(ROOT_DIR, 'functions', 'node_modules'))) return true;
      return 'warning';
    });

    // 4. Firebase CLI
    console.log('\n🔥 Firebase CLI:');
    this.check('Firebase CLI instalado', () => {
      execSync('firebase --version', { stdio: 'pipe' });
      return true;
    });
    this.check('Firebase project seleccionado', () => {
      try {
        const result = execSync('firebase use', { encoding: 'utf8', stdio: 'pipe', cwd: ROOT_DIR });
        return result.includes('Active Project:');
      } catch {
        return false;
      }
    });

    // 5. Firebase connection
    console.log('\n🌐 Conexión a Firebase:');
    await this.checkFirebaseConnection();

    // 6. Cloud Functions
    console.log('\n☁️  Cloud Functions:');
    this.checkCloudFunctions();

    // 7. MCP Server
    console.log('\n🔌 MCP Server:');
    this.checkMCP();

    // 8. Karajan-Code + Bridge Server
    console.log('\n🤖 Karajan-Code + Bridge Server:');
    this.checkKarajanAndBridge();

    // 9. Installation state
    this.checkInstallState();

    // Summary
    this.printSummary();
  }

  checkEnvVariables() {
    const requiredVars = [
      'PUBLIC_FIREBASE_API_KEY',
      'PUBLIC_FIREBASE_AUTH_DOMAIN',
      'PUBLIC_FIREBASE_DATABASE_URL',
      'PUBLIC_FIREBASE_PROJECT_ID',
      'PUBLIC_FIREBASE_STORAGE_BUCKET',
      'PUBLIC_SUPER_ADMIN_EMAIL',
    ];

    let envContent = '';
    try {
      envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.prod'), 'utf8');
    } catch {
      try {
        envContent = fs.readFileSync(path.join(ROOT_DIR, '.env.dev'), 'utf8');
      } catch {
        this.errors.push('No se encontró ningún archivo .env');
        return;
      }
    }

    for (const varName of requiredVars) {
      this.check(`${varName} configurado`, () => {
        const regex = new RegExp(`^${varName}=.+`, 'm');
        return regex.test(envContent);
      });
    }
  }

  async checkFirebaseConnection() {
    this.check('Puede listar proyectos Firebase', () => {
      try {
        execSync('firebase projects:list', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    });
  }

  checkCloudFunctions() {
    const requiredFunctions = [
      'addAppAdmin',
      'removeAppAdmin',
      'addAppUploader',
      'removeAppUploader',
      'syncAppAdminClaim',
      'syncAllAppAdminClaims',
    ];

    this.check('Cloud Functions definidas en index.js', () => {
      const indexPath = path.join(ROOT_DIR, 'functions', 'index.js');
      if (!fs.existsSync(indexPath)) return false;
      const content = fs.readFileSync(indexPath, 'utf8');
      return requiredFunctions.every(fn => content.includes(`exports.${fn}`));
    });
  }

  checkMCP() {
    const manager = new McpInstanceManager();

    // Engine check
    this.check('MCP Engine instalado', () => {
      if (manager.isEngineInstalled()) return true;
      return 'warning';
    });

    if (manager.isEngineInstalled()) {
      const version = manager.getEngineVersion();
      if (version) {
        console.log(`      Versión: ${version}`);
      }
    }

    // Manifest check
    const manifestPath = manager.manifestPath;
    this.check('Manifest de instancias existe', () => {
      if (fs.existsSync(manifestPath)) return true;
      return 'warning';
    });

    // Instance checks
    const instances = manager.listInstances();
    if (instances.length === 0) {
      console.log('      No hay instancias MCP configuradas (opcional)');
    }

    for (const instance of instances) {
      console.log(`\n    Instancia: ${instance.name}`);

      this.check(`  [${instance.name}] serviceAccountKey.json`, () => {
        return manager.hasServiceAccountKey(instance.name);
      });

      this.check(`  [${instance.name}] mcp.user.json`, () => {
        if (manager.hasMcpUser(instance.name)) return true;
        return 'warning';
      });

      // Check Claude registration
      this.check(`  [${instance.name}] Registrado en Claude`, () => {
        try {
          const output = execSync('claude mcp list', { encoding: 'utf8', stdio: 'pipe' });
          const mcpName = `planning-game-${instance.name}`;
          if (output.includes(mcpName)) return true;
          return 'warning';
        } catch {
          return 'warning';
        }
      });
    }
  }

  checkKarajanAndBridge() {
    const kjManager = new KjInstanceManager();

    // Check Docker availability
    this.check('Docker disponible', () => {
      if (kjManager.isDockerAvailable()) return true;
      return 'warning';
    });

    this.check('Docker Compose disponible', () => {
      if (kjManager.isDockerComposeAvailable()) return true;
      return 'warning';
    });

    // Check KJ instances
    const kjInstances = kjManager.listInstances();
    if (kjInstances.length === 0) {
      console.log('      No hay instancias Karajan-Code configuradas (Tier 3 no instalado)');
    }

    for (const instance of kjInstances) {
      console.log(`\n    Instancia KJ: ${instance.name}`);

      this.check(`  [${instance.name}] KJ repo existe`, () => {
        return instance.kjRepoPath && fs.existsSync(instance.kjRepoPath);
      });

      this.check(`  [${instance.name}] KJ instalado`, () => {
        if (instance.kjRepoPath && kjManager.isKjInstalled(instance.kjRepoPath)) return true;
        return 'warning';
      });
    }

    // Check Bridge Server
    this.check('Bridge Server Docker container', () => {
      if (kjManager.isBridgeRunning()) return true;
      return 'warning';
    });

    // Check bridge config in docker-compose
    this.check('Bridge definido en docker-compose.yml', () => {
      const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
      if (!fs.existsSync(composePath)) return 'warning';
      const content = fs.readFileSync(composePath, 'utf8');
      if (content.includes('bridge:') && content.includes('planninggame-bridge')) return true;
      return 'warning';
    });

    // Health check if bridge is running
    if (kjManager.isBridgeRunning()) {
      this.check('Bridge Server health check', () => {
        try {
          const result = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/health', {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 5000,
          });
          return result.trim() === '200';
        } catch {
          return false;
        }
      });
    }
  }

  checkInstallState() {
    const installState = new InstallStateManager();
    if (installState.isInProgress()) {
      const state = installState.load();
      console.log(`\n⚠️  Instalación interrumpida detectada (tier ${state.tier}, último paso: ${state.lastStep})`);
      console.log('    Ejecuta "npm run setup" para continuar la instalación.');
      this.warnings.push('Instalación interrumpida pendiente');
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('  RESUMEN DE VERIFICACIÓN');
    console.log('='.repeat(50));
    console.log(`\n  ✅ Pasados:    ${this.passed.length}`);
    console.log(`  ⚠️  Warnings:   ${this.warnings.length}`);
    console.log(`  ❌ Errores:    ${this.errors.length}`);

    if (this.errors.length > 0) {
      console.log('\n❌ Errores encontrados:');
      this.errors.forEach(e => console.log(`    - ${e}`));
      console.log('\n  Ejecuta "npm run setup" para corregirlos.');
      process.exit(1);
    } else if (this.warnings.length > 0) {
      console.log('\n⚠️  Configuración parcial. Algunas funcionalidades pueden no estar disponibles.');
      process.exit(0);
    } else {
      console.log('\n✅ ¡Todo configurado correctamente!');
      process.exit(0);
    }
  }
}

const verifier = new SetupVerifier();
verifier.run().catch(console.error);
