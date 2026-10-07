import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { command } from '../src/game/commands';
import { MAX_ARMY, UNITS } from '../src/game/config';
import { expose, infect } from '../src/game/disease';
import { rates } from '../src/game/economy';
import { addResidents, assignResidentJobs } from '../src/game/population';
import { decode } from '../src/game/persistence';
import { recruitmentBlocker, recruitmentPlan, selectRecruitResidents } from '../src/game/recruitment';
import { army, makeBuilding, makeUnit, newGame } from '../src/game/state';
import type { State } from '../src/game/types';

function prepared(extraResidents = 80): State {
  const s = newGame();
  const garrison = s.buildings.find(b => b.kind === 'barracks')!;
  garrison.level = 3;
  for (let i = 0; i < 3; i++) makeBuilding(s, 'barracks', i, 0, true).level = 3;
  addResidents(s, extraResidents);
  assignResidentJobs(s);
  s.resources.stone = 9_000;
  s.resources.food = 9_000;
  return s;
}

describe('fast recruitment', () => {
  it('uses idle people first, safely reassigns workers, and accounts for people and jobs', () => {
    const s = prepared(10);
    const idleIds = s.residents!.filter(r => r.job === 'idle').map(r => r.id);
    const selected = selectRecruitResidents(s, idleIds.length + 2);
    expect(idleIds.length).toBeGreaterThan(0);
    expect(selected.slice(0, idleIds.length).map(r => r.id)).toEqual(idleIds);
    expect(selected.slice(idleIds.length).every(r => r.job !== 'idle')).toBe(true);

    const census = s.population + army(s).length;
    const before = { population: s.population, army: army(s).length, crowns: s.resources.stone, foodRate: rates(s).food };
    const result = command(s, { type: 'recruit', kind: 'warden', count: selected.length });
    expect(result.ok).toBe(true);
    expect(s.population).toBe(before.population - selected.length);
    expect(army(s)).toHaveLength(before.army + selected.length);
    expect(s.resources.stone).toBe(before.crowns - UNITS.warden.cost.stone! * selected.length);
    expect(s.jobs.woodcutters).toBeGreaterThanOrEqual(1);
    expect(s.jobs.farmers).toBeGreaterThanOrEqual(1);
    expect(s.residents!.length + army(s).length).toBe(census);
    expect(new Set([...s.residents!.map(r => r.id), ...s.units.map(u => u.id)]).size).toBe(s.residents!.length + s.units.length);
    expect(rates(s).food).toBeGreaterThanOrEqual(before.foodRate);
  });

  it('supports 1, 5, 10, 50, 100, and Max batches through the 200-soldier cap', () => {
    const s = prepared(350);
    for (const count of [1, 5, 10, 50, 100]) expect(command(s, { type: 'recruit', kind: 'warden', count }).ok).toBe(true);
    expect(army(s)).toHaveLength(169);
    expect(recruitmentPlan(s, 'warden').max).toBe(31);
    expect(command(s, { type: 'recruit', kind: 'warden', count: recruitmentPlan(s, 'warden').max }).ok).toBe(true);
    expect(army(s)).toHaveLength(MAX_ARMY);
    for (const count of [500, 2_000]) {
      const before = JSON.stringify(s);
      expect(command(s, { type: 'recruit', kind: 'warden', count })).toMatchObject({ ok: false, message: expect.stringMatching(/capacity/i) });
      expect(JSON.stringify(s)).toBe(before);
    }
    for (const count of [0, -1, 1.5]) {
      const before = JSON.stringify(s);
      expect(command(s, { type: 'recruit', kind: 'warden', count }).ok).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it('keeps a food crew, woodcutter, miner, healer when needed, and active builder staffed', () => {
    const s = prepared(40);
    s.jobs.builders = 3;
    s.jobs.miners = 3;
    s.jobs.healers = 2;
    s.infection.push({ id: s.nextId++, age: 2, personId: s.residents![0].id, host: 'resident', source: 'bite', sourceId: 1 });
    const site = makeBuilding(s, 'tower', 18, 13);
    const infectedJob = s.residents!.find(r => r.id === s.infection[0].personId)!;
    infectedJob.job = 'idle';
    assignResidentJobs(s);
    const count = recruitmentPlan(s, 'warden').max;
    expect(count).toBeGreaterThan(0);
    expect(command(s, { type: 'recruit', kind: 'warden', count }).ok).toBe(true);
    expect(s.jobs.farmers).toBeGreaterThanOrEqual(1);
    expect(s.jobs.woodcutters).toBeGreaterThanOrEqual(1);
    expect(s.jobs.miners).toBeGreaterThanOrEqual(1);
    expect(s.jobs.healers).toBeGreaterThanOrEqual(1);
    expect(site.progress).toBeLessThan(1);
    expect(s.jobs.builders).toBeGreaterThanOrEqual(1);
    expect(Object.values(s.jobs).every(n => n >= 0)).toBe(true);
    expect(Object.values(s.jobs).reduce((total, n) => total + n, 0)).toBeLessThanOrEqual(s.population);
    expect(s.infection.some(i => i.personId === infectedJob.id)).toBe(true);
  });

  it('shows the actual affordability blocker and rejects unaffordable batches atomically', () => {
    const s = prepared(30);
    s.resources.stone = 39;
    expect(recruitmentPlan(s, 'warden').max).toBe(1);
    expect(recruitmentBlocker(s, 'warden', 5)).toBe('Need 61 Crowns more.');
    const before = JSON.stringify(s);
    expect(command(s, { type: 'recruit', kind: 'warden', count: 5 })).toMatchObject({ ok: false, message: 'Need 61 Crowns more.' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('keeps specialist unlocks and excludes infected or unfit residents until recovery', () => {
    const s = newGame(), garrison = s.buildings.find(b => b.kind === 'barracks')!;
    s.resources.stone = 9_000;
    addResidents(s, 20);
    expect(command(s, { type: 'recruit', kind: 'spearman' }).message).toContain('Upgrade a garrison');
    garrison.level = 2;

    const resident = s.residents![0];
    s.residents = [resident]; s.population = 1; s.jobs = { farmers: 0, woodcutters: 0, miners: 0, healers: 0, builders: 0 }; resident.job = 'idle';
    const zombie = makeUnit(s, 'hollow', resident.x + 1, resident.y);
    expect(expose(s, resident, 30, 'bite', zombie.id)).toBeUndefined();
    const recruited = command(s, { type: 'recruit', kind: 'spearman' });
    expect(recruited.ok).toBe(true);
    const converted = army(s).find(u => u.id === resident.id)!;
    expect(converted.exposure).toBe(30);
    expect(converted.exposureSourceId).toBe(zombie.id);
    expect(s.infection.some(i => i.personId === resident.id)).toBe(false);

    const t = newGame(), victim = t.residents![0], attacker = makeUnit(t, 'runner', victim.x + 1, victim.y);
    t.residents = [victim]; t.population = 1; t.jobs = { farmers: 0, woodcutters: 0, miners: 0, healers: 0, builders: 0 };
    t.resources = { wood: 0, stone: 9_000, food: 100, herbs: 10 };
    expect(infect(t, victim, 'bite', 5, attacker.id)).toBe(true);
    const infected = JSON.stringify(t);
    expect(command(t, { type: 'recruit', kind: 'warden' }).ok).toBe(false);
    expect(JSON.stringify(t)).toBe(infected);
    expect(t.residents).toContain(victim);
    expect(t.units.find(u => u.id === attacker.id)?.hp).toBeGreaterThan(0);

    expect(command(t, { type: 'treat' }).ok).toBe(true);
    expect(t.infection.some(i => i.personId === victim.id)).toBe(false);
    victim.hp = victim.maxHp * 0.69;
    const wounded = JSON.stringify(t);
    expect(command(t, { type: 'recruit', kind: 'warden' }).ok).toBe(false);
    expect(JSON.stringify(t)).toBe(wounded);
    victim.hp = victim.maxHp * 0.7;
    expect(command(t, { type: 'recruit', kind: 'warden' }).ok).toBe(true);
  });

  it('recruits from a legacy census save and keeps the migrated save valid', () => {
    const raw = readFileSync(new URL('./fixtures/milestone-v2.json', import.meta.url), 'utf8');
    const legacy = JSON.parse(raw);
    expect(legacy.residents).toBeUndefined();
    const s = decode(raw)!;
    expect(s.residents).toHaveLength(s.population);
    const candidate = selectRecruitResidents(s, 1)[0], oldHp = candidate.hp;
    s.resources.stone = 9_000;
    expect(command(s, { type: 'recruit', kind: 'warden' }).ok).toBe(true);
    const converted = army(s).find(u => u.id === candidate.id)!;
    expect(converted.hp / converted.maxHp).toBeCloseTo(oldHp / candidate.maxHp);
    expect(s.population).toBe(legacy.population - 1);
    expect(decode(JSON.stringify(s))).not.toBeNull();
  });
});
