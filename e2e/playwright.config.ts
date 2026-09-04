import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    { command: 'npm run start:dev', cwd: '../apps/api', port: 3001, reuseExistingServer: true },
    { command: 'npm run dev', cwd: '../apps/web', port: 5173, reuseExistingServer: true },
    // Still needed for sign-in (portal login is OIDC via mock-idp). The demo-app-a/b webServer
    // entries that used to run alongside this were removed with sso-launch.spec.ts — no
    // remaining Playwright spec launches into either demo app anymore.
    { command: 'npm run start:dev', cwd: '../apps/mock-idp', port: 4000, reuseExistingServer: true },
    // Target of the credential-vault launch flow — vault.spec.ts signs into it via the inject page.
    { command: 'npm run start:dev', cwd: '../apps/mock-target-apps/legacy-demo-app', port: 4003, reuseExistingServer: true },
  ],
});
