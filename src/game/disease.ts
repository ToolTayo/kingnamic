import { MAP_W, MAX_HOSTILES, MAX_UNITS } from './config';
import { key } from './map';
import { army, enemies, isFriendly, isInfected, isRival, log, makeUnit, rivals } from './state';
import { ensureResidents } from './population';
import type { Infection, Resident, State, Unit } from './types';

export const INCUBATION = 18, CRITICAL = 55, FATAL = 75, RISE_DELAY = 8;
export const illnessFor = (s: State, id: number) => s.infection.find(i => i.personId === id);
export const diseaseStage = (age: number) => age < INCUBATION ? 'Incubating' : age < CRITICAL ? 'Symptomatic' : 'Critical';
// Current-health estimate, excluding future healing or further combat wounds.
// Critical HP loss can kill an injured host before the disease-age deadline.
export function illnessDeadline(s: State, i: Infection, host?: Resident | Unit): number {
  const p = host ?? s.residents?.find(p => p.id === i.personId) ?? s.units.find(p => p.id === i.personId);
  const rate = s.quarantine ? .25 : 1;
  return Math.max(0, Math.min((FATAL - i.age) / rate, Math.max(0, CRITICAL - i.age) / rate + (p?.hp ?? 0) / (2 * rate)));
}
export function nextIllnessDeadline(s: State): number {
  const hosts = new Map<number, Resident | Unit>([...(s.residents ?? []), ...s.units].map(p => [p.id,p]));
  return s.infection.reduce((n,i) => Math.min(n, illnessDeadline(s,i,hosts.get(i.personId!))), Infinity);
}
function attachInfection(s: State, person: Resident | Unit, age: number, source: 'bite' | 'legacy', sourceId?: number, legacyCause?: 'bite' | 'unknown'): boolean {
  if (person.hp <= 0 || (person.immune ?? 0) > 0 || illnessFor(s, person.id)) return false;
  const host = 'kind' in person ? 'soldier' : 'resident';
  s.infection.push({ id: s.nextId++, age, personId: person.id, host, source, ...(sourceId ? { sourceId } : {}), ...(source === 'legacy' ? { legacyCause: legacyCause ?? 'unknown' } : {}) }); person.exposure = 0; delete person.exposureSourceId;
  if (host === 'resident') (person as Resident).sick = true;
  const origin = source === 'bite' ? `a zombie bite from #${sourceId}` : legacyCause === 'bite' ? 'a bite recorded by an older save' : 'an illness recorded by an older save';
  log(s, `${host === 'soldier' ? 'Soldier' : 'Resident'} #${person.id}: Hollowing confirmed after ${origin}. They remain human while alive; herbs can cure them.`, 'warn'); return true;
}
// Compatibility/fixture entry point: production combat passes the real
// attackerId through expose(); source-less restored cases are labelled legacy.
export function infect(s: State, person: Resident | Unit, source: string, age = 0, sourceId?: number): boolean {
  if (source !== 'bite') return false;
  if(sourceId!==undefined){const attacker=s.units.find(u=>u.id===sourceId);if(!attacker||!isInfected(attacker)||attacker.hp<=0)return false;}
  return sourceId === undefined
    ? attachInfection(s,person,age,'legacy',undefined,'bite')
    : attachInfection(s,person,age,'bite',sourceId);
}
// Used by combat only after a living zombie's bite has landed on a living host.
// Environmental contamination, sickness, and ordinary HP loss never expose a host.
export function expose(s: State, person: Resident | Unit, dose: number, source: string, sourceId?: number): void {
  const attacker = sourceId === undefined ? undefined : s.units.find(u => u.id === sourceId);
    if (source !== 'bite' || !attacker || !isInfected(attacker) || attacker.hp <= 0 || person.hp <= 0 || (person.immune ?? 0) > 0 || illnessFor(s, person.id)) return;
  const firstBite = (person.exposure ?? 0) <= 0;
  person.exposure = Math.min(100, (person.exposure ?? 0) + dose);
  person.exposureSourceId = sourceId;
  if (firstBite) log(s, `${'kind' in person ? 'Soldier' : 'Resident'} #${person.id} was bitten by zombie #${sourceId}. Watch their bite exposure and treat confirmed illness.`, 'danger');
  if (person.exposure >= 100) attachInfection(s, person, 0, 'bite', sourceId);
}
// Existing illness follows its host across regions. It is not a new exposure;
// old records without bite provenance remain explicitly marked as legacy.
export function restoreInfection(s: State, person: Resident | Unit, infection: Infection): boolean {
  return infection.source === 'bite' && infection.sourceId !== undefined
    ? attachInfection(s, person, infection.age, 'bite', infection.sourceId)
    : attachInfection(s, person, infection.age, 'legacy', undefined, infection.legacyCause ?? 'unknown');
}
export function cure(s: State, count: number, ids?: number[]): number {
  const hosts = new Map<number, Resident | Unit>([...(s.residents ?? []), ...army(s), ...rivals(s)].map(p => [p.id,p]));
  const chosen = s.infection.filter(i => !ids || ids.includes(i.personId!)).sort((a,b) => illnessDeadline(s,a,hosts.get(a.personId!)) - illnessDeadline(s,b,hosts.get(b.personId!)) || b.age-a.age || a.id-b.id).slice(0,count);
  const cases = new Set(chosen.map(i => i.id));
  for (const i of chosen) { const p = hosts.get(i.personId!); if (p && p.hp > 0) { p.exposure = 0; p.immune = 35; p.hp = Math.min(p.maxHp, p.hp + 15); if ('sick' in p) p.sick = false; } }
  s.infection = s.infection.filter(i => !cases.has(i.id)); s.stats.cured += chosen.length; return chosen.length;
}
export function recordDeath(s: State, person: Resident | Unit): void {
  if (person.hp > 0 || 'kind' in person && !isFriendly(person) && !isRival(person)) return;
  s.fallenIds ??= [];
  if (!s.fallenIds.includes(person.id)) s.fallenIds.push(person.id);
  s.corpses ??= [];
  if (s.corpses.some(c => c.personId === person.id)) return;
  // Only a confirmed infection can animate a corpse. Bite exposure, soil, and
  // contaminated supplies are not infection and cannot turn a clean death.
  const infection=illnessFor(s,person.id);
  const tainted = !!infection;
  s.corpses.push({ id: s.nextId++, personId: person.id, kind: 'kind' in person ? person.kind as 'warden' : 'resident', x: person.x, y: person.y, remaining: tainted ? RISE_DELAY : 12, tainted, ...(infection?.sourceId?{sourceId:infection.sourceId}:{}) });
  s.infection = s.infection.filter(i => i.personId !== person.id);
  if (tainted) log(s, `Infected remains of #${person.id} will reanimate in ${RISE_DELAY}s. The body is dead; destroy it before it rises.`, 'danger');
}
export function resolveResidentDeaths(s: State): void {
  const dead = (s.residents ?? []).filter(r => r.hp <= 0);
  for (const r of dead) { recordDeath(s, r); s.stats.lost++; log(s, `Resident #${r.id} has died. Their work assignment is vacant.`, 'danger'); if (r.job !== 'idle') s.jobs[r.job] = Math.max(0, s.jobs[r.job] - 1); }
  if (dead.length) { s.residents = s.residents!.filter(r => r.hp > 0); s.population = s.residents.length; }
}
export function plagueStep(s: State, dt: number): void {
  ensureResidents(s);
  const hosts: (Resident | Unit)[] = [...s.residents!, ...army(s), ...rivals(s)], byId = new Map(hosts.map(p => [p.id,p]));
  for (const p of hosts) { if (p.immune) p.immune = Math.max(0,p.immune-dt); p.exposure = Math.max(0,(p.exposure ?? 0)-dt*.35); if(!p.exposure)delete p.exposureSourceId; }
  for (const i of s.infection) {
    const p = byId.get(i.personId!); if (!p || p.hp <= 0) continue;
    const old = i.age; i.age += dt * (s.quarantine ? .25 : 1);
    if (old < INCUBATION && i.age >= INCUBATION) log(s, `#${p.id} shows Hollowing symptoms after a zombie bite. They remain human and can still be treated.`, 'warn');
    if (old < CRITICAL && i.age >= CRITICAL) log(s, `#${p.id} is critically ill. Treat now; death follows at 75s of illness.`, 'danger');
    if (i.age >= CRITICAL) p.hp -= dt * (s.quarantine ? .5 : 2);
    if (i.age >= FATAL) p.hp = 0;
  }
  s.plagueClock += dt;
  if (s.plagueClock >= 1) {
    const elapsed = Math.floor(s.plagueClock); s.plagueClock %= 1;
    // Keep environmental contamination visible and cleanable, but it is not a
    // transmission route. Only valid combat bites create new infections.
    const farmTainted = s.buildings.some(b => b.kind === 'farm' && [key(b),key(b)+1,key(b)-1,key(b)+MAP_W,key(b)-MAP_W].some(k => (s.contamination[k] ?? 0) >= 40));
    s.suppliesTaint = Math.max(0, Math.min(100, (s.suppliesTaint ?? 0) + (farmTainted ? 2 : -1) * elapsed));
    // Ground contamination changes slowly. Batch its bounded map scan at the
    // existing one-second disease clock instead of visiting all 780 tiles on
    // every fixed simulation step; elapsed totals remain deterministic.
    for (let i=0;i<s.contamination.length;i++) s.contamination[i]=Math.max(0,s.contamination[i]-elapsed*.35);
  }
  for (const corpse of s.corpses ?? []) {
    corpse.remaining = Math.max(0,corpse.remaining-dt);
    if (corpse.remaining === 0 && corpse.tainted && enemies(s).length < MAX_HOSTILES && s.units.length < MAX_UNITS) {
      const risen = makeUnit(s, 'hollow', corpse.x, corpse.y); risen.reanimatedFrom = corpse.personId; risen.reanimatedBy=corpse.sourceId; corpse.tainted = false;
      log(s, `The dead body of #${corpse.personId} has reanimated after infection. This is a hostile, not a returned soldier.`, 'danger');
    }
  }
  s.corpses = (s.corpses ?? []).filter(c => c.remaining > 0 || c.tainted);
  resolveResidentDeaths(s);
}
