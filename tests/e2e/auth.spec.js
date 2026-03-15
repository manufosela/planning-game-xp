/**
 * E2E scaffold: authentication flow.
 * Tests login page rendering and basic auth interactions.
 *
 * TODO: Activate when Firebase emulator is configured.
 */

import { test, expect } from '@playwright/test';

test.describe('Auth flow', () => {
  test.skip(true, 'TODO: activate when Firebase emulator is running');

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page has email and password fields', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('login page has a sign-in button', async ({ page }) => {
    await page.goto('/login');
    const signInButton = page.getByRole('button', { name: /sign in|login|iniciar/i });

    await expect(signInButton).toBeVisible();
  });

  test('sign-in with valid credentials redirects to /app', async ({ page }) => {
    // TODO: requires Firebase Auth emulator
    await page.goto('/login');

    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('testpassword');
    await page.getByRole('button', { name: /sign in|login|iniciar/i }).click();

    await expect(page).toHaveURL(/\/app/);
  });

  test('sign-in with invalid credentials shows error', async ({ page }) => {
    // TODO: requires Firebase Auth emulator
    await page.goto('/login');

    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|login|iniciar/i }).click();

    // Should show an error notification or message
    await expect(page.getByText(/error|invalid|incorrect/i)).toBeVisible();
  });
});
