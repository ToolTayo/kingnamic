import { defineConfig } from '@playwright/test';
const port = process.env.EXPEDITION_TEST_PORT ?? process.env.KINGNAMIC_TEST_PORT ?? '5194';
const hardware = process.env.KINGNAMIC_HARDWARE_PROFILE === '1';
export default defineConfig({globalSetup: './tests/helpers/prepare-evidence.ts',
  testDir: './tests/expedition-browser', outputDir: './test-results/expedition', timeout: 240000, workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 960 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: hardware ? ['--enable-gpu', '--use-gl=angle', '--use-angle=d3d11'] : [] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true, timeout: 30000 },
});
