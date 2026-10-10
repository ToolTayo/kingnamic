import { MAX_HOSTILES, MAX_UNITS } from './config';
import { distance, key } from './map';
import { nearestOpen } from './navigation';
import { army, enemies, log, makeUnit } from './state';
import type { Point, RoadAmbushId, State, UnitKind } from './types';

export interface RoadAmbush {
  id: RoadAmbushId;
  name: string;
  point: Point;
  warning: number;
  risk: 'Watchful' | 'Rising' | 'High' | 'Severe';
  roster: readonly ('hollow' | 'runner' | 'brute')[];
  patrol: { a: Point; b: Point };
}

// These four hand-placed route encounters are finite. Each road is telegraphed,
// and no second roaming pack is armed while infected remain on the March map.
export const ROAD_AMBUSHES: readonly RoadAmbush[] = [
  { id: 'abbey-approach', name: 'the abbey ravine road', point: { x: 7, y: 36 }, warning: 8, risk: 'Watchful', roster: ['hollow', 'hollow', 'runner'], patrol: { a: { x: 6, y: 36 }, b: { x: 8, y: 38 } } },
  { id: 'splitwater-ford', name: 'Splitwater Ford', point: { x: 33, y: 24 }, warning: 8, risk: 'Rising', roster: ['hollow', 'runner', 'hollow', 'runner'], patrol: { a: { x: 32, y: 23 }, b: { x: 35, y: 24 } } },
  { id: 'saltwick-causeway', name: 'Saltwick Causeway', point: { x: 29, y: 39 }, warning: 8, risk: 'High', roster: ['hollow', 'hollow', 'runner', 'hollow', 'brute'], patrol: { a: { x: 28, y: 39 }, b: { x: 31, y: 41 } } },
  { id: 'greybank-track', name: 'the Greybank quarry track', point: { x: 44, y: 14 }, warning: 8, risk: 'Severe', roster: ['hollow', 'runner', 'hollow', 'runner', 'hollow', 'brute'], patrol: { a: { x: 43, y: 14 }, b: { x: 46, y: 12 } } },
];

export function roadAmbush(id: RoadAmbushId): RoadAmbush | undefined {
  return ROAD_AMBUSHES.find(encounter => encounter.id === id);
}

export function wildernessReadout(s: State): string {
  const hero = army(s).find(u => u.id === s.commander?.id);
  if (!hero) return 'Southern road · Quiet';
  const nearest = ROAD_AMBUSHES.reduce((best, current) => distance(hero, current.point) < distance(hero, best.point) ? current : best);
  const nearby = enemies(s).filter(u => distance(hero, u) < 8).length;
  const risk = nearby ? 'Contested' : nearest.risk;
  return `${nearest.name.replace(/^the /, '')} · ${risk}`;
}

function spawnRoadAmbush(s: State, encounter: RoadAmbush): boolean {
  const infected = enemies(s).length;
  const room = Math.min(MAX_HOSTILES - infected, MAX_UNITS - s.units.length);
  if (room < encounter.roster.length) return false;
  const reserved = new Set(s.units.map(key));
  const offsets = [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }];
  encounter.roster.forEach((kind: UnitKind, index) => {
    const offset = offsets[index % offsets.length], desired = { x: encounter.point.x + offset.x, y: encounter.point.y + offset.y };
    const p = nearestOpen(s, desired, reserved, undefined, 'infected'); reserved.add(key(p));
    const u = makeUnit(s, kind, p.x, p.y);
    u.order = 'patrol'; u.anchor = { ...p };
    u.patrol = { a: { ...encounter.patrol.a }, b: { ...encounter.patrol.b }, leg: (index % 2) as 0 | 1 };
    u.target = { ...(u.patrol.leg ? u.patrol.b : u.patrol.a) };
  });
  return true;
}

export function wildernessStep(s: State, dt: number, hero?: { x: number; y: number }): void {
  const m = s.march;
  if (!m || !s.region) return;
  m.roadAmbushes ??= [];
  const pending = m.roadWarning;
  if (pending) {
    const encounter = roadAmbush(pending.id);
    if (!encounter || !hero) { delete m.roadWarning; return; }
    // Pulling back out of the ravine abandons the ambush before the pack forms.
    if (distance(hero, encounter.point) > 10) { delete m.roadWarning; return; }
    const wasPending = pending.remaining > 0;
    pending.remaining = Math.max(0, pending.remaining - dt);
    if (pending.remaining === 0) {
      if (spawnRoadAmbush(s, encounter)) {
        if (!m.roadAmbushes.includes(encounter.id)) m.roadAmbushes.push(encounter.id);
        delete m.roadWarning;
        log(s, `Infected emerge along ${encounter.name}. ${encounter.roster.length} infected are ranging between the road and ravine.`, 'danger');
      } else if (wasPending) {
        log(s, `The ${encounter.name} pack waits for room on the battlefield. Clear infected before it can close in.`, 'warn');
      }
    }
    return;
  }
  if (!hero || enemies(s).length) return;
  const activated = new Set(m.roadAmbushes);
  const encounter = ROAD_AMBUSHES.find(route => !activated.has(route.id)
    && distance(hero, route.point) <= 4.5
    && !enemies(s).some(u => distance(u, route.point) < 9));
  if (!encounter) return;
  m.roadWarning = { id: encounter.id, remaining: encounter.warning };
  log(s, `Scouts hear infected on ${encounter.name}. A road ambush will arrive in ${encounter.warning} seconds. Rally on the high ground or pull back.`, 'warn');
}
