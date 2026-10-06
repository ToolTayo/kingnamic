import { defineConfig } from '@playwright/test';
const port = process.env.KINGNAMIC_TEST_PORT ?? '5173';
export default defineConfig({
  testDir: './tests/browser', outputDir: './test-results/ui', timeout: 60000, fullyParallel: false, workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 960 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true, timeout: 30000 },
});
