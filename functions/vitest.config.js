import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
  resolve: {
    alias: {
      '@pgv2/domain': fileURLToPath(new URL('../packages/domain', import.meta.url)),
    },
  },
});
