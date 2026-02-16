#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const { AppInstanceManager } = require('./app-instance-manager.cjs');
const { applyInstanceOverlays } = require('./instance-config-overlay.cjs');
const { resolveInstanceName } = require('./instance-dev-helper.cjs');

const ROOT_DIR = path.join(__dirname, '..');

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function run() {
  const instanceName = resolveInstanceName(process.argv, process.env);
  if (!instanceName) {
    fail('Uso: npm run instance:dev -- <nombre-instancia>  (o define INSTANCE=<nombre>)');
  }

  const manager = new AppInstanceManager();
  const instance = manager.findByName(instanceName);
  if (!instance) {
    fail(`Instancia no encontrada: ${instanceName}`);
  }

  let restore = null;
  try {
    restore = applyInstanceOverlays(ROOT_DIR, instance.directory);
    console.log(`Usando configuración de instancia: ${instance.name} (${instance.directory})`);
  } catch (error) {
    if (restore) restore();
    fail(`No se pudo aplicar configuración de instancia: ${error.message}`);
  }

  const child = spawn('npm', ['run', 'dev'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: true,
  });

  const cleanup = () => {
    if (restore) {
      restore();
      restore = null;
      console.log('\nConfiguración de template restaurada.');
    }
  };

  const terminateChild = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', () => terminateChild('SIGINT'));
  process.on('SIGTERM', () => terminateChild('SIGTERM'));

  child.on('close', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    cleanup();
    fail(`No se pudo arrancar npm run dev: ${error.message}`);
  });
}

run();
