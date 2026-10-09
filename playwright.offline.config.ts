import { defineConfig } from '@playwright/test';
const port = process.env.OFFLINE_TEST_PORT ?? '4188';
export default defineConfig({globalSetup: './tests/helpers/prepare-evidence.ts',
  testDir: './tests/offline', outputDir: './test-results/offline', timeout: 90000, workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 960 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 30000 },
});
