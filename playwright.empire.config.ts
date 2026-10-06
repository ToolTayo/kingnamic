import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/empire-browser',outputDir:'./test-results/empire-browser',timeout:180000,workers:1,
 use:{actionTimeout:12000,baseURL:'http://127.0.0.1:5192',viewport:{width:1440,height:960},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--enable-precise-memory-info']},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5192 --strictPort',url:'http://127.0.0.1:5192',reuseExistingServer:true,timeout:30000}});
