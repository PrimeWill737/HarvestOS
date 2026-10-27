import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw new Error('Browser runtime error: ' + error.message);
  });
});
test('public landing and stakeholder routes render', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Every harvest');
  for (const path of [
    'how-it-works',
    'farmers',
    'buyers',
    'logistics',
    'storage',
    'impact',
    'about',
    'contact',
    'privacy',
    'terms',
  ]) {
    await page.goto('/' + path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto('/');
  await page.screenshot({ path: 'docs/screenshots/home-desktop.png', fullPage: true });
});
test('all stakeholder workspaces render and disclose preview', async ({ page }) => {
  for (const role of [
    'farmer',
    'buyer',
    'transport',
    'storage',
    'cooperative',
    'operations',
    'admin',
    'super-admin',
  ]) {
    await page.goto('/workspace/' + role);
    await expect(page.getByText('Local preview', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto('/workspace/operations');
  await page.screenshot({ path: 'docs/screenshots/operations-desktop.png', fullPage: true });
  await page.goto('/workspace/super-admin/users');
  await expect(page.getByRole('button', { name: 'Manage access' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/super-admin-desktop.png', fullPage: true });
});
test('preview forms cannot create real records and risk explanation is visible', async ({
  page,
}) => {
  await page.goto('/workspace/farmer/harvests');
  await page.getByRole('button', { name: 'Create a harvest draft' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save record' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close form' }).click();
  await page.getByRole('button', { name: 'View record details' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('not a probability of spoilage');
});
test('320px registration and workspace remain within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/auth/register');
  await expect(page.getByLabel('Email address')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'docs/screenshots/register-mobile.png', fullPage: true });
  await page.goto('/workspace/operations');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Risk queue' })).toBeVisible();
  await page.getByRole('link', { name: 'Risk queue' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Risk queue');
  await page.screenshot({ path: 'docs/screenshots/risk-mobile.png', fullPage: true });
});
test('unconfigured privileged API fails closed', async ({ request }) => {
  const response = await request.get('/api/admin/users');
  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body.error.code).toBe('SETUP_REQUIRED');
});
