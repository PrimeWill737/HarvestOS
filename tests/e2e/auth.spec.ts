import { test, expect } from '@playwright/test';

test('authenticator recovery is available without signing in', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('link', { name: 'Administrator MFA', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Lost access to your authenticator?' }).click();
  await expect(page).toHaveURL(/\/auth\/mfa-recovery$/);
  await expect(page.getByRole('heading', { name: 'Recover authenticator access' })).toBeVisible();
  await expect(page.getByText('The administrator must verify your identity', { exact: false })).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
});

test('signed-out MFA visitors are sent to login', async ({ page }) => {
  await page.goto('/auth/mfa');
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByText('Explore local preview')).toHaveCount(0);
});

test('login requests an authenticator code and keeps invalid codes on the form', async ({ page }) => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    factors: [{ id: '22222222-2222-4222-8222-222222222222', factor_type: 'totp', status: 'verified' }],
  };
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aal: 'aal1' },
  ].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.signature';
  let passwordRequests = 0;
  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/token')) {
      passwordRequests++;
      await route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
    } else if (url.endsWith('/user')) {
      await route.fulfill({ json: user });
    } else if (url.endsWith('/challenge')) {
      await route.fulfill({ json: { id: '33333333-3333-4333-8333-333333333333', expires_at: 9999999999 } });
    } else if (url.endsWith('/verify')) {
      await route.fulfill({ status: 422, json: { code: 'mfa_verification_failed', msg: 'Invalid authenticator code' } });
    } else {
      await route.abort();
    }
  });
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.locator('input[name="password"]').fill('test-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page.getByText('Invalid authenticator code', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login$/);
  expect(passwordRequests).toBe(1);
});
