import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Components under /public import siblings by absolute browser URL
  // (/js/utils/...). Vite only refuses to transform those while it treats
  // /public as the public dir, which is meaningless for the test run.
  publicDir: false,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.{test,spec}.js'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'playwright/**',
      'functions/node_modules/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.config.js',
        '**/*.config.mjs',
        'scripts/',
        'src/env.d.ts'
      ]
    }
  },
  resolve: {
    alias: [
      { find: '@', replacement: '/public/js' },
      // Some web components import siblings by absolute browser URL
      // (/js/utils/...). Vite refuses to transform files under /public
      // imported that way, so map it back to the source directory.
      { find: /^\/js\//, replacement: path.join(rootDir, 'public/js/') },
      { find: '@mcp', replacement: path.join(process.env.HOME, 'mcp-servers/planning-game') },
      { find: /^\/firebase-config\.js$/, replacement: path.join(rootDir, 'tests/mocks/firebase-config.js') },
      { find: 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm', replacement: path.join(rootDir, 'tests/mocks/lit.js') },
      { find: 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm', replacement: path.join(rootDir, 'tests/mocks/lit.js') }
    ]
  }
});
