import { BUILDINGS, UNITS, MAP_H, MAP_W } from './config';
import type { Building, BuildingKind, State, Unit, UnitKind } from './types';
import { ensureResidents } from './population';
export function random(s: State): number {
  let t = s.rng += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  s.rng >>>= 0;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
export function log(s: State, text: string, tone: 'info' | 'good' | 'warn' | 'danger' = 'info'): void {
  s.logs.unshift({ id: s.nextId++, time: s.time, text, tone }); s.logs.length = Math.min(s.logs.length, 35);
}
export function makeBuilding(s: State, kind: BuildingKind, x: number, y: number, ready = false): Building {
  const b: Building = { id: s.nextId++, kind, x, y, hp: BUILDINGS[kind].hp, maxHp: BUILDINGS[kind].hp, level: 1, progress: ready ? 1 : 0, cooldown: 0 };
  s.buildings.push(b); return b;
}
export function makeUnit(s: State, kind: UnitKind, x: number, y: number): Unit {
  const u: Unit = { id: s.nextId++, kind, x, y, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp, cooldown: 0, target: { x, y }, path: [], repath: 0, attackFlash: 0 };
  s.units.push(u); return u;
}
export const isFriendly = (u: Unit): boolean => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind);
export const army = (s: State): Unit[] => s.units.filter(u => isFriendly(u) && u.hp > 0);
export const enemies = (s: State): Unit[] => s.units.filter(u => !isFriendly(u) && u.hp > 0);
export function newGame(seed = 74019): State {
  const s: State = {
    version: 2, economyRevision:1, seed, rng: seed, time: 0, day: 1, phaseTime: 0, phase: 'day', speed: 1, lastSpeed: 1,
    resources: { wood: 145, stone: 90, food: 180, herbs: 18 }, population: 18,
    jobs: { farmers: 4, woodcutters: 4, miners: 0, healers: 0, builders: 2 },
    buildings: [], units: [], owned: ['hearthmere'], infection: [], contamination: Array(MAP_W * MAP_H).fill(0),
    plagueClock: 0, economyClock: 0, waveClock: 0, waveRemaining: 0, waveNumber: 0, nextId: 1,
    formation: 'line', quarantine: false, biteRulesRevision: 1, logs: [], effects: [], stats: { slain: 0, lost: 0, built: 0, nights: 0, cured: 0, claimed: 0 },
    completed: [], outcome: 'playing', tutorialSeen: false,
  };
  makeBuilding(s, 'hearth', 14, 11, true).name='Hearthmere';
  makeBuilding(s, 'cottage', 11, 12, true); makeBuilding(s, 'cottage', 16, 14, true);
  makeBuilding(s, 'farm', 11, 15, true); makeBuilding(s, 'lumberyard', 10, 9, true);
  makeBuilding(s, 'barracks', 17, 10, true); makeBuilding(s, 'tower', 17, 17, true);
  for (let x = 11; x <= 18; x++) makeBuilding(s, x === 14 ? 'gate' : 'wall', x, 18, true);
  makeUnit(s, 'warden', 13, 17); makeUnit(s, 'warden', 15, 17); makeUnit(s, 'ranger', 14, 16);
  log(s, 'The beacon is lit. Hearthmere stands with you.', 'good');
  log(s, 'Scouts report movement beyond the southern crossing. Prepare before dusk.');
  ensureResidents(s);
  return s;
}
