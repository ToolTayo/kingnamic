import {describe,it,expect} from 'vitest';
import {army,rivals,rivalStronghold,newGame,makeUnit} from '../src/game/state';
import {command} from '../src/game/commands';
import {REDWATER_CAMPS,ROAD_EXIT,captureStronghold,empireStep,strongholdCaptureError} from '../src/game/empire';
import {decode} from '../src/game/persistence';
import {combatStep} from '../src/game/combat';
import {infect,plagueStep} from '../src/game/disease';
import {findPath,navigation} from '../src/game/navigation';
import {STRONGHOLD_CENTERS,tileAt} from '../src/game/map';
import type {State} from '../src/game/types';

function depart(seed=90521){
 const s=newGame(seed);command(s,{type:'commander-appoint'});
 const party=army(s).slice(0,2);
 for(const u of party)Object.assign(u,ROAD_EXIT,{target:{...ROAD_EXIT},order:'hold'});
 expect(command(s,{type:'travel',ids:party.map(u=>u.id)}).ok).toBe(true);
 return s;
}
function approach(seed=90521){
 const s=depart(seed),hero=army(s).find(u=>u.id===s.commander!.id)!;
 Object.assign(hero,{x:35,y:14,target:{x:35,y:14},anchor:{x:35,y:14},path:[],order:'hold'});
 empireStep(s,.1);
 expect(s.march!.seen).toContain('redwater-cairn');
 expect(s.march!.rumors).toContain('redwater');
 expect(s.march!.redwater!.status).toBe('unseen');
 empireStep(s,.1);
 return s;
}
const reload=(s:State)=>{const loaded=decode(JSON.stringify(s));expect(loaded).not.toBeNull();return loaded!;};

