import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    { command: 'npm run start:dev', cwd: '../apps/api', port: 3001, reuseExistingServer: true },
    { command: 'npm run dev', cwd: '../apps/web', port: 5173, reuseExistingServer: true },
    { command: 'npm run start:dev', cwd: '../apps/mock-idp', port: 4000, reuseExistingServer: true },
    { command: 'npm run start:dev', cwd: '../apps/mock-target-apps/demo-app-a', port: 4001, reuseExistingServer: true },
    { command: 'npm run start:dev', cwd: '../apps/mock-target-apps/demo-app-b', port: 4002, reuseExistingServer: true },
  ],
});
