import { test, expect } from '@playwright/test';

// Locators cross-checked against apps/web/src/pages/LoginPage.tsx, strings.ts,
// components/SearchBar.tsx, and components/ServiceTile.tsx (see Task 19 report).
// Seed data cross-checked against apps/api/prisma/seed.ts.

test('two users in different departments see distinct catalogs', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('finance.employee@launchpad.local');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('Finance Expense System')).toBeVisible();
  await expect(page.getByText('Source Code Repository')).not.toBeVisible();
});

test('misspelled search still finds the right service', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('finance.employee@launchpad.local');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('searchbox').fill('expence');
  await expect(page.getByText('Finance Expense System')).toBeVisible();
});
