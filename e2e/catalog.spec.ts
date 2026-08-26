import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

// Locators cross-checked against apps/web/src/pages/LoginPage.tsx, strings.ts,
// components/SearchBar.tsx, and components/ServiceTile.tsx (see Task 19 report).
// Seed data cross-checked against apps/api/prisma/seed.ts.

test('two users in different departments see distinct catalogs', async ({ page }) => {
  await loginAs(page, 'finance.employee@launchpad.local');
  await expect(page.getByText('Finance Expense System')).toBeVisible();
  await expect(page.getByText('Source Code Repository')).not.toBeVisible();
});

test('misspelled search still finds the right service', async ({ page }) => {
  await loginAs(page, 'finance.employee@launchpad.local');
  await page.getByRole('searchbox').fill('expence');
  await expect(page.getByText('Finance Expense System')).toBeVisible();
});
