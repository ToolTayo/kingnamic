import { MAP_W, MAX_HOSTILES, MAX_UNITS } from './config';
import { key } from './map';
import { army, enemies, isFriendly, log, makeUnit } from './state';
import { ensureResidents } from './population';
import { SpatialGrid } from './spatial';
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
export function infect(s: State, person: Resident | Unit, source: Infection['source'], age = 0): boolean {
  if (person.hp <= 0 || (person.immune ?? 0) > 0 || illnessFor(s, person.id)) return false;
  const host = 'kind' in person ? 'soldier' : 'resident';
  s.infection.push({ id: s.nextId++, age, personId: person.id, host, source }); person.exposure = 0;
  if (host === 'resident') (person as Resident).sick = true;
  log(s, `${host === 'soldier' ? 'Soldier' : 'Resident'} #${person.id}: suspected Hollowing from ${source}. Incubation lasts 18s; herbs can cure it.`, 'warn'); return true;
}
export function expose(s: State, person: Resident | Unit, dose: number, source: Infection['source']): void {
  if (person.hp <= 0 || (person.immune ?? 0) > 0 || illnessFor(s, person.id)) return;
  person.exposure = Math.min(100, (person.exposure ?? 0) + dose);
  if (person.exposure >= 100) infect(s, person, source);
}
export function cure(s: State, count: number, ids?: number[]): number {
  const hosts = new Map<number, Resident | Unit>([...(s.residents ?? []), ...army(s)].map(p => [p.id,p]));
  const chosen = s.infection.filter(i => !ids || ids.includes(i.personId!)).sort((a,b) => illnessDeadline(s,a,hosts.get(a.personId!)) - illnessDeadline(s,b,hosts.get(b.personId!)) || b.age-a.age || a.id-b.id).slice(0,count);
  const cases = new Set(chosen.map(i => i.id));
  for (const i of chosen) { const p = hosts.get(i.personId!); if (p && p.hp > 0) { p.exposure = 0; p.immune = 35; p.hp = Math.min(p.maxHp, p.hp + 15); if ('sick' in p) p.sick = false; } }
  s.infection = s.infection.filter(i => !cases.has(i.id)); s.stats.cured += chosen.length; return chosen.length;
}
export function recordDeath(s: State, person: Resident | Unit): void {
  if ('kind' in person && !isFriendly(person)) return;
  s.corpses ??= [];
  if (s.corpses.some(c => c.personId === person.id)) return;
  const tainted = !!illnessFor(s,person.id) || (person.exposure ?? 0) >= 40 || (s.contamination[key(person)] ?? 0) >= 50;
  s.corpses.push({ id: s.nextId++, personId: person.id, kind: 'kind' in person ? person.kind as 'warden' : 'resident', x: person.x, y: person.y, remaining: tainted ? RISE_DELAY : 12, tainted });
  s.infection = s.infection.filter(i => i.personId !== person.id);
  if (tainted) log(s, `Tainted remains of #${person.id} will rise in ${RISE_DELAY}s. Clear the ground or cleanse with herbs.`, 'danger');
}
export function resolveResidentDeaths(s: State): void {
  const dead = (s.residents ?? []).filter(r => r.hp <= 0);
  for (const r of dead) { recordDeath(s, r); s.stats.lost++; log(s, `Resident #${r.id} has died. Their work assignment is vacant.`, 'danger'); if (r.job !== 'idle') s.jobs[r.job] = Math.max(0, s.jobs[r.job] - 1); }
  if (dead.length) { s.residents = s.residents!.filter(r => r.hp > 0); s.population = s.residents.length; }
}
export function plagueStep(s: State, dt: number): void {
  ensureResidents(s);
  const hosts: (Resident | Unit)[] = [...s.residents!, ...army(s)], byId = new Map(hosts.map(p => [p.id,p]));
  for (const p of hosts) { if (p.immune) p.immune = Math.max(0,p.immune-dt); p.exposure = Math.max(0,(p.exposure ?? 0)-dt*.35); }
  for (const i of s.infection) {
    const p = byId.get(i.personId!); if (!p || p.hp <= 0) continue;
    const old = i.age; i.age += dt * (s.quarantine ? .25 : 1);
    if (old < INCUBATION && i.age >= INCUBATION) log(s, `#${p.id} now shows symptoms and can spread infection through close contact.`, 'warn');
    if (old < CRITICAL && i.age >= CRITICAL) log(s, `#${p.id} is critically ill. Treat now; death follows at 75s of illness.`, 'danger');
    if (i.age >= CRITICAL) p.hp -= dt * (s.quarantine ? .5 : 2);
    if (i.age >= FATAL) p.hp = 0;
  }
  s.plagueClock += dt;
  if (s.plagueClock >= 1) {
    const elapsed = Math.min(1, s.plagueClock); s.plagueClock %= 1;
    const contagious = s.infection.filter(i => i.age >= INCUBATION).map(i => byId.get(i.personId!)).filter((p): p is Resident | Unit => !!p && p.hp > 0);
    const grid = new SpatialGrid(contagious, 2);
    const farmTainted = s.buildings.some(b => b.kind === 'farm' && [key(b),key(b)+1,key(b)-1,key(b)+MAP_W,key(b)-MAP_W].some(k => (s.contamination[k] ?? 0) >= 40));
    s.suppliesTaint = Math.max(0, Math.min(100, (s.suppliesTaint ?? 0) + (farmTainted ? 2 : -1) * elapsed));
    for (const p of hosts) {
      const soil = s.contamination[key(p)] ?? 0;
      if (soil >= 25) expose(s,p,soil / 100 * 4 * elapsed * (s.quarantine ? .3 : 1),'ground');
      if (!s.quarantine && grid.nearest(p,1.4,q => q.id !== p.id)) expose(s,p,3*elapsed,'contact');
      if ((s.suppliesTaint ?? 0) >= 35 && !('kind' in p)) expose(s,p,1.5*elapsed*(s.quarantine ? .25 : 1),'supplies');
    }
    if (farmTainted && (s.suppliesTaint ?? 0) >= 35 && (s.suppliesTaint ?? 0) < 37) log(s,'Contamination has reached the crofts. Supplies are tainted: cleanse the ground or quarantine distribution.','danger');
  }
  for (let i=0;i<s.contamination.length;i++) s.contamination[i]=Math.max(0,s.contamination[i]-dt*.35);
  for (const corpse of s.corpses ?? []) {
    corpse.remaining = Math.max(0,corpse.remaining-dt);
    if (corpse.remaining === 0 && corpse.tainted && enemies(s).length < MAX_HOSTILES && s.units.length < MAX_UNITS) {
      const risen = makeUnit(s, 'hollow', corpse.x, corpse.y); risen.reanimatedFrom = corpse.personId; corpse.tainted = false;
      log(s, `The remains of #${corpse.personId} have risen. This is a hostile infected, not a returned soldier.`, 'danger');
    }
  }
  s.corpses = (s.corpses ?? []).filter(c => c.remaining > 0 || c.tainted);
  resolveResidentDeaths(s);
}
