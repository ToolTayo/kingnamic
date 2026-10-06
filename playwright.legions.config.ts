import { defineConfig } from '@playwright/test';
const port=process.env.KINGNAMIC_TEST_PORT??'5173';
export default defineConfig({testDir:'./tests/legions-browser',outputDir:'./test-results/legions-browser',timeout:90000,workers:1,fullyParallel:false,
  use:{baseURL:`http://127.0.0.1:${port}`,viewport:{width:1440,height:960},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--enable-precise-memory-info']},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:true,timeout:30000}
});
