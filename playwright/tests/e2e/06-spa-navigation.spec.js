/**
 * E2E Tests: SPA Navigation with View Transitions
 *
 * Verifies that navigation between main pages works via the AppShellRouter
 * without full page reloads, that persistent elements maintain DOM identity,
 * and that browser back/forward navigation works correctly.
 */

import { test, expect } from '../../fixtures/auth.fixture.js';

/**
 * Pages that participate in the AppShellRouter SPA navigation.
 * index (/) is the landing page and does NOT use the shell router,
 * so navigating to/from it triggers a full reload - we test shell routes only.
 */
const SHELL_PAGES = [
  { path: '/projects/', label: 'Projects', navSelector: 'a.nav-link[href="/projects"]' },
  { path: '/dashboard/', label: 'Dashboard', navSelector: 'a.nav-link[href="/dashboard/"]' },
  { path: '/sprintview/', label: 'Sprint View', navSelector: 'a.nav-link[href*="sprintview"]' },
  { path: '/proposals/', label: 'Proposals', navSelector: 'a.nav-link[href="/proposals/"]' },
  { path: '/wip/', label: 'WIP', navSelector: 'a.nav-link[href="/wip/"]' },
  { path: '/adminproject/', label: 'Admin Project', navSelector: 'a.nav-link[href="/adminproject/"]' },
];

/**
 * Helper: stamp a unique marker on a persistent DOM element and return it.
 * If the element retains the marker after navigation, no full reload occurred.
 */
async function stampElement(page, selector, markerAttr = 'data-e2e-stamp') {
  const stamp = 'stamp-' + Date.now();
  await page.evaluate(
    ({ selector, markerAttr, stamp }) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(markerAttr, stamp);
    },
    { selector, markerAttr, stamp }
  );
  return stamp;
}

async function getStamp(page, selector, markerAttr = 'data-e2e-stamp') {
  return page.evaluate(
    ({ selector, markerAttr }) => {
      const el = document.querySelector(selector);
      return el ? el.getAttribute(markerAttr) : null;
    },
    { selector, markerAttr }
  );
}

/**
 * Wait for the shell router to finish loading a partial.
 */
