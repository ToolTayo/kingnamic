import { defineConfig } from '@playwright/test';
export default defineConfig({globalSetup: './tests/helpers/prepare-evidence.ts',
  testDir:'./tests/sustain-browser',outputDir:'./test-results/sustain-browser',timeout:240000,workers:1,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:5190',viewport:{width:1440,height:960},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--enable-precise-memory-info']},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5190 --strictPort',url:'http://127.0.0.1:5190',reuseExistingServer:true,timeout:30000}
});
