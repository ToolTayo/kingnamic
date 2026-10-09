import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('docs/evidence', { recursive: true });
import { command } from '../src/game/commands';
import { combatStep } from '../src/game/combat';
import { ambushFronts, ambushRoster } from '../src/game/encounters';
import { battalion, expeditionParty, missionRoute, ROUTE } from '../src/game/expedition';
import { distance, key, tileAt } from '../src/game/map';
import { decode } from '../src/game/persistence';
import { advance, step } from '../src/game/simulation';
import { army, enemies, makeUnit, newGame } from '../src/game/state';
import type { ExpeditionApproach, State } from '../src/game/types';

const prepare = (seed = 74019) => { const s = newGame(seed); s.resources.stone=200; command(s, { type: 'recruit', kind: 'warden' }); command(s, { type: 'recruit', kind: 'ranger' }); return s; };
function play(s: State, seconds = 240, shareDelay = 0) {
  let discoveredAt = 0;
  for (let n = 0; n < seconds * 10 && s.expedition; n++) {
    const e = s.expedition;
    if (e.discovered && !discoveredAt) discoveredAt = e.world.time;
    if (n % 10 === 0) {
      if (e.discovered && !e.shared && e.world.time >= discoveredAt + shareDelay) command(s, { type: 'expedition-share' });
      const target = e.stage === 'search' || e.stage === 'hold' || !e.shared ? ROUTE.camp : e.stage === 'standard' ? missionRoute(e).standard : ROUTE.exit;
      if (!expeditionParty(e).some(u => u.order)) command(s, { type: 'rally', ...target });
      if (e.stage === 'return' || e.stage === 'retreat') command(s, { type: 'expedition-extract' });
    }
    if (!s.expedition) break;
    step(s);
  }
}

