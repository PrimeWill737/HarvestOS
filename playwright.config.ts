import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (process.platform === 'win32'
          ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
          : undefined),
    },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run dev',
    url: process.env.E2E_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
