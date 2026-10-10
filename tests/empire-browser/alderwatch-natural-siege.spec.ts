import { test, expect, type Page } from '@playwright/test';
import { newGame, army, makeBuilding } from '../../src/game/state';
import { addResidents } from '../../src/game/population';
import { command } from '../../src/game/commands';
import { decode } from '../../src/game/persistence';
import type { SoldierKind } from '../../src/game/types';

const read = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
const waitRegion = (page: Page, region: 'march' | 'heartmere') => expect.poll(async () => {
  const s = await read(page); return s.region ?? 'heartmere';
}, { timeout: 90000, intervals: [100, 250, 500] }).toBe(region);
async function issue(page: Page, ids: number[], order: 'move' | 'attack' | 'defend' | 'hunt' | 'hold', x: number, y: number, focus?: number) {
  const result = await page.evaluate(({ ids, order, x, y, focus }) => {
    const rt = (window as any).__KINGNAMIC__.runtime;
    rt.selectUnits(ids);
    return rt.issueOrder(order, { x, y }, focus);
  }, { ids, order, x, y, focus });
  if (!result.ok && order === 'attack' && focus !== undefined && result.message === 'Choose a living enemy or hostile stronghold structure.') {
    const targetStillAlive = await page.evaluate((id: number) => {
      const s = (window as any).__KINGNAMIC__.runtime.world;
      return s.units.some((u: any) => u.id === id && u.hp > 0) || s.buildings.some((b: any) => b.id === id && b.owner === 'rival' && b.hp > 0);
    }, focus);
    if (!targetStillAlive) return { ok: true, message: 'The focused target fell before the order resolved.' };
  }
  return result;
}async function fitCompany(page: Page, ids: number[]) {
  return page.evaluate((ids: number[]) => {
    const s = (window as any).__KINGNAMIC__.runtime.world;
    return ids.filter(id => {
      const u = s.units.find((v: any) => v.id === id);
      return !!u && u.hp > 0 && !u.injury && !s.infection?.some((i: any) => i.personId === id);
    });
  }, ids);
}

