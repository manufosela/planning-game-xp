/**
 * Tests for the pg-app root component module.
 * Since vitest runs in node environment (no DOM), we test the module exports
 * and logic rather than rendering.
 */

import { describe, it, expect } from 'vitest';

describe('presentation/pg-app', () => {
  it('module can be imported without errors', async () => {
    // In node env, customElements is not available, so we test
    // that the module structure is correct by checking exports
    const mod = await import('../../src/presentation/pg-app.js');
    expect(mod).toBeDefined();
  });

  it('exports PgApp class', async () => {
    const { PgApp } = await import('../../src/presentation/pg-app.js');
    expect(PgApp).toBeDefined();
    expect(typeof PgApp).toBe('function');
  });

  it('PgApp has route-to-component mapping', async () => {
    const { ROUTE_COMPONENTS } = await import('../../src/presentation/pg-app.js');
    expect(ROUTE_COMPONENTS).toBeDefined();
    expect(typeof ROUTE_COMPONENTS).toBe('object');
    expect(ROUTE_COMPONENTS).toHaveProperty('projects');
    expect(ROUTE_COMPONENTS).toHaveProperty('project');
    expect(ROUTE_COMPONENTS).toHaveProperty('dashboard');
    expect(ROUTE_COMPONENTS).toHaveProperty('login');
  });
});
