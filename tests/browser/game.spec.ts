import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

async function start(page: Page) { await page.goto('/'); await page.locator('#start').click(); await expect(page.locator('#world canvas')).toBeVisible(); }
async function tile(page: Page, x: number, y: number, right = false) {
  const p = await page.evaluate(({ x, y }) => (window as any).__KINGNAMIC__.scene.screenPoint({ x, y }), { x, y });
  await page.locator('#world canvas').click({ position: p, button: right ? 'right' : 'left' });
}
async function state(page: Page) { return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state))); }

test('desktop: construction, jobs, recruitment, rally, upgrades, pause and save/resume', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  await page.locator('#category-production').click();await page.locator('#build-quarry').click(); await tile(page, 18, 13);
  await expect.poll(async () => (await state(page)).buildings.some((b: any) => b.kind === 'quarry')).toBe(true);
  await page.locator('#speed-2').click();
  await expect.poll(async () => (await state(page)).buildings.find((b: any) => b.kind === 'quarry').progress, { timeout: 12000 }).toBe(1);
  await page.locator('#tab-people').click(); await page.locator('#job-miners-plus').click(); await page.locator('#job-miners-plus').click();
  expect((await state(page)).jobs.miners).toBe(2);
  await page.locator('#tab-army').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-ranger').click();
  expect((await state(page)).units.filter((u: any) => ['warden', 'ranger'].includes(u.kind))).toHaveLength(5);
  await page.locator('#army-orders').click();await page.locator('#rally').click(); await tile(page, 15, 16);
  await page.locator('#army-orders').click();await page.locator('#formation-loose').click(); expect((await state(page)).formation).toBe('loose');
  await page.locator('#pause').click(); const paused = (await state(page)).time; await page.waitForTimeout(450); expect((await state(page)).time).toBe(paused);
  await page.locator('#tab-build').click();
  const b = (await state(page)).buildings.find((b: any) => b.kind === 'quarry'); await page.locator('#category-owned').click();await page.locator(`#inspect-${b.id}`).click();
  await page.locator('#upgrade').click(); expect((await state(page)).buildings.find((v: any) => v.id === b.id).level).toBe(2);
  await page.locator('#save').click(); await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  const before = await state(page); await page.reload(); await expect(page.locator('#start')).toHaveText(/Resume kingdom/); await page.locator('#start').click();
  const after = await state(page); expect(after.buildings).toEqual(before.buildings); expect(after.jobs).toEqual(before.jobs); expect(after.resources).toEqual(before.resources);
  await page.locator('#tab-build').click(); await mkdir('docs/evidence', { recursive: true }); await page.screenshot({ path: 'docs/evidence/desktop.png' });
  expect(errors).toEqual([]);
});

test('live zombie combat infects only bitten soldiers and keeps treatment/source through reload', async ({ page }) => {
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await start(page);await page.locator('#pause').click();
  const ids=await page.evaluate(async()=>{
    const {makeUnit}=await import('/src/game/state.ts' as string),{combatStep}=await import('/src/game/combat.ts' as string),{plagueStep}=await import('/src/game/disease.ts' as string),rt=(window as any).__KINGNAMIC__.runtime,s=rt.state;
    const guards=s.units.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind)).slice(0,2);if(guards.length<2)throw Error('Fresh kingdom needs two defenders');
    s.units=guards;const [target,bystander]=guards;Object.assign(target,{x:14,y:14,hp:target.maxHp,injury:80,order:'hold',target:{x:14,y:14},path:[],repath:0});Object.assign(bystander,{x:8,y:8,hp:bystander.maxHp,injury:80,order:'hold',target:{x:8,y:8},path:[],repath:0});
    s.residents=[];s.population=0;s.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};s.buildings=s.buildings.filter((b:any)=>b.kind==='hearth');s.contamination.fill(100);s.suppliesTaint=100;
    const zombie=makeUnit(s,'hollow',14,13);rt.onChange();
    for(let n=0;n<180&&!s.infection.some((i:any)=>i.personId===target.id);n++){combatStep(s,.1,false);plagueStep(s,.1);}
    rt.onChange();return {target:target.id,bystander:bystander.id,zombie:zombie.id,exposure:target.exposure};
  });
  let s=await state(page);const illness=s.infection.find((i:any)=>i.personId===ids.target);
  expect(illness).toMatchObject({source:'bite',sourceId:ids.zombie});expect(s.units.find((u:any)=>u.id===ids.target).hp).toBeGreaterThan(0);expect(s.infection.some((i:any)=>i.personId===ids.bystander)).toBe(false);expect(s.units.find((u:any)=>u.id===ids.bystander).exposure??0).toBe(0);
  await page.locator('#tab-people').click();await expect(page.locator('#panel')).toContainText(`Zombie bite · attacker #${ids.zombie}`);await expect(page.locator('#panel')).toContainText('Living and treatable');await page.screenshot({path:'test-results/infection-bite-ui.png'});
  await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');await page.reload();await page.locator('#start').click();s=await state(page);expect(s.infection.find((i:any)=>i.personId===ids.target)).toMatchObject({source:'bite',sourceId:ids.zombie});
  await page.locator('#tab-people').click();await page.locator('#treat').click();s=await state(page);expect(s.infection.some((i:any)=>i.personId===ids.target)).toBe(false);expect(s.units.find((u:any)=>u.id===ids.target).hp).toBeGreaterThan(0);expect(s.suppliesTaint).toBeGreaterThan(35);await expect(page.locator('#alert-people')).toHaveCount(0);expect(errors).toEqual([]);
});

