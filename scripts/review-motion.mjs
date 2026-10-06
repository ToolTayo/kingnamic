import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://127.0.0.1:5173/'); await page.locator('#start').click();
await page.locator('#tab-army').click();
for (let n = 0; n < 4; n++) await page.locator(n % 2 ? '#recruit-ranger' : '#recruit-warden').click();
await page.locator('#rally').click();
const p = await page.evaluate(() => window.__KINGNAMIC__.scene.screenPoint({ x: 14, y: 22 }));
await page.locator('#world canvas').click({ position: p }); await page.locator('#speed-2').click();
const samples = [];
for (let n = 0; n < 35; n++) {
  await page.waitForTimeout(300);
  samples.push(await page.evaluate(() => {
    const { runtime, scene } = window.__KINGNAMIC__;
    function overlaps(actors) { let pairs = 0; for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) if (Math.hypot(actors[i].x - actors[j].x, actors[i].y - actors[j].y) < .3) pairs++; return pairs; }
    return { time: runtime.state.time, civilians: overlaps(scene.civilians.people), troops: overlaps(runtime.state.units), arrived: runtime.state.units.filter(u => !u.order).length };
  }));
}
await page.locator('#pause').click();
const label = process.env.REVIEW_LABEL ?? 'after';
await page.screenshot({ path: `docs/evidence/motion-${label}.png` });
await writeFile(`docs/evidence/motion-${label}.json`, JSON.stringify({ samples, civilianOverlapSamples: samples.reduce((n, s) => n + s.civilians, 0), troopOverlapSamples: samples.reduce((n, s) => n + s.troops, 0), arrived: samples.at(-1).arrived }, null, 2));
await browser.close();
