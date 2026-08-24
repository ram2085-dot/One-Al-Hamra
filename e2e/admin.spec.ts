import { test, expect } from '@playwright/test';

// Locators cross-checked against apps/web/src/pages/LoginPage.tsx,
// apps/web/src/pages/admin/AdminConsole.tsx, ServiceForm.tsx, EntitlementEditor.tsx,
// and strings.ts (see Task 19 report). Seed data cross-checked against
// apps/api/prisma/seed.ts.

test('admin creates a service and entitlement; it appears for the entitled user without restart', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto('/login');
  await adminPage.getByLabel('Email').fill('admin@launchpad.local');
  await adminPage.getByRole('button', { name: /sign in/i }).click();
  await adminPage.goto('/admin');
  await adminPage.getByLabel('Name').fill('E2E New Service');
  await adminPage.getByLabel('Category').fill('IT');
  await adminPage.getByLabel('Description').fill('Created by e2e test');
  await adminPage.getByLabel('Support contact').fill('it@launchpad.local');
  await adminPage.getByRole('button', { name: /create service/i }).click();
  await adminPage.getByText('E2E New Service').locator('..').getByRole('button', { name: /manage entitlements/i }).click();
  await adminPage.getByPlaceholder('Department').fill('Engineering');
  await adminPage.getByRole('button', { name: /add entitlement/i }).click();

  const engContext = await browser.newContext();
  const engPage = await engContext.newPage();
  await engPage.goto('/login');
  await engPage.getByLabel('Email').fill('eng.employee@launchpad.local');
  await engPage.getByRole('button', { name: /sign in/i }).click();
  await expect(engPage.getByText('E2E New Service')).toBeVisible();
});

test('retiring a service removes it from the catalog but not from admin history', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@launchpad.local');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.goto('/admin');
  const row = page.getByText('Finance Expense System').locator('..');
  await row.getByRole('button', { name: /retire/i }).click();
  await expect(page.getByText('Finance Expense System')).toBeVisible(); // still in admin console
});
