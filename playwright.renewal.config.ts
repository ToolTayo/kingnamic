import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/renewal-browser',outputDir:'./test-results/renewal-browser',timeout:90000,workers:1,
  use:{baseURL:'http://127.0.0.1:5191',viewport:{width:1440,height:960},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191 --strictPort',url:'http://127.0.0.1:5191',reuseExistingServer:true,timeout:30000}});
