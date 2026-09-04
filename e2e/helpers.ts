import type { Page } from '@playwright/test';

export async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('link', { name: /sign in with sso/i }).click();
  await page.getByRole('button', { name: new RegExp(email.replace('.', '\\.')) }).click();
}

// Locators cross-checked against apps/web/src/components/ServiceTile.tsx (tile name is a <button>),
// apps/web/src/pages/VaultManager.tsx, apps/web/src/components/ReauthModal.tsx, and strings.ts.

export async function openHrCredentials(page: Page) {
  await page.getByRole('button', { name: 'HR Self-Service Portal' }).click();
  await page.waitForURL(/\/services\/[^/]+\/credentials/);
  // Wait out the credential-list fetch — VaultManager shows a bare "Loading…" placeholder until it
  // resolves, and an "Add credential" button appears in both the empty and populated states. A
  // caller that inspects rows before this (e.g. beforeEach's clean-up count) would read zero.
  await page.getByRole('button', { name: /add credential/i }).waitFor();
}

export async function addCredential(page: Page, username: string, password: string, label = 'Test') {
  await page.getByRole('button', { name: /add credential/i }).click();
  await page.getByLabel(/label/i).fill(label);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^save$/i }).click();
  // ReauthModal
  await page.getByLabel(/windows password/i).fill('dev-ad-password');
  await page.getByRole('button', { name: /continue/i }).click();
  // `.first()` — the username can legitimately appear in more than one row (e.g. a default and a
  // non-default credential sharing a username); we only need to know the new row has landed.
  await page.getByRole('row', { name: new RegExp(username) }).first().waitFor();
}
