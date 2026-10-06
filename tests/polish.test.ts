import { addResidents } from '../src/game/population';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CivilianSystem } from '../src/game/civilians';
import { command } from '../src/game/commands';
import { combatStep } from '../src/game/combat';
import { distance, tileAt } from '../src/game/map';
import { clearMelee } from '../src/game/navigation';
import { decode } from '../src/game/persistence';
import { makeBuilding, makeUnit, newGame } from '../src/game/state';

describe('individual civilian routines', () => {
  it('keeps resident identities stable while persisting individual work assignments', () => {
    const s = newGame(), system = new CivilianSystem(); system.update(s);
    for (let n = 0; n < 100; n++) { s.time += .1; system.update(s); }
    const before = structuredClone(s), positions = system.people.map(c => ({ id: c.id, x: c.x, y: c.y }));
    s.jobs.farmers--; s.jobs.builders++;
    system.update(s);
    expect(system.people.map(c => ({ id: c.id, x: c.x, y: c.y }))).toEqual(positions);
    expect(system.people.filter(c => c.job === 'builders')).toHaveLength(3);
    expect(s.resources).toEqual(before.resources); expect(s.units).toEqual(before.units); expect(s.residents).toBe(system.people); expect(decode(JSON.stringify(s))?.residents).toEqual(s.residents);
  });
  it('walks individual routes without entering occupied tiles or water and freezes with simulation time', () => {
    const s = newGame(), system = new CivilianSystem(); system.update(s);
    let walking = 0, deliveries = 0;
    for (let n = 0; n < 450; n++) {
      s.time += .1; system.update(s);
      for (const c of system.people) {
        expect(tileAt(Math.round(c.x), Math.round(c.y))?.terrain).not.toBe('water');
        expect(s.buildings.some(b => b.kind !== 'gate' && b.x === Math.round(c.x) && b.y === Math.round(c.y))).toBe(false);
        if (c.path.length) walking++;
        if (c.carrying) deliveries++;
      }
    }
    expect(walking).toBeGreaterThan(100); expect(deliveries).toBeGreaterThan(100);
    const frozen = JSON.stringify(system.people); for (let n = 0; n < 20; n++) system.update(s);
    expect(JSON.stringify(system.people)).toBe(frozen);
  });
  it('walks through the southern gate and river crossing to shelter without teleporting at dusk', () => {
    const s = newGame(); s.population = 1; s.residents=s.residents!.slice(0,1); s.jobs = { farmers: 1, miners: 0, healers: 0, woodcutters: 0, builders: 0 };
    const system = new CivilianSystem(); system.update(s); const c = system.people[0];
    c.x = 14; c.y = 23; c.path = []; s.phase = 'night';
    s.time += .1; system.update(s);
    expect(distance(c, { x: 14, y: 23 })).toBeLessThan(.16);
    expect(c.path.some(p => p.x === 14 && p.y === 18)).toBe(true);
    expect(c.path.some(p => p.y === 20 && (p.x === 14 || p.x === 15))).toBe(true);
    for (let n = 0; n < 350; n++) { const p = { x: c.x, y: c.y }; s.time += .1; system.update(s); expect(distance(c, p)).toBeLessThan(.16); }
    expect(c.activity).toBe('shelter'); expect(distance(c, c.goal)).toBeLessThan(.3);
  });
  it('sends builders to construction and sick residents to the staffed refuge on foot', () => {
    const s = newGame(); makeBuilding(s, 'quarry', 18, 13); makeBuilding(s, 'infirmary', 18, 15, true);
    const system = new CivilianSystem(); system.update(s); s.time += .1; system.update(s);
    expect(system.people.filter(c => c.job === 'builders').every(c => Math.round(distance(c.goal, { x: 18, y: 13 })) === 1)).toBe(true);
    s.infection.push({ id: s.nextId++, age: 0 }); const old = system.people.map(c => ({ id: c.id, x: c.x, y: c.y }));
    system.update(s); const sick = system.people.find(c => c.sick)!;
    expect(sick.activity).toBe('recover'); expect(distance(sick.goal, { x: 18, y: 15 })).toBeLessThan(2.1);
    expect({ id: sick.id, x: sick.x, y: sick.y }).toEqual(old.find(c => c.id === sick.id));
  });
  it('reroutes when construction blocks a route and bounds rendered actors while preserving all individual residents', () => {
    const s = newGame(), system = new CivilianSystem(); system.update(s);
    for (let n = 0; n < 20; n++) { s.time += .1; system.update(s); }
    const c = system.people.find(c => c.path.length > 2)!;
    const blocked = c.path[1]; makeBuilding(s, 'wall', blocked.x, blocked.y, true);
    s.time += .1; system.update(s);
    expect(c.path.some(p => p.x === blocked.x && p.y === blocked.y)).toBe(false);
    addResidents(s,1000); system.observe(s); expect(system.people).toHaveLength(64);expect(s.residents).toHaveLength(1000);
  });
});
describe('battle orders and legacy save compatibility', () => {
  it('reads an actual pre-polish v2 fixture without losing any progress or adding required fields', () => {
    const raw = readFileSync(new URL('./fixtures/milestone-v2.json', import.meta.url), 'utf8');
    const migrated=decode(raw)!;const legacy=JSON.parse(raw);expect({...migrated,residents:undefined,nextId:legacy.nextId}).toEqual({...legacy,economyRevision:1,residents:undefined});
    const s = decode(raw)!; command(s, { type: 'rally', x: 16, y: 16 });
    expect(decode(JSON.stringify(s))).toEqual(s);
    s.units[0].order = 'invalid' as 'move'; expect(decode(JSON.stringify(s))).toBeNull();
  });
  it('reserves distinct rally slots beside obstacles', () => {
    const s = newGame(); makeBuilding(s, 'wall', 13, 17, true); makeBuilding(s, 'wall', 15, 17, true);
    command(s, { type: 'rally', x: 14, y: 17 });
    expect(new Set(s.units.map(u => `${u.target.x},${u.target.y}`)).size).toBe(s.units.length);
  });
  it('honors retreat orders while enemies are within acquisition range', () => {
    const s = newGame(); s.units = []; s.buildings = s.buildings.filter(b => b.kind === 'hearth');
    const u = makeUnit(s, 'warden', 10, 14); makeUnit(s, 'hollow', 10, 16);
    command(s, { type: 'rally', x: 10, y: 10 }); const before = distance(u, u.target);
    for (let n = 0; n < 10; n++) combatStep(s, .1);
    expect(distance(u, u.target)).toBeLessThan(before - .5);
    expect(u.order).toBe('move');
  });
  it('keeps rangers on their assigned ground instead of chasing targets out of range', () => {
    const s = newGame(); s.units = []; s.buildings = s.buildings.filter(b => b.kind === 'hearth');
    const ranger = makeUnit(s, 'ranger', 10, 17); ranger.target = { x: 10, y: 17 };
    makeUnit(s, 'hollow', 15.5, 17); combatStep(s, .1);
    expect(ranger.x).toBe(10); expect(ranger.y).toBe(17);
  });
  it('brings distant guards back when the Hearth is breached, while an explicit retreat still wins', () => {
    const s = newGame(); s.units = []; s.buildings = s.buildings.filter(b => b.kind === 'hearth');
    const hearth = s.buildings[0], ranger = makeUnit(s, 'ranger', 14, 18), warden = makeUnit(s, 'warden', 15, 18);
    ranger.target = { x: 14, y: 18 }; warden.target = { x: 15, y: 18 };
    makeUnit(s, 'brute', 14, 10);
    const before = distance(ranger, hearth), beforeWarden = distance(warden, hearth);
    for (let n = 0; n < 20; n++) combatStep(s, .1);
    expect(distance(ranger, hearth)).toBeLessThan(before - 1); expect(distance(warden, hearth)).toBeLessThan(beforeWarden - 1);
    command(s, { type: 'rally', x: 18, y: 18 }); const retreat = distance(ranger, ranger.target);
    for (let n = 0; n < 10; n++) combatStep(s, .1);
    expect(distance(ranger, ranger.target)).toBeLessThan(retreat);
  });
  it('blocks melee through a palisade and permits strikes on open ground', () => {
    const s = newGame(); s.units = []; s.buildings = s.buildings.filter(b => b.kind === 'hearth');
    const wall = makeBuilding(s, 'wall', 10, 10, true), w = makeUnit(s, 'warden', 9.6, 10), foe = makeUnit(s, 'hollow', 10.4, 10);
    expect(clearMelee(s, w, foe)).toBe(false); combatStep(s, .1); expect(w.hp).toBe(w.maxHp); expect(foe.hp).toBe(foe.maxHp);
    s.buildings = s.buildings.filter(b => b.id !== wall.id);
    expect(clearMelee(s, w, foe)).toBe(true);
  });
});
