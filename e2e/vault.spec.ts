import { test, expect } from '@playwright/test';
import { loginAs, openHrCredentials, addCredential } from './helpers';

// Locators cross-checked against apps/web/src/pages/VaultManager.tsx,
// apps/web/src/components/ReauthModal.tsx, apps/web/src/strings.ts, and
// apps/mock-target-apps/legacy-demo-app/src/index.ts (see Task 15 report).
// Seed data cross-checked against apps/api/prisma/seed.ts (HR Self-Service Portal,
// launchType CREDENTIAL, entitled to every EMPLOYEE; finance.employee is one).

// All three scenarios drive the same user + same service + same DB, so they run serially against
// each other — the per-test setup in beforeEach would otherwise race a sibling's credential writes.
// (catalog.spec / admin.spec touch neither HR credentials nor the HR portal's entitlement, so
// cross-file parallelism is still fine.)
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await loginAs(page, 'finance.employee@launchpad.local');
  await openHrCredentials(page);
  // `npm run test:e2e` re-seeds first, and seed.ts now clears the vault.Credential table, so we
  // normally start clean. Keep a small defensive sweep (cap 3) in case a prior test in this serial
  // file left a row behind — a leftover default credential would change which one the next test
  // launches. Gate each pass on the row count actually dropping, not a fixed sleep.
  const deleteButtons = page.getByRole('button', { name: /^delete$/i });
  for (let guard = 0; guard < 3; guard++) {
    const before = await deleteButtons.count();
    if (before === 0) break;
    await deleteButtons.first().click();
    await page.getByLabel(/windows password/i).fill('dev-ad-password');
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(deleteButtons).toHaveCount(before - 1);
  }
});

test('reveal requires the AD password and then shows the stored secret', async ({ page }) => {
  await addCredential(page, 'hruser', 'hr-pw-123', 'Primary');
  await page.getByRole('button', { name: /reveal/i }).click();
  await page.getByLabel(/windows password/i).fill('dev-ad-password');
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByText('hr-pw-123')).toBeVisible();
});

test('launch with a non-default credential signs into the legacy app with no second prompt', async ({ page }) => {
  await addCredential(page, 'wrong', 'wrong', 'Default');          // first = default, deliberately bad
  await addCredential(page, 'hruser', 'hr-pw-123', 'Real');        // second = non-default, correct
  await page.getByLabel(/launch with/i).selectOption({ label: 'Real' });
  await expect(page.getByText(/no second login prompt/i)).toBeVisible();
});

test('a wrong stored credential shows the FR-17 recovery banner back in the portal', async ({ page }) => {
  await addCredential(page, 'hruser', 'definitely-wrong', 'Primary');
  await page.getByRole('button', { name: /^launch$/i }).click();
  await page.waitForURL(/credentialLaunchFailed=1/);
  await expect(page.getByRole('alert')).toContainText(/didn't work/i);
});
