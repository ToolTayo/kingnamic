import { MAX_ARMY } from './config';
import { distance, key, tileAt } from './map';
import { findPath,nearestOpen,navigation } from './navigation';
import { army, hostiles } from './state';
import { illnessFor } from './disease';
import type { ArmyOrder, CommandResult, Point, State, Unit } from './types';
export const ORDER_NAMES:Record<ArmyOrder,string>={move:'Move',attack:'Attack',hunt:'Hunt',defend:'Defend',patrol:'Patrol',hold:'Defensive hold',retreat:'Retreat',regroup:'Regroup',escort:'Escort'};
export const SQUAD_COLORS=[0xe5cb84,0x92c6df,0xc4a5dc,0xa9d6a1,0xe6a085,0x93d3c6];
export const armyCapacity=(s:State):number=>Math.min(MAX_ARMY,s.buildings.filter(b=>b.kind==='barracks'&&b.owner!=='rival'&&b.progress===1&&b.hp>0).reduce((n,b)=>n+b.level*24,0)+(s.empire?armyCapacity(s.empire.reserve):0));
export const available=(s:State,u:Unit)=>u.hp>0&&!u.injury&&!(s.quarantine&&illnessFor(s,u.id));
export type FormationSlot=Point&{id:number;kind:Unit['kind'];rank:number;rear:boolean};
export function commandableIds(s:State, ids?:number[]):number[]{
  const selected=ids?new Set(ids):undefined,isolated=new Set(s.quarantine?s.infection.map(i=>i.personId):[]);
  return army(s).filter(u=>u.origin!=='battalion'&&u.hp>0&&!u.injury&&!isolated.has(u.id)&&(!selected||selected.has(u.id))).map(u=>u.id);
}
export const squadMembers=(s:State,id:number)=>army(s).filter(u=>u.squadId===id);
export function formationFacing(s:State,troops:Unit[],point:Point,heading?:Point):Point{
  if(heading&&Math.hypot(heading.x,heading.y)>.01){const length=Math.hypot(heading.x,heading.y);return{x:heading.x/length,y:heading.y/length};}
  const foe=hostiles(s).reduce<Unit|undefined>((a,b)=>!a||distance(b,point)<distance(a,point)?b:a,undefined);
  const center={x:troops.reduce((n,u)=>n+u.x,0)/Math.max(1,troops.length),y:troops.reduce((n,u)=>n+u.y,0)/Math.max(1,troops.length)};
  const facing=foe?{x:foe.x-point.x,y:foe.y-point.y}:{x:point.x-center.x,y:point.y-center.y},length=Math.hypot(facing.x,facing.y)||1;
  return{x:facing.x/length,y:facing.y/length};
}
function formationGeometry(troops:Pick<Unit,'id'|'kind'|'formation'>[],point:Point,formation:State['formation'],heading?:Point):FormationSlot[]{
  if(!troops.length)return[];
  // A formation has no shape with one member. Keep individual orders on the
  // exact commanded tile instead of offsetting a lone archer behind empty ranks.
  if(troops.length===1){const u=troops[0];return[{id:u.id,kind:u.kind,rank:0,rear:false,x:point.x,y:point.y}];}
  const melee=troops.filter(u=>u.kind==='warden'||u.kind==='spearman'),ranged=troops.filter(u=>u.kind==='ranger'||u.kind==='scout');
  const columns=formation==='column'?2:Math.min(18,Math.max(3,Math.ceil(Math.sqrt(troops.length*(formation==='line'?2.2:1.65)))));
  const acrossSpacing=formation==='loose'?1.4:formation==='column'?.72:1;
  const rankSpacing=formation==='column'?1.05:1.12;
  const front=heading??{x:0,y:1},length=Math.hypot(front.x,front.y)||1,dx=front.x/length,dy=front.y/length,side={x:-dy,y:dx};
  const meleeRows=Math.ceil(melee.length/columns),rangedStart=meleeRows+(formation==='protected'?3:1);
  const result:FormationSlot[]=[];
  const place=(group:typeof melee,startRank:number,rear:boolean)=>group.forEach((u,i)=>{
    const row=Math.floor(i/columns),width=Math.min(columns,group.length-row*columns),column=i%columns,across=(column-(width-1)/2)*acrossSpacing,rank=startRank+row;
    result.push({id:u.id,kind:u.kind,rank,rear,x:point.x+side.x*across-dx*rank*rankSpacing,y:point.y+side.y*across-dy*rank*rankSpacing});
  });
  if(formation==='column'){
    const ordered=[...melee,...ranged];
    place(ordered,0,false);
  }else{
    place(melee,0,false);place(ranged,rangedStart,true);
  }
  return result;
}
export function formationSlots(s:State,troops:Unit[],point:Point,heading?:Point):FormationSlot[]{
  return formationGeometry(troops,point,troops[0]?.formation??s.formation,heading);
}
export function assignDestinations(s:State,troops:Unit[],point:Point,order:ArmyOrder='move',focus?:number,heading?:Point):void{
  const nav=navigation(s),reserved=troops.length===1?new Set<number>():new Set(s.units.filter(u=>!troops.includes(u)).map(u=>key(u.target)));
  const direction=formationFacing(s,troops,point,heading);
  const center={x:troops.reduce((n,u)=>n+u.x,0)/troops.length,y:troops.reduce((n,u)=>n+u.y,0)/troops.length},origin=nearestOpen(s,center,new Set(),nav),rally=nearestOpen(s,point,new Set(),nav);
  const corridor=[origin,...findPath(s,origin,rally,false,nav)];if(key(corridor[corridor.length-1])!==key(rally))corridor.push(rally);
  const byId=new Map(troops.map(u=>[u.id,u]));
  for(const slot of formationSlots(s,troops,point,direction)){
    const u=byId.get(slot.id)!;
    u.target=nearestOpen(s,slot,reserved,nav);reserved.add(key(u.target));
    let closest=0,bestDistance=Infinity;for(let i=0;i<corridor.length;i++){const d=distance(u,corridor[i]);if(d<bestDistance){bestDistance=d;closest=i;}}
    delete u.muster;u.anchor={...u.target};u.path=corridor.slice(closest);u.path.push(u.target);u.repath=Math.min(120,(corridor.length+distance(u,u.target))/.7+2);u.order=order;u.focus=focus;
    if(order==='patrol')u.patrol={a:{x:u.x,y:u.y},b:{...u.target},leg:1};else delete u.patrol;
  }
}
export function orderArmy(s:State,ids:number[],order:ArmyOrder,p?:Point,focus?:number,heading?:Point):CommandResult{
  if(!ids.length||ids.length>MAX_ARMY||new Set(ids).size!==ids.length)return{ok:false,message:'Select one or more different soldiers.'};
  const troops=army(s).filter(u=>ids.includes(u.id)&&u.origin!=='battalion'&&available(s,u));
  if(troops.length!==ids.length)return{ok:false,message:'Some selected soldiers are dead, recovering, isolated, or not under your command.'};
  const target=focus===undefined?undefined:s.units.find(u=>u.id===focus&&u.hp>0),targetBuilding=focus===undefined?undefined:s.buildings.find(b=>b.id===focus&&b.owner==='rival'&&b.hp>0);
  if(order==='escort'&&(!target||!army(s).includes(target)||ids.includes(target.id)))return{ok:false,message:'Choose a different living ally to escort.'};
  if(order==='attack'&&focus!==undefined&&(!target||army(s).includes(target))&&!targetBuilding)return{ok:false,message:'Choose a living enemy or hostile stronghold structure.'};
  if(order==='hold'){for(const u of troops){delete u.muster;u.target={x:u.x,y:u.y};u.anchor={...u.target};u.order='hold';u.path=[];delete u.patrol;delete u.focus;}return{ok:true,message:`${troops.length} soldiers hold their ground.`};}
  if(order==='retreat')p=s.theatre?{x:10,y:16}:{x:14,y:15};
  if(order==='regroup')p={x:troops.reduce((n,u)=>n+u.x,0)/troops.length,y:troops.reduce((n,u)=>n+u.y,0)/troops.length};
  p??=target??targetBuilding??{x:troops[0].x,y:troops[0].y};
  const t=tileAt(Math.round(p.x),Math.round(p.y),s);if(!t||t.terrain==='water')return{ok:false,message:'Choose passable ground.'};
  assignDestinations(s,troops,p,order,focus,heading);return{ok:true,message:`${ORDER_NAMES[order]}: ${troops.length} soldiers received the order. Other soldiers retain their orders.`};
}
