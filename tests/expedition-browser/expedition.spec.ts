import {fundExpedition} from '../helpers/trade';
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { newGame } from '../../src/game/state';
import { command } from '../../src/game/commands';
const read = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
async function prepare(page: Page) {
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#pause').click();
  await page.locator('#tab-army').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-class-ranger').click();await page.locator('#recruit-ranger').click();
  await fundExpedition(page);await page.locator('#open-expedition').click();
  const selected = await page.locator('[data-patrol][aria-pressed="true"]').first().getAttribute('id');
  await page.locator(`#${selected}`).click(); await expect(page.locator('#expedition-launch')).toBeDisabled();
  await page.locator(`#${selected}`).click(); await expect(page.locator('#expedition-launch')).toBeEnabled();
  await page.locator('#expedition-launch').click();
}
test('complete the Broken Standard through real controls, reload mid-ambush, enlist and defend with survivors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await prepare(page); expect((await read(page)).units).toHaveLength(2);
  const started = Date.now();
  await page.locator('#expedition-camp').click(); await page.locator('#speed-2').click();
  await expect.poll(async () => (await read(page)).expedition.discovered, { timeout: 18000 }).toBe(true);
  await page.locator('#expedition-share').click();
  await expect(page.locator('#expedition-share')).toBeDisabled();
  await page.locator('#pause').click(); await page.locator('#save').click();
  const saved = (await read(page)).expedition;
  await page.screenshot({ path: 'docs/evidence/battalion-discovery.png' });
  await page.reload(); await page.locator('#start').click();
  expect((await read(page)).expedition).toEqual({ ...saved, world: { ...saved.world, effects: [] } });
  await page.locator('#speed-2').click();
  await expect.poll(async () => (await read(page)).expedition.held, { timeout: 30000 }).toBe(true);
  const alliedKinds = (await read(page)).expedition.world.units.filter((u: any) => u.origin === 'battalion').map((u: any) => u.kind);
  expect(alliedKinds).toContain('spearman'); expect(alliedKinds).toContain('scout');
  await page.locator('#expedition-standard').click();
  await expect.poll(async () => (await read(page)).expedition.wave, { timeout: 20000 }).toBe(2);
  await page.waitForFunction(() => { const e = (window as any).__KINGNAMIC__.runtime.state.expedition; return e && !e.warning && e.world.units.some((u: any) => !u.origin); });
  await page.screenshot({ path: 'docs/evidence/battalion-ridge.png' });
  const performanceMetrics = await page.evaluate(async () => {
    const times: number[] = []; let last = performance.now(), peakUnits = 0;
    await new Promise<void>(resolve => { let n = 0; const frame = (now: number) => { peakUnits = Math.max(peakUnits, (window as any).__KINGNAMIC__.runtime.world.units.length); if (n++ > 10) times.push(now - last); last = now; if (n < 180) requestAnimationFrame(frame); else resolve(); }; requestAnimationFrame(frame); });
    times.sort((a,b) => a-b); const a = (window as any).__KINGNAMIC__;
    return { scenario: 'second ambush, real combat', medianFrameMs: times[Math.floor(times.length / 2)], p95FrameMs: times[Math.floor(times.length * .95)], engineFps: a.runtime.fps, units: a.runtime.world.units.length, peakUnits, heapMB: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 };
  });
  expect(performanceMetrics.medianFrameMs).toBeLessThan(50);
  await writeFile('docs/evidence/battalion-performance.json', JSON.stringify(performanceMetrics, null, 2));
  await expect.poll(async () => (await read(page)).expedition.standard, { timeout: 40000 }).toBe(true);
  await page.locator('#expedition-exit').click();
  await expect.poll(async () => (await read(page)).expedition.world.units.filter((u: any) => u.origin).every((u: any) => Math.hypot(u.x - 10, u.y - 16) < 3.5), { timeout: 25000 }).toBe(true);
  const missionSeconds = (await read(page)).expedition.world.time, missionWallSeconds = (Date.now() - started) / 1000;
  await page.locator('#expedition-extract').click();
  const returned = await read(page); expect(returned.expedition).toBeUndefined(); expect(returned.lostBattalions.report.outcome).toBe('success');
  expect(returned.lostBattalions.recruited).toBeGreaterThan(0);
  await page.screenshot({ path: 'docs/evidence/battalion-return.png' });
  await page.locator('#save').click(); await page.reload(); await page.locator('#start').click();
  expect((await read(page)).lostBattalions).toEqual(returned.lostBattalions);
  await page.locator('#tab-army').click(); await expect(page.locator('#panel')).toContainText('recovering');
  // Recovery is real kingdom time: establish medicine and respond to outbreaks
  // instead of waiting until a roster of dead soldiers reports no injuries.
  await page.locator('#tab-build').click();await page.locator('#category-settlement').click();await page.locator('#build-infirmary').click();
  const refuge=await page.evaluate(()=>(window as any).__KINGNAMIC__.scene.screenPoint({x:18,y:15}));await page.locator('#world canvas').click({position:refuge});
  await page.locator('#speed-2').click();
  const recoveryStart=Date.now();
  while(Date.now()-recoveryStart<80000){
    const now=await read(page);expect(now.units.some((u:any)=>['spearman','scout'].includes(u.kind))).toBe(true);
    if(now.infection.length||now.buildings.some((b:any)=>b.kind==='infirmary'&&b.progress===1)&&now.jobs.healers===0){
      await page.locator('#pause').click();await page.locator('#tab-people').click();
      if(now.infection.length&&!now.quarantine)await page.locator('#quarantine').click();
      if(now.infection.length&&now.resources.herbs>=5)await page.locator('#treat').click();
      if(now.buildings.some((b:any)=>b.kind==='infirmary'&&b.progress===1)&&now.jobs.healers===0)await page.locator('#job-healers-plus').click();
      await page.locator('#speed-2').click();
    }
    if(!now.units.some((u:any)=>u.injury)&&now.phase==='night')break;
    await page.waitForTimeout(700);
  }
  expect((await read(page)).units.some((u:any)=>['spearman','scout'].includes(u.kind)&&!u.injury)).toBe(true);
  await page.locator('#pause').click();
  // Give the short-range specialists an actual interception opportunity. At
  // the default rear line, older rangers can kill the opening wave first.
  await page.locator('#tab-army').click();await page.locator('#army-orders').click();await page.locator('#formation-loose').click(); await page.locator('#army-orders').click();await page.locator('#rally').click();
  const crossing = await page.evaluate(() => (window as any).__KINGNAMIC__.scene.screenPoint({ x: 14, y: 24 }));
  await page.locator('#world canvas').click({ position: crossing }); await page.locator('#speed-2').click();
  await page.waitForFunction(() => (window as any).__KINGNAMIC__.runtime.state.units.some((u: any) => ['spearman', 'scout'].includes(u.kind) && u.attackFlash > 0), null, { timeout: 30000 });
  await page.locator('#pause').click(); await page.screenshot({ path: 'docs/evidence/battalion-kingdom-defense.png' });
  await writeFile('docs/evidence/battalion-browser.json', JSON.stringify({ report: returned.lostBattalions.report, missionSeconds, missionWallSeconds, recoveredKinds: (await read(page)).units.filter((u: any) => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind)).map((u: any) => u.kind), specialistsFoughtAtHome: true, performanceMetrics, errors }, null, 2));
  expect(errors).toEqual([]);
});
test('withdraws during a real ambush, reloads the retreat and grants no unearned recruits', async ({ page }) => {
  await prepare(page); await page.locator('#expedition-camp').click(); await page.locator('#speed-2').click();
  await expect.poll(async () => { const e = (await read(page)).expedition; return e.discovered && !e.warning && e.world.units.some((u: any) => !u.origin); }, { timeout: 18000 }).toBe(true);
  await page.locator('#expedition-retreat').click(); await page.locator('#pause').click(); await page.locator('#save').click();
  await page.reload(); await page.locator('#start').click(); expect((await read(page)).expedition.stage).toBe('retreat');
  await page.locator('#speed-2').click();
  for (let i = 0; i < 50 && (await read(page)).expedition; i++) { await page.waitForTimeout(500); await page.locator('#expedition-extract').click(); }
  const s = await read(page); expect(s.expedition).toBeUndefined(); expect(s.lostBattalions.recruited).toBe(0);
  expect(s.units).toHaveLength(2 + s.lostBattalions.report.returned);
  await writeFile('docs/evidence/battalion-retreat.json', JSON.stringify(s.lostBattalions.report, null, 2));
});
test.describe('phone withdrawal', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('retreats with real touch input without granting allies or losing the home save', async ({ page }) => {
    await prepare(page); await page.locator('#pause').tap();
    await page.locator('#expedition-retreat').tap(); await page.locator('#expedition-extract').tap();
    const s = await read(page); expect(s.expedition).toBeUndefined(); expect(s.lostBattalions.recruited).toBe(0); expect(s.units).toHaveLength(5);
    expect(s.lostBattalions.remaining).toHaveLength(4); await expect(page.locator('#expedition-launch')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'docs/evidence/battalion-phone.png' });
  });
});

test('an existing victorious save can resume an active expedition without a duplicate ending dialog', async ({ page }) => {
  // Explicit compatibility fixture, separate from the uninjected mission playthrough.
  const s = newGame(); s.resources.stone=200; command(s, { type: 'recruit', kind: 'warden' }); command(s, { type: 'recruit', kind: 'ranger' }); s.outcome = 'won'; s.speed = 0;
  await page.addInitScript(raw => { if (!localStorage.getItem('kingnamic.save.v2')) localStorage.setItem('kingnamic.save.v2', raw); }, JSON.stringify(s));
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#close-dialog').click();
  await page.locator('#tab-army').click(); await fundExpedition(page);await page.locator('#open-expedition').click(); await page.locator('#expedition-launch').click();
  await page.locator('#pause').click(); await page.locator('#save').click(); await page.reload(); await page.locator('#start').click();
  await expect(page.locator('#dialog')).not.toBeVisible(); await expect(page.locator('#world-title')).toHaveText('Broken Standard');
  await page.locator('#expedition-retreat').click(); await page.locator('#expedition-extract').click();
  expect((await read(page)).outcome).toBe('won'); await expect(page.locator('#panel')).toContainText('A fighting withdrawal');
});
