import { defineConfig } from '@playwright/test';
const port = process.env.OFFLINE_TEST_PORT ?? '4187';
export default defineConfig({
  testDir: './tests/offline', outputDir: './test-results/offline', timeout: 60000, workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 960 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true, timeout: 30000 },
});
