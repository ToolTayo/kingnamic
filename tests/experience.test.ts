import { describe, expect, it } from 'vitest';
import { CivilianSystem } from '../src/game/civilians';
import { combatStep, waveSize, spawnWave } from '../src/game/combat';
import { separateCrowd } from '../src/game/crowd';
import { economyStep } from '../src/game/economy';
import { command } from '../src/game/commands';
import { distance, tileAt } from '../src/game/map';
import { decode } from '../src/game/persistence';
import { newGame, makeBuilding, makeUnit } from '../src/game/state';
import { builderAssignments, constructionCrew } from '../src/game/workforce';
import { obscuresActor } from '../src/render/visibility';

describe('crowds, passage and finishing orders', () => {
  it('finishes a movement order within the destination tile after a replan', () => {
    const s = newGame(); s.units = []; const u = makeUnit(s, 'warden', 14.35, 17);
    u.target = { x: 14, y: 17 }; u.order = 'move';
    for (let i = 0; i < 20; i++) combatStep(s, .1);
    expect(u.order).toBeUndefined(); expect(distance(u, u.target)).toBeLessThan(.2);
  });
  it('separates a stacked group deterministically without pushing them into walls or water', () => {
    const a = newGame(), b = newGame(); a.units = []; b.units = [];
    for (const s of [a, b]) for (let i = 0; i < 7; i++) makeUnit(s, 'warden', 14, 18);
    for (let n = 0; n < 100; n++) { separateCrowd(a, a.units, .1); separateCrowd(b, b.units, .1); }
    expect(a.units).toEqual(b.units);
    for (let i = 0; i < a.units.length; i++) {
      const u = a.units[i]; expect(tileAt(Math.round(u.x), Math.round(u.y))?.terrain).not.toBe('water');
      expect(a.buildings.some(v => v.kind !== 'gate' && v.x === Math.round(u.x) && v.y === Math.round(u.y))).toBe(false);
      for (let j = i + 1; j < a.units.length; j++) expect(distance(u, a.units[j])).toBeGreaterThan(.35);
    }
  });
  it('moves seven soldiers through the gate and crossing without leaving orders stuck', () => {
    const s = newGame(); s.units = [];
    for (let i = 0; i < 7; i++) makeUnit(s, i < 4 ? 'warden' : 'ranger', 12 + i % 4, 16 - Math.floor(i / 4));
    command(s, { type: 'rally', x: 14, y: 22 });
    for (let n = 0; n < 700; n++) combatStep(s, .1);
    expect(s.units.every(u => !u.order)).toBe(true);
    for (let i = 0; i < s.units.length; i++) for (let j = i + 1; j < s.units.length; j++) expect(distance(s.units[i], s.units[j])).toBeGreaterThan(.35);
  });
  it('gives a full village different doorstep spaces and keeps stationary crowds apart', () => {
    const s = newGame(); s.phase = 'night'; const system = new CivilianSystem(); system.update(s);
    for (let n = 0; n < 250; n++) { s.time += .1; system.update(s); }
    let close = 0;
    for (let i = 0; i < system.people.length; i++) for (let j = i + 1; j < system.people.length; j++) if (distance(system.people[i], system.people[j]) < .3) close++;
    expect(close).toBe(0); expect(system.people.filter(c => c.path.length)).toHaveLength(0);
  });
});

describe('individual building work and feedback', () => {
  it('assigns each builder once, splits finite effort, and moves freed workers to unfinished projects', () => {
    const s = newGame(), a = makeBuilding(s, 'quarry', 18, 13), b = makeBuilding(s, 'quarry', 19, 15);
    expect(builderAssignments(s).map(v => v.id)).toEqual([a.id, b.id]);
    economyStep(s, 1);
    expect(a.progress).toBeCloseTo(.75 / 12); expect(b.progress).toBeCloseTo(.75 / 12);
    a.progress = 1;
    expect(constructionCrew(s, b.id)).toBe(2); const before = b.progress; economyStep(s, 1);
    expect(b.progress - before).toBeCloseTo(1.25 / 12);
    expect(decode(JSON.stringify(s))?.buildings).toEqual(s.buildings);
  });
  it('caps assigned effort at the real six builders, including a large queue and after save/resume', () => {
    const s = newGame(); s.jobs.builders = 6; s.jobs.farmers = 0;
    for (let x = 9; x < 19; x++) makeBuilding(s, 'wall', x, 7);
    expect(builderAssignments(s)).toHaveLength(6);
    expect(builderAssignments(decode(JSON.stringify(s))!).map(b => b.id)).toEqual(builderAssignments(s).map(b => b.id));
    const before = s.buildings.reduce((v, b) => v + (b.progress < 1 ? b.progress * 3 : 0), 0); economyStep(s, .1);
    const after = s.buildings.filter(b => b.y === 7).reduce((v, b) => v + b.progress * 3, 0);
    expect(after - before).toBeCloseTo((6 * .5 + 10 * .25) * .1);
  });
  it('shows the exact predicted wave budget without changing enemy balance', () => {
    const s = newGame(); s.day = 3; s.owned.push('pinewatch', 'greybank'); const predicted = waveSize(s);
    spawnWave(s); expect(s.waveRemaining).toBe(predicted); expect(predicted).toBe(21);
  });
  it('emits one bounded death effect and counts a defeated unit exactly once', () => {
    const s = newGame(); s.units = []; const u = makeUnit(s, 'hollow', 10, 10); u.hp = 0;
    combatStep(s, .1); combatStep(s, .1);
    expect(s.stats.slain).toBe(1); expect(s.effects.filter(e => e.kind === 'death')).toHaveLength(1);
    expect(s.effects[0].unit).toBe('hollow'); expect(decode(JSON.stringify(s))?.effects).toEqual([]);
  });
  it('fades only scenery whose foreground overlaps an actor, independent of zoom', () => {
    expect(obscuresActor({ x: 100, y: 100 }, 20, 60, [{ x: 100, y: 70 }])).toBe(true);
    expect(obscuresActor({ x: 100, y: 100 }, 20, 60, [{ x: 100, y: 130 }])).toBe(false);
    expect(obscuresActor({ x: 100, y: 100 }, 20, 60, [{ x: 130, y: 70 }])).toBe(false);
  });
});
