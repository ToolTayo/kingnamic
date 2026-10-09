import {army,enemies,hostiles,log,makeBuilding,makeUnit,newGame,rivalIdOf,rivalStronghold,rivals} from './state';
import {distance,key,STRONGHOLD_CENTERS,tileAt} from './map';
import {nearestOpen} from './navigation';
import {illnessFor,recordDeath,resolveResidentDeaths} from './disease';
import {addResidents,assignResidentJobs,removeResident} from './population';
import {rebalanceJobs} from './economy';
import {credit} from './treasury';
import {MAP_W,MAX_UNITS} from './config';
import {wildernessStep} from './wilderness';
import type {BuildingKind,CommandResult,Resource,Resources,RivalStronghold,State,StrongholdId,UnitKind} from './types';
export const ROAD_EXIT={x:14,y:24};
export interface Landmark {id:string;name:string;x:number;y:number;art:'village'|'grove'|'ruin'|'ford'|'shrine'|'homestead'|'camp'|'watch'|'keep'|'quarry'|'cairn';reward:Partial<Resources>;hostiles?:UnitKind[];survivors?:number}
export const STRONGHOLDS={
 mossgate:{id:'mossgate',name:'Mossgate',faction:'The Gloamward',center:STRONGHOLD_CENTERS.mossgate,total:100,initialGarrison:20},
 tallowmere:{id:'tallowmere',name:'Tallowmere',faction:'The Weirward Compact',center:STRONGHOLD_CENTERS.tallowmere,total:150,initialGarrison:30},
 stonewake:{id:'stonewake',name:'Stonewake',faction:'The Stonewake Hold',center:STRONGHOLD_CENTERS.stonewake,total:125,initialGarrison:25},
 alderwatch:{id:'alderwatch',name:'Alderwatch',faction:'The Abbey Wardens',center:STRONGHOLD_CENTERS.alderwatch,total:160,initialGarrison:32},
 redwater:{id:'redwater',name:'Redwater Reach',faction:'The Redwater Watch',center:STRONGHOLD_CENTERS.redwater,total:160,initialGarrison:40},
} as const satisfies Record<StrongholdId,{id:StrongholdId;name:string;faction:string;center:{x:number;y:number};total:number;initialGarrison:number}>;
export const REDWATER_CAMPS=[{name:'Westcut',x:31.5,y:20.5},{name:'High Heath',x:40.5,y:13.5},{name:'East Ravine',x:45.5,y:22.5}] as const;
export function ensureStronghold(s:State,id:StrongholdId):RivalStronghold{
 const known=rivalStronghold(s,id);if(known)return known;
 const info=STRONGHOLDS[id],w:RivalStronghold={id,name:info.name,faction:info.faction,status:'unseen',remaining:info.total,reserve:info.total-info.initialGarrison,casualties:0,warning:0,patrolVariant:((s.seed>>>4)%3) as 0|1|2};
  if(id==='mossgate')s.march!.rival=w;else if(id==='tallowmere')s.march!.weirward=w;else if(id==='stonewake')s.march!.stonewake=w;else if(id==='alderwatch')s.march!.alderwatch=w;else s.march!.redwater=w;return w;
}
export const LANDMARKS:Landmark[]=[
 {id:'village',name:'Briar village',x:14,y:11,art:'village',reward:{food:18}},
 {id:'grove',name:'The timber grove',x:5,y:14,art:'grove',reward:{wood:22}},
 {id:'ruins',name:'The old watch',x:22,y:8,art:'ruin',reward:{stone:8}},
 {id:'splitford',name:'Splitwater Ford',x:33,y:24,art:'ford',reward:{food:16},hostiles:['hollow','hollow','runner']},
 {id:'pilgrim-shrine',name:'Saint Orla’s shrine',x:39,y:8,art:'shrine',reward:{herbs:7},hostiles:['hollow','hollow','hollow','runner']},
 {id:'mossgate',name:'Mossgate hamlet',x:47,y:29,art:'village',reward:{wood:16},hostiles:['hollow','runner','hollow','runner'],survivors:3},
 {id:'bogstead',name:'The peat-cutters’ stead',x:16,y:39,art:'homestead',reward:{food:20,herbs:4},hostiles:['hollow','hollow','runner']},
 {id:'wayfarer-camp',name:'The wayfarers’ camp',x:28,y:44,art:'camp',reward:{food:12},hostiles:['hollow','hollow','runner'],survivors:2},
 {id:'saltwick-causeway',name:'Saltwick Causeway',x:29,y:39,art:'ford',reward:{food:16,stone:10}},
 {id:'tallowmere',name:'Tallowmere Hall',x:37,y:36,art:'keep',reward:{wood:12,stone:12}},
 {id:'northwatch',name:'Northwatch bell tower',x:52,y:35,art:'watch',reward:{stone:12},hostiles:['hollow','hollow','runner','brute']},
 {id:'stonewake-quarry',name:'Greybank quarry road',x:45,y:12,art:'quarry',reward:{wood:14,stone:16},hostiles:['hollow','runner','hollow','hollow']},
 {id:'abbey-road',name:'The abbey road',x:8,y:35,art:'shrine',reward:{food:12,herbs:3}},
 {id:'redwater-cairn',name:'Redwater cairn',x:35,y:14,art:'cairn',reward:{wood:14,stone:9},hostiles:['hollow','runner']},
];
export const empireArmy=(s:State)=>army(s).length+(s.empire?army(s.empire.reserve).length:0);
export function createMarch(s:State):State{
  const w=newGame(s.seed);w.region='march';w.march={seen:[],rescued:[],rumors:[],secured:false,rewarded:false,incursion:0,warning:0,roadAmbushes:[],rival:{id:'mossgate',name:'Mossgate',faction:'The Gloamward',status:'unseen',remaining:100,reserve:80,casualties:0,warning:0},weirward:{id:'tallowmere',name:'Tallowmere',faction:'The Weirward Compact',status:'unseen',remaining:150,reserve:120,casualties:0,warning:0,patrolVariant:((s.seed>>>4)%3) as 0|1|2},stonewake:{id:'stonewake',name:'Stonewake',faction:'The Stonewake Hold',status:'unseen',remaining:125,reserve:100,casualties:0,warning:0,patrolVariant:((s.seed>>>7)%3) as 0|1|2},alderwatch:{id:'alderwatch',name:'Alderwatch',faction:'The Abbey Wardens',status:'unseen',remaining:160,reserve:128,casualties:0,warning:0,patrolVariant:((s.seed>>>11)%3) as 0|1|2},redwater:{id:'redwater',name:'Redwater Reach',faction:'The Redwater Watch',status:'unseen',remaining:160,reserve:120,casualties:0,warning:0,campsCleared:0,patrolVariant:((s.seed>>>10)%3) as 0|1|2}};
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
  if(s.waveRemaining||(s.march?.warning??0)>0||hostiles(s).some(z=>party.some(u=>distance(u,z)<5)))return 'Clear nearby threats and incoming reinforcements before travelling.';
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
  log(s,s.region?'Explore Briar March, follow its roads, discover new places and clear infected sites.':'The company returned to Hearthmere. Its defenders and buildings remain in place.','good');
  return {ok:true,message:`${party.length} travellers arrived. Other soldiers stayed at their posts. Time is paused.`};
}
export function outpostError(s:State,x:number,y:number):string|null{
  if(!s.region||!s.march)return 'Outposts can only be founded on frontier ground.';
  const hero=army(s).find(u=>u.id===s.commander?.id);
  if(!hero||distance(hero,{x,y})>5)return 'Bring the commander within five tiles of this site.';
  const established=s.march.secured&&s.buildings.some(b=>b.kind==='hearth');
  if(s.buildings.some(b=>b.kind==='hearth'&&distance(b,{x,y})<12))return 'Choose open ground at least twelve tiles from another settlement.';
  if(!established&&(hostiles(s).some(z=>distance(z,{x,y})<7)||s.corpses?.some(c=>c.tainted&&distance(c,{x,y})<7)))return 'Clear infected and tainted remains within seven tiles of this settlement site.';
  if(established&&(hostiles(s).some(z=>distance(z,{x,y})<7)||s.corpses?.some(c=>c.tainted&&distance(c,{x,y})<7)))return 'Clear the infected around this site before founding.';
  const fit=army(s).filter(u=>!u.injury&&!illnessFor(s,u.id));
  if(established?fit.filter(u=>distance(u,{x,y})<7).length<2:fit.length<2)return 'Bring two fit soldiers to establish the defensive presence.';
  const home=s.empire?.reserve;
  if(!home)return 'The home settlement must supply the founding crew.';
  assignResidentJobs(home);
  if((home.residents??[]).filter(r=>r.job==='idle'&&!illnessFor(home,r.id)&&r.hp>=r.maxHp*.7).length<2)return 'Leave two fit, unassigned residents at home for the founding crew.';
  if(s.resources.wood<80||s.resources.stone<40)return 'An outpost costs 80 Timber and 40 Crowns.';
  return null;
}
export function foundOutpost(s:State,x:number,y:number):void{
  s.resources.wood-=80;s.resources.stone-=40;
  const n=s.buildings.filter(b=>b.kind==='hearth').length+1,b=makeBuilding(s,'hearth',x,y,true);b.hp=b.maxHp=800;b.name=n===1?'Briar Outpost':`Frontier ${n}`;s.march!.secured=true;
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
function stronghold(s:State,id:StrongholdId='mossgate'):RivalStronghold {return ensureStronghold(s,id);}
const MOSS=STRONGHOLDS.mossgate.center,TALLOWMERE=STRONGHOLDS.tallowmere.center,STONEWAKE=STRONGHOLDS.stonewake.center,ALDERWATCH=STRONGHOLDS.alderwatch.center;
function deployRivals(s:State,war:RivalStronghold,count:number,startAt?:number):number{
  const roster:UnitKind[]=war.id==='mossgate'?['warden','warden','warden','warden','spearman','spearman','ranger','ranger','scout']:war.id==='stonewake'?['spearman','spearman','spearman','ranger','ranger','scout','warden','scout','spearman','ranger']:war.id==='alderwatch'?['warden','spearman','spearman','warden','ranger','spearman','ranger','scout','warden','spearman','ranger','scout']:war.id==='redwater'?['spearman','spearman','spearman','spearman','warden','spearman','warden','ranger','scout','spearman']:['spearman','spearman','spearman','spearman','warden','warden','warden','ranger','ranger','scout'];
  const deployedBefore=startAt??war.remaining+war.casualties-war.reserve;
  const makeYard=(x1:number,x2:number,y1:number,y2:number)=>{const points:{x:number;y:number}[]=[];for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(tileAt(x,y,s)&&!s.buildings.some(b=>b.hp>0&&b.x===x&&b.y===y))points.push({x,y});return points;};
  const yards=war.id==='redwater'?[makeYard(30,33,19,22),makeYard(39,42,12,15),makeYard(44,47,21,24),makeYard(34,38,18,24)]:[war.id==='mossgate'?makeYard(45,49,26,32):war.id==='tallowmere'?makeYard(34,40,33,39):war.id==='alderwatch'?makeYard(7,14,39,45):makeYard(47,53,5,13)];
  const centers=war.id==='redwater'?[...REDWATER_CAMPS.map(({x,y})=>({x,y})),STRONGHOLD_CENTERS.redwater]:[war.id==='stonewake'?{x:48.5,y:9.5}:war.id==='mossgate'?MOSS:war.id==='tallowmere'?{x:34,y:38}:STRONGHOLDS.alderwatch.center];
  const posts=yards.map((yard,index)=>({melee:[...yard].sort((a,b)=>war.id==='stonewake'?Math.min(distance(a,{x:46,y:9}),distance(a,{x:51,y:14}))-Math.min(distance(b,{x:46,y:9}),distance(b,{x:51,y:14})):distance(a,centers[index]??centers[0])-distance(b,centers[index]??centers[0])||a.y-b.y||a.x-b.x),ranged:[...yard].sort((a,b)=>war.id==='mossgate'?b.x-a.x||Math.abs(a.y-MOSS.y)-Math.abs(b.y-MOSS.y):war.id==='stonewake'?(tileAt(b.x,b.y,s)!.height-tileAt(a.x,a.y,s)!.height)||distance(a,{x:52,y:7})-distance(b,{x:52,y:7}):war.id==='alderwatch'?(tileAt(b.x,b.y,s)!.height-tileAt(a.x,a.y,s)!.height)||Math.min(distance(a,{x:8,y:39}),distance(a,{x:13,y:39}))-Math.min(distance(b,{x:8,y:39}),distance(b,{x:13,y:39})):war.id==='redwater'?(tileAt(b.x,b.y,s)!.height-tileAt(a.x,a.y,s)!.height)||distance(b,centers[index])-distance(a,centers[index])||a.y-b.y:a.y-b.y||b.x-a.x)}));
  const occupied=new Set(rivals(s,war.id).map(u=>key(u.anchor??u)));
  const lanes=[
    [{a:{x:30,y:20},b:{x:33,y:22}},{a:{x:30,y:22},b:{x:32,y:19}},{a:{x:31,y:23},b:{x:33,y:20}}],
    [{a:{x:39,y:15},b:{x:42,y:15}},{a:{x:39,y:14},b:{x:42,y:12}},{a:{x:40,y:15},b:{x:42,y:13}}],
    [{a:{x:44,y:21},b:{x:47,y:24}},{a:{x:44,y:22},b:{x:47,y:21}},{a:{x:45,y:24},b:{x:47,y:22}}],
    [{a:{x:34,y:20},b:{x:38,y:22}},{a:{x:34,y:23},b:{x:38,y:19}},{a:{x:35,y:19},b:{x:37,y:23}}],
  ];
  let deployed=0;
  for(;deployed<count&&s.units.length<MAX_UNITS;deployed++){
    const absolute=deployedBefore+deployed,group=war.id==='redwater'?Math.min(3,Math.floor(absolute/10)):0,rosterIndex=absolute%roster.length,kind=roster[rosterIndex],groupPosts=posts[group]??posts[0],candidates=kind==='ranger'||kind==='scout'?groupPosts.ranged:groupPosts.melee,p=candidates.find(at=>!occupied.has(key(at)));
    if(!p)break;
    occupied.add(key(p));const u=makeUnit(s,kind,p.x,p.y);u.faction='rival';if(war.id!=='mossgate')u.rivalId=war.id;u.formation=kind==='ranger'||kind==='scout'?'protected':rosterIndex>=7?'protected':'line';u.anchor={...p};u.target={...p};u.order='defend';
    if(war.id==='tallowmere'&&kind==='scout'){
      const patrolLanes=[{a:{x:32,y:38},b:{x:34,y:38}},{a:{x:42,y:35},b:{x:40,y:35}},{a:{x:35,y:39},b:{x:39,y:39}}],lane=patrolLanes[((war.patrolVariant??0)+absolute)%patrolLanes.length];
      u.order='patrol';u.patrol={...lane,leg:0};u.target={...lane.a};
    }else if(war.id==='stonewake'&&kind==='scout'){
      const patrolLanes=[{a:{x:44,y:14},b:{x:45,y:11}},{a:{x:49,y:18},b:{x:51,y:15}}],lane=patrolLanes[((war.patrolVariant??0)+absolute)%patrolLanes.length];
      u.order='patrol';u.patrol={...lane,leg:0};u.target={...lane.a};
    }else if(war.id==='redwater'&&(kind==='ranger'||kind==='scout')){
      const lane=lanes[group][((war.patrolVariant??0)+absolute)%lanes[group].length];
      u.order='patrol';u.patrol={...lane,leg:0};u.target={...lane.a};
    }else if(war.id==='alderwatch'&&kind==='scout'){
      const lanes=[{a:{x:5,y:36},b:{x:8,y:39}},{a:{x:16,y:42},b:{x:13,y:45}}],lane=lanes[((war.patrolVariant??0)+deployedBefore+deployed)%lanes.length];
      u.order='patrol';u.patrol={...lane,leg:0};u.target={...lane.a};
    }
    if(!war.leaderId){war.leaderId=u.id;u.maxHp=Math.round(u.maxHp*1.7);u.hp=u.maxHp;}
  }
  return deployed;
}
function raiseMossgate(s:State):void{
 const w=stronghold(s);if(w.status!=='unseen')return;w.status='occupied';
 const own=(kind:BuildingKind,x:number,y:number,name?:string)=>{const b=makeBuilding(s,kind,x,y,true);b.owner='rival';if(name)b.name=name;return b;};
 for(let x=44;x<=50;x++){own('wall',x,25);own('wall',x,33);}
 for(let y=26;y<=32;y++){own(y===29?'gate':'wall',44,y);own('wall',50,y);}
 own('tower',46,27,'Gloamward Lookout');own('barracks',48,27,'Gloamward Muster Hall');own('cottage',46,31);own('cottage',48,31);own('hearth',47,29,'Mossgate Hall');
 const deployed=deployRivals(s,w,20,0);w.reserve=100-deployed;w.remaining=100;log(s,`The Gloamward have fortified Mossgate. Scouts count one hundred defenders; ${deployed} hold the walls while their relief companies muster behind the gate.`,'danger');
}
function raiseTallowmere(s:State):void{
 const w=stronghold(s,'tallowmere');if(w.status!=='unseen')return;w.status='occupied';
 const own=(kind:BuildingKind,x:number,y:number,name?:string)=>{const b=makeBuilding(s,kind,x,y,true);b.owner='rival';b.rivalId='tallowmere';if(name)b.name=name;return b;};
 for(let x=33;x<=41;x++){own('wall',x,32);own('wall',x,40);}
 for(let y=33;y<=39;y++){own(y===38?'gate':'wall',33,y,y===38?'Causeway Gate':undefined);own(y===35?'gate':'wall',41,y,y===35?'East Postern':undefined);}
 own('tower',35,34,'Reed Bell Tower');own('tower',39,34,'Roadward Beacon');own('barracks',37,33,'Compact Muster Hall');own('cottage',35,38);own('cottage',39,38);own('farm',37,39);own('hearth',37,36,'Tallowmere Hall');
 const deployed=deployRivals(s,w,30,0);w.reserve=150-deployed;w.remaining=150;
 log(s,`The Weirward Compact holds Tallowmere. Wayfarers count all 150 defenders: ${deployed} keep the twin gates and rear bow line while five relief companies remain inside the walls.`,'danger');
}
function raiseStonewake(s:State):void{
 const w=stronghold(s,'stonewake');if(w.status!=='unseen')return;w.status='occupied';
 const own=(kind:BuildingKind,x:number,y:number,name?:string)=>{const b=makeBuilding(s,kind,x,y,true);b.owner='rival';b.rivalId='stonewake';if(name)b.name=name;return b;};
 for(let x=47;x<=53;x++){own('wall',x,4);if(x!==51)own('wall',x,14);}
 for(let y=5;y<=13;y++){if(y!==9)own('wall',46,y);own('wall',54,y);}
 own('gate',46,9,'West Quarry Gate');own('gate',51,14,'South Cut Gate');
 own('tower',48,7,'Greybank Lookout');const signal=own('tower',52,7,'Stonewake Signal Tower');w.signalTowerId=signal.id;w.signalDisabled=false;
 own('barracks',50,6,'Stonewake Muster Hall');own('cottage',48,11);own('cottage',52,11);own('farm',50,12);own('hearth',50,9,'Stonewake Hall');
 const deployed=deployRivals(s,w,25,0);w.reserve=125-deployed;w.remaining=125;
 log(s,`The Stonewake Hold commands the Greybank quarry. Scouts count 125 defenders: ${deployed} hold the pass, high ground and flanks while ${w.reserve} remain in reserve. The signal tower is calling them in.`,'danger');
}
function raiseAlderwatch(s:State):void{
 const w=stronghold(s,'alderwatch');if(w.status!=='unseen')return;w.status='occupied';
 const own=(kind:BuildingKind,x:number,y:number,name?:string)=>{const b=makeBuilding(s,kind,x,y,true);b.owner='rival';b.rivalId='alderwatch';if(name)b.name=name;return b;};
 for(let x=6;x<=15;x++){own(x===10?'gate':'wall',x,38,x===10?'Abbey Gate':undefined);own('wall',x,46);}
 for(let y=39;y<=45;y++){own('wall',6,y);own(y===42?'gate':'wall',15,y,y===42?'Ravine Gate':undefined);}
 own('tower',8,39,'West Abbey Watch');own('tower',13,39,'East Abbey Watch');own('barracks',11,41,'Alderwatch Muster Hall');own('cottage',8,44);own('farm',12,44);own('hearth',10,42,'Alderwatch Hall');
 const deployed=deployRivals(s,w,32,0);w.reserve=160-deployed;w.remaining=160;
  log(s,`The Abbey Wardens hold Alderwatch. The abbey ledger counts 160 defenders: ${deployed} guard two watch posts and the hall while ${w.reserve} remain in finite reserve. Scout patrols cover both ravine roads.`,'danger');
}
function raiseRedwater(s:State):void{
 const w=stronghold(s,'redwater');if(w.status!=='unseen')return;w.status='occupied';w.campsCleared=0;
 const own=(kind:BuildingKind,x:number,y:number,name?:string)=>{const b=makeBuilding(s,kind,x,y,true);b.owner='rival';b.rivalId='redwater';if(name)b.name=name;return b;};
 own('tower',30,19,'Westcut Arrow Stand');own('barracks',32,19,'Westcut Muster');own('wall',30,18);own('gate',31,18,'Westcut Camp Gate');own('wall',32,18);
 own('tower',39,12,'High Heath Watch');own('barracks',41,13,'Heath Muster');own('wall',39,16);own('gate',40,16,'Heath Camp Gate');own('wall',41,16);
 own('tower',47,22,'Ravine Lookout');own('barracks',44,24,'Ravine Muster');own('wall',44,23);own('wall',45,24);own('gate',46,24,'Ravine Camp Gate');own('wall',47,24);
 for(let x=33;x<=39;x++){own('wall',x,17);own('wall',x,25);}
 for(let y=18;y<=24;y++){own(y===22?'gate':'wall',33,y,y===22?'West Heath Gate':undefined);own(y===20?'gate':'wall',39,y,y===20?'East Ravine Gate':undefined);}
 own('tower',35,19,'Reach North Tower');own('barracks',36,19,'Redwater Muster Hall');own('tower',37,19,'Reach East Tower');own('cottage',35,23);own('farm',36,23);own('cottage',37,23);own('hearth',36,21,'Redwater Hall');
 const deployed=deployRivals(s,w,40,0);w.reserve=160-deployed;w.remaining=160;
 log(s,'The Redwater Watch holds the ravine keep. Scouts count all 160 defenders: 30 guard three outer camps, 10 hold the central keep, and '+w.reserve+' await the warned reserve call.','danger');
}
export function strongholdCaptureError(s:State,id:StrongholdId='mossgate'):string|null{
 const info=STRONGHOLDS[id];if(!s.region||!s.march)return `${info.name} can only be secured from the Briar March.`;const w=stronghold(s,id),hero=army(s).find(u=>u.id===s.commander?.id);
 if(s.outcome!=='playing')return 'Continue the watch before capturing '+info.name+'.';
 if(w.status!=='occupied')return w.status==='captured'?`${info.name} already flies your banner.`:`Find ${info.name} and draw out its defenders first.`;
 if(!hero||distance(hero,info.center)>6)return `Bring the commander within six tiles of ${info.name} Hall.`;
 if(id==='redwater'&&(w.campsCleared??0)<3)return 'Clear all three Redwater outer camps before securing the keep.';
 if(w.remaining||w.reserve||rivals(s,id).length)return `Defeat the remaining ${w.remaining} ${w.faction} defenders before securing ${info.name}.`;
 if(enemies(s).some(u=>distance(u,info.center)<7)||s.corpses?.some(c=>c.tainted&&distance(c,info.center)<7))return `Clear infected and tainted remains around ${info.name} first.`;
 return null;
}
export function captureStronghold(s:State,id:StrongholdId='mossgate'):CommandResult{
 const error=strongholdCaptureError(s,id);if(error)return{ok:false,message:error};const w=stronghold(s,id),info=STRONGHOLDS[id];
 w.status='captured';w.warning=0;w.leaderId=undefined;s.march!.secured=true;
 for(const b of s.buildings)if(b.owner==='rival'&&rivalIdOf(b)===id){b.owner='player';delete b.rivalId;}
  const hallName=id==='redwater'?'Redwater Hall':`${info.name} Hall`;let hearth=s.buildings.find(b=>b.kind==='hearth'&&b.name===hallName);
 // A keep hall can be destroyed during a natural siege. Conquest still grants
 // a settlement, so restore its named hearth as a damaged, repairable ruin.
  if(!hearth){hearth=makeBuilding(s,'hearth',info.center.x,info.center.y,true);hearth.name=hallName;}
 hearth.owner='player';delete hearth.rivalId;hearth.hp=Math.max(1,Math.floor(hearth.maxHp*.72));
  const farmAt=id==='mossgate'?{x:45,y:32}:id==='tallowmere'?{x:37,y:39}:id==='stonewake'?{x:49,y:12}:id==='alderwatch'?{x:9,y:44}:{x:42,y:26},cottageAt=id==='mossgate'?{x:47,y:32}:id==='tallowmere'?{x:36,y:39}:id==='stonewake'?{x:51,y:12}:id==='alderwatch'?{x:11,y:44}:{x:43,y:26};
 for(const [kind,p]of [['farm',farmAt],['cottage',cottageAt]] as const)if(!s.buildings.some(b=>b.x===p.x&&b.y===p.y)){const b=makeBuilding(s,kind,p.x,p.y,true);b.owner='player';}
  const survivors=id==='mossgate'?4:id==='redwater'?8:6;addResidents(s,survivors);s.jobs.farmers=id==='mossgate'?2:3;s.jobs.builders=id==='mossgate'?2:3;assignResidentJobs(s);
  const timber=id==='mossgate'?45:id==='tallowmere'?60:id==='stonewake'?80:id==='alderwatch'?75:70,crowns=id==='mossgate'?25:id==='tallowmere'?35:id==='stonewake'?45:40;s.resources.wood+=timber;s.resources.stone+=crowns;
 if(id==='tallowmere')log(s,'Tallowmere is secured. Six Compact families return to the hall; the causeway ledger and stores are yours. +60 Timber · +35 Crowns.','good');
 else if(id==='stonewake')log(s,'Stonewake is secured. Six quarry families return to the hall; its finite stores are yours. +80 Timber · +45 Crowns.','good');
 else if(id==='alderwatch')log(s,'Alderwatch is secured. Six abbey families return to the hall; the watch posts and finite stores are yours. +75 Timber · +40 Crowns.','good');
  else if(id==='redwater')log(s,'Redwater Reach is secured. Eight families return from the ravine camps; the keep stores yield +70 Timber and +40 Crowns.','good');
 else log(s,'Mossgate is secured. Four survivors begin repairs and tend the new croft. +45 Timber · +25 Crowns.','good');
 return{ok:true,message:`${info.name} secured. Repair the damaged hall, develop its croft and station a garrison.`};
}
function updateRedwaterCamps(s:State,w:RivalStronghold):void{
 if(w.status!=='occupied')return;
 const cleared=REDWATER_CAMPS.filter(c=>!rivals(s,'redwater').some(u=>distance(u.anchor??u,c)<=3.2)).length,previous=w.campsCleared??0;
 if(cleared>previous){w.campsCleared=cleared;const count=cleared-previous;s.resources.wood+=count*6;s.resources.stone+=count*3;log(s,cleared+' of 3 Redwater outer camps cleared. Their stores yield '+count*6+' Timber and '+count*3+' Crowns.','good');}
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
  const hero=army(s).find(u=>u.id===s.commander?.id),war=stronghold(s),weirward=stronghold(s,'tallowmere'),stonewake=stronghold(s,'stonewake'),alderwatch=stronghold(s,'alderwatch'),redwater=stronghold(s,'redwater');
  // Reveal the garrison before the commander reaches the perimeter, and put
  // the gate on the western approach from the southern road. Revealing at 4
  // tiles used to build a closed ring around the commander and trap them in it.
  if(hero&&war.status==='unseen'&&distance(hero,MOSS)<8)raiseMossgate(s);
  // The Weirward compound is revealed only after the player finds the
  // wayfarers' report. Without this gate, the ordinary Mossgate route wakes
  // a second, unrelated garrison and turns that siege into an unintended
  // two-front battle.
  if(hero&&m.rumors?.includes('weirward')&&weirward.status==='unseen'&&distance(hero,TALLOWMERE)<8)raiseTallowmere(s);
  if(hero&&m.rumors?.includes('stonewake')&&stonewake.status==='unseen'&&distance(hero,STONEWAKE)<8)raiseStonewake(s);
  // Reveal Alderwatch from outside both watch-post ranges so the player can
  // scout the garrison before the commander enters the Wardens' firing lanes.
  const alderwatchWatches=[{x:8,y:39},{x:13,y:39}];
  if(hero&&m.rumors?.includes('alderwatch')&&alderwatch.status==='unseen'&&distance(hero,ALDERWATCH)<10&&alderwatchWatches.every(watch=>distance(hero,watch)>6))raiseAlderwatch(s);
  if(hero&&m.rumors?.includes('redwater')&&redwater.status==='unseen'&&distance(hero,STRONGHOLD_CENTERS.redwater)<8)raiseRedwater(s);
  if(stonewake.status==='occupied'&&!stonewake.signalDisabled&&stonewake.signalTowerId!==undefined&&s.buildings.some(b=>b.id===stonewake.signalTowerId&&b.hp<=0)){stonewake.signalDisabled=true;if(stonewake.warning>0)stonewake.warning=Math.max(stonewake.warning,20);log(s,'Stonewake Signal Tower is down. Relay runners must carry the call; the next reserve warning lasts 20 seconds.','good');}
  updateRedwaterCamps(s,redwater);
  const relief=(garrison:RivalStronghold,center:{x:number;y:number})=>{
    if(garrison.status!=='occupied'||garrison.id==='redwater'&&(garrison.campsCleared??0)<3)return;
    const active=rivals(s,garrison.id).length,pressure=[...army(s),...enemies(s)].some(u=>distance(u,center)<12);
    if(garrison.warning>0){garrison.warning=Math.max(0,garrison.warning-dt);if(!garrison.warning&&garrison.reserve){const n=Math.min(12,garrison.reserve),deployed=deployRivals(s,garrison,n);garrison.reserve-=deployed;log(s,`${garrison.faction} relief reaches ${garrison.name}. ${garrison.remaining} defenders still stand${deployed<n?' · remaining relief is delayed by battlefield capacity':''}.`,'danger');}}
    else if(garrison.reserve>0&&active<=8&&pressure){const delay=garrison.id==='stonewake'&&garrison.signalDisabled?20:garrison.id==='redwater'?8:5;garrison.warning=delay;log(s,`${garrison.faction} relief company is forming behind ${garrison.name}'s walls. ${delay} seconds.`,'warn');}
  };
  relief(war,MOSS);relief(weirward,TALLOWMERE);relief(stonewake,STONEWAKE);relief(alderwatch,ALDERWATCH);relief(redwater,STRONGHOLD_CENTERS.redwater);
  m.rumors??=[];
  if(hero)for(const site of LANDMARKS)if(!m.seen.includes(site.id)&&distance(hero,site)<4){
    m.seen.push(site.id);const found=Object.entries(site.reward).filter((entry):entry is [Resource,number]=>typeof entry[1]==='number');
    for(const [resource,amount]of found)credit(s,resource,amount);
    const cache=found.map(([resource,amount])=>`${amount} ${resource==='stone'?'Crowns':resource==='wood'?'Timber':resource==='food'?'provisions':'herbs'}`).join(' · ');
    log(s,`${site.name} discovered${cache?` · ${cache} recovered`:''}.`,'good');
    if(site.hostiles?.length){const danger=Math.min(2,Math.floor(distance(hero,ROAD_EXIT)/18)),count=Math.min(site.hostiles.length,2+danger),reserved=new Set(s.units.map(key)),offsets=[{x:1,y:0},{x:-1,y:1},{x:1,y:2},{x:-2,y:-1},{x:2,y:-2}];
      for(let i=0;i<count;i++){const at=offsets[i%offsets.length],p=nearestOpen(s,{x:site.x+at.x,y:site.y+at.y},reserved,undefined,'infected');reserved.add(key(p));const u=makeUnit(s,site.hostiles[i],p.x,p.y);u.order='defend';u.anchor={x:site.x,y:site.y};}
      log(s,`The infected stir around ${site.name}. The road is not safe yet.`,'danger');
    }
  }
  if(m.seen.includes('wayfarer-camp')&&!m.rumors.includes('weirward')){m.rumors.push('weirward');log(s,'A charcoal tally at the wayfarers’ camp names the Weirward Compact: 150 defenders, a causeway gate, an eastern postern, and relief held behind the walls.','info');}
  if(m.seen.includes('stonewake-quarry')&&!m.rumors.includes('stonewake')){m.rumors.push('stonewake');log(s,'Fresh cart tracks climb into the Greybank ridge. Scouts count 125 Stonewake defenders; a signal tower can summon their reserve companies.','warn');}
  if(m.seen.includes('abbey-road')&&!m.rumors.includes('alderwatch')){m.rumors.push('alderwatch');log(s,'The abbey ledger names Alderwatch: 160 Wardens, two ravine watch posts, bow cover above the road and a finite reserve inside the hall.','warn');}
  if(m.seen.includes('redwater-cairn')&&!m.rumors.includes('redwater')){m.rumors.push('redwater');log(s,'A tally at the cairn names Redwater Reach: 160 disciplined defenders, three outer camps, ravine gates, and finite reserve calls after the camps fall.','warn');}
  m.rescued??=[];
  for(const site of LANDMARKS)if(site.survivors&&!m.rescued.includes(site.id)&&m.seen.includes(site.id)&&!hostiles(s).some(z=>distance(z,site)<6)){
    const home=s.empire?.reserve;if(!home)continue;home.nextId=Math.max(home.nextId,s.nextId);const joined=addResidents(home,site.survivors).length;s.nextId=home.nextId;m.rescued.push(site.id);
    log(s,`${joined} survivors from ${site.name} join your people${joined?' at Hearthmere':''}.`,'good');
  }
  wildernessStep(s,dt,hero);
  if(m.secured&&!s.buildings.some(b=>b.kind==='hearth')){m.secured=false;log(s,'The last outpost beacon fell. Clear the land and re-establish your position.','danger');}
  if(!m.secured)return;
  m.incursion+=dt;
  if(m.incursion>=90&&!m.warning&&!enemies(s).length){m.warning=8;log(s,'Scouts warn: an infected band approaches the eastern old watch in 8 seconds.','danger');}
  else if(m.warning){m.warning=Math.max(0,m.warning-dt);if(!m.warning){m.incursion=0;const count=Math.min(18,4+Math.floor(army(s).length/15)),reserved=new Set(s.units.map(key));for(let n=0;n<count;n++){const p=nearestOpen(s,{x:MAP_W-5,y:8+n%4},reserved);reserved.add(key(p));makeUnit(s,n%4===0?'runner':'hollow',p.x,p.y);}}}
}