describe('Redwater Reach campaign',()=>{
 it('connects the heath, ravine crossing, clue, and keep without changing the old quarry road',()=>{
  const s=depart(),heath=[] as string[],ravine=[] as string[];
  for(let y=14;y<=30;y++)for(let x=31;x<=47;x++){const t=tileAt(x,y,s)!;if(t.terrain==='heath')heath.push(x+','+y);if(t.terrain==='water')ravine.push(x+','+y);}
  expect(heath.length).toBeGreaterThan(100);expect(ravine.length).toBeGreaterThan(5);
  expect(tileAt(45,12,s)?.terrain).toBe('road');expect(tileAt(43,16,s)?.terrain).toBe('road');expect(tileAt(35,14,s)?.terrain).toBe('road');expect(tileAt(46,24,s)?.terrain).toBe('road');expect(tileAt(47,14,s)?.terrain).not.toBe('heath');
  expect(tileAt(36,21,s)?.height).toBeGreaterThan(.8);expect(tileAt(35,14,s)?.height).toBeGreaterThan(.7);expect(STRONGHOLD_CENTERS.redwater).toEqual({x:36,y:21});
  expect(findPath(s,ROAD_EXIT,{x:35,y:14},false,navigation(s),'player').length).toBeGreaterThan(0);
  expect(findPath(s,ROAD_EXIT,{x:32,y:22},false,navigation(s),'player').length).toBeGreaterThan(0);
  expect(decode(JSON.stringify(s))!.march!.redwater).toMatchObject({id:'redwater',status:'unseen',remaining:160,reserve:120,campsCleared:0});
 });
 it('uses a bounded save-seeded patrol pattern that replays exactly and varies between seeds',()=>{
  const first=approach(90521),replay=approach(90521),variant=approach(91545),routes=(s:State)=>rivals(s,'redwater').filter(u=>u.order==='patrol'&&u.patrol).map(u=>u.patrol);
  expect(first.march!.redwater!.patrolVariant).toBe(1);expect(replay.march!.redwater!.patrolVariant).toBe(1);expect(variant.march!.redwater!.patrolVariant).toBe(2);
  expect(routes(first)).toEqual(routes(replay));expect(routes(first)).not.toEqual(routes(variant));
 });
 it('keeps Redwater roads and camps clear of the neighboring Mossgate stronghold',()=>{
  const s=approach(),hero=army(s).find(u=>u.id===s.commander!.id)!;Object.assign(hero,{x:47,y:29,target:{x:47,y:29},anchor:{x:47,y:29},path:[],order:'hold'});empireStep(s,.1);
  expect(rivalStronghold(s,'mossgate').status).toBe('occupied');expect(s.buildings.some(b=>b.name==='Mossgate Hall')).toBe(true);
  const hostileCells=s.buildings.filter(b=>b.owner==='rival').map(b=>`${b.x},${b.y}`);expect(new Set(hostileCells).size).toBe(hostileCells.length);
  expect(s.buildings.find(b=>b.name==='Ravine Camp Gate')).toMatchObject({x:46,y:24,rivalId:'redwater'});
 });
 it('reveals exactly 160 original defenders in outer camps and a guarded central keep',()=>{
  const s=approach(),war=s.march!.redwater!;
  expect(war).toMatchObject({id:'redwater',name:'Redwater Reach',faction:'The Redwater Watch',status:'occupied',remaining:160,reserve:120,casualties:0,campsCleared:0});
  const guards=rivals(s,'redwater');expect(guards).toHaveLength(40);
  const counts=REDWATER_CAMPS.map(c=>guards.filter(u=>Math.hypot((u.anchor??u).x-c.x,(u.anchor??u).y-c.y)<3.2).length);
  expect(counts).toEqual([10,10,10]);
  expect(guards.filter(u=>Math.hypot((u.anchor??u).x-36,(u.anchor??u).y-21)<4).length).toBe(10);
  expect(guards.filter(u=>u.kind==='spearman')).toHaveLength(24);
  expect(guards.filter(u=>u.kind==='ranger')).toHaveLength(4);
  expect(guards.filter(u=>u.kind==='scout')).toHaveLength(4);
  expect(guards.filter(u=>(u.kind==='ranger'||u.kind==='scout')&&u.order==='patrol'&&u.formation==='protected')).toHaveLength(8);
  expect(s.buildings.filter(b=>b.owner==='rival'&&b.rivalId==='redwater')).toHaveLength(51);
  expect(s.buildings.filter(b=>b.name==='West Heath Gate'||b.name==='East Ravine Gate')).toHaveLength(2);
  const inside={x:34,y:22},outside={x:32,y:22},nav=navigation(s);
  expect(findPath(s,inside,outside,false,nav,'player')).toHaveLength(0);
  expect(findPath(s,inside,outside,false,nav,'rival').length).toBeGreaterThan(0);
  const commander=army(s).find(u=>u.id===s.commander!.id)!;Object.assign(commander,{x:36,y:21,target:{x:36,y:21},anchor:{x:36,y:21},path:[],order:'hold'});
  expect(strongholdCaptureError(s,'redwater')).toContain('Clear all three Redwater outer camps');
  const saved=reload(s);expect(saved.march!.redwater).toEqual(war);expect(rivals(saved,'redwater')).toHaveLength(40);
 });
 it('lets an east-ravine archer answer only a nearby visible threat beyond the keep sightline',()=>{
  const s=approach(),archer=rivals(s,'redwater').find(u=>u.kind==='ranger')!;s.waveRemaining=0;
  Object.assign(archer,{x:46,y:21,target:{x:46,y:21},anchor:{x:46,y:21},path:[],order:'defend',cooldown:0,attackFlash:0});
  const infected=makeUnit(s,'hollow',47,21);combatStep(s,.1,false);
  expect(Math.hypot(infected.x-36,infected.y-21)).toBeGreaterThan(9);
  expect(archer.attackFlash).toBeGreaterThan(0);expect(archer.cooldown).toBeGreaterThan(0);
 });
 it('records camp casualty batches once and keeps warned reserves finite',()=>{
  const s=approach(),war=s.march!.redwater!;
  for(const [index,center] of REDWATER_CAMPS.entries()){
   const camp=rivals(s,'redwater').filter(u=>Math.hypot((u.anchor??u).x-center.x,(u.anchor??u).y-center.y)<3.2);
   expect(camp).toHaveLength(10);for(const u of camp)u.hp=0;
   combatStep(s,.1,false);empireStep(s,.1);
   expect(war.campsCleared).toBeGreaterThanOrEqual(index+1);
  }
  expect(war.campsCleared).toBe(3);expect(war.reserve).toBe(120);expect(war.remaining+war.casualties).toBe(160);
  expect(rivals(s,'redwater')).toHaveLength(10);
  for(const u of rivals(s,'redwater').slice(0,2))u.hp=0;
  combatStep(s,.1,false);empireStep(s,.1);
  expect(war.warning).toBe(8);expect(war.reserve).toBe(120);
  const saved=reload(s);expect(saved.march!.redwater).toMatchObject({campsCleared:3,warning:8,reserve:120});
  empireStep(s,8);expect(war.warning).toBe(0);expect(war.reserve).toBe(108);expect(rivals(s,'redwater')).toHaveLength(20);
  expect(war.remaining+war.casualties).toBe(160);
  expect(reload(s).march!.redwater).toEqual(war);
 });
 it('keeps infected as a separate force and preserves bite-only infection against Redwater spears',()=>{
  const s=approach(),war=s.march!.redwater!,guard=rivals(s,'redwater')[0];
  s.units=[guard];
  Object.assign(guard,{x:32,y:21,cooldown:8,exposure:95,order:'defend',anchor:{x:32,y:21}});
  const zombie=makeUnit(s,'hollow',31.2,21),remaining=war.remaining,casualties=war.casualties;
  combatStep(s,.1,false);
  expect(s.infection.some(i=>i.personId===guard.id&&i.source==='bite'&&i.sourceId===zombie.id)).toBe(true);
  expect(war.remaining).toBe(remaining);expect(war.casualties).toBe(casualties);
  expect(rivals(s,'redwater')).toContain(guard);expect(s.units.some(u=>u.id===zombie.id&&u.hp>0)).toBe(true);
 });
 it('records a bitten defender once, then returns the dead as an independent hollow',()=>{
  const s=approach(),war=s.march!.redwater!,guard=rivals(s,'redwater')[0],zombie=makeUnit(s,'hollow',31,21),remaining=war.remaining;
  s.waveRemaining=0;expect(infect(s,guard,'bite',0,zombie.id)).toBe(true);guard.hp=0;combatStep(s,.1,false);
  expect(war.remaining).toBe(remaining-1);expect(war.casualties).toBe(1);expect(s.corpses?.find(c=>c.personId===guard.id)?.tainted).toBe(true);
  plagueStep(s,8);const risen=s.units.find(u=>u.reanimatedFrom===guard.id);
  expect(risen?.kind).toBe('hollow');expect(risen?.faction).toBeUndefined();expect(risen?.rivalId).toBeUndefined();
  expect(war.remaining+war.casualties).toBe(160);expect(rivals(s,'redwater')).not.toContain(guard);
 });
 it('captures a repairable Redwater Hall even when its original keep hearth was destroyed',()=>{
  const s=approach(),war=s.march!.redwater!,hero=army(s).find(u=>u.id===s.commander!.id)!,hall=s.buildings.find(b=>b.name==='Redwater Hall')!;
  Object.assign(hero,{x:36,y:21,target:{x:36,y:21},anchor:{x:36,y:21},path:[],order:'hold'});s.units=army(s);s.infection=[];s.corpses=[];
  war.remaining=0;war.reserve=0;war.casualties=160;war.campsCleared=3;s.buildings=s.buildings.filter(b=>b.id!==hall.id);
  expect(captureStronghold(s,'redwater').ok).toBe(true);
  const restored=s.buildings.find(b=>b.name==='Redwater Hall');expect(restored).toMatchObject({owner:'player',x:36,y:21});
  expect(restored!.hp).toBe(Math.floor(restored!.maxHp*.72));expect(decode(JSON.stringify(s))).not.toBeNull();
 });
 it('migrates old March saves with an untouched Redwater ledger and rejects invalid camp progress',()=>{
  const old=depart();delete old.march!.redwater;old.march!.seen=old.march!.seen.filter(id=>id!=='redwater-cairn');old.march!.rumors=[];
  const loaded=decode(JSON.stringify(old));expect(loaded).not.toBeNull();expect(loaded!.march!.redwater).toMatchObject({status:'unseen',remaining:160,reserve:120,campsCleared:0});
  const forgedLedger=structuredClone(loaded!);forgedLedger.march!.redwater!.campsCleared=4;
  expect(decode(JSON.stringify(forgedLedger))).toBeNull();
 });
});
