import {fundExpedition} from '../helpers/trade';
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { command } from '../../src/game/commands';
import { newGame } from '../../src/game/state';
const read = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
const tile = (page: Page, x: number, y: number) => page.evaluate(({x,y}) => (window as any).__KINGNAMIC__.scene.screenPoint({x,y}), {x,y});

test('guided first-time opening staffs production, equips soldiers and survives its first night', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#pause').click();
  const paused = await read(page); expect(paused.speed).toBe(0); await page.waitForTimeout(350); expect((await read(page)).time).toBe(paused.time);
  await expect(page.locator('#next-action')).toHaveText('Build Trading post →'); await page.locator('#next-action').click();
  await page.locator('#world canvas').click({ position: await tile(page, 18, 13) }); await page.locator('#speed-2').click();
  await expect.poll(async () => (await read(page)).buildings.find((b: any) => b.kind === 'quarry')?.progress, { timeout: 20000 }).toBe(1);
  await page.locator('#pause').click(); await expect(page.locator('#next-action')).toHaveText('Assign traders →'); await page.locator('#next-action').click();
  for (let n = 0; n < 3; n++) await page.locator('#job-miners-plus').click();
  await page.locator('#next-action').click(); await expect(page.locator('#panel')).toContainText('The Hearthguard');
  await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-ranger').click();
  await page.locator('#army-orders').click();await page.locator('#formation-line').click(); await page.locator('#army-orders').click();await page.locator('#rally-gate').click();
  await page.locator('#tab-build').click(); await page.locator('#category-settlement').click();await page.locator('#build-infirmary').click(); await page.locator('#world canvas').click({ position: await tile(page, 18, 15) });
  await page.locator('#speed-2').click(); await expect.poll(async () => (await read(page)).buildings.find((b: any) => b.kind === 'infirmary')?.progress, { timeout: 20000 }).toBe(1);
  await page.locator('#pause').click(); await page.locator('#tab-people').click(); await page.locator('#job-healers-plus').click();
  await page.locator('#help').click(); await page.locator('#close-dialog').click(); await page.waitForTimeout(100); expect((await read(page)).speed).toBe(0);
  await page.locator('#speed-2').click(); await expect.poll(async () => (await read(page)).stats.nights, { timeout: 120000 }).toBe(1);
  await page.locator('#pause').click(); const s = await read(page);
  expect(s.buildings.find((b: any) => b.kind === 'hearth')?.hp).toBeGreaterThan(0); expect(s.jobs.miners).toBe(3); expect(s.jobs.healers).toBe(1);
  await page.screenshot({ path: 'docs/evidence/tactics-guided-opening.png' });
  await writeFile('docs/evidence/tactics-guided-opening.json', JSON.stringify({ scenario:'automated first-time guidance proxy; no human feedback', time:s.time, stats:s.stats, jobs:s.jobs, hearth:s.buildings.find((b:any)=>b.kind==='hearth')?.hp, soldiers:s.units.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind)).length, errors }, null, 2)); expect(errors).toEqual([]);
});

