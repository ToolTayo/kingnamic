import { movementBlocker, navigation } from './navigation';
import type { Point, State } from './types';

interface Body extends Point { id: number; path?: Point[]; kind?: string; faction?:'rival' }
// A small spatial grid avoids an all-pairs crowd pass. Corrections never cross
// a blocked tile edge; gates leave enough space for two pedestrian lanes.
export function separateCrowd(s: State, bodies: Body[], dt: number, spacing = .48): void {
  if (dt <= 0 || bodies.length < 2) return;
  const nav=navigation(s);
  const clear = (b:Body,p: Point) => {const infected=b.kind==='hollow'||b.kind==='runner'||b.kind==='brute';return !movementBlocker(nav,b,p,infected,false,infected?'infected':b.faction==='rival'?'rival':'player');};
  const shift = (b: Body, x: number, y: number) => {
    const p = { x: b.x + x, y: b.y + y };
    if (clear(b,p)) { b.x = p.x; b.y = p.y; }
    else if (clear(b,{ x: p.x, y: b.y })) b.x = p.x;
    else if (clear(b,{ x: b.x, y: p.y })) b.y = p.y;
  };
  for (let pass = 0; pass < 1; pass++) {
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
        // A soldier with an active path has a reason to be moving; an idle or
        // stationed body should yield most of the overlap correction. Equal
        // pushes made large ordered groups pin their own leaders in doorways.
        const movingA=!!a.path?.length,movingB=!!b.path?.length;
        if(movingA&&movingB){
          const an=a.path![0],bn=b.path![0],al=Math.hypot(an.x-a.x,an.y-a.y)||1,bl=Math.hypot(bn.x-b.x,bn.y-b.y)||1,ax=(an.x-a.x)/al,ay=(an.y-a.y)/al,bx=(bn.x-b.x)/bl,by=(bn.y-b.y)/bl,fx=ax+bx,fy=ay+by,fl=Math.hypot(fx,fy)||1;
          if((ax*bx+ay*by)>.65){
            // Bodies in the same moving block must not shove one another back
            // along the shared corridor. Open lateral lanes instead.
            const side=Math.min(dt*.7,amount),sideOffset=vx*(-fy/fl)+vy*(fx/fl),sign=sideOffset===0?((a.id*13+b.id*7)%2?1:-1):Math.sign(sideOffset);
            shift(a,-fy/fl*sign*side,fx/fl*sign*side);shift(b,fy/fl*sign*side,-fx/fl*sign*side);continue;
          }
        }
        const shareA=movingA&&!movingB ? .15 : movingB&&!movingA ? .85 : .5;
        shift(a, vx / d * amount*shareA, vy / d * amount*shareA); shift(b, -vx / d * amount*(1-shareA), -vy / d * amount*(1-shareA));
        // Head-on traffic can balance forward motion against separation
        // forever. A small deterministic side-step lets moving bodies pass,
        // while stationary formations retain their ground. The same blocked
        // edge checks apply, so this never phases through a wall or river.
        const side=Math.min(dt*.7,amount);
        if(movingA)shift(a,-vy/d*side,vx/d*side);
        if(movingB)shift(b,vy/d*side,-vx/d*side);
      }
    }
  }
}