async function waitForShellNavigation(page, expectedPath) {
  await page.waitForURL('**' + expectedPath + '**', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  // Small settling time for scripts injected by shell router
  await page.waitForTimeout(300);
}

test.describe('SPA Navigation', () => {
  test.setTimeout(120000);

  test('navigate between shell pages without full page reload', async ({ sharedPage }) => {
    const page = sharedPage;

    // Start on a shell page so the router is active
    await page.goto('/dashboard/');
    await page.waitForLoadState('networkidle');

    // Wait for the shell router to be available
    await page.waitForFunction(() => !!window.appShellRouter, { timeout: 10000 });

    // Stamp the header to detect full reloads
    const headerStamp = await stampElement(page, 'header');
    expect(headerStamp).toBeTruthy();

    // Navigate through each shell page via nav links
    for (const target of SHELL_PAGES) {
      console.log('  Navigating to ' + target.label + ' (' + target.path + ')');

      const navLink = page.locator(target.navSelector).first();

      // Some links may be hidden (super admin only) - skip if not visible
      if (!(await navLink.isVisible({ timeout: 2000 }).catch(() => false))) {
        console.log('    Skipped (link not visible)');
        continue;
      }

      await navLink.click();
      await waitForShellNavigation(page, target.path);

      // Verify URL changed
      expect(page.url()).toContain(target.path);

      // Verify the header stamp survived (no full reload)
      const currentStamp = await getStamp(page, 'header');
      expect(currentStamp).toBe(headerStamp);
    }
  });

  test('persistent elements maintain state across navigations', async ({ sharedPage }) => {
    const page = sharedPage;

    await page.goto('/projects/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!window.appShellRouter, { timeout: 10000 });

    // Verify header, nav, and footer exist
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('nav.menu-nav')).toBeVisible();

    // Stamp header and nav
    const headerStamp = await stampElement(page, 'header', 'data-e2e-header');
    const navStamp = await stampElement(page, 'nav.menu-nav', 'data-e2e-nav');

    // Check that project-selector keeps its state if visible
    const projectSelector = page.locator('project-selector');
    let selectedProjectBefore = null;
    if (await projectSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
      selectedProjectBefore = await page.evaluate(() => {
        const ps = document.querySelector('project-selector');
        return ps ? (ps.value || ps.getAttribute('selected') || ps.projectId || null) : null;
      });
    }

    // Navigate to dashboard
    const dashboardLink = page.locator('a.nav-link[href="/dashboard/"]').first();
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click();
      await waitForShellNavigation(page, '/dashboard/');

      // Verify stamps survive
      expect(await getStamp(page, 'header', 'data-e2e-header')).toBe(headerStamp);
      expect(await getStamp(page, 'nav.menu-nav', 'data-e2e-nav')).toBe(navStamp);

      // Verify project-selector state persists
      if (selectedProjectBefore !== null) {
        const selectedProjectAfter = await page.evaluate(() => {
          const ps = document.querySelector('project-selector');
          return ps ? (ps.value || ps.getAttribute('selected') || ps.projectId || null) : null;
        });
        expect(selectedProjectAfter).toBe(selectedProjectBefore);
      }
    }

    // Navigate to proposals
    const proposalsLink = page.locator('a.nav-link[href="/proposals/"]').first();
    if (await proposalsLink.isVisible()) {
      await proposalsLink.click();
      await waitForShellNavigation(page, '/proposals/');

      // Stamps should still be there
      expect(await getStamp(page, 'header', 'data-e2e-header')).toBe(headerStamp);
      expect(await getStamp(page, 'nav.menu-nav', 'data-e2e-nav')).toBe(navStamp);
    }
  });

  test('page re-initialization on return visit', async ({ sharedPage }) => {
    const page = sharedPage;

    await page.goto('/projects/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!window.appShellRouter, { timeout: 10000 });

    // Stamp the main content area to track partial replacement
    await stampElement(page, '[data-main], #mainContainer, main', 'data-e2e-main');
    const firstMainStamp = await getStamp(page, '[data-main], #mainContainer, main', 'data-e2e-main');

    // Navigate away to dashboard
    const dashboardLink = page.locator('a.nav-link[href="/dashboard/"]').first();
    if (!(await dashboardLink.isVisible())) {
      console.log('  Dashboard link not visible, skipping re-init test');
      return;
    }
    await dashboardLink.click();
    await waitForShellNavigation(page, '/dashboard/');

    // The main content stamp should be gone (partial was replaced)
    const stampAfterNav = await getStamp(page, '[data-main], #mainContainer, main', 'data-e2e-main');
    expect(stampAfterNav).not.toBe(firstMainStamp);

    // Navigate back to projects
    const projectsLink = page.locator('a.nav-link[href="/projects"]').first();
    await projectsLink.click();
    await waitForShellNavigation(page, '/projects/');

    // The main container should have new content (fresh data loaded)
    const hasProjectContent = await page.evaluate(() => {
      const main = document.querySelector('[data-main], #mainContainer, main');
      return main ? main.innerHTML.length > 0 : false;
    });
    expect(hasProjectContent).toBe(true);
  });

  test('browser back/forward navigation works with shell router', async ({ sharedPage }) => {
    const page = sharedPage;

    // Start at projects
    await page.goto('/projects/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!window.appShellRouter, { timeout: 10000 });

    // Stamp header to verify no full reload through back/forward
    const headerStamp = await stampElement(page, 'header');

    // Navigate to dashboard via nav link
    const dashboardLink = page.locator('a.nav-link[href="/dashboard/"]').first();
    if (!(await dashboardLink.isVisible())) {
      console.log('  Dashboard link not visible, skipping back/forward test');
      return;
    }
    await dashboardLink.click();
    await waitForShellNavigation(page, '/dashboard/');
    expect(page.url()).toContain('/dashboard/');

    // Navigate to proposals via nav link
    const proposalsLink = page.locator('a.nav-link[href="/proposals/"]').first();
    if (await proposalsLink.isVisible()) {
      await proposalsLink.click();
      await waitForShellNavigation(page, '/proposals/');
      expect(page.url()).toContain('/proposals/');
    }

    // Go back - should return to dashboard
    await page.goBack();
    await page.waitForURL('**/dashboard/**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/dashboard/');

    // Header should still have the stamp (no full reload)
    expect(await getStamp(page, 'header')).toBe(headerStamp);

    // Go back again - should return to projects
    await page.goBack();
    await page.waitForURL('**/projects/**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/projects/');
    expect(await getStamp(page, 'header')).toBe(headerStamp);

    // Go forward - should go to dashboard
    await page.goForward();
    await page.waitForURL('**/dashboard/**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/dashboard/');
    expect(await getStamp(page, 'header')).toBe(headerStamp);
  });

  test('active nav link updates on navigation', async ({ sharedPage }) => {
    const page = sharedPage;

    await page.goto('/projects/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!window.appShellRouter, { timeout: 10000 });

    // Verify the Projects link has the active class
    const projectsLink = page.locator('a.nav-link[href="/projects"]').first();
    if (await projectsLink.isVisible()) {
      await expect(projectsLink).toHaveClass(/active/);
    }

    // Navigate to dashboard
    const dashboardLink = page.locator('a.nav-link[href="/dashboard/"]').first();
    if (!(await dashboardLink.isVisible())) {
      console.log('  Dashboard link not visible, skipping active-link test');
      return;
    }
    await dashboardLink.click();
    await waitForShellNavigation(page, '/dashboard/');

    // Dashboard link should now be active, projects should not
    await expect(dashboardLink).toHaveClass(/active/);
    if (await projectsLink.isVisible()) {
      await expect(projectsLink).not.toHaveClass(/active/);
    }
  });
});
