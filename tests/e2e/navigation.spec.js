/**
 * E2E scaffold: navigation and routing.
 * Tests SPA routing, pg-app component loading, and command palette.
 *
 * TODO: Activate when app is fully deployed with Firebase emulator.
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.skip(true, 'TODO: activate when app + emulators are running');

  test('/app loads pg-app component', async ({ page }) => {
    await page.goto('/app');
    const pgApp = page.locator('pg-app');

    await expect(pgApp).toBeAttached();
  });

  test('/app renders navigation bar', async ({ page }) => {
    await page.goto('/app');
    const nav = page.locator('pg-nav');

    await expect(nav).toBeAttached();
  });

  test('command palette opens on Cmd+K', async ({ page }) => {
    await page.goto('/app');

    // Trigger Cmd+K (Meta+K on Mac, Ctrl+K on Linux/Windows)
    await page.keyboard.press('Control+k');

    const commandPalette = page.locator('pg-command');
    await expect(commandPalette).toBeVisible();
  });

  test('command palette closes on Escape', async ({ page }) => {
    await page.goto('/app');

    await page.keyboard.press('Control+k');
    const commandPalette = page.locator('pg-command');
    await expect(commandPalette).toBeVisible();

    await page.keyboard.press('Escape');
    // Command palette should close or hide
  });

  test('navigation to projects page', async ({ page }) => {
    await page.goto('/app');

    // Navigate via nav link or command palette
    await page.getByRole('link', { name: /projects/i }).click();

    await expect(page).toHaveURL(/\/projects/);
  });

  test('navigation to dashboard page', async ({ page }) => {
    await page.goto('/app');

    await page.getByRole('link', { name: /dashboard/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('navigation to WIP page', async ({ page }) => {
    await page.goto('/app');

    await page.getByRole('link', { name: /wip/i }).click();

    await expect(page).toHaveURL(/\/wip/);
  });

  test('keyboard shortcut "1" switches to board view', async ({ page }) => {
    // TODO: requires authenticated session and project context
    await page.goto('/app');
    await page.keyboard.press('1');

    // Should switch to board view — verify by checking active view indicator
  });
});