test('a naturally recruited company discovers, assaults, captures, occupies and revisits Alderwatch', async ({ page }) => {
  test.setTimeout(900000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  const s = newGame(609142); s.speed = 0;
  s.resources = { wood: 2600, stone: 5600, food: 10100, herbs: 180 };
  const barracks = s.buildings.find(b => b.kind === 'barracks')!; barracks.level = 3;
  makeBuilding(s, 'barracks', 19, 10, true).level = 3;
  makeBuilding(s, 'barracks', 21, 10, true).level = 3;
  for (const [x, y] of [[23, 9], [25, 9], [27, 9]]) makeBuilding(s, 'farm', x, y, true);
  s.jobs.farmers = 20; addResidents(s, 210);

  const originalIds = new Set(army(s).map(u => u.id));
  const recruitment: [SoldierKind, number][] = [['warden', 60], ['spearman', 60], ['ranger', 50], ['scout', 27]];
  for (const [kind, count] of recruitment) {
    const result = command(s, { type: 'recruit', kind, count });
    expect(result.ok, 'All 197 soldiers must come from the legal recruitment command: ' + result.message).toBe(true);
  }
  const force = army(s), company = force.filter(u => !originalIds.has(u.id)), companyIds = company.map(u => u.id);
  const commander = force.find(u => u.id === s.commander?.id) ?? force.find(u => u.kind === 'warden')!;
  expect(force).toHaveLength(200);
  expect(company).toHaveLength(197);
  expect(command(s, { type: 'commander-appoint', id: commander.id }).ok).toBe(true);
  for (const u of force) Object.assign(u, { x: 14, y: 24, target: { x: 14, y: 24 }, anchor: { x: 14, y: 24 }, path: [], order: 'hold' });
  const homeGuards = force.filter(u => originalIds.has(u.id) && u.id !== commander.id);
  homeGuards.forEach((u, i) => Object.assign(u, { x: i ? 15 : 13, y: 17, target: { x: i ? 15 : 13, y: 17 }, anchor: { x: 14, y: 17 }, path: [], order: 'defend' }));
  const travellingIds = [...companyIds, commander.id];
  expect(decode(JSON.stringify(s))).not.toBeNull();

  await page.goto('/');
  await page.evaluate(raw => localStorage.setItem('kingnamic.save.v2', raw), JSON.stringify(s));
  await page.reload(); await page.locator('#start').click();
  await expect.poll(async () => (await read(page)).units.filter((u: any) => travellingIds.includes(u.id)).length).toBe(198);
  await page.locator('#tab-army').click();
  await page.evaluate((ids: number[]) => (window as any).__KINGNAMIC__.runtime.selectUnits(ids), companyIds);
  await page.locator('#tab-empire').click(); await page.locator('#gather-road').click(); await page.locator('#speed-2').click();
  await expect(page.locator('#travel-region')).toBeEnabled({ timeout: 90000 });
  await page.locator('#travel-region').click(); await waitRegion(page, 'march');

  let state = await read(page);
  expect(state.units.filter((u: any) => travellingIds.includes(u.id))).toHaveLength(198);
  expect(state.empire.reserve.units.filter((u: any) => homeGuards.some(g => g.id === u.id) && u.order === 'defend')).toHaveLength(2);

  // Clear March's eight finite starting infected first. The road encounter
  // director intentionally waits for infected already on the map to clear.
  const clearRoad = await issue(page, companyIds, 'hunt', 14, 17);
  expect(clearRoad.ok, clearRoad.message).toBe(true);
  await page.locator('#speed-2').click();
  await expect.poll(async () => (await read(page)).units.filter((u: any) => ['hollow', 'runner', 'brute'].includes(u.kind)).length,
    { timeout: 120000, intervals: [500, 1000, 2000] }).toBe(0);
  const remoteIds = await fitCompany(page, companyIds);
  const remoteStage = await issue(page, remoteIds, 'move', 42, 20);
  expect(remoteStage.ok, remoteStage.message).toBe(true);
  await expect.poll(async () => page.evaluate((ids: number[]) => {
    const s = (window as any).__KINGNAMIC__.runtime.world;
    return s.units.filter((u: any) => ids.includes(u.id) && u.hp > 0).every((u: any) => u.order !== 'move');
  }, remoteIds), { timeout: 120000, intervals: [500, 1000, 2000] }).toBe(true);
  const beforeApproach = await read(page);
  expect(beforeApproach.march.alderwatch.status).toBe('unseen');
  // Keep the force clear of the commander's road so he can physically scout
  // the warning without being trapped in a 200-soldier formation.
  const revealWarning = await issue(page, [commander.id], 'move', 8, 32);
  expect(revealWarning.ok, revealWarning.message).toBe(true);
  try {
    await expect.poll(async () => (await read(page)).march.roadWarning?.id, { timeout: 20000 }).toBe('abbey-approach');
  } catch (error) {
    const diagnostic = await page.evaluate(({ commanderId, revealWarning }: { commanderId: number; revealWarning: unknown }) => {
      const rt = (window as any).__KINGNAMIC__.runtime, w = rt.world, h = w.units.find((u: any) => u.id === commanderId);
      const point = { x: 7, y: 36 }, distance = (u: any) => Math.hypot(u.x - point.x, u.y - point.y);
      return {
        roadWarning: w.march.roadWarning, roadAmbushes: w.march.roadAmbushes, seen: w.march.seen, rumors: w.march.rumors,
        garrison: w.march.alderwatch, hero: h && { x: h.x, y: h.y, hp: h.hp, order: h.order, target: h.target, distance: distance(h) },
        infected: w.units.filter((u: any) => ['hollow', 'runner', 'brute'].includes(u.kind) && u.hp > 0).map((u: any) => ({ kind: u.kind, x: u.x, y: u.y, distance: distance(u) })),
        rivals: w.units.filter((u: any) => u.faction === 'rival' && u.hp > 0 && distance(u) < 10).map((u: any) => ({ kind: u.kind, rivalId: u.rivalId, x: u.x, y: u.y, distance: distance(u) })),
        logs: rt.state.logs.slice(0, 8), revealWarning
      };
    }, { commanderId: commander.id, revealWarning });
    console.error('Alderwatch first road warning diagnostic', JSON.stringify(diagnostic));
    throw error;
  }
  await expect(page.locator('#alert-banner')).toContainText('ambush in');
  await expect.poll(async () => (await read(page)).march.seen.includes('abbey-road'), { timeout: 45000 }).toBe(true);
  state = await read(page);
  expect(state.march.rumors).toContain('alderwatch');
  expect(state.march.alderwatch.status).toBe('unseen');
  const vanguard = await issue(page, await fitCompany(page, companyIds), 'hunt', 7, 36);
  expect(vanguard.ok, vanguard.message).toBe(true);
  const safeCaptain = await issue(page, [commander.id], 'move', 15, 31);
  expect(safeCaptain.ok, safeCaptain.message).toBe(true);
  try {
    await expect.poll(async () => {
      const s = await read(page), h = s.units.find((u: any) => u.id === commander.id);
      return s.march.roadAmbushes.includes('abbey-approach')
        && !s.units.some((u: any) => ['hollow', 'runner', 'brute'].includes(u.kind) && Math.hypot(u.x - 7, u.y - 36) < 8)
        && !!h && Math.hypot(h.x - 7, h.y - 36) > 8;
    }, { timeout: 90000, intervals: [250, 500, 1000] }).toBe(true);
  } catch (error) {
    const diagnostic = await page.evaluate(({ commanderId, companyIds }: { commanderId: number; companyIds: number[] }) => {
      const s = (window as any).__KINGNAMIC__.runtime.state, w = (window as any).__KINGNAMIC__.runtime.world;
      return {
        commander: w.units.find((u: any) => u.id === commanderId), warning: w.march.roadWarning,
        roadAmbushes: w.march.roadAmbushes,
        infected: w.units.filter((u: any) => ['hollow', 'runner', 'brute'].includes(u.kind)).map((u: any) => ({ id: u.id, kind: u.kind, x: u.x, y: u.y, hp: u.hp, order: u.order, target: u.target })),
        company: w.units.filter((u: any) => companyIds.includes(u.id)).map((u: any) => ({ id: u.id, x: u.x, y: u.y, hp: u.hp, order: u.order, target: u.target })),
        log: s.logs.slice(0, 8)
      };
    }, { commanderId: commander.id, companyIds });
    console.error('Alderwatch ambush clear diagnostic', JSON.stringify(diagnostic));
    throw error;
  }
  state = await read(page);
  expect(state.march.roadWarning).toBeUndefined();
  expect(state.units.find((u: any) => u.id === commander.id)?.hp).toBeGreaterThan(0);
  // Bring the company outside both firing arcs before the commander scouts
  // the reported Hall, so the first garrison volley cannot catch the screen
  // mid-march.
  const fortressIds = await fitCompany(page, companyIds);
  const fortressScreen = await issue(page, fortressIds, 'move', 30, 20);
  expect(fortressScreen.ok, fortressScreen.message).toBe(true);
  await expect.poll(async () => {
    const s = await read(page);
    return s.units.filter((u: any) => fortressIds.includes(u.id) && u.hp > 0 && u.order === 'move').length;
  }, { timeout: 120000, intervals: [500, 1000, 2000] }).toBe(0);
  await expect.poll(async () => page.evaluate((ids: number[]) => {
    const s = (window as any).__KINGNAMIC__.runtime.world;
    const watches = [{ x: 8, y: 39 }, { x: 13, y: 39 }];
    return s.units.filter((u: any) => ids.includes(u.id) && u.hp > 0).every((u: any) => watches.every(w => Math.hypot(u.x - w.x, u.y - w.y) > 6));
  }, [...companyIds, commander.id]), { timeout: 60000, intervals: [250, 500, 1000] }).toBe(true);
  const beforeSafeReveal = await read(page);
  expect(beforeSafeReveal.march.alderwatch.status).toBe('unseen');
  const commanderHpBeforeReveal = beforeSafeReveal.units.find((u: any) => u.id === commander.id)?.hp;
  await page.evaluate((commanderId: number) => {
    const root = window as any; root.__alderwatchRevealSample = undefined;
    if (root.__alderwatchRevealSampler) clearInterval(root.__alderwatchRevealSampler);
    root.__alderwatchRevealSampler = setInterval(() => {
      const w = root.__KINGNAMIC__?.runtime?.world, hero = w?.units?.find((u: any) => u.id === commanderId);
      if (w?.march?.alderwatch?.status === 'occupied' && hero && !root.__alderwatchRevealSample) {
        root.__alderwatchRevealSample = {
          x: hero.x, y: hero.y, hp: hero.hp, time: w.time,
          westRange: Math.hypot(hero.x - 8, hero.y - 39), eastRange: Math.hypot(hero.x - 13, hero.y - 39),
          hallRange: Math.hypot(hero.x - 10, hero.y - 42)
        };
      }
    }, 0);
  }, commander.id);
  await page.locator('#speed-1').click();
  const revealPoint = { x: 12, y: 33 };
  const revealPath = await page.evaluate(async ({ commanderId, target }: { commanderId: number; target: { x: number; y: number } }) => {
    const [{ tileAt }, { findPath, navigation }] = await Promise.all([
      import('/src/game/map.ts' as string), import('/src/game/navigation.ts' as string)
    ]);
    const s = (window as any).__KINGNAMIC__.runtime.world, hero = s.units.find((u: any) => u.id === commanderId);
    return findPath(s, hero, target, false, navigation(s), 'player').map((p: any) => ({
      x: p.x, y: p.y, westRange: Math.hypot(p.x - 8, p.y - 39), eastRange: Math.hypot(p.x - 13, p.y - 39),
      hallRange: Math.hypot(p.x - 10, p.y - 42)
    }));
  }, { commanderId: commander.id, target: revealPoint });
  expect(revealPath.length).toBeGreaterThan(0);
  expect(revealPath.every(p => p.westRange > 6 && p.eastRange > 6), `The commander route must stay outside both watch-post ranges: ${JSON.stringify(revealPath)}`).toBe(true);
  const approach = await issue(page, [commander.id], 'move', revealPoint.x, revealPoint.y);
  expect(approach.ok, approach.message).toBe(true);
  try {
    await expect.poll(async () => (await read(page)).march.alderwatch.status, { timeout: 45000 }).toBe('occupied');
  } catch (error) {
    const diagnostic = await page.evaluate(({ commanderId, companyIds, revealPoint, approach }: { commanderId: number; companyIds: number[]; revealPoint: { x: number; y: number }; approach: unknown }) => {
      const rt = (window as any).__KINGNAMIC__.runtime, s = rt.state, w = rt.world;
      const watches = [{ x: 8, y: 39 }, { x: 13, y: 39 }];
      const living = w.units.filter((u: any) => u.hp > 0);
      const distance = (u: any, p: any) => Math.hypot(u.x - p.x, u.y - p.y);
      const h = w.units.find((u: any) => u.id === commanderId);
      return {
        time: w.time, speed: w.speed, region: w.region,
        status: w.march.alderwatch.status, rumors: w.march.rumors, seen: w.march.seen,
        commander: h && { id: h.id, x: h.x, y: h.y, hp: h.hp, order: h.order, target: h.target, path: h.path, toReveal: distance(h, revealPoint), toCenter: distance(h, { x: 10, y: 42 }) },
        commanderState: w.commander,
        unitsNearWatches: living.filter((u: any) => watches.some(p => distance(u, p) <= 8)).map((u: any) => ({ id: u.id, faction: u.faction, kind: u.kind, rivalId: u.rivalId, x: u.x, y: u.y, hp: u.hp, order: u.order, toWest: distance(u, watches[0]), toEast: distance(u, watches[1]), company: companyIds.includes(u.id) })),
        localCompany: living.filter((u: any) => companyIds.includes(u.id) || u.id === commanderId).map((u: any) => ({ id: u.id, x: u.x, y: u.y, hp: u.hp, order: u.order, target: u.target })),
        garrison: w.march.alderwatch, logs: s.logs.slice(0, 12), approach
      };
    }, { commanderId: commander.id, companyIds, revealPoint, approach });
    console.error('Alderwatch reveal diagnostic', JSON.stringify(diagnostic));
    throw error;
  }
  state = await read(page);
  expect(state.march.alderwatch.status).toBe('occupied');
  const firstReveal = await page.evaluate(() => (window as any).__alderwatchRevealSample);
  console.log('Alderwatch first reveal position', JSON.stringify(firstReveal));
  expect(firstReveal, 'The safe commander approach must expose the first reveal position.').toBeTruthy();
  expect(firstReveal.hallRange).toBeLessThan(10);
  expect(firstReveal.westRange).toBeGreaterThan(6);
  expect(firstReveal.eastRange).toBeGreaterThan(6);
  expect(firstReveal.hp).toBe(commanderHpBeforeReveal);
  await page.locator('#pause').click();
  state = await read(page);
  const opening = state.march.alderwatch;
  expect(opening.remaining + opening.casualties).toBe(160);
  expect(opening.reserve).toBe(128);
  expect(opening.casualties).toBeLessThanOrEqual(32);
  const defenders = state.units.filter((u: any) => u.faction === 'rival' && u.rivalId === 'alderwatch' && u.hp > 0);
  expect(defenders).toHaveLength(opening.remaining - opening.reserve);
  const patrolScouts = defenders.filter((u: any) => u.kind === 'scout' && u.order === 'patrol' && u.patrol);
  expect(patrolScouts.length).toBeGreaterThan(0);
  expect(patrolScouts.length).toBeLessThanOrEqual(5);
  const gate = state.buildings.find((b: any) => b.name === 'Abbey Gate')!;
  const ravineGate = state.buildings.find((b: any) => b.name === 'Ravine Gate')!;
  const towers = state.buildings.filter((b: any) => b.rivalId === 'alderwatch' && b.kind === 'tower');
  expect(gate && ravineGate).toBeTruthy(); expect(towers).toHaveLength(2);

  const melee = company.filter(u => u.kind === 'warden' || u.kind === 'spearman').map(u => u.id);
  const ranged = company.filter(u => u.kind === 'ranger' || u.kind === 'scout').map(u => u.id);
  const westMelee = melee.filter((_, i) => i % 2 === 0), eastMelee = melee.filter((_, i) => i % 2 === 1);
  let order = await issue(page, westMelee, 'attack', gate.x, gate.y, gate.id);
  expect(order.ok, order.message).toBe(true);
  order = await issue(page, eastMelee, 'attack', ravineGate.x, ravineGate.y, ravineGate.id);
  expect(order.ok, order.message).toBe(true);
  const westWatch = towers.find((b: any) => b.name === 'West Abbey Watch')!;
  const eastWatch = towers.find((b: any) => b.name === 'East Abbey Watch')!;
  const westCover = ranged.filter((_, i) => i % 2 === 0), eastCover = ranged.filter((_, i) => i % 2 === 1);
  order = await issue(page, westCover, 'attack', westWatch.x, westWatch.y, westWatch.id);
  expect(order.ok, order.message).toBe(true);
  order = await issue(page, eastCover, 'attack', eastWatch.x, eastWatch.y, eastWatch.id);
  expect(order.ok, order.message).toBe(true);
  const captain = state.units.find((u: any) => u.id === commander.id);
  expect(captain, `The appointed commander must survive the initial reveal: ${JSON.stringify({ commanderId: commander.id, commanderState: state.commander, localUnit: captain, homeUnit: state.empire?.reserve.units.find((u: any) => u.id === commander.id), corpse: state.corpses?.find((c: any) => c.personId === commander.id), stats: state.stats, log: state.logs.slice(0, 5) })}`).toBeTruthy();
  const safeCommander = await issue(page, [commander.id], 'hold', revealPoint!.x, revealPoint!.y);
  expect(safeCommander.ok, safeCommander.message).toBe(true);
  await page.locator('#pause').click();
  state = await read(page);
  expect(state.units.find((u: any) => u.id === commander.id)?.hp).toBeGreaterThan(0);
  await page.locator('#speed-2').click();

  const started = Date.now(), history: any[] = [];
  let lastLog = started + 20000, lastEnemyTarget: number | undefined, commanderAdvanced = false, overviewOpened = false;
  while (Date.now() - started < 720000) {
    await page.waitForTimeout(1500);
    state = await read(page);
    const war = state.march.alderwatch;
    const active = state.units.filter((u: any) => u.faction === 'rival' && u.rivalId === 'alderwatch' && u.hp > 0);
    const infected = state.units.filter((u: any) => u.hp > 0 && ['hollow', 'runner', 'brute'].includes(u.kind));
    const snapshot = {
      elapsedMs: Date.now() - started, remaining: war.remaining, reserve: war.reserve,
      active: active.length, casualties: war.casualties, warning: war.warning,
      players: state.units.filter((u: any) => companyIds.includes(u.id) && u.hp > 0).length,
      commander: (() => { const h = state.units.find((u: any) => u.id === commander.id); return h ? { x: h.x, y: h.y, hp: h.hp } : null; })()
    };
    history.push(snapshot);
    if (Date.now() >= lastLog) {
      console.log('Alderwatch natural siege', JSON.stringify(snapshot));
      lastLog += 20000;
    }
    if (war.remaining === 0 && war.reserve === 0 && !active.length) {
      const nearby = infected.filter((u: any) => Math.hypot(u.x - 10, u.y - 42) < 7);
      if (nearby.length) {
        const target = [...nearby].sort((a: any, b: any) => Math.hypot(a.x - 10, a.y - 42) - Math.hypot(b.x - 10, b.y - 42))[0];
        if (target.id !== lastEnemyTarget) {
          const healthy = await fitCompany(page, companyIds);
          if (healthy.length) { await issue(page, healthy, 'attack', target.x, target.y, target.id); lastEnemyTarget = target.id; }
        }
      } else {
        const liveWatch = state.buildings.find((b: any) => b.rivalId === 'alderwatch' && b.kind === 'tower' && b.hp > 0);
        if (liveWatch) {
          if (liveWatch.id !== lastEnemyTarget) {
            const shooters = await fitCompany(page, ranged);
            if (shooters.length) {
              const result = await issue(page, shooters, 'attack', liveWatch.x, liveWatch.y, liveWatch.id);
              expect(result.ok, result.message).toBe(true); lastEnemyTarget = liveWatch.id;
            }
          }
        } else if (!commanderAdvanced) {
          const h = state.units.find((u: any) => u.id === commander.id);
          if (!h || Math.hypot(h.x - 10, h.y - 47) > 1) {
            const result = await issue(page, [commander.id], 'move', 10, 47);
            expect(result.ok, result.message).toBe(true);
          }
          commanderAdvanced = true;
        }
      }
      if (!overviewOpened) { await page.locator('#tab-empire').click(); overviewOpened = true; }
      if (await page.locator('#capture-alderwatch').count() && await page.locator('#capture-alderwatch').isEnabled()) break;
    } else if (!active.length && war.reserve > 0 && !war.warning) {
      // Relief intervals are simulation timed. Leave the advance active while the finite company forms.
    } else if (active.length && !state.buildings.some((b: any) => b.id === gate.id) && !state.buildings.some((b: any) => b.id === ravineGate.id)) {
      const nearest = [...active].sort((a: any, b: any) => Math.hypot(a.x - 10, a.y - 42) - Math.hypot(b.x - 10, b.y - 42))[0];
      if (nearest && nearest.id !== lastEnemyTarget) {
        const healthy = await fitCompany(page, companyIds);
        if (healthy.length) {
          const result = await issue(page, healthy, 'attack', nearest.x, nearest.y, nearest.id);
          expect(result.ok, result.message).toBe(true); lastEnemyTarget = nearest.id;
        }
      }
    }
  }
  expect(await page.locator('#capture-alderwatch').isEnabled(),
    'Natural Alderwatch siege did not reach capture readiness: ' + JSON.stringify(history.slice(-5))).toBe(true);

  await page.locator('#pause').click();
  state = await read(page);
  expect(state.march.alderwatch).toMatchObject({ remaining: 0, reserve: 0, casualties: 160 });
  expect(state.units.some((u: any) => u.faction === 'rival' && u.rivalId === 'alderwatch')).toBe(false);
  expect(state.units.filter((u: any) => u.faction === 'rival' && u.hp > 0)).toHaveLength(0);
  expect(state.infection.every((i: any) => i.source === 'bite')).toBe(true);
  const woodBefore = state.resources.wood, crownsBefore = state.resources.stone;
  await page.locator('#capture-alderwatch').click();
  state = await read(page);
  expect(state.march.alderwatch.status).toBe('captured');
  expect(state.buildings.find((b: any) => b.name === 'Alderwatch Hall')?.owner).toBe('player');
  expect(state.population).toBe(6);
  expect(state.resources.wood - woodBefore).toBe(75);
  expect(state.resources.stone - crownsBefore).toBe(40);
  const duplicate = await page.evaluate(() => {
    const rt = (window as any).__KINGNAMIC__.runtime;
    const before = { resources: { ...rt.state.resources }, population: rt.state.population };
    const result = rt.act({ type: 'stronghold-capture', id: 'alderwatch' });
    return { result, before, after: { resources: { ...rt.state.resources }, population: rt.state.population } };
  });
  expect(duplicate.result.ok).toBe(false);
  expect(duplicate.after).toEqual(duplicate.before);

  const hall = state.buildings.find((b: any) => b.name === 'Alderwatch Hall')!;
  const repair = await page.evaluate((id: number) => (window as any).__KINGNAMIC__.runtime.act({ type: 'repair', id }), hall.id);
  expect(repair.ok, repair.message).toBe(true);
  state = await read(page);
  expect(state.buildings.find((b: any) => b.id === hall.id)?.hp).toBe(state.buildings.find((b: any) => b.id === hall.id)?.maxHp);

  const site = await page.evaluate(async () => {
    const { buildError } = await import('/src/game/commands.ts' as string);
    const s = (window as any).__KINGNAMIC__.runtime.world, h = s.buildings.find((b: any) => b.name === 'Alderwatch Hall');
    for (let r = 1; r <= 7; r++) for (let y = h.y - r; y <= h.y + r; y++) for (let x = h.x - r; x <= h.x + r; x++) {
      if (Math.max(Math.abs(x - h.x), Math.abs(y - h.y)) === r && !buildError(s, 'cottage', x, y)) return { x, y };
    }
    return null;
  });
  expect(site).toBeTruthy();
  const build = await page.evaluate((site: any) => (window as any).__KINGNAMIC__.runtime.act({ type: 'build', kind: 'cottage', ...site }), site);
  expect(build.ok, build.message).toBe(true);
  state = await read(page);

  const survivors = await fitCompany(page, companyIds);
  expect(survivors.length).toBeGreaterThan(18);
  const garrisonIds = survivors.slice(0, 12);
  const garrison = await issue(page, garrisonIds, 'defend', 10, 35);
  expect(garrison.ok, garrison.message).toBe(true);
  const resourceLedger = { ...state.resources }, buildingCount = state.buildings.length;
  await page.locator('#save').click(); await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload(); await page.locator('#start').click();
  state = await read(page);
  expect(state.march.alderwatch.status).toBe('captured');
  expect(state.march.alderwatch.remaining + state.march.alderwatch.casualties).toBe(160);
  expect(state.buildings.find((b: any) => b.name === 'Alderwatch Hall')?.hp).toBe(state.buildings.find((b: any) => b.id === hall.id)?.maxHp);
  expect(state.buildings.some((b: any) => b.x === site!.x && b.y === site!.y)).toBe(true);
  expect(state.buildings.length).toBe(buildingCount);
  expect(state.resources).toEqual(resourceLedger);
  expect(state.units.filter((u: any) => garrisonIds.includes(u.id) && u.hp > 0 && u.order === 'defend')).toHaveLength(garrisonIds.length);
  expect(decode(JSON.stringify(state))).not.toBeNull();

  const commanderInfection = await page.evaluate((id: number) => {
    const s = (window as any).__KINGNAMIC__.runtime.world;
    return s.infection.find((i: any) => i.personId === id) ?? null;
  }, commander.id);
  if (commanderInfection) {
    expect(commanderInfection.source).toBe('bite');
    const treatment = await page.evaluate((id: number) => (window as any).__KINGNAMIC__.runtime.act({ type: 'treat', ids: [id] }), commander.id);
    expect(treatment.ok, treatment.message).toBe(true);
  }
  state = await read(page);
  expect(state.infection.some((i: any) => i.personId === commander.id)).toBe(false);  const fitReturn = await fitCompany(page, [commander.id, ...survivors.filter(id => !garrisonIds.includes(id))]);
  const returnParty = fitReturn.slice(0, 7);
  expect(returnParty).toContain(commander.id);
  await page.locator('#tab-army').click();
  await page.evaluate((ids: number[]) => (window as any).__KINGNAMIC__.runtime.selectUnits(ids.filter(id => id !== (window as any).__KINGNAMIC__.runtime.state.commander?.id)), returnParty);
  await page.locator('#tab-empire').click(); await page.locator('#gather-road').click(); await page.locator('#speed-2').click();
  await expect(page.locator('#travel-region')).toBeEnabled({ timeout: 90000 });
  await page.locator('#travel-region').click(); await waitRegion(page, 'heartmere');
  state = await read(page);
  expect(state.empire.reserve.march.alderwatch.status).toBe('captured');
  expect(state.empire.reserve.units.filter((u: any) => garrisonIds.includes(u.id) && u.hp > 0 && u.order === 'defend')).toHaveLength(garrisonIds.length);
  expect(state.empire.reserve.buildings.find((b: any) => b.name === 'Alderwatch Hall')?.hp).toBe(state.empire.reserve.buildings.find((b: any) => b.id === hall.id)?.maxHp);
  await page.locator('#save').click(); await page.reload(); await page.locator('#start').click();
  state = await read(page);
  expect(state.region).toBeUndefined();
  expect(state.empire.reserve.march.alderwatch.status).toBe('captured');

  const available = await page.evaluate((ids: number[]) => ids.filter(id => (window as any).__KINGNAMIC__.runtime.state.units.some((u: any) => u.id === id && u.hp > 0)), returnParty);
  expect(available).toContain(commander.id);
  await page.locator('#tab-army').click();
  await page.evaluate((ids: number[]) => (window as any).__KINGNAMIC__.runtime.selectUnits(ids.filter(id => id !== (window as any).__KINGNAMIC__.runtime.state.commander?.id)), available);
  await page.locator('#tab-empire').click(); await page.locator('#gather-road').click(); await page.locator('#speed-2').click();
  await expect(page.locator('#travel-region')).toBeEnabled({ timeout: 90000 });
  await page.locator('#travel-region').click(); await waitRegion(page, 'march');
  state = await read(page);
  expect(state.march.alderwatch.status).toBe('captured');
  expect(state.buildings.find((b: any) => b.name === 'Alderwatch Hall')?.hp).toBe(state.buildings.find((b: any) => b.id === hall.id)?.maxHp);
  expect(state.buildings.some((b: any) => b.x === site!.x && b.y === site!.y)).toBe(true);
  expect(state.units.filter((u: any) => garrisonIds.includes(u.id) && u.hp > 0 && u.order === 'defend')).toHaveLength(garrisonIds.length);
  expect(errors).toEqual([]);
});
