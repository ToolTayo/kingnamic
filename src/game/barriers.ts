import type {Building,Point} from './types';
export const isBarrier=(b:Pick<Building,'kind'>)=>b.kind==='wall'||b.kind==='gate';
export const barrierIndex=(buildings:Building[])=>new Map(buildings.filter(b=>b.hp>0&&isBarrier(b)).map(b=>[b.y*30+b.x,b]));
export function barrierRotation(b:Building,index:Map<number,Building>):0|1 {
 if(b.rotation!==undefined)return b.rotation;
 return !index.has(b.y*30+b.x-1)&&!index.has(b.y*30+b.x+1)&&(index.has((b.y-1)*30+b.x)||index.has((b.y+1)*30+b.x))?1:0;
}
export function barrierMask(b:Building,index:Map<number,Building>):number {
 const axis=barrierRotation(b,index);if(b.kind==='gate')return axis?12:3;
 let mask=0;for(const [dx,dy,bit]of [[1,0,1],[-1,0,2],[0,1,4],[0,-1,8]]){const n=index.get((b.y+dy)*30+b.x+dx);if(n&&(n.kind!=='gate'||barrierRotation(n,index)===(dx?0:1)))mask|=bit;}
 return mask|| (axis?12:3);
}
// Two real grid axes. The square occupied cell remains solid to infected;
// an allied gate passage crosses the rail, never through its side posts.
export function gateEdge(b:Building,from:Point,to:Point,rotation:0|1):boolean {
 if(b.kind!=='gate')return true;
 return rotation===0?Math.round(from.x)===b.x&&Math.round(to.x)===b.x:Math.round(from.y)===b.y&&Math.round(to.y)===b.y;
}
