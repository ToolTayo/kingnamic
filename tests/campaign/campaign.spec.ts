import { expect, test, type Page } from '@playwright/test';
import { BUILDINGS, TERRITORIES, UNITS } from '../../src/game/config';
import { repairCost, upgradeCost } from '../../src/game/commands';
import { army, enemies } from '../../src/game/state';
import { canAfford, idle, jobCapacity } from '../../src/game/economy';
import type { BuildingKind, Job, State } from '../../src/game/types';
import { writeFile } from 'node:fs/promises';

// This test reads the development inspector, but every game action uses an
// actual button or canvas click. No state injection or simulated time jumps.
async function read(page: Page): Promise<State> { return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state))); }
test('complete five nights and all three marches through the real browser UI', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#speed-2').click();
  const queue: [BuildingKind, number, number][] = [['quarry', 18, 13], ['infirmary', 18, 15], ['tower', 10, 13], ['tower', 13, 8], ['tower', 19, 13], ['tower', 12, 17], ['farm', 12, 9], ['cottage', 16, 8]];
  let buildIndex = 0, lastDay = 0;
  const started = Date.now();
  while (Date.now() - started < 850000) {
    let s = await read(page); if (s.outcome !== 'playing') break;
    if (s.day !== lastDay) { lastDay = s.day; console.log('LIVE CAMPAIGN', JSON.stringify({ day: s.day, time: s.time, owned: s.owned, slain: s.stats.slain, hearth: s.buildings.find(b => b.kind === 'hearth')?.hp })); }
    const work = (['miners', 'healers', 'farmers'] as Job[]).some(job => idle(s) && s.jobs[job] < (job === 'miners' ? 3 : job === 'healers' ? 1 : s.population > 20 ? 6 : 4) && jobCapacity(s, job) > s.jobs[job]);
    const construct = buildIndex < queue.length && canAfford(s, BUILDINGS[queue[buildIndex][0]].cost);
    const health = s.infection.length > 0 && (canAfford(s, { herbs: 5, food: 8 }) || !s.quarantine);
    const recruitment = army(s).length < 7 && idle(s) && canAfford(s, UNITS[army(s).length % 3 === 0 ? 'ranger' : 'warden'].cost);
    const expansion = s.time > 120 && s.owned.length < 4 && s.phase === 'day' && !enemies(s).length;
    const maintenance = s.buildings.some(b => !['wall', 'gate'].includes(b.kind) && b.progress === 1 && !enemies(s).some(u => Math.hypot(u.x - b.x, u.y - b.y) < 2) && (b.hp < b.maxHp * .7 && canAfford(s, repairCost(b)) || s.owned.length === 4 && s.resources.wood > 80 && s.resources.stone > 65 && ['tower', 'hearth'].includes(b.kind) && b.level < 3 && canAfford(s, upgradeCost(b))));
    if (!(work || construct || health || recruitment || expansion || maintenance)) { await page.waitForTimeout(1400); continue; }
    // Players can pause to issue orders. This also prevents the healer from
    // spending herbs between reading affordability and clicking treatment.
    await page.locator('#pause').click({ timeout: 10000 }).catch(async error => { if ((await read(page)).outcome === 'playing') throw error; });
    s = await read(page); if (s.outcome !== 'playing') break;
    if (s.infection.length && !canAfford(s, { herbs: 5, food: 8 }) && !s.quarantine) { await page.locator('#tab-people').click(); await page.locator('#quarantine').click(); }
    if (s.infection.length && canAfford(s, { herbs: 5, food: 8 })) { await page.locator('#tab-people').click(); await page.locator('#treat').click(); }
    if (buildIndex < queue.length) {
      const [kind, x, y] = queue[buildIndex];
      if (canAfford(s, BUILDINGS[kind].cost) && !s.units.some(u => Math.hypot(u.x - x, u.y - y) < .8)) {
        await page.locator('#tab-build').click(); await page.locator(`#category-${BUILDINGS[kind].category}`).click(); await page.locator(`#build-${kind}`).click();
        const p = await page.evaluate(({ x, y }) => (window as any).__KINGNAMIC__.scene.screenPoint({ x, y }), { x, y });
        await page.locator('#world canvas').click({ position: p });
        s = await read(page); if (s.buildings.some(b => b.kind === kind && b.x === x && b.y === y)) buildIndex++;
      }
    }
    for (const [job, desired] of [['miners', 3], ['healers', 1], ['farmers', s.population > 20 ? 6 : 4]] as [Job, number][]) {
      s = await read(page);
      if (s.jobs[job] < desired && idle(s) && jobCapacity(s, job) > s.jobs[job]) { await page.locator('#tab-people').click(); await page.locator(`#job-${job}-plus`).click(); }
    }
    s = await read(page); const kind = army(s).length % 3 === 0 ? 'ranger' : 'warden';
    if (army(s).length < 7 && idle(s) && canAfford(s, UNITS[kind].cost)) { await page.locator('#tab-army').click(); await page.locator('#army-recruit').click();await page.locator(`#recruit-${kind}`).click(); }
    s = await read(page);
    if (s.time > 120 && s.phase === 'day' && enemies(s).length === 0 && army(s).length >= 4) {
      for (const territory of ['pinewatch', 'greybank', 'fen'] as const) {
        s = await read(page); const t = TERRITORIES[territory];
        if (!s.owned.includes(territory) && (!t.requirement || s.owned.includes(t.requirement)) && canAfford(s, t.cost)) { await page.locator('#tab-territories').click(); await page.locator(`#claim-${territory}`).click(); }
      }
    }
    s = await read(page);
    const upgrading = s.owned.length === 4 && s.resources.wood > 80 && s.resources.stone > 65;
    const b = s.buildings.find(b => !['wall', 'gate'].includes(b.kind) && b.progress === 1 && !enemies(s).some(u => Math.hypot(u.x - b.x, u.y - b.y) < 2) && (b.hp < b.maxHp * .7 && canAfford(s, repairCost(b)) || upgrading && ['tower', 'hearth'].includes(b.kind) && b.level < 3 && canAfford(s, upgradeCost(b))));
    if (b) {
      await page.locator('#tab-build').click(); await page.locator('#category-owned').click();await page.locator(`#inspect-${b.id}`).click();
      await page.locator(upgrading && ['tower', 'hearth'].includes(b.kind) && b.level < 3 && canAfford(s, upgradeCost(b)) ? '#upgrade' : '#repair').click();
      // Inspection pans the camera; return home before the next map placement.
      await page.locator('#home-camera').click();
    }
    await page.locator('#speed-2').click();
    await page.waitForTimeout(1400);
  }
  const s = await read(page);
  const result = { outcome: s.outcome, simulationSeconds: Number(s.time.toFixed(1)), wallSeconds: Math.round((Date.now() - started) / 1000), stats: s.stats, owned: s.owned, villagers: s.population, soldiers: army(s).length, hearthHealth: s.buildings.find(b => b.kind === 'hearth')?.hp, errors };
  console.log('LIVE CAMPAIGN RESULT', JSON.stringify(result));
  await writeFile('docs/evidence/renewal-campaign.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'docs/evidence/renewal-campaign.png' });
  expect(s.outcome).toBe('won'); expect(s.stats.nights).toBe(5); expect(s.owned).toHaveLength(4); expect(errors).toEqual([]);
});
