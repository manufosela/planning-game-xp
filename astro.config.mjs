import { defineConfig } from 'astro/config';
import lit from '@astrojs/lit';

export default defineConfig({
  integrations: [lit()],
  output: 'static',
  server: {
    host: true,
    port: 4321,
  },
  vite: {
    resolve: {
      alias: {
        '@lib': '/src/lib',
        '@components': '/src/components',
        '@styles': '/src/styles',
      }
    }
  }
});
