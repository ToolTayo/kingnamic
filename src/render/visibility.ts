import type { Point } from '../game/types';

// Actor positions are rebuilt once per scene update and grouped by screen y.
// Occlusion only depends on actors inside a building or prop's vertical span.
export interface ActorVisibilityIndex { readonly byY: Point[] }
export function indexActorsByScreenY(actors: Point[]): ActorVisibilityIndex {
  return { byY: actors.slice().sort((a,b)=>a.y-b.y) };
}

// Screen-space occlusion, independent of camera zoom and rendering APIs.
export function obscuresActor(foot: Point, width: number, height: number, actors: ActorVisibilityIndex | Point[]): boolean {
  const byY=Array.isArray(actors)?actors:actors.byY;
  let lo=0,hi=byY.length;const lower=foot.y-height;
  // The original screen-space check uses a strict lower bound. Skip all actors
  // at or above it, then inspect only the narrow vertical band under this art.
  while(lo<hi){const mid=(lo+hi)>>>1;if(byY[mid].y<=lower)lo=mid+1;else hi=mid;}
  for(let i=lo;i<byY.length&&byY[i].y<foot.y+4;i++)if(Math.abs(byY[i].x-foot.x)<width)return true;
  return false;
}
