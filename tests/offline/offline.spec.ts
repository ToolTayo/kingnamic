import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { newGame,army } from '../../src/game/state';
import { command } from '../../src/game/commands';
import { infect,plagueStep } from '../../src/game/disease';
import { combatStep } from '../../src/game/combat';

test('production offline save preserves individual plague, timed remains and separate squads',async({page,context})=>{
  const s=newGame();s.resources={wood:1000,stone:1000,food:1000,herbs:100};command(s,{type:'recruit',kind:'warden',count:5});command(s,{type:'recruit',kind:'ranger',count:2});const ids=army(s).map(u=>u.id);
  command(s,{type:'squad-create',ids:ids.slice(0,5),name:'Gate Watch'});command(s,{type:'squad-create',ids:ids.slice(5),name:'Outriders'});command(s,{type:'order',order:'defend',ids:ids.slice(0,5),x:14,y:17});command(s,{type:'order',order:'hunt',ids:ids.slice(5),x:14,y:23});
  infect(s,s.units[0],'bite',74.95);infect(s,s.units[1],'bite',20);plagueStep(s,.1);combatStep(s,.1);s.speed=0;
  await page.addInitScript(raw=>{if(!localStorage.getItem('kingnamic.save.v2'))localStorage.setItem('kingnamic.save.v2',raw);},JSON.stringify(s));
  await page.goto('/');await page.locator('#start').click();await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload();await page.locator('#start').click();const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('kingnamic.save.v2')!));
  expect(restored.units).toEqual(s.units);expect(restored.residents).toEqual(s.residents);expect(restored.infection).toEqual(s.infection);expect(restored.corpses).toEqual(s.corpses);expect(restored.squads).toEqual(s.squads);
  await page.locator('#tab-people').click();await expect(page.locator('#panel')).toContainText('Symptomatic');await expect(page.locator('#panel')).toContainText('Infected dead · #');await page.locator('#treat').click();await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  const treated=await page.evaluate(()=>JSON.parse(localStorage.getItem('kingnamic.save.v2')!));expect(treated.infection).toHaveLength(0);expect(treated.corpses).toHaveLength(1);expect(treated.units.some((u:any)=>u.id===ids[0])).toBe(false);await context.setOffline(false);
});
test('production build resumes saved progress with the network completely offline', async ({ page, context, baseURL }) => {
  const errors: string[] = [], externalRequests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith(baseURL!) && !r.url().startsWith('data:')) externalRequests.push(r.url()); });
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#pause').click();
  await page.locator('#tab-army').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click(); await page.locator('#save').click();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const snapshot = await page.evaluate(() => localStorage.getItem('kingnamic.save.v2'));
  expect(await page.evaluate(() => '__KINGNAMIC__' in window)).toBe(false);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('#start')).toHaveText(/Resume kingdom/); await page.locator('#start').click();
  await expect(page.locator('#world canvas')).toBeVisible(); await page.locator('#tab-army').click();
  await expect(page.locator('#panel')).toContainText('The Hearthguard');
  const restored = await page.evaluate(() => localStorage.getItem('kingnamic.save.v2'));
  expect(JSON.parse(restored!).units).toEqual(JSON.parse(snapshot!).units);
  await page.screenshot({ path: 'docs/evidence/offline-production.png' });
  expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
  await context.setOffline(false);
});

