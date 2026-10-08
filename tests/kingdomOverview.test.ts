import {describe,expect,it} from 'vitest';
import {army,makeBuilding,makeUnit,newGame} from '../src/game/state';
import {kingdomOverview} from '../src/game/kingdomOverview';
import {decode} from '../src/game/persistence';
import type {State} from '../src/game/types';

function withFrontier(s:State):State{
 const reserve=structuredClone(s);reserve.region='march';reserve.march={seen:[],rescued:[],secured:true,rewarded:true,incursion:0,warning:0,rival:{id:'mossgate',name:'Mossgate',faction:'The Gloamward',status:'captured',remaining:0,reserve:0,casualties:100,warning:0}};
 reserve.buildings=[];reserve.units=[];reserve.residents=[];reserve.population=0;reserve.infection=[];reserve.corpses=[];reserve.effects=[];reserve.logs=[];reserve.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};reserve.owned=['hearthmere'];reserve.commander=undefined;reserve.empire=undefined;reserve.nextId=s.nextId;reserve.resources=s.resources;
 const heart=makeBuilding(reserve,'hearth',47,29,true);heart.name='Mossgate Hall';heart.owner='player';makeBuilding(reserve,'barracks',45,29,true);s.nextId=reserve.nextId;
 s.empire={reserve,elapsed:0};return s;
}
describe('kingdom overview derived ledger',()=>{
 it('aggregates owned regions without changing the saved game state',()=>{
  const s=withFrontier(newGame()),before=JSON.stringify(s),view=kingdomOverview(s);
  expect(view.settlements.map(v=>v.name)).toEqual(['Hearthmere','Mossgate Hall']);
  expect(view.territories).toContain('Briar March');expect(view.population).toBe(s.population);
  expect(view.housing).toBeGreaterThanOrEqual(s.population);expect(view.availableWorkers).toBeGreaterThanOrEqual(0);
  expect(view.soldiers).toBe(army(s).length);expect(view.capacity).toBe(48);
  expect(JSON.stringify(s)).toBe(before);
 });

 it('distinguishes stationed, assigned, and genuinely marching defenders',()=>{
  const s=withFrontier(newGame()),home=s.buildings.find(b=>b.kind==='hearth')!,troops=army(s);
  Object.assign(troops[0],{x:14,y:11,order:'defend',anchor:{x:14,y:11}});
  Object.assign(troops[1],{x:31,y:31,order:'defend',anchor:{x:14,y:11}});
  Object.assign(troops[2],{x:32,y:32,order:'hold',anchor:{x:14,y:11}});
  const site=kingdomOverview(s).settlements.find(v=>v.id===home.id)!;
  expect(site.stationed).toBe(1);expect(site.fitStationed).toBe(1);expect(site.committed).toBe(1);expect(site.fitCommitted).toBe(1);expect(site.inbound).toBe(1);
 });

 it('surfaces real local threats and damaged structures and survives save decoding',()=>{
  const s=withFrontier(newGame()),tower=s.buildings.find(b=>b.kind==='tower')!;tower.hp=24;
  const foe=makeUnit(s,'hollow',14,11);foe.order='defend';
  const before={people:s.population,soldiers:army(s).length,food:s.resources.food};
  const view=kingdomOverview(s);
  expect(view.alerts.some(a=>a.message.includes('threat near Hearthmere'))).toBe(true);
  expect(view.alerts.some(a=>a.message.includes('damaged structure at Hearthmere'))).toBe(true);
  expect(view.settlements[0].repairs.some(b=>b.id===tower.id)).toBe(true);
  const loaded=decode(JSON.stringify(s));expect(loaded).not.toBeNull();
  const reloaded=kingdomOverview(loaded!);expect(reloaded.settlements.map(v=>[v.name,v.stationed,v.inbound])).toEqual(view.settlements.map(v=>[v.name,v.stationed,v.inbound]));
  expect({people:loaded!.population,soldiers:army(loaded!).length,food:loaded!.resources.food}).toEqual(before);
 });

 it('keeps remote settlement threats and repairs visible while that region is inactive',()=>{
  const s=withFrontier(newGame()),remote=s.empire!.reserve,site=remote.buildings.find(b=>b.kind==='hearth')!;
  const tower=makeBuilding(remote,'tower',45,31,true);tower.owner='player';tower.hp=24;
  makeUnit(remote,'hollow',46,30);
  const view=kingdomOverview(s),frontier=view.settlements.find(v=>v.id===site.id)!;
  expect(frontier.active).toBe(false);expect(frontier.threats).toBe(1);expect(frontier.repairs.some(b=>b.id===tower.id)).toBe(true);
  expect(view.alerts.some(a=>a.settlementId===site.id&&a.message.includes('threat near Mossgate Hall'))).toBe(true);
  expect(view.alerts.some(a=>a.settlementId===site.id&&a.message.includes('damaged structure at Mossgate Hall'))).toBe(true);
 });

 it('reports Tallowmere independently from the Mossgate garrison',()=>{
  const march=withFrontier(newGame()).empire!.reserve;
  march.march!.weirward={id:'tallowmere',name:'Tallowmere',faction:'The Weirward Compact',status:'occupied',remaining:149,reserve:120,casualties:1,warning:0,patrolVariant:0};
  const soldier=makeUnit(march,'spearman',37,36);soldier.faction='rival';soldier.rivalId='tallowmere';
  const view=kingdomOverview(march);
  expect(view.alerts.some(a=>a.message==='Tallowmere is still contested · 149 defenders remain.')).toBe(true);
  expect(view.alerts.some(a=>a.message==='Mossgate is still contested · 100 defenders remain.')).toBe(false);
 });
});
