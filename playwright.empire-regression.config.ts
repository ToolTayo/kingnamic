import {defineConfig} from '@playwright/test';
export default defineConfig({globalSetup: './tests/helpers/prepare-evidence.ts',testDir:'./tests',testMatch:['**/browser/*.spec.ts','**/renewal-browser/*.spec.ts','**/expedition-browser/*.spec.ts','**/tactics-browser/*.spec.ts','**/legions-browser/*.spec.ts'],outputDir:'./test-results/empire-regression',timeout:240000,workers:1,fullyParallel:false,
 use:{baseURL:'http://127.0.0.1:5193',viewport:{width:1440,height:960},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE},screenshot:'only-on-failure',trace:'retain-on-failure'},
 reporter:[['line'],['json',{outputFile:'test-results/empire-regression.json'}]],
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5193 --strictPort',url:'http://127.0.0.1:5193',reuseExistingServer:true,timeout:30000}});
