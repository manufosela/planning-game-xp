import { defineConfig } from 'astro/config';
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

// Exportar la configuración de Astro
export default defineConfig({
  integrations: [],
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
