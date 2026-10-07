import { describe, expect, it } from 'vitest';
import { BUILDINGS, MAP_H, MAP_W, STEP } from '../src/game/config';
import { command, buildError } from '../src/game/commands';
import { capacity, idle, rates } from '../src/game/economy';
import { findPath } from '../src/game/navigation';
import { BACKUP_KEY, decode, load, SAVE_KEY, save } from '../src/game/persistence';
import { advance, step } from '../src/game/simulation';
import { army, enemies, makeBuilding, makeUnit, newGame } from '../src/game/state';
import type { State } from '../src/game/types';

const storage = () => { const map = new Map<string, string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } }; };
const flush = (s: State) => { s.units = s.units.filter(u => u.kind === 'warden' || u.kind === 'ranger'); s.waveRemaining = 0; };
describe('integrated kingdom rules', () => {
  it('starts with an inhabited, sustainable settlement and three troop roles/structures', () => { const s = newGame(); expect(s.population).toBe(18); expect(army(s)).toHaveLength(3); expect(capacity(s)).toBe(24); expect(rates(s).food).toBeGreaterThan(0); expect(idle(s)).toBe(8); expect(decode(JSON.stringify(s))).not.toBeNull(); });
  it('is deterministic across complete runs and save/resume', () => {
    const a = newGame(901), b = newGame(901); advance(a, 95); advance(b, 95); expect(a).toEqual(b);
    const c = decode(JSON.stringify(a))!; a.effects = []; advance(a, 30); advance(c, 30); expect(c).toEqual(a);
  });
  it('spends resources once, completes construction and enables jobs', () => {
    const s = newGame(); expect(command(s, { type: 'build', kind: 'quarry', x: 18, y: 13 }).ok).toBe(true); expect(s.resources.wood).toBe(105);
    expect(command(s, { type: 'job', job: 'miners', delta: 1 }).ok).toBe(false); expect(buildError(s, 'cottage', 18, 13)).toContain('already');
    advance(s, 12); expect(command(s, { type: 'job', job: 'miners', delta: 1 }).ok).toBe(true); const stone = s.resources.stone; advance(s, 10); expect(s.resources.stone).toBeGreaterThan(stone + 2); expect(s.stats.built).toBe(1);
  });
  it('rejects water, unclaimed tiles, occupied ground and overspending', () => { const s = newGame(); expect(buildError(s, 'wall', 23, 10)).toBeTruthy(); expect(buildError(s, 'wall', 4, 10)).toContain('Reclaim'); expect(buildError(s, 'wall', 14, 11)).toContain('already'); s.resources.wood = 0; expect(command(s, { type: 'build', kind: 'cottage', x: 18, y: 13 }).ok).toBe(false); expect(s.resources.wood).toBe(0); });
  it('recruitment consumes one idle resident and Crowns', () => { const s = newGame(); expect(command(s, { type: 'recruit', kind: 'ranger' }).ok).toBe(true); expect(s.population).toBe(17); expect(army(s)).toHaveLength(4); expect(s.resources.stone).toBe(65); expect(s.resources.food).toBe(180); s.jobs.builders += idle(s); expect(command(s, { type: 'recruit', kind: 'warden' }).ok).toBe(false); });
  it('prevents assignments above healthy population or workplace capacity', () => { const s = newGame(); expect(command(s, { type: 'job', job: 'woodcutters', delta: 1 }).ok).toBe(false); s.infection = Array.from({ length: 17 }, (_, i) => ({ id: 500 + i, age: 1 })); step(s); expect(Object.values(s.jobs).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1); });
  it('upgrades increase capacity and repairs cannot be spammed in battle', () => { const s = newGame(), farm = s.buildings.find(b => b.kind === 'farm')!; expect(command(s, { type: 'upgrade', id: farm.id }).ok).toBe(true); expect(farm.level).toBe(2); expect(farm.maxHp).toBe(BUILDINGS.farm.hp * 1.5); farm.hp = 50; makeUnit(s, 'hollow', farm.x + 1, farm.y); expect(command(s, { type: 'repair', id: farm.id }).ok).toBe(false); flush(s); expect(command(s, { type: 'repair', id: farm.id }).ok).toBe(true); expect(farm.hp).toBe(farm.maxHp); });
  it('gates admit allies and force infected to breach or detour', () => {
    const s = newGame(); s.buildings = []; for (let x = 0; x < MAP_W; x++) makeBuilding(s, x === 14 ? 'gate' : 'wall', x, 18, true);
    const path = findPath(s, { x: 14, y: 19 }, { x: 14, y: 17 }); expect(path.some(p => p.x === 14 && p.y === 18)).toBe(true);
    const enemyPath = findPath(s, { x: 14, y: 19 }, { x: 14, y: 17 }, true); expect(enemyPath).toHaveLength(2);
    s.buildings.find(b => b.kind === 'gate')!.kind = 'wall'; expect(findPath(s, { x: 14, y: 19 }, { x: 14, y: 17 })).toHaveLength(0);
  });
  it('routes across the river using a crossing', () => { const s = newGame(); const path = findPath(s, { x: 12, y: 22 }, { x: 12, y: 19 }, true); expect(path.some(p => p.y === 20 && (p.x === 14 || p.x === 15))).toBe(true); });
  it('nearby wardens actually gain shield-line armor', () => {
    const damage = (pair: boolean) => { const s = newGame(); s.units = []; s.buildings = s.buildings.filter(b => b.kind === 'hearth'); const w = makeUnit(s, 'warden', 10, 10); if (pair) makeUnit(s, 'warden', 10, 11); makeUnit(s, 'hollow', 11, 10); step(s); return w.maxHp - w.hp; };
    expect(damage(false)).toBe(4); expect(damage(true)).toBe(1);
  });
  it('rally orders put rangers behind the shield line regardless of recruitment order', () => {
    const s = newGame(); s.units = [];
    makeUnit(s, 'ranger', 15, 5); makeUnit(s, 'warden', 16, 5); makeUnit(s, 'ranger', 17, 5); makeUnit(s, 'warden', 18, 5);
    expect(command(s, { type: 'rally', x: 15, y: 7 }).ok).toBe(true);
    const front = s.units.filter(u => u.kind === 'warden').map(u => u.target.y);
    expect(s.units.filter(u => u.kind === 'ranger').every(u => u.target.y < Math.min(...front))).toBe(true);
    expect(new Set(s.units.map(u => `${u.target.x},${u.target.y}`)).size).toBe(s.units.length);
  });
  it('high ground and loose order extend ranger reach, and high ground increases damage', () => {
    const shoot = (y: number, loose: boolean) => { const s = newGame(); s.units = []; s.buildings = s.buildings.filter(b => b.kind === 'hearth'); s.formation = loose ? 'loose' : 'line'; makeUnit(s, 'ranger', 15, y); const target = makeUnit(s, 'hollow', 20, y); step(s); return target.maxHp - target.hp; };
    expect(shoot(13, false)).toBe(0); expect(shoot(13, true)).toBe(12); expect(shoot(3, false)).toBe(15);
  });
  it('waves damage defenses and create contamination; killing enemies rewards herbs', () => {
    const s = newGame(); s.units = []; s.residents=[];s.population=0;s.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};makeUnit(s, 'brute', 14, 17); const hearth = s.buildings.find(b => b.kind === 'hearth')!; advance(s, 30); expect(hearth.hp).toBeLessThan(hearth.maxHp); expect(Math.max(...s.contamination)).toBeGreaterThan(0);
    const t = makeUnit(s, 'hollow', 17, 16); t.hp = 1; const herbs = s.resources.herbs; advance(s, 2); expect(s.stats.slain).toBeGreaterThan(0); expect(s.resources.herbs).toBeGreaterThan(herbs);
  });
  it('household infection turns, while treatment restores productive population', () => {
    const s = newGame(); s.infection.push({ id: s.nextId++, age: 74.9 }); const pop = s.population; step(s); step(s); expect(s.population).toBe(pop - 1); expect(enemies(s)).toHaveLength(0); expect(s.corpses?.filter(c=>c.tainted)).toHaveLength(1); advance(s,8);expect(enemies(s).some(u=>u.reanimatedFrom)).toBe(true);
    s.infection.push({ id: s.nextId++, age: 3 }, { id: s.nextId++, age: 5 }); const before = s.resources.herbs;
    expect(command(s, { type: 'treat' }).ok).toBe(true); expect(s.infection).toHaveLength(0); expect(s.resources.herbs).toBe(before - 5); expect(s.stats.cured).toBe(2);
  });
  it('quarantine slows progression and production; staffed refuge cures automatically', () => {
    const s = newGame(); s.infection.push({ id: s.nextId++, age: 0 }); const rate = rates(s).wood; command(s, { type: 'quarantine' }); advance(s, 10); expect(s.infection[0].age).toBeCloseTo(2.5); expect(rates(s).wood).toBeCloseTo(rate * 0.8);
    makeBuilding(s, 'infirmary', 18, 13, true); command(s, { type: 'job', job: 'healers', delta: 1 }); advance(s, 3); expect(s.infection).toHaveLength(0); expect(s.stats.cured).toBe(1);
  });
  it('requires peaceful daylight and connected territory claims, then applies risk/reward', () => {
    const s = newGame(); s.resources = { wood: 1000, stone: 1000, food: 1000, herbs: 100 }; command(s, { type: 'recruit', kind: 'warden' });
    expect(command(s, { type: 'claim', territory: 'greybank' }).ok).toBe(false); const timberRate = rates(s).wood;
    expect(command(s, { type: 'claim', territory: 'pinewatch' }).ok).toBe(true); expect(rates(s).wood).toBeCloseTo(timberRate * 1.35);
    s.phase = 'night'; expect(command(s, { type: 'claim', territory: 'greybank' }).ok).toBe(false); s.phase = 'day';
    expect(command(s, { type: 'claim', territory: 'greybank' }).ok).toBe(true); command(s, { type: 'claim', territory: 'fen' }); expect(s.owned).toHaveLength(4); expect(s.infection).toHaveLength(0);expect(s.residents?.every(r=>!r.sick)).toBe(true);
  });
  it('loses when the Hearth falls and does not continue the simulation', () => { const s = newGame(); s.buildings.find(b => b.kind === 'hearth')!.hp = 0; step(s); expect(s.outcome).toBe('lost'); const time = s.time; step(s); expect(s.time).toBe(time); });
  it('victory requires all four banners, five nights, and no surviving attackers', () => { const s = newGame(); s.owned = ['hearthmere', 'pinewatch', 'greybank', 'fen']; s.stats.nights = 5; const u = makeUnit(s, 'hollow', 1, 1); step(s); expect(s.outcome).toBe('playing'); u.hp = 0; step(s); expect(s.outcome).toBe('won'); expect(s.speed).toBe(0); });
});
describe('bounded persistence and recovery', () => {
  it('round-trips and recovers an older valid backup after corrupted primary data', () => { const store = storage(), s = newGame(); save(store, s); advance(s, 4); save(store, s); store.setItem(SAVE_KEY, '{bad'); const loaded = load(store); expect(loaded.state?.time).toBe(0); expect(loaded.message).toContain('backup'); expect(store.getItem(BACKUP_KEY)).toBeTruthy(); });
  it('migrates the initial pre-release schema', () => { const old = { ...newGame(), version: 1, formation: undefined, lastSpeed: undefined }; const s = decode(JSON.stringify(old)); expect(s?.version).toBe(2); expect(s?.formation).toBe('line'); });
  it.each(['resources', 'buildings', 'units', 'jobs', 'infection', 'owned', 'stats', 'logs'])('rejects malformed %s without throwing', key => { const s: any = newGame(); s[key] = null; expect(decode(JSON.stringify(s))).toBeNull(); });
  it('rejects hostile IDs, unbounded paths, invalid coordinates, duplicate buildings and invalid numbers', () => {
    const s = newGame(); s.resources.wood = Infinity; expect(decode(JSON.stringify(s))).toBeNull();
    const a = newGame(); a.units[0].path = Array(MAP_W * MAP_H + 1).fill({ x: 0, y: 0 }); expect(decode(JSON.stringify(a))).toBeNull();
    const b = newGame(); b.buildings.push({ ...b.buildings[0], id: b.nextId++ }); expect(decode(JSON.stringify(b))).toBeNull();
    const c = newGame(); c.units[0].x = -100; expect(decode(JSON.stringify(c))).toBeNull();
    const d: any = newGame(); d.buildings[0].kind = '__proto__'; expect(decode(JSON.stringify(d))).toBeNull();
    const e: any = newGame(); e.owned.push('constructor'); expect(decode(JSON.stringify(e))).toBeNull();
  });
  it('reports quota/security failures and preserves the previous good save', () => { const s = newGame(); const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} }; expect(save(broken, s).ok).toBe(false); const store = storage(); save(store, s); s.resources.wood = -1; expect(save(store, s).ok).toBe(false); expect(load(store).state?.resources.wood).toBe(145); });
});
describe('campaign and simulation budget', () => {
  it('keeps the simulation bounded with 100 units and 150 buildings', () => {
    const s = newGame(); s.buildings = []; s.units = [];
    makeBuilding(s, 'hearth', 14, 11, true);
    for (let y = 2; y < 18 && s.buildings.length < 150; y++) for (let x = 2; x < 23 && s.buildings.length < 150; x++) if (!(x === 14 && y === 11)) makeBuilding(s, 'wall', x, y, true);
    for (let i = 0; i < 100; i++) makeUnit(s, i < 24 ? i % 2 ? 'ranger' : 'warden' : 'hollow', 10 + i % 9, 19 + Math.floor(i / 25));
    const start = performance.now(); advance(s, 10); const ms = performance.now() - start;
    console.log('STRESS METRICS', JSON.stringify({ steps: 100, elapsedMs: Number(ms.toFixed(1)), msPerStep: Number((ms / 100).toFixed(2)), buildings: s.buildings.length, units: s.units.length }));
    expect(s.units.length).toBeLessThanOrEqual(100); expect(s.buildings.length).toBeLessThanOrEqual(150); expect(s.effects.length).toBeLessThanOrEqual(100); expect(s.contamination).toHaveLength(780);
    expect(ms).toBeLessThan(8000);
  });
  it('completes a five-night campaign using only legal gameplay commands', () => {
    const s = newGame();
    const buildings: [any, number, number][] = [['quarry', 18, 13], ['infirmary', 18, 15], ['tower', 10, 13], ['tower', 13, 8], ['tower', 19, 13], ['tower', 12, 17], ['farm', 12, 9], ['cottage', 16, 8]];
    let buildIndex = 0;
    for (let tick = 0; tick < 6500 && s.outcome === 'playing'; tick++) {
      if (tick % 10 === 0) {
        if (buildIndex < buildings.length) { const [kind, x, y] = buildings[buildIndex]; if (command(s, { type: 'build', kind, x, y }).ok) buildIndex++; }
        if (s.jobs.miners < 3) command(s, { type: 'job', job: 'miners', delta: 1 });
        if (s.jobs.healers < 1) command(s, { type: 'job', job: 'healers', delta: 1 });
        if (s.jobs.farmers < (s.population > 20 ? 6 : 4)) command(s, { type: 'job', job: 'farmers', delta: 1 });
        if (s.infection.length) command(s, { type: 'treat' });
        if (army(s).length < 7) command(s, { type: 'recruit', kind: army(s).length % 3 === 0 ? 'ranger' : 'warden' });
        if (s.time > 120) for (const territory of ['pinewatch', 'greybank', 'fen'] as const) command(s, { type: 'claim', territory });
        if (s.owned.length === 4 && s.resources.wood > 80 && s.resources.stone > 65) for (const b of s.buildings.filter(b => b.kind === 'tower' || b.kind === 'hearth')) if (b.level < 3) command(s, { type: 'upgrade', id: b.id });
        for (const b of s.buildings) if (b.hp < b.maxHp * 0.7) command(s, { type: 'repair', id: b.id });
      }
      step(s, STEP);
    }
    console.log('Campaign result', JSON.stringify({ outcome: s.outcome, time: s.time.toFixed(1), stats: s.stats, villagers: s.population, soldiers: army(s).length, owned: s.owned, resources: s.resources, hearth: s.buildings.find(b => b.kind === 'hearth')?.hp }));
    expect(s.outcome).toBe('won'); expect(s.owned).toHaveLength(4); expect(s.stats.nights).toBe(5); expect(decode(JSON.stringify(s))).not.toBeNull();
  });
});
