import { BUILDINGS } from './config';
import { distance, tileAt } from './map';
import { findPath, nearestOpen, navigation, movementBlocker } from './navigation';
import { enemies } from './state';
import { separateCrowd } from './crowd';
import { builderAssignments } from './workforce';
import { assignResidentJobs } from './population';
import { SpatialGrid } from './spatial';
import type { Building, Point, State, Resident } from './types';

export type Civilian = Resident;
const open = (s: State, p: Point) => {
  const x = Math.round(p.x), y = Math.round(p.y), tile = tileAt(x, y,s);
  return !!tile && tile.terrain !== 'water' && !s.buildings.some(b => b.hp > 0 && b.kind !== 'gate' && b.x === x && b.y === y);
};

// Movement belongs to the fixed-step simulation. Rendering observes a bounded
// sample of the same persistent people; it never advances their health or paths.
export class CivilianSystem {
  people: Civilian[] = [];
  private state?: State;
  private time = 0;
  private topology = '';
  private ordinals = new Map<number, number>();

  private doorstep(s: State, b: Building, id: number): Point {
    const lane = Math.floor(id / 4) % 2 ? .23 : -.23, r = 1 + Math.floor(id / 8) % 2;
    const sides = [{ x: b.x + r, y: b.y + lane }, { x: b.x + lane, y: b.y + r }, { x: b.x - r, y: b.y + lane }, { x: b.x + lane, y: b.y - r }];
    for (let n = 0; n < 4; n++) { const p = sides[(n + id) % 4]; if (open(s, { x: Math.round(p.x), y: Math.round(p.y) })) return p; }
    return nearestOpen(s, { x: b.x, y: b.y + 1 });
  }
  private home(s: State, id: number): Point {
    const homes = s.buildings.filter(b => b.kind === 'cottage' && b.progress === 1);
    const b = homes[(id - 1) % Math.max(1, homes.length)] ?? s.buildings.find(b => b.kind === 'hearth');
    return b ? this.doorstep(s, b, Math.floor((id - 1) / Math.max(1, homes.length))) : nearestOpen(s, { x: 14, y: 13 });
  }
  private workplace(s: State, c: Civilian): Point {
    const ordinal = this.ordinals.get(c.id) ?? 0;
    const sites = s.buildings.filter(b => b.progress === 1 && BUILDINGS[b.kind].job === c.job);
    const b = c.job === 'builders' ? builderAssignments(s)[ordinal] : sites[ordinal % Math.max(1, sites.length)];
    if (b) return this.doorstep(s, b, Math.floor(ordinal / Math.max(1, sites.length)));
    // Unassigned residents stroll to safe nearby ground, then rest at home.
    const home = this.home(s, c.id), phase = c.id * 7 + c.trip * 3;
    const p = nearestOpen(s, { x: home.x + phase % 5 - 2, y: home.y + Math.floor(phase / 5) % 5 - 2 });
    const tile = tileAt(p.x, p.y,s);
    return tile && tile.territory !== 'wild' && s.owned.includes(tile.territory) ? p : home;
  }
  private reconcile(s: State): void {
    assignResidentJobs(s); this.people = s.residents!;
    this.ordinals.clear(); const counts = new Map<string, number>();
    for (const c of this.people) { const n = counts.get(c.job) ?? 0; this.ordinals.set(c.id, n); counts.set(c.job, n + 1); }
  }
  observe(s: State, focus?:number|null): void {
    const residents=s.residents??[];
    this.people=[...residents.filter(r=>r.sick||r.id===focus),...residents.filter(r=>!r.sick&&r.id!==focus)].slice(0,64);
  }
  update(s: State, fixedDelta?: number): void {
    if (this.state !== s || s.time < this.time) {
      this.state = s; this.time = s.time; this.topology = '';
    }
    const dt = fixedDelta ?? Math.min(.5, Math.max(0, s.time - this.time)); this.time = s.time;
    this.reconcile(s);
    const signature = s.buildings.map(b => `${b.id}:${b.x},${b.y}:${b.rotation??0}`).join('|');
    if (this.topology && signature !== this.topology) for (const c of this.people) { c.path = []; c.retry = 0; }
    this.topology = signature;
    const nav=navigation(s);
    let pathBudget = 2; // Bound path searches per simulation step, even at the population cap.
    const foes = enemies(s);
    const threats = new SpatialGrid(foes);
    for (const c of this.people) {
      c.retry = Math.max(0, c.retry - dt);
      const threat = !!threats.nearest(c, 3.5);
      const resting = s.phase === 'night' || s.phaseTime > 64;
      const urgent = c.sick ? 'recover' : threat ? 'flee' : resting ? 'shelter' : null;
      let goal: Point;
      if (urgent) {
        c.activity = urgent; c.carrying = false;
        const refuge = c.sick && s.buildings.find(b => b.kind === 'infirmary' && b.progress === 1);
        goal = refuge ? this.doorstep(s, refuge, c.id) : this.home(s, c.id);
        // A threatened doorstep sends residents toward the safer side of the Hearth.
        if (threat && foes.some(u => distance(u, goal) < 3.5)) {
          const hearth = s.buildings.find(b => b.kind === 'hearth');
          if (hearth) goal = this.doorstep(s, hearth, c.id);
        }
      } else {
        if (['shelter', 'recover', 'flee'].includes(c.activity)) { c.activity = 'work'; c.wait = c.id % 3; }
        c.wait = Math.max(0, c.wait - dt);
        if (!c.path.length && distance(c, c.goal) < .3 && c.wait === 0) {
          c.activity = c.activity === 'work' ? 'home' : 'work'; c.trip++;
          c.carrying = c.activity === 'home' && c.job !== 'idle' && c.job !== 'builders';
        }
        goal = c.activity === 'work' ? this.workplace(s, c) : this.home(s, c.id);
      }
      if (goal.x !== c.goal.x || goal.y !== c.goal.y) { c.goal = goal; c.path = []; c.wait = 0; c.retry = 0; }
      if (c.path[0] && !open(s, c.path[0])) c.path = [];
      if (dt > 0 && !c.retry && !c.path.length && distance(c, goal) > .28 && pathBudget > 0) {
        const anchor = { x: Math.round(c.x), y: Math.round(c.y) };
        const end = { x: Math.round(goal.x), y: Math.round(goal.y) };
        c.path = distance(anchor, end) < .01 ? [goal] : findPath(s, anchor, end);
        if (c.path.length && distance(c.path[c.path.length - 1], goal) > .01) c.path.push(goal);
        if (c.path.length && open(s, anchor) && distance(c, anchor) > .01) c.path.unshift(anchor);
        if (!c.path.length) c.retry = 2 + c.id % 3;
        pathBudget--;
      }
      if(dt>0&&c.path.length>1&&distance(c,c.path[0])<.42)c.path.shift();
      if(dt>0&&c.path.length===1&&distance(c,goal)<.28){c.path=[];c.wait=Math.max(c.wait,2);}
      const next = c.path[0];
      if (!next || !dt) continue;
      const d = distance(c, next), speed = (c.sick ? .45 : threat ? 1.55 : .85 + c.id % 5 * .035) * (tileAt(c.x, c.y,s)?.terrain === 'marsh' ? .6 : 1);
      const fraction=d?Math.min(1,speed*dt/d):1,p={x:c.x+(next.x-c.x)*fraction,y:c.y+(next.y-c.y)*fraction};if(movementBlocker(nav,c,p,false,true)){c.path=[];c.retry=.5;continue;}
      if (d <= speed * dt) {
        c.x = next.x; c.y = next.y; c.path.shift();
        if (!c.path.length) c.wait = c.activity === 'work' ? 5 + c.id % 7 : 2 + c.id % 4;
      } else { c.x += (next.x - c.x) / d * speed * dt; c.y += (next.y - c.y) / d * speed * dt; }
    }
    // One shared crowd pass prevents pedestrians and soldiers occupying the
    // same space. Full simulation skips the earlier soldiers-only pass.
    separateCrowd(s, [...s.units,...this.people], dt, .48);
  }
}
