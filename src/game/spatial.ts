import type { Point } from './types';
// Rebuilt once per simulation step. Queries only inspect intersecting cells;
// callers select their best candidate without allocating or sorting lists.
export class SpatialGrid<T extends Point> {
  private cells = new Map<number, T[]>();
  constructor(items: readonly T[], private size = 3) {
    for (const item of items) { const k = this.key(item.x, item.y), bucket = this.cells.get(k); if (bucket) bucket.push(item); else this.cells.set(k, [item]); }
  }
  private key(x: number, y: number): number { return Math.floor(y / this.size) * 64 + Math.floor(x / this.size); }
  visit(p: Point, radius: number, fn: (item: T, d2: number) => void): void {
    const r2 = radius * radius;
    for (let y = Math.floor((p.y - radius) / this.size); y <= Math.floor((p.y + radius) / this.size); y++) for (let x = Math.floor((p.x - radius) / this.size); x <= Math.floor((p.x + radius) / this.size); x++) {
      const bucket = this.cells.get(y * 64 + x); if (!bucket) continue;
      for (const item of bucket) { const d2 = (p.x - item.x) ** 2 + (p.y - item.y) ** 2; if (d2 <= r2) fn(item, d2); }
    }
  }
  nearest(p: Point, radius: number, accept: (item: T) => boolean = () => true): T | undefined {
    let best: T | undefined, limit = radius * radius;
    this.visit(p, radius, (item, d2) => { if (d2 < limit && accept(item)) { best = item; limit = d2; } }); return best;
  }
}
