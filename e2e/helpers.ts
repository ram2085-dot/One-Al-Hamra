import type { Page } from '@playwright/test';

export async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('link', { name: /sign in with sso/i }).click();
  await page.getByRole('button', { name: new RegExp(email.replace('.', '\\.')) }).click();
}
