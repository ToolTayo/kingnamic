import { MAX_ARMY } from './config';
import { distance, key, tileAt } from './map';
import { nearestOpen, navigation } from './navigation';
import { army, hostiles } from './state';
import { illnessFor } from './disease';
import type { ArmyOrder, CommandResult, Point, State, Unit } from './types';
export const ORDER_NAMES:Record<ArmyOrder,string>={move:'Move',attack:'Attack',hunt:'Hunt',defend:'Defend',patrol:'Patrol',hold:'Hold',retreat:'Retreat',regroup:'Regroup',escort:'Escort'};
export const SQUAD_COLORS=[0xe5cb84,0x92c6df,0xc4a5dc,0xa9d6a1,0xe6a085,0x93d3c6];
export const armyCapacity=(s:State):number=>Math.min(MAX_ARMY,s.buildings.filter(b=>b.kind==='barracks'&&b.owner!=='rival'&&b.progress===1&&b.hp>0).reduce((n,b)=>n+b.level*24,0)+(s.empire?armyCapacity(s.empire.reserve):0));
export const available=(s:State,u:Unit)=>u.hp>0&&!u.injury&&!(s.quarantine&&illnessFor(s,u.id));
export function commandableIds(s:State, ids?:number[]):number[]{
  const selected=ids?new Set(ids):undefined,isolated=new Set(s.quarantine?s.infection.map(i=>i.personId):[]);
  return army(s).filter(u=>u.origin!=='battalion'&&u.hp>0&&!u.injury&&!isolated.has(u.id)&&(!selected||selected.has(u.id))).map(u=>u.id);
}
export const squadMembers=(s:State,id:number)=>army(s).filter(u=>u.squadId===id);
export function assignDestinations(s:State,troops:Unit[],point:Point,order:ArmyOrder='move',focus?:number):void{
  const nav=navigation(s),reserved=new Set(s.units.filter(u=>!troops.includes(u)).map(u=>key(u.target))),foe=hostiles(s).reduce<Unit|undefined>((a,b)=>!a||distance(b,point)<distance(a,point)?b:a,undefined);
  const center={x:troops.reduce((n,u)=>n+u.x,0)/troops.length,y:troops.reduce((n,u)=>n+u.y,0)/troops.length};
  const forward=foe?{x:foe.x-point.x,y:foe.y-point.y}:s.theatre?{x:point.x-center.x,y:point.y-center.y}:{x:0,y:1};
  const len=Math.hypot(forward.x,forward.y)||1,dx=forward.x/len,dy=forward.y/len;
  const melee=troops.filter(u=>u.kind==='warden'||u.kind==='spearman'),ranged=troops.filter(u=>u.kind==='ranger'||u.kind==='scout');
  const formation=troops[0]?.formation??s.formation,columns=formation==='column'?1:troops.length<=9?3:Math.min(12,Math.ceil(Math.sqrt(troops.length*1.4)));
  for(const[group,start]of [[melee,0],[ranged,Math.ceil(melee.length/columns)]] as const)group.forEach((u,i)=>{
    const style=u.formation??s.formation,spacing=style==='loose'?1.25:style==='column'?.72:.85,across=(i%columns-(Math.min(columns,group.length)-1)/2)*spacing,back=start+Math.floor(i/columns);
    u.target=nearestOpen(s,{x:point.x+dy*across-dx*back,y:point.y-dx*across-dy*back},reserved,nav);reserved.add(key(u.target));
    delete u.muster;u.anchor={...u.target};u.path=[];u.repath=0;u.order=order;u.focus=focus;
    if(order==='patrol')u.patrol={a:{x:u.x,y:u.y},b:{...u.target},leg:1};else delete u.patrol;
  });
}
export function orderArmy(s:State,ids:number[],order:ArmyOrder,p?:Point,focus?:number):CommandResult{
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
  assignDestinations(s,troops,p,order,focus);return{ok:true,message:`${ORDER_NAMES[order]}: ${troops.length} selected soldiers. Other squads keep their orders.`};
}
