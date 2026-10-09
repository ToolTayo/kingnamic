import { defineConfig } from '@playwright/test';
const port = process.env.KINGNAMIC_TEST_PORT ?? '5173';
export default defineConfig({globalSetup: './tests/helpers/prepare-evidence.ts',
  testDir: './tests/campaign', outputDir: './test-results/campaign', timeout: 900000, workers: 1,
  // Long runs use snapshots and structured evidence. Full DOM tracing embeds
  // procedural thumbnails on every action and is unnecessarily memory-heavy.
  use: { baseURL: `http://127.0.0.1:${port}`, actionTimeout: 10000, viewport: { width: 1440, height: 960 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }, screenshot: 'only-on-failure', trace: 'off' },
  webServer: { command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true, timeout: 60000 },
});
