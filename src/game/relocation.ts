import {MAP_W} from './config';
import {key,tileAt,distance} from './map';
import {hostiles} from './state';
import {barrierIndex,barrierRotation,gateEdge,isBarrier} from './barriers';
import type {Building,BuildingKind,Point,State} from './types';
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]] as const;
const previews=new WeakMap<State,{signature:string;before:Set<number>;candidate:string;after:Set<number>}>();
function reachable(s:State,buildings:Building[]):Set<number>{
 const blocked=new Map(buildings.filter(b=>b.hp>0).map(b=>[key(b),b])),barriers=barrierIndex(buildings),seen=new Set<number>(),queue:Point[]=[{x:14,y:24}];seen.add(key(queue[0]));
 for(let i=0;i<queue.length;i++){const p=queue[i];for(const[dx,dy]of DIRS){const q={x:p.x+dx,y:p.y+dy},t=tileAt(q.x,q.y,s),n=key(q),a=blocked.get(key(p)),b=blocked.get(n);if(!t||t.terrain==='water'||seen.has(n)||b&&b.kind!=='gate')continue;if([a,b].some(g=>g?.kind==='gate'&&!gateEdge(g,p,q,barrierRotation(g,barriers))))continue;seen.add(n);queue.push(q);}}
 return seen;
}
export function relocationError(s:State,id:number,x:number,y:number,rotation?:0|1):string|null{
 const b=s.buildings.find(b=>b.id===id);if(!b||b.hp<=0)return 'That building no longer exists.';
 if(s.theatre||s.expedition)return 'Return from the expedition before editing buildings.';
 if(s.outcome!=='playing')return 'Continue the watch before editing the settlement.';
 if(hostiles(s).length||s.waveRemaining||s.march?.warning)return 'Clear the current attack before rearranging buildings.';
 if(rotation!==undefined&&(![0,1].includes(rotation)||!isBarrier(b)))return 'Only palisades and gates support the two grid orientations.';
 const t=tileAt(x,y,s);if(!t||!Number.isInteger(x)||!Number.isInteger(y))return 'Choose a tile inside this region.';
 if(x===b.x&&y===b.y&&(rotation===undefined||rotation===b.rotation))return null;
 if(s.region&&!s.march?.secured)return 'Secure and found the outpost before editing.';
 if(t.territory==='wild'||!s.owned.includes(t.territory))return 'Choose land you already control.';
 if(t.terrain==='water'||t.terrain==='rock'||t.terrain==='forest')return 'Choose open ground, away from water, bedrock and dense forest.';
 if(distance({x,y},{x:14,y:24})<1.5)return 'Keep the travel banners clear.';
 if(t.terrain==='road'&&b.kind!=='gate'&&(x!==b.x||y!==b.y))return 'Keep roads open; a correctly aligned gate may cross them.';
 if(s.buildings.some(v=>v.id!==id&&v.x===x&&v.y===y))return 'There is already a building here.';
 if([...s.units,...(s.residents??[])].some(u=>distance(u,{x,y})<.8))return 'Wait for people and soldiers to leave this footprint.';
 const candidate={...b,x,y,rotation:rotation??b.rotation};
 return layoutAccessError(s,candidate,s.buildings.map(v=>v.id===id?candidate:v));
}
export function placementAccessError(s:State,kind:BuildingKind,x:number,y:number,rotation?:0|1):string|null{
 const candidate:Building={id:-1,kind,x,y,rotation,hp:1,maxHp:1,level:1,progress:0,cooldown:0};
 return layoutAccessError(s,candidate,[...s.buildings,candidate]);
}
function layoutAccessError(s:State,candidate:Building,next:Building[]):string|null{
 const signature=(s.region??'home')+s.buildings.map(v=>[v.id,v.x,v.y,v.kind,v.rotation??'auto',v.hp>0].join(':')).join('|'),candidateKey=[candidate.id,candidate.kind,candidate.x,candidate.y,candidate.rotation??'auto'].join(':');
 let cached=previews.get(s);if(!cached||cached.signature!==signature){cached={signature,before:reachable(s,s.buildings),candidate:'',after:new Set()};previews.set(s,cached);}if(cached.candidate!==candidateKey){cached.after=reachable(s,next);cached.candidate=candidateKey;}const {before,after}=cached;
 const door=(v:Building,area:Set<number>)=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>area.has(key({x:v.x+dx,y:v.y+dy})));
 if(next.some((v,i)=>!isBarrier(v)&&(v.id===candidate.id||door(s.buildings[i],before))&&!door(v,after)))return 'Keep a doorway connected to the road; use an aligned gate through walls.';
 if([...s.units,...(s.residents??[])].some(u=>before.has(key(u))&&!after.has(key(u))))return 'This move would trap someone. Leave an accessible route.';
 for(const k of before)if(tileAt(k%MAP_W,Math.floor(k/MAP_W),s)?.terrain==='road'&&!after.has(k))return 'This would cut a road. Leave a connected passage.';
 return null;
}
export function relocate(s:State,id:number,x:number,y:number,rotation?:0|1):void{
 const b=s.buildings.find(b=>b.id===id)!;b.x=x;b.y=y;if(rotation!==undefined)b.rotation=rotation;
 for(const u of s.units){u.path=[];u.repath=0;}
 for(const r of s.residents??[]){r.path=[];r.wait=0;r.retry=0;}
}
