import {barrierIndex,barrierRotation,gateEdge} from './barriers';
import { MAP_H, MAP_W } from './config';
import { key, tileAt } from './map';
import type { Building, Point, State } from './types';
const COUNT=MAP_W*MAP_H, DIRS=[[1,0],[-1,0],[0,1],[0,-1]] as const;
export const NAV_FIELD_LIMIT=256;
interface Field { next: Int16Array; distance: Float64Array }
export type NavigationFaction='player'|'rival'|'infected';
export interface Navigation { buildings: (Building | undefined)[]; fields: Map<number,Field>; signature: string; region?:State['region']; rotations:Map<number,0|1> }
const caches=new WeakMap<State,Navigation>();
export const navigationMetrics={fieldsBuilt:0,pathQueries:0};
const CORNERS=[[-.12,-.12],[.12,-.12],[-.12,.12],[.12,.12]] as const;
// Route costs may include a siege target, but physical motion never does.
// Test the swept footprint, including fractional/crowd motion near corners.
function gatePassage(gate:Building,faction:NavigationFaction):boolean{return gate.kind==='gate'&&(faction==='rival'?gate.owner==='rival':faction==='player'?gate.owner!=='rival':false);}
export function movementBlocker(nav:Navigation,from:Point,to:Point,enemy:boolean,escapeOrigin=false,faction:NavigationFaction=enemy?'infected':'player'):Building|'terrain'|undefined {
  if(to.x<0||to.y<0||to.x>MAP_W-1||to.y>MAP_H-1)return 'terrain';
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)*8)),origin=key(from);
  const fromGate=nav.buildings[key(from)];if(!enemy&&fromGate?.hp&&gatePassage(fromGate,faction)&&!gateEdge(fromGate,from,to,nav.rotations.get(fromGate.id)??0))return fromGate;
  for(let i=1;i<=steps;i++)for(const [dx,dy]of CORNERS){
    const x=Math.round(from.x+(to.x-from.x)*i/steps+dx),y=Math.round(from.y+(to.y-from.y)*i/steps+dy),t=tileAt(x,y,nav);
    if(!t||t.terrain==='water')return 'terrain';
    const k=y*MAP_W+x,b=nav.buildings[k];
    if(b&&b.hp>0&&!(escapeOrigin&&k===origin)&&(b.kind!=='gate'||enemy||!gatePassage(b,faction)||!gateEdge(b,from,to,nav.rotations.get(b.id)??0)))return b;
  }
  return;
}
export function navigation(s: State): Navigation {
  const signature=(s.region??'home')+s.buildings.filter(b=>b.hp>0).map(b=>`${b.id}:${b.x}:${b.y}:${b.kind}:${b.owner??'neutral'}:${b.maxHp}:${b.rotation??'auto'}`).join('|');
  let nav=caches.get(s); if(nav?.signature===signature)return nav;
  nav={signature,region:s.region,buildings:Array(COUNT),fields:new Map(),rotations:new Map()};
  for(const b of s.buildings)if(b.hp>0)nav.buildings[key(b)]=b;
  const barriers=barrierIndex(s.buildings);for(const b of s.buildings)if(b.kind==='gate')nav.rotations.set(b.id,barrierRotation(b,barriers));
  caches.set(s,nav);return nav;
}
function flow(nav:Navigation,goal:number,enemy:boolean,faction:NavigationFaction):Field {
  const id=goal*6+Number(enemy)*3+({player:0,rival:1,infected:2}[faction]),known=nav.fields.get(id);if(known)return known;
  navigationMetrics.fieldsBuilt++;
  const next=new Int16Array(COUNT).fill(-1),dist=new Float64Array(COUNT).fill(Infinity);
  const nodes:number[]=[],scores:number[]=[];
  const push=(node:number,score:number)=>{let i=nodes.length;nodes.push(node);scores.push(score);while(i>0){const p=(i-1)>>1;if(scores[p]<score||scores[p]===score&&nodes[p]<=node)break;nodes[i]=nodes[p];scores[i]=scores[p];i=p;}nodes[i]=node;scores[i]=score;};
  const pop=()=>{const n=nodes[0],score=scores[0],last=nodes.pop()!,v=scores.pop()!;if(nodes.length){let i=0;while(i*2+1<nodes.length){let c=i*2+1;if(c+1<nodes.length&&(scores[c+1]<scores[c]||scores[c+1]===scores[c]&&nodes[c+1]<nodes[c]))c++;if(scores[c]>v||scores[c]===v&&nodes[c]>=last)break;nodes[i]=nodes[c];scores[i]=scores[c];i=c;}nodes[i]=last;scores[i]=v;}return {n,score};};
  // Hostiles may plan through a blocking building as a breach route; the
  // swept movement check still stops them at its footprint and combat damages
  // it. Treating it as unreachable made intact gates permanently invulnerable.
  const pass=(k:number)=>{const t=tileAt(k%MAP_W,Math.floor(k/MAP_W),nav),b=nav.buildings[k];return !!t&&t.terrain!=='water'&&(enemy||!b||gatePassage(b,faction));};
  if(pass(goal)){dist[goal]=0;push(goal,0);}
  while(nodes.length){const {n,score}=pop();if(score!==dist[n])continue;
    const t=tileAt(n%MAP_W,Math.floor(n/MAP_W),nav)!,b=nav.buildings[n];
    const cost=(t.terrain==='marsh'?1.7:t.terrain==='forest'?1.2:1)+(b&&enemy?3+b.maxHp/65:0);
    for(const[dx,dy]of DIRS){const x=n%MAP_W+dx,y=Math.floor(n/MAP_W)+dy;if(x<0||y<0||x>=MAP_W||y>=MAP_H)continue;const k=y*MAP_W+x;if(!pass(k))continue;const a={x,y},z={x:n%MAP_W,y:Math.floor(n/MAP_W)};if(!enemy&&[nav.buildings[k],nav.buildings[n]].some(g=>g?.kind==='gate'&&gatePassage(g,faction)&&!gateEdge(g,a,z,nav.rotations.get(g.id)??0)))continue;const d=score+cost;if(d<dist[k]){dist[k]=d;next[k]=n;push(k,d);}}
  }
  const field={next,distance:dist};if(nav.fields.size>=NAV_FIELD_LIMIT)nav.fields.delete(nav.fields.keys().next().value!);nav.fields.set(id,field);return field;
}
// Reverse fields are shared by units with the same destination. Cache warmth
// only changes computation cost; cold reloads reproduce the same decisions.
export function findPath(s: State,from: Point,to: Point,enemy=false,nav=navigation(s),faction:NavigationFaction=enemy?'infected':'player'):Point[]{
  navigationMetrics.pathQueries++;const start=key(from),goal=key(to);
  if(start===goal||start<0||goal<0||start>=COUNT||goal>=COUNT)return[];
  const field=flow(nav,goal,enemy,faction),path:Point[]=[];let k=start;
  if(!Number.isFinite(field.distance[k])) {
    // A new construction footprint or a legacy save may enclose the starting
    // tile. Walk to an adjacent reachable tile; never teleport to the goal.
    let best=-1,bestCost=Infinity;
    for(const [dx,dy]of DIRS){const x=k%MAP_W+dx,y=Math.floor(k/MAP_W)+dy,n=y*MAP_W+x;if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&field.distance[n]<bestCost){best=n;bestCost=field.distance[n];}}
    if(best<0)return[];k=best;path.push({x:k%MAP_W,y:Math.floor(k/MAP_W)});
  }
  for(let n=0;n<COUNT&&k!==goal;n++){k=field.next[k];if(k<0)return[];path.push({x:k%MAP_W,y:Math.floor(k/MAP_W)});}return path;
}
export function nearestOpen(s: State,point: Point,reserved=new Set<number>(),nav=navigation(s),faction:NavigationFaction='player'):Point{
  const cx=Math.max(0,Math.min(MAP_W-1,Math.round(point.x))),cy=Math.max(0,Math.min(MAP_H-1,Math.round(point.y)));
  for(let r=0;r<Math.max(MAP_W,MAP_H);r++){
    let best:Point|undefined,bestD=Infinity;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(r&&Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;
      const x=cx+dx,y=cy+dy,t=tileAt(x,y,nav),k=y*MAP_W+x,b=nav.buildings[k];
      if(!t||t.terrain==='water'||reserved.has(k)||b&&!gatePassage(b,faction))continue;
      const d=(x-point.x)**2+(y-point.y)**2;if(d<bestD){best={x,y};bestD=d;}
    }if(best)return best;
  }return{x:cx,y:cy};
}
export function clearMelee(s:State,from:Point,to:Point,nav=navigation(s)):boolean{
  const steps=Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)*8);
  for(let i=1;i<steps;i++){const x=Math.round(from.x+(to.x-from.x)*i/steps),y=Math.round(from.y+(to.y-from.y)*i/steps);if(nav.buildings[y*MAP_W+x])return false;}return true;
}
