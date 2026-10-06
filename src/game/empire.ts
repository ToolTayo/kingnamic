import {army,enemies,log,makeBuilding,makeUnit,newGame} from './state';
import {distance,key,tileAt} from './map';
import {nearestOpen} from './navigation';
import {illnessFor,recordDeath,resolveResidentDeaths} from './disease';
import {assignResidentJobs,removeResident} from './population';
import {rebalanceJobs} from './economy';
import {credit} from './treasury';
import type {BuildingKind,CommandResult,State} from './types';
export const ROAD_EXIT={x:14,y:24};
export const LANDMARKS=[{id:'village',name:'Briar village',x:14,y:11},{id:'grove',name:'The timber grove',x:5,y:14},{id:'ruins',name:'The old watch',x:22,y:8}];
export const empireArmy=(s:State)=>army(s).length+(s.empire?army(s.empire.reserve).length:0);
export function createMarch(s:State):State{
  const w=newGame(s.seed);w.region='march';w.march={seen:[],secured:false,rewarded:false,incursion:0,warning:0};
  w.units=[];w.buildings=[];w.residents=[];w.population=0;w.infection=[];w.corpses=[];w.logs=[];w.effects=[];w.completed=[];
  w.jobs={farmers:0,woodcutters:0,miners:0,builders:0,healers:0};w.nextId=s.nextId;w.resources=s.resources;w.squads=s.squads;w.speed=0;
  for(const [x,y]of [[12,10],[16,10],[21,7]]){const b=makeBuilding(w,'cottage',x,y,true);b.hp=60;}
  for(const [kind,x,y]of [['hollow',14,17],['hollow',15,16],['runner',12,12],['hollow',16,12],['hollow',5,13],['hollow',6,15],['brute',21,9],['runner',23,10]] as const){const u=makeUnit(w,kind,x,y);u.order='defend';u.anchor={x,y};}
  return w;
}
export function gatherCompany(s:State,ids:number[]):CommandResult{
  const hero=army(s).find(u=>u.id===s.commander?.id);if(!hero||s.expedition)return {ok:false,message:'Appoint an available commander first.'};
  const chosen=new Set([...ids,hero.id]),party=[hero,...army(s).filter(u=>u!==hero&&chosen.has(u.id))];
  if(party.length!==chosen.size||party.some(u=>u.injury||illnessFor(s,u.id)))return {ok:false,message:'Choose fit, uninfected soldiers for this company.'};
  const reserved=new Set(s.units.filter(u=>!chosen.has(u.id)).map(key));
  for(const u of party){const p=nearestOpen(s,ROAD_EXIT,reserved);reserved.add(key(p));u.target={...p};u.anchor={...p};u.path=[];u.repath=0;u.order='move';u.muster=true;delete u.patrol;delete u.focus;}
  return {ok:true,message:'The commander leads the convoy to the road. Each companion walks to a separate gathering position.'};
}
export function travelError(s:State,ids:number[]):string|null{
  if(s.expedition)return 'Return from the Broken Standard before travelling.';
  const hero=army(s).find(u=>u.id===s.commander?.id);
  if(!hero)return 'Appoint a living commander in Empire first.';
  if(s.outcome==='won')return 'Continue the watch in Army before exploring beyond the kingdom.';
  if(s.outcome==='lost')return 'The original Hearth must survive.';
  if(hero.injury||illnessFor(s,hero.id))return 'Treat and rest the commander before travelling.';
  if(distance(hero,ROAD_EXIT)>2)return 'Lead the commander to the southern road banners.';
  if(new Set(ids).size!==ids.length)return 'Choose each traveller once.';
  const chosen=new Set([...ids,hero.id]),party=army(s).filter(u=>chosen.has(u.id));
  if(party.length!==chosen.size)return 'Choose living soldiers in this region.';
  if(party.some(u=>u.injury||illnessFor(s,u.id)))return 'Travellers must be fit and uninfected.';
  if(party.some(u=>distance(u,ROAD_EXIT)>6&&!(u.muster&&distance(u,u.target)<.8&&distance(u.target,ROAD_EXIT)<20)))return 'Gather every selected traveller at the road; large companies must reach their assigned convoy positions.';
  if(s.waveRemaining||(s.march?.warning??0)>0||enemies(s).some(z=>party.some(u=>distance(u,z)<5)))return 'Clear nearby threats and incoming reinforcements before travelling.';
  return null;
}
export function travel(s:State,ids:number[]):CommandResult{
  const error=travelError(s,ids);if(error)return {ok:false,message:error};
  return exchangeRegions(s,ids);
}
export function returnToHomeWatch(s:State):CommandResult{
  if(!s.region||!s.empire||army(s).length)return {ok:false,message:'Living soldiers must gather and travel with a commander.'};
  exchangeRegions(s,[]);log(s,'The company was lost. Command resumes at Hearthmere; the fallen stay dead and Briar March retains its threats and damage.','warn');
  return {ok:true,message:'You returned to the home watch. Recruit or appoint a survivor before another journey.'};
}
function exchangeRegions(s:State,ids:number[]):CommandResult{
  const selected=new Set([...ids,...(s.commander?[s.commander.id]:[])]),party=army(s).filter(u=>selected.has(u.id));
  const destination=s.empire?.reserve??createMarch(s),elapsed=s.empire?.elapsed??0,resources=s.resources,commander=s.commander,squads=s.squads,lostBattalions=s.lostBattalions,bountyPaid=s.bountyPaid,bountyTotal=s.bountyTotal;
  const nextId=Math.max(s.nextId,destination.nextId);
  const parked={...s,units:s.units.filter(u=>!selected.has(u.id)),effects:[],speed:0 as const};delete parked.empire;delete parked.commander;delete parked.lostBattalions;
  for(const k of Object.keys(s))delete (s as unknown as Record<string,unknown>)[k];
  Object.assign(s,destination,{resources,commander,squads,lostBattalions,bountyPaid,bountyTotal,nextId,speed:0,lastSpeed:1,empire:{reserve:parked,elapsed}});
  parked.resources=resources;parked.squads=squads;parked.nextId=nextId;
  const reserved=new Set([...s.units,...(s.residents??[])].map(key));
  for(const u of party){const p=nearestOpen(s,ROAD_EXIT,reserved);reserved.add(key(p));Object.assign(u,p,{target:{...p},anchor:{...p},path:[],repath:0,order:'hold'});delete u.patrol;delete u.focus;delete u.muster;s.units.push(u);}
  log(s,s.region?'You reached Briar March. Explore the three landmarks, clear the infected and establish an outpost.':'The company returned to Hearthmere. Its defenders and buildings remain in place.','good');
  return {ok:true,message:`${party.length} travellers arrived. Other soldiers stayed at their posts. Time is paused.`};
}
export function outpostError(s:State,x:number,y:number):string|null{
  if(!s.region||!s.march||s.march.secured)return 'The Last Hearth cannot be replaced.';
  const hero=army(s).find(u=>u.id===s.commander?.id);
  if(!hero||distance(hero,{x,y})>5)return 'Bring the commander within five tiles of this site.';
  if(enemies(s).length||s.corpses?.some(c=>c.tainted))return 'Clear the region and its tainted remains before founding.';
  if(army(s).filter(u=>!u.injury&&!illnessFor(s,u.id)).length<2)return 'Two fit soldiers must establish the defensive presence.';
  const home=s.empire?.reserve;
  if(!home)return 'The home settlement must supply the founding crew.';
  assignResidentJobs(home);
  if((home.residents??[]).filter(r=>r.job==='idle'&&!illnessFor(home,r.id)&&r.hp>=r.maxHp*.7).length<2)return 'Leave two fit, unassigned residents at home for the founding crew.';
  if(s.resources.wood<80||s.resources.stone<40)return 'An outpost costs 80 Timber and 40 Crowns.';
  return null;
}
export function foundOutpost(s:State,x:number,y:number):void{
  s.resources.wood-=80;s.resources.stone-=40;
  const b=makeBuilding(s,'hearth',x,y,true);b.hp=b.maxHp=800;s.march!.secured=true;
  const home=s.empire!.reserve,crew=home.residents!.filter(r=>r.job==='idle'&&!illnessFor(home,r.id)&&r.hp>=r.maxHp*.7).slice(0,2);
  const reserved=new Set(s.units.map(key));for(const person of crew){removeResident(home,person.id);const p=nearestOpen(s,{x,y:y+1},reserved);reserved.add(key(p));Object.assign(person,p,{job:'builders',path:[],goal:{...p},wait:0,activity:'work'});s.residents!.push(person);}
  s.population=s.residents!.length;s.jobs.builders+=crew.length;home.nextId=s.nextId;
  if(!s.march!.rewarded){s.march!.rewarded=true;credit(s,'wood',60);credit(s,'stone',20);log(s,'The recovered stores yield 60 Timber and 20 Crowns. Two home residents now build here.','good');}
}
// One bounded flood per placement checks every working doorway and the exit.
export function accessError(s:State,x:number,y:number,kind:BuildingKind):string|null{
  if(distance({x,y},ROAD_EXIT)<1.5)return 'Keep the southern road banners clear for travelling companies.';
  const buildings=[...s.buildings,{kind,x,y}],blocked=new Set(buildings.filter(b=>b.kind!=='gate').map(key));
  const seen=new Set<number>(),queue=[ROAD_EXIT];seen.add(key(ROAD_EXIT));
  for(let n=0;n<queue.length;n++){const p=queue[n];for(const q of [{x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1}]){const t=tileAt(q.x,q.y,s),k=key(q);if(t&&t.terrain!=='water'&&!blocked.has(k)&&!seen.has(k)){seen.add(k);queue.push(q);}}}
  return buildings.filter(b=>!['wall','gate'].includes(b.kind)).every(b=>[{x:b.x+1,y:b.y},{x:b.x-1,y:b.y},{x:b.x,y:b.y+1},{x:b.x,y:b.y-1}].some(p=>seen.has(key(p))))?null:'Keep a passable doorway from each building to the southern road; include gates in enclosed walls.';
}
export function empireStep(s:State,dt:number):void{
  if(s.empire){
    const e=s.empire,old=e.elapsed;e.elapsed+=dt;e.reserve.resources=s.resources;e.reserve.squads=s.squads;
    if(Math.floor(old/110)!==Math.floor(e.elapsed/110))s.bountyPaid=0;
    // Economy rates include both populations; unvisited encounters/illness hold.
    if(Math.floor(old/12)!==Math.floor(e.elapsed/12)&&s.resources.food<1){
      const parked=e.reserve;parked.nextId=s.nextId;for(const u of army(parked)){u.hp-=6;if(u.hp<=0){recordDeath(parked,u);parked.stats.lost++;}}
      parked.units=parked.units.filter(u=>u.hp>0);if(parked.residents?.length){parked.residents.at(-1)!.hp=0;resolveResidentDeaths(parked);}rebalanceJobs(parked);
      s.nextId=Math.max(s.nextId,parked.nextId);log(s,'Rations are exhausted in the other settlement. Its people need food.','danger');
    }
    e.reserve.nextId=s.nextId;
  }
  const m=s.march;if(!s.region||!m)return;
  const hero=army(s).find(u=>u.id===s.commander?.id);
  if(hero)for(const site of LANDMARKS)if(!m.seen.includes(site.id)&&distance(hero,site)<5){m.seen.push(site.id);log(s,`${site.name} discovered. No map purchase is needed.`,'good');}
  if(m.secured&&!s.buildings.some(b=>b.kind==='hearth')){m.secured=false;log(s,'The outpost beacon fell. Clear the land and re-establish your position.','danger');}
  if(!m.secured)return;
  m.incursion+=dt;
  if(m.incursion>=90&&!m.warning&&!enemies(s).length){m.warning=8;log(s,'Scouts warn: an infected band approaches the eastern old watch in 8 seconds.','danger');}
  else if(m.warning){m.warning=Math.max(0,m.warning-dt);if(!m.warning){m.incursion=0;const count=Math.min(18,4+Math.floor(army(s).length/15)),reserved=new Set(s.units.map(key));for(let n=0;n<count;n++){const p=nearestOpen(s,{x:27,y:8+n%4},reserved);reserved.add(key(p));makeUnit(s,n%4===0?'runner':'hollow',p.x,p.y);}}}
}
