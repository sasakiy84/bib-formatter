import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', forbidOnly: Boolean(process.env.CI), workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}, screenshot: 'only-on-failure' },
  webServer: { command: 'bun run serve', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
