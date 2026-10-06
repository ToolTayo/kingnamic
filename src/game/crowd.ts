import { movementBlocker, navigation } from './navigation';
import type { Point, State } from './types';

interface Body extends Point { id: number; path?: Point[]; kind?: string }
// A small spatial grid avoids an all-pairs crowd pass. Corrections never cross
// a blocked tile edge; gates leave enough space for two pedestrian lanes.
export function separateCrowd(s: State, bodies: Body[], dt: number, spacing = .48): void {
  if (dt <= 0 || bodies.length < 2) return;
  const nav=navigation(s);
  const clear = (b:Body,p: Point) => !movementBlocker(nav,b,p,b.kind==='hollow'||b.kind==='runner'||b.kind==='brute');
  const shift = (b: Body, x: number, y: number) => {
    const p = { x: b.x + x, y: b.y + y };
    if (clear(b,p)) { b.x = p.x; b.y = p.y; }
    else if (clear(b,{ x: p.x, y: b.y })) b.x = p.x;
    else if (clear(b,{ x: b.x, y: p.y })) b.y = p.y;
  };
  for (let pass = 0; pass < 2; pass++) {
    const grid = new Map<number, number[]>();
    for (let i = 0; i < bodies.length; i++) { const b = bodies[i], key = Math.floor(b.y) * 64 + Math.floor(b.x); const bucket = grid.get(key) ?? []; bucket.push(i); grid.set(key, bucket); }
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i], gx = Math.floor(a.x), gy = Math.floor(a.y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const j of grid.get((gy + dy) * 64 + gx + dx) ?? []) {
        if (j <= i) continue;
        const b = bodies[j]; let vx = a.x - b.x, vy = a.y - b.y, d = Math.hypot(vx, vy);
        if (d >= spacing) continue;
        if (d < .001) { const angle = ((a.id * 13 + b.id * 7) % 16) / 16 * Math.PI * 2; vx = Math.cos(angle); vy = Math.sin(angle); d = 1; }
        const amount = Math.min(spacing * .3, Math.max(.01, (spacing - Math.hypot(a.x - b.x, a.y - b.y)) * .5), dt * 1.5);
        shift(a, vx / d * amount, vy / d * amount); shift(b, -vx / d * amount, -vy / d * amount);
        // Head-on traffic can balance forward motion against separation
        // forever. A small deterministic side-step lets moving bodies pass,
        // while stationary formations retain their ground. The same blocked
        // edge checks apply, so this never phases through a wall or river.
        const side=Math.min(dt*.7,amount);
        if(a.path?.length)shift(a,-vy/d*side,vx/d*side);
        if(b.path?.length)shift(b,vy/d*side,-vx/d*side);
      }
    }
  }
}
