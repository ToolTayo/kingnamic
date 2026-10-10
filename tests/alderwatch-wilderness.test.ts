import { describe, expect, it } from 'vitest';
import { command } from '../src/game/commands';
import { MAX_BUILDINGS, MAX_HOSTILES } from '../src/game/config';
import { combatStep } from '../src/game/combat';
import { ROAD_EXIT, empireStep, captureStronghold, strongholdCaptureError } from '../src/game/empire';
import { findPath, navigation } from '../src/game/navigation';
import { decode } from '../src/game/persistence';
import { army, enemies, makeUnit, newGame, rivals } from '../src/game/state';
import { distance, STRONGHOLD_CENTERS, tileAt, tilesFor } from '../src/game/map';
import { wildernessReadout, wildernessStep } from '../src/game/wilderness';
import type { State } from '../src/game/types';

function depart() {
  const s = newGame(408120);
  command(s, { type: 'commander-appoint' });
  const party = army(s).slice(0, 2);
  for (const u of party) Object.assign(u, ROAD_EXIT, { target: { ...ROAD_EXIT }, order: 'hold' });
  expect(command(s, { type: 'travel', ids: party.map(u => u.id) }).ok).toBe(true);
  return s;
}
function cleared() {
  const s = depart();
  s.units = army(s);
  s.resources.wood = 500;
  s.resources.stone = 500;
  return s;
}
function commander(s: State) {
  return army(s).find(u => u.id === s.commander?.id)!;
}
function reload(s: State) {
  const loaded = decode(JSON.stringify(s));
  expect(loaded, 'The resulting March save should decode').not.toBeNull();
  return loaded!;
}