test('live night: combat, bite-only infection, treatment and territory consequences', async ({ page }) => {
  test.setTimeout(100000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page); await page.locator('#tab-army').click();
  await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-ranger').click(); await page.locator('#speed-2').click();
  await expect.poll(async () => (await state(page)).phase, { timeout: 45000, intervals: [1000] }).toBe('night');
  await page.waitForFunction(() => (window as any).__KINGNAMIC__.scene.fallen.size > 0, null, { timeout: 22000 });
  expect((await state(page)).stats.slain).toBeGreaterThan(0);
  await page.locator('#pause').click();
  expect((await page.locator('.objectives-card').boundingBox())!.height).toBeLessThan(65);
  await page.screenshot({ path: 'docs/evidence/night.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator('.objectives-card').boundingBox())!.height).toBeLessThan(65);
  await page.screenshot({ path: 'docs/evidence/experience-night-touch.png' });
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.locator('#world-subtitle')).toContainText('attackers in the valley');
  await page.locator('#speed-2').click();
  const metrics = await measureFrames(page);
  await writeFile('docs/evidence/experience-night-performance.json', JSON.stringify(metrics, null, 2));
  expect(metrics.medianFrameMs).toBeLessThan(50);
  await expect.poll(async () => (await state(page)).day, { timeout: 28000, intervals: [1000] }).toBe(2);
  await page.locator('#pause').click();
  expect((await state(page)).infection.every((i: any) => i.source === 'bite' && Number.isInteger(i.sourceId))).toBe(true);
  if ((await state(page)).infection.length) {
    await page.locator('#tab-people').click(); await page.locator('#quarantine').click(); expect((await state(page)).quarantine).toBe(true);
    await page.screenshot({ path: 'docs/evidence/plague.png' });
    await page.locator('#treat').click(); expect((await state(page)).infection).toHaveLength(0);
    await page.locator('#quarantine').click();
  }
  if ((await state(page)).units.some((u: any) => !['warden', 'ranger'].includes(u.kind))) {
    await page.locator('#speed-2').click();
    await expect.poll(async () => (await state(page)).units.filter((u: any) => !['warden', 'ranger'].includes(u.kind)).length, { timeout: 18000, intervals: [500] }).toBe(0);
    await page.locator('#pause').click();
  }
  await page.locator('#tab-territories').click(); await page.locator('#claim-pinewatch').click();
  expect((await state(page)).owned).toContain('pinewatch'); await expect(page.locator('#panel')).toContainText('Your banner flies');
  expect(errors).toEqual([]);
});

test('phone: touch-sized layout, building, people controls and reset cancellation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page); await page.locator('#pause').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#category-production').click();await page.locator('#build-quarry').click(); await tile(page, 18, 13);
  expect((await state(page)).buildings.some((b: any) => b.kind === 'quarry')).toBe(true);
  await page.locator('#tab-people').click(); await page.locator('#job-farmers-plus').click(); expect((await state(page)).jobs.farmers).toBe(5);
  await page.screenshot({ path: 'docs/evidence/mobile.png' });
  await page.locator('#help').click(); await page.locator('#reset-request').click(); await expect(page.locator('#dialog')).toContainText('Begin again?');
  await page.locator('#close-dialog').click(); expect((await state(page)).jobs.farmers).toBe(5);
  await page.locator('#help').click(); await page.locator('#reset-request').click(); await page.locator('#reset-confirm').click();
  expect((await state(page)).stats.built).toBe(0); expect((await state(page)).jobs.farmers).toBe(4);
});

test('keyboard and camera controls preserve browser layout and pause state', async ({ page }) => {
  await start(page); await page.locator('#pause').click();
  const before = await page.evaluate(() => (window as any).__KINGNAMIC__.scene.cameras.main.zoom);
  await page.locator('#zoom-in').click(); expect(await page.evaluate(() => (window as any).__KINGNAMIC__.scene.cameras.main.zoom)).toBeGreaterThan(before);
  await page.locator('#home-camera').click(); await page.locator('#tab-build').click(); await page.locator('#category-settlement').click();await page.locator('#build-cottage').click();
  await page.keyboard.press('Escape'); expect(await page.evaluate(() => (window as any).__KINGNAMIC__.runtime.placement)).toBeNull();
  await page.locator('#help').click(); await page.keyboard.press('Escape'); expect((await state(page)).speed).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test('blocked storage does not prevent play and reports an honest save failure', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }));
  await page.goto('/'); await expect(page.locator('#dialog')).toContainText('storage is unavailable'); await page.locator('#start').click();
  await expect(page.locator('#world canvas')).toBeVisible(); await page.locator('#save').click(); await expect(page.locator('#save-status')).toHaveText('Save unavailable');
});

async function measureFrames(page: Page) {
  return page.evaluate(async () => {
    const times: number[] = []; let last = performance.now();
    await new Promise<void>(resolve => { let frames = 0; function frame(now: number) { if (frames++ > 10) times.push(now - last); last = now; if (frames < 160) requestAnimationFrame(frame); else resolve(); } requestAnimationFrame(frame); });
    times.sort((a, b) => a - b);
    const app = (window as any).__KINGNAMIC__;
    return { viewport: `${innerWidth}x${innerHeight}`, renderer: app.game.renderer.type === 2 ? 'WebGL' : 'Canvas', medianFrameMs: Number(times[Math.floor(times.length / 2)].toFixed(2)), p95FrameMs: Number(times[Math.floor(times.length * .95)].toFixed(2)), engineFps: Math.round(app.runtime.fps), heapMB: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) : null };
  });
}
test('records desktop frame timing and renderer metrics', async ({ page }) => {
  await start(page);
  const metrics = await measureFrames(page);
  console.log('BROWSER METRICS', JSON.stringify(metrics));
  await writeFile('docs/evidence/experience-day-performance.json', JSON.stringify(metrics, null, 2));
  expect(metrics.medianFrameMs).toBeLessThan(50);
});