describe('tactical combat and encounter consequences', () => {
  it('uses high-ground and loose-order bow range, with weak point-blank ranger shots', () => {
    const s = newGame(); s.units = []; s.buildings = []; s.formation = 'loose';
    const archer = makeUnit(s, 'ranger', 19, 3), far = makeUnit(s, 'hollow', 25.1, 3);
    expect(tileAt(archer.x, archer.y)?.height).toBe(1); combatStep(s, .1); expect(far.hp).toBe(40);
    s.units = [archer]; archer.cooldown = 0; const close = makeUnit(s, 'hollow', 19.7, 3);
    combatStep(s, .1); expect(close.hp).toBeCloseTo(46); // (12 + 3) * .6
  });
  it('keeps the spear runner bonus on an explicit move order', () => {
    const s = newGame(); s.units = []; s.buildings = [];
    const spear = makeUnit(s, 'spearman', 10, 10), runner = makeUnit(s, 'runner', 11.7, 10);
    spear.order = 'move'; spear.target = { x: 10, y: 12 }; combatStep(s, .1); expect(runner.hp).toBe(16);
  });
  it('uses shield armor against heavy blows and exposes unshielded bowmen', () => {
    const s = newGame(); s.units = []; s.buildings = [];
    const guard = makeUnit(s, 'warden', 10, 10); makeUnit(s, 'warden', 10, 11.5); const brute = makeUnit(s, 'brute', 11, 10);
    combatStep(s, .1); expect(guard.hp).toBe(130); expect(s.effects.some(e => e.source === brute.id && e.armored)).toBe(true);
  });
  it('makes runners probe an exposed bowman but respects infantry already in melee reach', () => {
    const s = newGame(); s.units = []; s.buildings = []; s.theatre = 'expedition'; s.residents=[];s.population=0;
    const runner = makeUnit(s, 'runner', 10, 10); makeUnit(s, 'warden', 12.8, 10); const archer = makeUnit(s, 'ranger', 10, 13);
    combatStep(s, .1); expect(runner.path.at(-1)).toEqual({ x: archer.x, y: archer.y });
    s.units = [runner]; runner.x = 10; runner.y = 10; runner.path = []; runner.repath = 0; runner.cooldown = 0;
    const screen = makeUnit(s, 'warden', 11, 10); s.units.push(archer); combatStep(s, .1); expect(screen.hp).toBeLessThan(screen.maxHp);
  });
  it('orients formation fronts toward a northern threat, keeping archers behind infantry', () => {
    const s = newGame(); s.units = []; s.buildings = [];
    const guard = makeUnit(s, 'warden', 14, 12), bow = makeUnit(s, 'ranger', 14, 13); makeUnit(s, 'hollow', 14, 3);
    command(s, { type: 'rally', x: 14, y: 8 }); expect(guard.target.y).toBeLessThan(bow.target.y);
    expect(new Set(army(s).map(u => key(u.target))).size).toBe(2);
  });
  it('reserves equipment once and refunds all unused equipment after a pre-discovery retreat', () => {
    const s = prepare(), food = s.resources.food, wood = s.resources.wood, crowns = s.resources.stone;
    command(s, { type: 'expedition-launch' }); expect(s.resources.food).toBe(food - 30); expect(s.resources.wood).toBe(wood); expect(s.resources.stone).toBe(crowns-80);
    command(s, { type: 'expedition-retreat' }); command(s, { type: 'expedition-extract' });
    expect(s.resources.food).toBe(food - 30); expect(s.resources.wood).toBe(wood); expect(s.resources.stone).toBe(crowns);
    const snapshot = JSON.stringify(s); command(s, { type: 'expedition-extract' }); expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('preserves a legacy active mission route and original recruitment terms', () => {
    const s = prepare(); command(s, { type: 'expedition-launch' }); const e = s.expedition!;
    delete e.approach; delete e.variant; delete e.equipment; delete e.equipmentCurrency; delete e.pending; s.resources.stone += 80;
    const loaded = decode(JSON.stringify(s))!; expect(loaded).not.toBeNull(); expect(missionRoute(loaded.expedition!).standard).toEqual(ROUTE.standard);
    const wood = loaded.resources.wood; play(loaded); expect(loaded.lostBattalions?.report?.outcome).toBe('success'); expect(loaded.resources.wood).toBe(wood);
  });
  it('preserves stranded wounds after retreat and cancels future reinforcements without deleting active enemies', () => {
    const s = prepare(); command(s, { type: 'expedition-launch' }); command(s, { type: 'rally', ...ROUTE.camp }); advance(s, 6);
    const e = s.expedition!; const ally = battalion(e).find(u => u.kind === 'scout')!; ally.hp = 21;
    const count = enemies(e.world).length; e.pending = [{ kind: 'brute', point: { x: 18, y: 15 }, delay: 4 }]; e.warning = 2;
    command(s, { type: 'expedition-retreat' }); expect(e.pending).toHaveLength(0); expect(e.warning).toBe(0); expect(enemies(e.world)).toHaveLength(count);
    play(s); expect(s.lostBattalions?.wounds?.scout).toBeLessThanOrEqual(21);
    const hp = s.lostBattalions!.wounds!.scout; advance(s, 46); command(s, { type: 'expedition-launch' }); command(s, { type: 'rally', ...ROUTE.camp }); advance(s, 6);
    expect(battalion(s.expedition!).find(u => u.kind === 'scout')?.hp).toBe(hp);
  });
  it('stores a scheduled ambush across reload and cannot count an unfinished arrival as victory', () => {
    const s = prepare(); command(s, { type: 'expedition-launch', approach: 'ford' }); command(s, { type: 'rally', ...ROUTE.camp }); advance(s, 10);
    expect(s.expedition!.pending!.length).toBeGreaterThan(0); const clone = decode(JSON.stringify(s))!; expect(clone.expedition?.pending).toEqual(s.expedition!.pending);
    s.expedition!.world.effects = []; advance(s, 4); advance(clone, 4); expect(clone).toEqual(s);
    const e = s.expedition!; e.world.units = e.world.units.filter(u => u.origin); e.stage = 'hold'; e.held = false; e.warning = 0; e.pending = [{ kind: 'hollow', point: { x: 18, y: 15 }, delay: 3 }];
    for (const u of expeditionParty(e)) { u.x = 14; u.y = 12; } step(s); expect(e.held).toBe(false);
    e.pending[0].delay = 99; expect(decode(JSON.stringify(s))).toBeNull();
  });
  it('pauses capture while enemies contest the standard without erasing earned hold time', () => {
    const s = prepare(); command(s, { type: 'expedition-launch' }); const e = s.expedition!, p = missionRoute(e).standard;
    e.discovered = true; e.shared = true; e.held = true; e.supplies = 4; e.medicine = 1; e.stage = 'standard'; e.wave = 2; e.holdTime = 5; e.world.units = expeditionParty(e);
    for (const u of e.world.units) { u.x = p.x; u.y = p.y; u.cooldown = 10; } const ally = makeUnit(e.world, 'ranger', p.x, p.y + 1); ally.origin = 'battalion';
    makeUnit(e.world, 'brute', p.x + 1, p.y); step(s); expect(e.holdTime).toBe(5);
    e.world.units = e.world.units.filter(u => u.origin); step(s); expect(e.holdTime).toBeCloseTo(5.1);
  });
  it('never awards trusted allies if the entire patrol dies before extraction, and refunds their equipment', () => {
    const s = prepare(); command(s, { type: 'expedition-launch' }); const e = s.expedition!;
    e.discovered = true; e.held = true; e.shared = true; e.standard = true; e.stage = 'return'; e.wave = 2; e.holdTime = 12; e.supplies = 4; e.medicine = 1;
    e.world.units = expeditionParty(e); for (const kind of e.initialAllies) { const u = makeUnit(e.world, kind, ROUTE.exit.x, ROUTE.exit.y); u.origin = 'battalion'; }
    for (const u of expeditionParty(e)) u.hp = 0;
    const food = s.resources.food, wood = s.resources.wood, crowns=s.resources.stone; step(s);
    expect(s.expedition).toBeUndefined(); expect(s.lostBattalions?.report).toMatchObject({outcome:'defeat',returned:0,recruited:0,lost:3,stranded:4});
    expect(army(s)).toHaveLength(2); expect(s.resources.food).toBe(food); expect(s.resources.wood).toBe(wood); expect(s.resources.stone).toBe(crowns+80);
    expect(decode(JSON.stringify(s))).not.toBeNull();
  });
});

const balance: object[] = [];
for (const approach of ['ridge', 'ford'] as ExpeditionApproach[]) for (const seed of [74019, 74020, 74021]) for (const policy of ['mixed', 'all-bows', 'late-relief']) {
  it(`records actual mission combat: ${approach}, ${seed}, ${policy}`, () => {
    const s = policy === 'all-bows' ? newGame(seed) : prepare(seed);
    if (policy === 'all-bows') { s.resources.stone=200; command(s, { type: 'recruit', kind: 'ranger' }); command(s, { type: 'recruit', kind: 'ranger' }); }
    const ids = policy === 'all-bows' ? army(s).filter(u => u.kind === 'ranger').map(u => u.id) : undefined;
    expect(command(s, { type: 'expedition-launch', ids, approach }).ok).toBe(true);
    const e = s.expedition!; e.wave = 2; const roster = ambushRoster(e); expect(roster).toHaveLength(12); e.wave = 0;
    const fronts = ambushFronts(e); expect(fronts.every(p => tileAt(p.x, p.y)?.terrain !== 'water')).toBe(true);
    const crowns = s.resources.stone, started = performance.now(); play(s, 240, policy === 'late-relief' ? 14 : 0);
    balance.push({ approach, seed, policy, report: s.lostBattalions?.report, unresolved: s.expedition?.stage, missionSeconds: Number(e.world.time.toFixed(1)), elapsedMs: Number((performance.now() - started).toFixed(1)), equipmentCrownsRefunded: s.resources.stone - crowns, woundedOnReturn: army(s).filter(u => u.injury).map(u => ({ kind: u.kind, hp: Math.round(u.hp), injury: u.injury })), roster });
    expect(s.expedition).toBeUndefined(); expect(decode(JSON.stringify(s))).not.toBeNull();
    if (policy === 'mixed') expect(s.lostBattalions?.report?.outcome).toBe('success');
    expect(s.lostBattalions!.recruited).toBeLessThanOrEqual(4);
  });
}
afterAll(() => writeFileSync('docs/evidence/tactics-balance.json', JSON.stringify(balance, null, 2)));
