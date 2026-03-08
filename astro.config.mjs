import { defineConfig } from 'astro/config';
import { readFileSync, unlinkSync } from 'node:fs';
import { generateFirebaseConfig } from './scripts/generateFirebaseConfig.js';
import { generateFirebaseMessagingServiceWorker } from './scripts/generateFirebaseMessagingServiceWorker.js';
import { generateIaConfig } from './scripts/generateIaConfig.js';

// NOTA: Las variables de entorno ya están cargadas por el script npm (dotenv -e .env.dev/pro/pre)
// NO llamar a dotenv.config() aquí porque sobrescribiría las variables correctas

// Generar los archivos antes de iniciar la aplicación
generateFirebaseConfig(process.env);
generateFirebaseMessagingServiceWorker(process.env);
// theme-config.js uses CSS variables now — no longer auto-generated from KANBAN_COLORS
generateIaConfig(process.env);

// Read dev port override from instance-manager (when another instance is already serving)
let devPort = 4321;
try {
  const portStr = readFileSync('.dev-port', 'utf8').trim();
  const parsed = parseInt(portStr, 10);
  if (parsed > 0) {
    devPort = parsed;
    unlinkSync('.dev-port');
  }
} catch { /* no override */ }

// Exportar la configuración de Astro
export default defineConfig({
  integrations: [],
  server: { port: devPort },
  alias: {
    '@firebase': './src/firebase',
  },
  build: {
    target: 'esnext'
  },
  vite: {
    esbuild: {
      target: 'esnext'
    }
  }
});