async function finishMission(page: Page, label: string) {
  await page.locator('#expedition-camp').click(); await page.locator('#speed-2').click();
  await expect.poll(async () => (await read(page)).expedition.discovered, { timeout: 20000 }).toBe(true);
  await page.locator('#expedition-share').click(); await expect.poll(async () => (await read(page)).expedition.held, { timeout: 30000 }).toBe(true);
  await page.locator('#army-orders').click();await expect(page.locator('#formation-loose')).toHaveCount(1);await page.locator('#formation-loose').click(); await page.locator('#expedition-standard').click();
  await expect.poll(async () => (await read(page)).expedition.wave, { timeout: 25000 }).toBe(2);
  await page.waitForFunction(() => { const e=(window as any).__KINGNAMIC__.runtime.state.expedition; return e && !e.warning && e.world.units.some((u:any)=>!u.origin); });
  await page.locator('#speed-1').click();
  const metrics = await page.evaluate(async () => {
    const intervals:number[]=[]; let last=performance.now(), peakUnits=0, peakEffects=0;
    await new Promise<void>(resolve=>{let n=0; const frame=(now:number)=>{const w=(window as any).__KINGNAMIC__.runtime.world;peakUnits=Math.max(peakUnits,w.units.length);peakEffects=Math.max(peakEffects,w.effects.length);if(n++>10)intervals.push(now-last);last=now;if(n<240)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
    intervals.sort((a,b)=>a-b);return {medianMs:intervals[Math.floor(intervals.length/2)],p95Ms:intervals[Math.floor(intervals.length*.95)],peakUnits,peakEffects,heapMiB:(performance as any).memory?.usedJSHeapSize/1048576};
  });
  await page.locator('#pause').click(); await page.screenshot({path:`docs/evidence/tactics-${label}-combat.png`});
  await page.locator('#save').click(); const saved=(await read(page)).expedition;
  await page.reload(); await page.locator('#start').click(); expect((await read(page)).expedition).toEqual({...saved,world:{...saved.world,effects:[]}});
  await page.locator('#speed-2').click(); await expect.poll(async ()=>(await read(page)).expedition.standard,{timeout:45000}).toBe(true);
  await page.locator('#expedition-exit').click(); await expect(page.locator('#expedition-extract')).toBeEnabled({timeout:30000});
  const w=(await read(page)).expedition.world, before=(await read(page)).resources;
  await page.locator('#expedition-extract').click(); const s=await read(page); expect(s.expedition).toBeUndefined(); expect(s.lostBattalions.report.outcome).toBe('success');
  await page.locator('#save').click(); await page.reload(); await page.locator('#start').click(); expect((await read(page)).lostBattalions).toEqual(s.lostBattalions);
  await page.screenshot({path:`docs/evidence/tactics-${label}-return.png`});
  await writeFile(`docs/evidence/tactics-${label}-browser.json`,JSON.stringify({report:s.lostBattalions.report,missionSeconds:w.time,metrics,equipmentSettlement:{food:s.resources.food-before.food,wood:s.resources.wood-before.wood,crowns:s.resources.stone-before.stone},recovering:s.units.filter((u:any)=>u.injury).map((u:any)=>({kind:u.kind,hp:u.hp,injury:u.injury}))},null,2));
  expect(metrics.medianMs).toBeLessThan(50);
  return s;
}

test('experienced river patrol chooses its terrain, changes formation, reloads in combat and enlists finite survivors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#start').click();await page.locator('#pause').click();
  await page.locator('#tab-army').click();await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click();await page.locator('#army-recruit').click();await page.locator('#recruit-ranger').click();await fundExpedition(page);await page.locator('#open-expedition').click();
  await page.locator('#approach-ford').click();await expect(page.locator('#approach-ford')).toHaveAttribute('aria-pressed','true');
  const before=(await read(page)).resources; await page.locator('#expedition-launch').click();
  const deployed=await read(page);expect(deployed.expedition.approach).toBe('ford');expect(deployed.resources.wood).toBe(before.wood);expect(deployed.resources.food).toBe(before.food-30);expect(deployed.resources.stone).toBe(before.stone-80);
  const s=await finishMission(page,'ford');expect(s.lostBattalions.recruited).toBeGreaterThan(0);expect(s.lostBattalions.remaining).toHaveLength(0);
  await page.locator('#tab-army').click();await fundExpedition(page);await page.locator('#open-expedition').click();await expect(page.locator('#expedition-launch')).toBeDisabled();expect(errors).toEqual([]);
});

test('explicit legacy active-expedition fixture finishes at its original standard without retroactive equipment charges',async({page})=>{
  // Reconstructs the documented pre-tactics v2 shape, not a human save or uninjected run.
  const s=newGame();s.resources.stone=200;command(s,{type:'recruit',kind:'warden'});command(s,{type:'recruit',kind:'ranger'});command(s,{type:'expedition-launch'});
  const e=s.expedition!;delete e.approach;delete e.variant;delete e.equipment;delete e.equipmentCurrency;delete e.pending;s.resources.stone+=80;s.speed=0;
  await page.addInitScript(raw=>{if(!localStorage.getItem('kingnamic.save.v2'))localStorage.setItem('kingnamic.save.v2',raw);},JSON.stringify(s));
  await page.goto('/');await page.locator('#start').click();expect((await read(page)).expedition.approach).toBeUndefined();
  const result=await finishMission(page,'legacy');expect(result.resources.wood).toBe(s.resources.wood);expect(result.lostBattalions.recruited).toBeGreaterThan(0);
});
