/**
 * Tests for the pg-app root component module.
 * Since vitest runs in node environment (no DOM), we test the module exports
 * and logic rather than rendering.
 */

import { describe, it, expect } from 'vitest';

describe('presentation/pg-app', () => {
  it('module can be imported without errors', async () => {
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

  it('ROUTE_COMPONENTS maps routes to actual component tag names', async () => {
    const { ROUTE_COMPONENTS } = await import('../../src/presentation/pg-app.js');
    expect(ROUTE_COMPONENTS.projects).toBe('pg-project');
    expect(ROUTE_COMPONENTS.project).toBe('pg-project');
    expect(ROUTE_COMPONENTS.dashboard).toBe('pg-dashboard');
    expect(ROUTE_COMPONENTS.wip).toBe('pg-wip');
    expect(ROUTE_COMPONENTS.admin).toBe('pg-admin');
    expect(ROUTE_COMPONENTS.login).toBe('pg-login-view');
  });

  it('PgApp has setAuthenticated method', async () => {
    const { PgApp } = await import('../../src/presentation/pg-app.js');
    expect(typeof PgApp.prototype.setAuthenticated).toBe('function');
  });

  it('PgApp has _authenticated and _routeName reactive properties', async () => {
    const { PgApp } = await import('../../src/presentation/pg-app.js');
    const props = PgApp.properties;
    expect(props).toHaveProperty('_authenticated');
    expect(props).toHaveProperty('_routeName');
    expect(props._authenticated.state).toBe(true);
    expect(props._routeName.state).toBe(true);
  });

  it('PgApp has _currentView reactive property for project route', async () => {
    const { PgApp } = await import('../../src/presentation/pg-app.js');
    const props = PgApp.properties;
    expect(props).toHaveProperty('_currentView');
    expect(props._currentView.state).toBe(true);
  });

  it('PgApp has _projectId reactive property', async () => {
    const { PgApp } = await import('../../src/presentation/pg-app.js');
    const props = PgApp.properties;
    expect(props).toHaveProperty('_projectId');
    expect(props._projectId.state).toBe(true);
  });
});
