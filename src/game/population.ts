import { JOBS, MAX_RESIDENTS } from './config';
import { nearestOpen } from './navigation';
import { key } from './map';
import type { Resident, State } from './types';

export function addResidents(s: State, count: number): Resident[] {
  s.residents ??= [];
  const added: Resident[] = [], homes = s.buildings.filter(b => b.kind === 'cottage');
  const reserved=new Set([...s.residents,...s.units].map(key));
  for (let i = 0; i < count && s.residents.length < MAX_RESIDENTS; i++) {
    const id = s.nextId++, home = homes[id % Math.max(1, homes.length)] ?? { x: 14, y: 11 };
    const p = nearestOpen(s, { x: home.x + (id % 2 ? 1 : -1), y: home.y + (id % 3 - 1) },reserved);reserved.add(key(p));
    const r: Resident = { ...p, id, hp: 50, maxHp: 50, exposure: 0, immune: 0, job: 'idle', sick: false, activity: 'rest', path: [], goal: p, wait: id % 5, retry: 0, trip: 0, carrying: false };
    s.residents.push(r); added.push(r);
  }
  s.population = s.residents.length; return added;
}
// Only missing individual records are migrated. A mismatched modern census is
// rejected by persistence, never repaired by manufacturing dead people.
export function ensureResidents(s: State): void {
  if (!s.residents) { const count = s.population; s.residents = []; addResidents(s, count); }
  const claimed = new Set(s.infection.map(i => i.personId));
  for (const illness of s.infection) if (illness.personId === undefined) {
    const r = s.residents.find(r => !claimed.has(r.id));
    if (r) { illness.personId = r.id; illness.host = 'resident'; illness.source ??= 'arrival'; claimed.add(r.id); }
  }
}
export const civilianCases = (s: State) => s.infection.filter(i => i.host !== 'soldier');
export function assignResidentJobs(s: State): void {
  ensureResidents(s);
  const ill = new Set(civilianCases(s).map(i => i.personId));
  for (const r of s.residents!) { r.sick = ill.has(r.id); if (r.sick) r.job = 'idle'; }
  for (const { id } of JOBS) {
    const assigned = s.residents!.filter(r => r.job === id);
    for (const r of assigned.slice(s.jobs[id])) { r.job = 'idle'; r.wait = 0; }
    let needed = s.jobs[id] - Math.min(assigned.length, s.jobs[id]);
    for (const r of s.residents!) if (needed > 0 && r.job === 'idle' && !r.sick) {
      r.job = id; r.activity = 'work'; r.wait = .1; r.carrying = false; needed--;
    }
  }
}
export function removeResident(s: State, id: number): void {
  s.residents = (s.residents ?? []).filter(r => r.id !== id); s.population = s.residents.length;
  s.infection = s.infection.filter(i => i.personId !== id);
}
