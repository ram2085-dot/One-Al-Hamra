// e2e/sso-launch.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test('SSO tile launch lands authenticated in the demo app with no second login prompt', async ({ page }) => {
  await loginAs(page, 'admin@launchpad.local');
  await page.getByRole('link', { name: /admin/i }).click();
  await page.getByLabel('Name').fill('E2E SSO Demo Service');
  await page.getByLabel('Category').fill('IT');
  await page.getByLabel('Description').fill('Created by sso-launch e2e test');
  await page.getByLabel('Support contact').fill('it@launchpad.local');
  await page.getByRole('button', { name: /create service/i }).click();
  const row = page.getByText('E2E SSO Demo Service').locator('..');
  await row.getByRole('button', { name: /manage entitlements/i }).click();
  await page.getByPlaceholder('Department').fill('Finance');
  await page.getByRole('button', { name: /add entitlement/i }).click();
  await page.getByLabel('SSO Target').selectOption('DEMO_APP_A');

  await page.getByRole('button', { name: /sign out/i }).click();
  await loginAs(page, 'finance.employee@launchpad.local');
  await page.getByText('E2E SSO Demo Service').click();
  await page.getByRole('button', { name: /launch/i }).click();

  // No second login prompt: the browser lands straight on Demo App A's callback page.
  await expect(page).toHaveURL(/localhost:4001\/callback/);
  await expect(page.getByText(/logged in as finance\.employee@launchpad\.local/i)).toBeVisible();
});
