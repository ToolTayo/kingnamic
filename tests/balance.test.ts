import { afterAll, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('docs/evidence', { recursive: true });
import { command } from '../src/game/commands';
import { BUILDINGS, STEP } from '../src/game/config';
import { decode } from '../src/game/persistence';
import { step } from '../src/game/simulation';
import { army, newGame } from '../src/game/state';
import type { BuildingKind } from '../src/game/types';

// Diagnostic policy sweep, not a substitute for human difficulty testing.
// Commands obey normal costs, capacity, prerequisites and combat restrictions.
const results: object[] = [];
it('makes a new watchtower a deliberate timber investment', () => {
  expect(BUILDINGS.tower.cost).toEqual({ wood: 70, stone: 30 });
  const s = newGame(), site = { x: 10, y: 13 };
  s.resources.wood = BUILDINGS.tower.cost.wood! - 1;
  s.resources.stone = 100;
  expect(command(s, { type: 'build', kind: 'tower', ...site }).ok).toBe(false);
  expect(s.buildings.some(b => b.kind === 'tower' && b.x === site.x && b.y === site.y)).toBe(false);

  s.resources.wood++;
  expect(command(s, { type: 'build', kind: 'tower', ...site }).ok).toBe(true);
  expect(s.resources.wood).toBe(0);
  expect(s.resources.stone).toBe(70);
  expect(s.buildings.find(b => b.kind === 'tower' && b.x === site.x && b.y === site.y)?.progress).toBe(0);
  expect(BUILDINGS.tower.time).toBe(20);
});
for (const seed of [74019, 1701, 9042]) for (const policy of ['mixed-3s', 'mixed-10s', 'rangers-3s', 'no-medicine-3s']) {
  it(`records a valid campaign under ${policy}, seed ${seed}`, () => {
    const s = newGame(seed), interval = policy === 'mixed-10s' ? 100 : 30;
    const queue: [BuildingKind, number, number][] = [['quarry', 18, 13], ['infirmary', 18, 15], ['tower', 10, 13], ['tower', 13, 8], ['tower', 19, 13], ['tower', 12, 17], ['farm', 12, 9], ['cottage', 16, 8]];
    let next = 0, minFood = s.resources.food, peakSick = 0, minHearth = 1;
    const started = performance.now();
    for (let tick = 0; tick < 7000 && s.outcome === 'playing'; tick++) {
      if (tick % interval === 0) {
        if (next < queue.length) { const [kind, x, y] = queue[next]; if (command(s, { type: 'build', kind, x, y }).ok) next++; }
        if (s.jobs.miners < 3) command(s, { type: 'job', job: 'miners', delta: 1 });
        if (s.jobs.farmers < (s.population > 20 ? 6 : 4)) command(s, { type: 'job', job: 'farmers', delta: 1 });
        if (policy !== 'no-medicine-3s') {
          if (s.jobs.healers < 1) command(s, { type: 'job', job: 'healers', delta: 1 });
          if (s.infection.length) command(s, { type: 'treat' });
        }
        if (army(s).length < 7) command(s, { type: 'recruit', kind: policy === 'rangers-3s' || army(s).length % 3 === 0 ? 'ranger' : 'warden' });
        if (s.time > 120) for (const territory of ['pinewatch', 'greybank', 'fen'] as const) command(s, { type: 'claim', territory });
        for (const b of s.buildings) {
          if (s.owned.length === 4 && s.resources.wood > 80 && s.resources.stone > 65 && ['tower', 'hearth'].includes(b.kind) && b.level < 3) command(s, { type: 'upgrade', id: b.id });
          if (b.hp < b.maxHp * .7) command(s, { type: 'repair', id: b.id });
        }
      }
      step(s, STEP); minFood = Math.min(minFood, s.resources.food); peakSick = Math.max(peakSick, s.infection.length);
      const hearth = s.buildings.find(b => b.kind === 'hearth'); minHearth = Math.min(minHearth, hearth ? hearth.hp / hearth.maxHp : 0);
    }
    results.push({ seed, policy, outcome: s.outcome, simulationSeconds: Number(s.time.toFixed(1)), elapsedMs: Math.round(performance.now() - started), slain: s.stats.slain, lost: s.stats.lost, cured: s.stats.cured, peakSick, minFood: Math.round(minFood), minHearthPercent: Math.round(minHearth * 100), population: s.population, soldiers: army(s).length, territories: s.owned.length });
    expect(decode(JSON.stringify(s))).not.toBeNull();
    expect(Object.values(s.resources).every(v => Number.isFinite(v) && v >= 0)).toBe(true);
    expect(s.units.length).toBeLessThanOrEqual(100);
  });
}
afterAll(() => { writeFileSync('docs/evidence/experience-balance.json', JSON.stringify(results, null, 2)); });