describe('Alderwatch Abbey Wardens campaign', () => {
  it('keeps the hall hidden until Abbey Road is discovered and the commander reaches a safe reveal point', () => {
    const s = cleared(), hero = commander(s);
    const escort = army(s).find(u => u.id !== hero.id)!;
    Object.assign(hero, { x: 10, y: 42, target: { x: 10, y: 42 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.alderwatch!.status).toBe('unseen');
    expect(rivals(s, 'alderwatch')).toHaveLength(0);

    Object.assign(escort, { x: 7, y: 36, target: { x: 7, y: 36 }, path: [] });
    Object.assign(hero, { x: 8, y: 35, target: { x: 8, y: 35 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.seen).toContain('abbey-road');
    expect(s.march!.rumors).toContain('alderwatch');
    expect(s.march!.alderwatch!.status).toBe('unseen');
    const reportHp = hero.hp;
    combatStep(s, .1, false);
    expect(hero.hp).toBe(reportHp);

    Object.assign(escort, { x: 13, y: 37, target: { x: 13, y: 37 }, path: [] });
    Object.assign(hero, { x: 12, y: 33, target: { x: 12, y: 33 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.alderwatch!.status).toBe('occupied');
    expect(rivals(s, 'alderwatch')).toHaveLength(32);
    for (const point of [{ x: 8, y: 39 }, { x: 13, y: 39 }]) {
      expect(distance(hero, point)).toBeGreaterThan(6);
    }
    expect(distance(escort, { x: 13, y: 39 })).toBeLessThan(6);
    const safeHp = hero.hp;
    combatStep(s, .1, false);
    expect(hero.hp).toBe(safeHp);
  });

  it('leaves the established Tallowmere road passable and does not trigger Alderwatch or its ambush there', () => {
    const s = cleared(), hero = commander(s);
    expect(tileAt(14, 32, s)?.terrain).toBe('road');
    Object.assign(hero, { x: 14, y: 32, target: { x: 14, y: 32 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.seen).not.toContain('abbey-road');
    expect(s.march!.rumors).not.toContain('alderwatch');
    expect(s.march!.alderwatch!.status).toBe('unseen');
    expect(rivals(s, 'alderwatch')).toHaveLength(0);
    expect(s.march!.roadWarning).toBeUndefined();
    Object.assign(hero, { x: 21, y: 38, target: { x: 21, y: 38 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.alderwatch!.status).toBe('unseen');
    expect(s.march!.rumors).not.toContain('alderwatch');
    expect(s.march!.roadWarning).toBeUndefined();
  });

  it('requires the Abbey Road report, reveals a distinct fortified ravine hall, and gives ranged defenders high cover', () => {
    const s = cleared(), hero = commander(s);
    const terrain = tilesFor(s);
    expect(terrain.some(t => t.terrain === 'forest' && t.x >= 4 && t.x <= 18 && t.y >= 33 && t.y <= 47)).toBe(true);
    expect(terrain.some(t => t.terrain === 'rock' && t.x >= 4 && t.x <= 18 && t.y >= 33 && t.y <= 47)).toBe(true);
    expect(tileAt(14, 29, s)?.terrain).toBe('road');
    expect(tileAt(14, 32, s)?.terrain).toBe('road');
    expect(findPath(s, ROAD_EXIT, { x: 9, y: 42 }, false, navigation(s), 'player').length).toBeGreaterThan(0);

    Object.assign(hero, { x: 8, y: 35, target: { x: 8, y: 35 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.seen).toContain('abbey-road');
    expect(s.march!.rumors).toContain('alderwatch');
    expect(s.march!.alderwatch!.status).toBe('unseen');
    expect(rivals(s, 'alderwatch')).toHaveLength(0);

    // The revealed fort is still outside both tower ranges; the company has
    // time to screen the commander before the first exposed approach.
    Object.assign(hero, { x: 12, y: 33, target: { x: 12, y: 33 }, path: [] });
    empireStep(s, .1);
    const war = s.march!.alderwatch!;
    expect(distance(hero, STRONGHOLD_CENTERS.alderwatch)).toBeLessThan(10);
    for (const point of [{ x: 8, y: 39 }, { x: 13, y: 39 }]) expect(distance(hero, point)).toBeGreaterThan(6);
    expect(war).toMatchObject({ status: 'occupied', remaining: 160, reserve: 128, casualties: 0 });
    const defenders = rivals(s, 'alderwatch');
    expect(defenders).toHaveLength(32);
    expect(s.buildings.filter(b => b.owner === 'rival' && b.rivalId === 'alderwatch')).toHaveLength(40);
    expect(s.buildings.filter(b => b.rivalId === 'alderwatch' && b.kind === 'tower').map(b => b.name).sort()).toEqual(['East Abbey Watch', 'West Abbey Watch']);
    expect(defenders.filter(u => u.kind === 'scout' && u.order === 'patrol')).toHaveLength(5);
    expect(defenders.every(u => u.x >= 7 && u.x <= 14 && u.y >= 39 && u.y <= 45)).toBe(true);
    const revealHp = hero.hp;
    combatStep(s, .1, false);
    expect(hero.hp).toBe(revealHp);
    const ranged = defenders.filter(u => u.kind === 'ranger' || u.kind === 'scout');
    const melee = defenders.filter(u => u.kind === 'warden' || u.kind === 'spearman');
    const height = (group: typeof defenders) => group.reduce((total, u) => total + tileAt(u.x, u.y, s)!.height, 0) / group.length;
    expect(height(ranged)).toBeGreaterThan(height(melee));
    expect(findPath(s, ROAD_EXIT, { x: 9, y: 42 }, false, navigation(s), 'player')).toHaveLength(0);
    expect(findPath(s, ROAD_EXIT, { x: 9, y: 42 }, false, navigation(s), 'rival').length).toBeGreaterThan(0);
    Object.assign(hero, { x: 11, y: 47, target: { x: 11, y: 47 }, path: [] });
    expect(strongholdCaptureError(s, 'alderwatch')).toContain('remaining 160');
    const patrol = defenders.find(u => u.kind === 'scout')!, before = { x: patrol.x, y: patrol.y };
    combatStep(s, .2, false);
    expect(patrol.x !== before.x || patrol.y !== before.y).toBe(true);
    expect(reload(s).march!.alderwatch).toEqual(war);
  });

  it('tracks casualties once and captures the hall with its finite settlement reward and residents', () => {
    const s = cleared(), hero = commander(s);
    Object.assign(hero, { x: 8, y: 35, target: { x: 8, y: 35 }, path: [] });
    empireStep(s, .1);
    Object.assign(hero, { x: 12, y: 33, target: { x: 12, y: 33 }, path: [] });
    empireStep(s, .1);
    Object.assign(hero, { x: 10, y: 37, target: { x: 10, y: 37 }, path: [] });
    empireStep(s, .1);
    const war = s.march!.alderwatch!;
    const defenders = rivals(s, 'alderwatch');
    for (const u of defenders.slice(1)) Object.assign(u, { x: 35, y: 40, anchor: { x: 35, y: 40 }, target: { x: 35, y: 40 }, cooldown: 8 });
    for (const b of s.buildings.filter(b => b.owner === 'rival' && b.rivalId === 'alderwatch')) b.cooldown = 8;
    const casualty = defenders[0];
    casualty.hp = 0;
    combatStep(s, .1, false);
    expect(war).toMatchObject({ remaining: 159, reserve: 128, casualties: 1 });
    combatStep(s, .1, false);
    expect(war.casualties).toBe(1);

    s.units = s.units.filter(u => u.rivalId !== 'alderwatch');
    Object.assign(war, { remaining: 0, reserve: 0, casualties: 160 });
    const wood = s.resources.wood, crowns = s.resources.stone, count = s.buildings.length;
    const capture = captureStronghold(s, 'alderwatch');
    expect(capture, capture.message).toMatchObject({ ok: true });
    expect(war).toMatchObject({ status: 'captured', remaining: 0, reserve: 0, casualties: 160 });
    expect(s.buildings.find(b => b.name === 'Alderwatch Hall')?.owner).toBe('player');
    expect(s.buildings.filter(b => b.owner === 'player' && b.kind === 'tower')).toHaveLength(2);
    expect(s.buildings).toHaveLength(count + 2);
    expect(s.population).toBe(6);
    expect(s.residents).toHaveLength(6);
    expect(s.jobs.farmers).toBeGreaterThan(0);
    expect(s.resources.wood).toBe(wood + 75);
    expect(s.resources.stone).toBe(crowns + 40);
    expect(new Set([...s.units.map(u => u.id), ...s.residents!.map(r => r.id), ...s.empire!.reserve.units.map(u => u.id), ...s.empire!.reserve.residents!.map(r => r.id)]).size)
      .toBe(s.units.length + s.residents!.length + s.empire!.reserve.units.length + s.empire!.reserve.residents!.length);
    const saved = reload(s);
    expect(saved.march!.alderwatch!.status).toBe('captured');
    expect(saved.buildings.find(b => b.name === 'Alderwatch Hall')?.owner).toBe('player');
    const before = { resources: { ...saved.resources }, population: saved.population, buildings: saved.buildings.length };
    expect(captureStronghold(saved, 'alderwatch').ok).toBe(false);
    expect(saved.resources).toEqual(before.resources);
    expect(saved.population).toBe(before.population);
    expect(saved.buildings).toHaveLength(before.buildings);
  });
});

describe('bounded Briar March road encounters', () => {
  it('warns before a finite patrol band, persists it, and does not arm another while infected remain', () => {
    const s = cleared(), hero = commander(s);
    s.march!.seen = ['village', 'grove', 'ruins', 'splitford', 'pilgrim-shrine', 'mossgate', 'bogstead', 'wayfarer-camp', 'saltwick-causeway', 'tallowmere', 'northwatch', 'abbey-road'];
    Object.assign(hero, { x: 7, y: 36, target: { x: 7, y: 36 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.roadWarning).toMatchObject({ id: 'abbey-approach', remaining: 8 });
    expect(wildernessReadout(s)).toContain('Watchful');
    const saved = reload(s);
    expect(saved.march!.roadWarning).toEqual(s.march!.roadWarning);

    empireStep(s, 8);
    expect(s.march!.roadWarning).toBeUndefined();
    expect(s.march!.roadAmbushes).toEqual(['abbey-approach']);
    expect(enemies(s)).toHaveLength(3);
    expect(enemies(s).every(u => u.order === 'patrol' && !!u.patrol && !!u.anchor)).toBe(true);
    const patrolBefore = enemies(s).map(u => ({ x: u.x, y: u.y }));
    Object.assign(hero, { x: 33, y: 24, target: { x: 33, y: 24 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.roadWarning).toBeUndefined();
    combatStep(s, .2, false);
    expect(enemies(s).some((u, i) => u.x !== patrolBefore[i].x || u.y !== patrolBefore[i].y)).toBe(true);

    s.units = s.units.filter(u => !['hollow', 'runner', 'brute'].includes(u.kind));
    Object.assign(hero, { x: 44, y: 14, target: { x: 44, y: 14 }, path: [] });
    wildernessStep(s, .1, hero);
    expect(s.march!.roadWarning).toMatchObject({ id: 'greybank-track' });
    expect(wildernessReadout(s)).toContain('Severe');
  });

  it('still arms the Abbey road warning beside a live rival garrison when no infected remain', () => {
    const s = cleared(), hero = commander(s);
    s.march!.seen = ['abbey-road']; s.march!.rumors = ['alderwatch'];
    Object.assign(hero, { x: 12, y: 33, target: { x: 12, y: 33 }, path: [] });
    empireStep(s, .1);
    expect(s.march!.alderwatch!.status).toBe('occupied');
    expect(rivals(s, 'alderwatch').length).toBeGreaterThan(0);
    expect(enemies(s)).toHaveLength(0);

    Object.assign(hero, { x: 7, y: 36, target: { x: 7, y: 36 }, path: [] });
    wildernessStep(s, .1, hero);
    expect(s.march!.roadWarning).toMatchObject({ id: 'abbey-approach', remaining: 8 });
    expect(enemies(s)).toHaveLength(0);
  });

  it('abandons an unformed warning after retreat and retries safely when hostile capacity is full', () => {
    const s = cleared(), hero = commander(s);
    s.march!.seen = ['village', 'grove', 'ruins', 'splitford', 'pilgrim-shrine', 'mossgate', 'bogstead', 'wayfarer-camp', 'saltwick-causeway', 'tallowmere', 'northwatch', 'abbey-road'];
    Object.assign(hero, { x: 7, y: 36, target: { x: 7, y: 36 }, path: [] });
    wildernessStep(s, .1, hero);
    expect(s.march!.roadWarning?.id).toBe('abbey-approach');
    Object.assign(hero, { x: 30, y: 34 });
    wildernessStep(s, .1, hero);
    expect(s.march!.roadWarning).toBeUndefined();
    expect(s.march!.roadAmbushes).toHaveLength(0);

    Object.assign(hero, { x: 7, y: 36, target: { x: 7, y: 36 } });
    wildernessStep(s, .1, hero);
    for (let i = 0; i < MAX_HOSTILES - 2; i++) makeUnit(s, 'hollow', 54, 44);
    expect(enemies(s)).toHaveLength(MAX_HOSTILES - 2);
    wildernessStep(s, 8, hero);
    expect(enemies(s)).toHaveLength(MAX_HOSTILES - 2);
    expect(s.march!.roadWarning).toMatchObject({ id: 'abbey-approach', remaining: 0 });
    const removed = enemies(s)[0];
    s.units = s.units.filter(u => u.id !== removed.id);
    wildernessStep(s, .1, hero);
    expect(enemies(s)).toHaveLength(MAX_HOSTILES);
    expect(s.march!.roadAmbushes).toContain('abbey-approach');
    expect(s.units.length).toBeLessThanOrEqual(400);
    expect(decode(JSON.stringify(s))).not.toBeNull();
  });

  it('migrates March saves without Alderwatch and warning fields while rejecting invalid encounter identities', () => {
    const old = cleared();
    delete old.march!.alderwatch;
    delete old.march!.roadAmbushes;
    delete old.march!.roadWarning;
    old.march!.seen = old.march!.seen.filter(id => id !== 'abbey-road');
    old.march!.rumors = [];
    const migrated = reload(old);
    expect(migrated.march!.alderwatch).toMatchObject({ status: 'unseen', remaining: 160, reserve: 128, casualties: 0 });
    expect(migrated.march!.roadAmbushes).toEqual([]);
    expect(migrated.march!.seen).not.toContain('abbey-road');

    migrated.march!.roadWarning = { id: 'abbey-approach', remaining: 4 };
    expect(reload(migrated).march!.roadWarning).toEqual({ id: 'abbey-approach', remaining: 4 });
    const bad = structuredClone(migrated);
    bad.march!.roadWarning!.id = 'not-a-road' as any;
    expect(decode(JSON.stringify(bad))).toBeNull();
    const noDuplicate = structuredClone(migrated);
    noDuplicate.march!.roadAmbushes = ['abbey-approach'];
    noDuplicate.march!.roadWarning = { id: 'abbey-approach', remaining: 4 };
    expect(decode(JSON.stringify(noDuplicate))).toBeNull();
  });
});

describe('Alderwatch relief ledger and combined March save capacity', () => {
  it('deploys finite reserve companies under pressure and persists all four active keeps within the existing structure cap', () => {
    const s = cleared(), hero = commander(s);
    Object.assign(hero, { x: 8, y: 35, target: { x: 8, y: 35 }, path: [] });
    empireStep(s, .1);
    Object.assign(hero, { x: 12, y: 33, target: { x: 12, y: 33 }, path: [] });
    empireStep(s, .1);
    Object.assign(hero, { x: 10, y: 37, target: { x: 10, y: 37 }, path: [] });
    empireStep(s, .1);
    const war = s.march!.alderwatch!, initial = rivals(s, 'alderwatch');
    for (const u of initial.slice(0, 25)) u.hp = 0;
    for (const u of initial.slice(25)) Object.assign(u, { x: 35, y: 40, anchor: { x: 35, y: 40 }, target: { x: 35, y: 40 }, cooldown: 8 });
    for (const b of s.buildings.filter(b => b.owner === 'rival' && b.rivalId === 'alderwatch')) b.cooldown = 8;
    combatStep(s, .1, false);
    expect(war).toMatchObject({ remaining: 135, reserve: 128, casualties: 25 });
    expect(rivals(s, 'alderwatch')).toHaveLength(7);

    empireStep(s, .1);
    expect(war.warning).toBe(5);
    empireStep(s, 5);
    expect(war).toMatchObject({ remaining: 135, reserve: 116, casualties: 25, warning: 0 });
    expect(rivals(s, 'alderwatch')).toHaveLength(19);

    const allKeeps = cleared(), scout = commander(allKeeps);
    allKeeps.march!.seen = ['wayfarer-camp', 'stonewake-quarry', 'abbey-road'];
    allKeeps.march!.rumors = ['weirward', 'stonewake', 'alderwatch'];
    for (const [x, y] of [[47, 29], [37, 36], [50, 9], [10, 42]]) {
      Object.assign(scout, { x, y, target: { x, y }, path: [] });
      empireStep(allKeeps, .1);
    }
    Object.assign(scout, { x: 8, y: 35, target: { x: 8, y: 35 }, path: [] });
    empireStep(allKeeps, .1);
    Object.assign(scout, { x: 12, y: 33, target: { x: 12, y: 33 }, path: [] });
    empireStep(allKeeps, .1);
    expect(['mossgate', 'tallowmere', 'stonewake', 'alderwatch'].every(id =>
      allKeeps.march![id === 'mossgate' ? 'rival' : id === 'tallowmere' ? 'weirward' : id]!.status === 'occupied'
    )).toBe(true);
    expect(allKeeps.buildings.length).toBeLessThanOrEqual(MAX_BUILDINGS);
    expect(decode(JSON.stringify(allKeeps))).not.toBeNull();
  });
});