test('a cached older offline build updates with the old page open and preserves its kingdom save', async ({ page, context }) => {
  test.setTimeout(120000);
  // Explicit stale-cache fixture. This exercises the real generated worker's
  // activation and navigation policy, rather than modifying its code in-page.
  let updated = false;
  const root = resolve('dist');
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, 'http://localhost').pathname;
      response.setHeader('Cache-Control', 'no-store');
      if (pathname === '/sw.js' && !updated) {
        response.setHeader('Content-Type', 'application/javascript');
        response.end(`self.addEventListener('install',e=>e.waitUntil(caches.open('kingnamic-update-fixture').then(c=>c.put('/index.html',new Response('<p>Previous cached build</p>',{headers:{'Content-Type':'text/html'}})))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.match('/index.html'));});`); return;
      }
      if (pathname === '/' && !updated) { response.setHeader('Content-Type','text/html'); response.end(`<p>Install previous build</p><script>navigator.serviceWorker.register('/sw.js')</script>`); return; }
      const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!file.startsWith(root + sep)) { response.statusCode = 404; response.end(); return; }
      response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.html') ? 'text/html' : 'text/plain');
      response.end(await readFile(file));
    } catch { response.statusCode = 404; response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.reload(); await expect(page.getByText('Previous cached build', { exact:true })).toBeVisible();
    const fixture = JSON.parse(await readFile('tests/fixtures/milestone-v2.json', 'utf8')); fixture.speed = 0;
    await page.evaluate(raw => localStorage.setItem('kingnamic.save.v2', raw), JSON.stringify(fixture));
    updated = true; await page.evaluate(async () => {
      // Cache deletion precedes clients.claim(). Wait for the new worker to
      // control this still-open page before testing its next navigation.
      const claimed = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      await (await navigator.serviceWorker.getRegistration())!.update();
      await claimed;
    });
    await page.waitForFunction(async () => (await caches.keys()).some(k => k.startsWith('kingnamic-') && k !== 'kingnamic-update-fixture') && !(await caches.keys()).includes('kingnamic-update-fixture'));
    await page.reload(); await page.locator('#start').click({timeout:10000}); await page.locator('#tab-army').click(); await expect(page.locator('#open-expedition')).toBeVisible();
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('kingnamic.save.v2')!));
    expect(restored.units).toEqual(fixture.units); expect(restored.resources).toEqual(fixture.resources); expect(restored.buildings).toEqual(fixture.buildings);
    await context.setOffline(true); await page.reload(); await page.locator('#start').click(); await expect(page.locator('#world canvas')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kingnamic.save.v2')!).units)).toEqual(fixture.units);
    await page.screenshot({ path:'docs/evidence/tactics-offline-update.png' });
  } finally {
    await context.setOffline(false).catch(() => {});
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  }
});

test('production expedition survives an offline reload and extracts without duplicate recruitment', async ({ page, context }) => {
  // Explicit funded fixture isolates production offline mission persistence.
  const funded=newGame();funded.resources.stone=200;
  await page.addInitScript(raw=>{if(!localStorage.getItem('kingnamic.save.v2'))localStorage.setItem('kingnamic.save.v2',raw);},JSON.stringify(funded));
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#pause').click();
  await page.locator('#tab-army').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click(); await page.locator('#army-recruit').click();await page.locator('#recruit-class-ranger').click();await page.locator('#recruit-ranger').click();
  await page.locator('#open-expedition').click(); await page.locator('#expedition-launch').click(); await page.locator('#pause').click();
  await page.locator('#save').click(); await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('kingnamic.save.v2')!));
  expect(snapshot.expedition.world.units.filter((u: any) => u.origin === 'party')).toHaveLength(3);
  await context.setOffline(true); await page.reload(); await page.locator('#start').click();
  await expect(page.locator('#world-title')).toHaveText('Broken Standard');
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('kingnamic.save.v2')!));
  expect(resumed.expedition).toEqual(snapshot.expedition);
  // Retreat clears neither nearby infected nor the extraction rule. Let the live
  // withdrawal reach a safe entry; pursuing infected can cross the boundary on
  // the next simulation tick, so commit extraction in the same browser task.
  await page.locator('#expedition-retreat').click(); await page.locator('#speed-1').click();
  await page.waitForFunction(() => {
    const extract = document.querySelector<HTMLButtonElement>('#expedition-extract');
    if (!extract || extract.disabled) return false;
    extract.click();
    return true;
  }, undefined, {timeout:60000});
  await expect(page.locator('#panel')).toContainText('A fighting withdrawal');
  await page.locator('#save').click(); await page.reload(); await page.locator('#start').click();
  const returned = await page.evaluate(() => JSON.parse(localStorage.getItem('kingnamic.save.v2')!));
  expect(returned.expedition).toBeUndefined(); expect(returned.units).toHaveLength(5); expect(returned.lostBattalions.recruited).toBe(0);
  await page.screenshot({ path: 'docs/evidence/battalion-offline.png' });
  await context.setOffline(false);
});
