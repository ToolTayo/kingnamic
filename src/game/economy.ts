import { BUILDINGS, MAX_RESIDENTS } from './config';
import { army, enemies, log } from './state';
import { builderAssignments } from './workforce';
import type { Job, Resources, State } from './types';
import { civilianCases, ensureResidents } from './population';
import { cure, resolveResidentDeaths } from './disease';
export function capacity(s: State): number { return Math.min(MAX_RESIDENTS,s.buildings.filter(b => b.progress >= 1).reduce((n, b) => n + (b.kind === 'hearth' ? 12 : b.kind === 'cottage' ? 6 * b.level : 0), 0)); }
export const healthy = (s: State): number => Math.max(0, s.population - civilianCases(s).length);
export const assigned = (s: State): number => Object.values(s.jobs).reduce((a, b) => a + b, 0);
export const idle = (s: State): number => Math.max(0, healthy(s) - assigned(s));
export function jobCapacity(s: State, job: Job): number {
  if (job === 'builders') return 6;
  return s.buildings.filter(b => b.progress >= 1 && BUILDINGS[b.kind].job === job).reduce((v, b) => v + (BUILDINGS[b.kind].capacity ?? 0) * b.level, 0);
}
export function rebalanceJobs(s: State): void {
  for (const job of Object.keys(s.jobs) as Job[]) s.jobs[job] = Math.min(s.jobs[job], jobCapacity(s, job));
  let extra = assigned(s) - healthy(s);
  for (const job of ['miners', 'woodcutters', 'builders', 'farmers', 'healers'] as Job[]) {
    const cut = Math.min(s.jobs[job], Math.max(0, extra)); s.jobs[job] -= cut; extra -= cut;
  }
}
export function rates(s: State): Resources {
  const m = s.quarantine ? 0.8 : 1;
  const local = {
    wood: s.jobs.woodcutters * 0.3 * m * (s.owned.includes('pinewatch') ? 1.35 : 1),
    stone: s.jobs.miners * 0.22 * m * (s.owned.includes('greybank') ? 1.4 : 1),
    food: s.jobs.farmers * 0.55 * m - (s.population + army(s).length) * 0.04,
    herbs: s.jobs.healers * 0.055 * m * (s.owned.includes('fen') ? 1.6 : 1),
  };
  if(s.empire){const other=rates(s.empire.reserve);for(const r of Object.keys(local) as (keyof Resources)[])local[r]+=other[r];}return local;
}
export function canAfford(s: State, cost: Partial<Resources>): boolean { return Object.entries(cost).every(([r, value]) => s.resources[r as keyof Resources] >= value); }
export function spend(s: State, cost: Partial<Resources>): void { for (const [r, value] of Object.entries(cost)) s.resources[r as keyof Resources] -= value; }
export function recoverSoldiers(s: State, dt: number): void {
  if (!enemies(s).length && s.resources.food > 15) for (const u of army(s)) if (u.injury) {
    const rate = s.jobs.healers > 0 ? 1.5 : 1;
    u.injury = Math.max(0, u.injury - dt * rate); u.hp = Math.min(u.maxHp, u.hp + dt * rate);
    if (!u.injury) { u.hp = u.maxHp; delete u.injury; }
  }
}
export function economyStep(s: State, dt: number): void {
  ensureResidents(s);
  recoverSoldiers(s, dt);
  rebalanceJobs(s);
  const crew = new Map<number, number>();
  for (const site of builderAssignments(s)) crew.set(site.id, (crew.get(site.id) ?? 0) + 1);
  for (const b of s.buildings) if (b.progress < 1) {
    // One small resident contribution keeps an unstaffed project recoverable.
    // Assigned labor is finite, even when many projects are queued at once.
    b.progress = Math.min(1, b.progress + dt * (0.25 + (crew.get(b.id) ?? 0) * 0.5) / BUILDINGS[b.kind].time);
    if (b.progress === 1) {
      s.stats.built++; log(s, `${BUILDINGS[b.kind].name} is ready.`, 'good');
      s.effects.push({ id: s.nextId++, x: b.x, y: b.y, kind: 'build', ttl: 1.3 });
    }
  }
  const production = rates(s);
  for (const r of Object.keys(production) as (keyof Resources)[]) s.resources[r] = Math.min(Math.max(9999,s.resources[r]), Math.max(0, s.resources[r] + production[r] * dt));
  s.economyClock += dt;
  if (s.economyClock >= 12) {
    s.economyClock -= 12;
    if(s.resources.food<1&&army(s).length){for(const u of army(s))u.hp-=6;log(s,'The army has no rations. Every soldier loses 6 health each 12 seconds until food returns.','danger');}
    if (s.resources.food < 1 && s.population > 0) {
      const person=s.residents!.find(r=>r.job==='idle')??s.residents![s.residents!.length-1];if(person)person.hp=0;resolveResidentDeaths(s);
      log(s, 'A villager was lost to hunger. Assign farmers or build another croft.', 'danger');
    }
    if (s.jobs.healers > 0 && s.infection.length && s.resources.herbs >= 3) {
      s.resources.herbs -= 3; cure(s,1); log(s, 'The herbalists cured one resident or soldier of the Hollowing.', 'good');
    }
    // Rest and provisions restore wounded soldiers between attacks.
    if (s.phase === 'day' && s.resources.food > 15) {
      for (const u of army(s)) u.hp = Math.min(u.maxHp, u.hp + 10);
      for (const r of s.residents!) if(!r.sick)r.hp=Math.min(r.maxHp,r.hp+5);
    }
  }
}
