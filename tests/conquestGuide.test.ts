import {describe,it,expect} from 'vitest';
import {CONQUEST_IDS,CONQUEST_ROUTES,advanceRoute,conquestGuide,conquestMoveOrders,type ConquestNavigation} from '../src/game/conquestGuide';
import {army,newGame,makeUnit,makeBuilding} from '../src/game/state';
import {command} from '../src/game/commands';
import {ROAD_EXIT,empireStep,STRONGHOLDS,LANDMARKS} from '../src/game/empire';
import {findPath,navigation} from '../src/game/navigation';
import {decode} from '../src/game/persistence';
function frontier(){const s=newGame();command(s,{type:'commander-appoint'});const hero=army(s).find(u=>u.id===s.commander!.id)!;Object.assign(hero,ROAD_EXIT);expect(command(s,{type:'travel',ids:[]}).ok).toBe(true);return s;}
describe('honest World Conquest guidance',()=>{
 it('lists exactly five rivals without creating world state or discoveries',()=>{
  const s=newGame(),before=JSON.stringify(s);expect(CONQUEST_IDS).toHaveLength(5);
  for(const id of CONQUEST_IDS){const v=conquestGuide(s,id);expect(v.status).toBe('unknown');expect(v.stage).toBe('discover');expect(v.war).toBeUndefined();expect(v.marker.id).toBe(CONQUEST_ROUTES[id].report);}
  expect(JSON.stringify(s)).toBe(before);expect(s.empire).toBeUndefined();
 });
 for(const id of CONQUEST_IDS)it(`${id} uses reachable physical discovery and staging waypoints`,()=>{
  const s=frontier(),nav=navigation(s);let from={...ROAD_EXIT};
  for(const point of [...CONQUEST_ROUTES[id].discovery,...CONQUEST_ROUTES[id].approach]){
   if(from.x!==point.x||from.y!==point.y){const path=findPath(s,from,point,false,nav,'player');expect(path.length,point.name).toBeGreaterThan(0);expect(path.at(-1)).toMatchObject({x:point.x,y:point.y});}from=point;
  }
 });
 it('reads distant discoveries and legacy saves without requiring local resource claims',()=>{
  const s=frontier(),hero=army(s).find(u=>u.id===s.commander!.id)!;Object.assign(hero,{x:35,y:14});empireStep(s,.1);
  expect(conquestGuide(s,'redwater').status).toBe('scouted');Object.assign(hero,ROAD_EXIT);expect(command(s,{type:'travel',ids:[]}).ok).toBe(true);
  const saved=decode(JSON.stringify(s))!;expect(saved).not.toBeNull();expect(conquestGuide(saved,'redwater').status).toBe('scouted');expect(saved.territories).toEqual(s.territories);
 });
 it('reflects real finite campaign counters and capture blockers without granting rewards',()=>{
  const s=frontier(),hero=army(s).find(u=>u.id===s.commander!.id)!;Object.assign(hero,{x:40,y:29});empireStep(s,.1);
  const before=JSON.stringify(s),v=conquestGuide(s,'mossgate');expect(v.status).toBe('besieged');expect(v.war!.remaining).toBe(STRONGHOLDS.mossgate.total);expect(v.blocker).toBeTruthy();expect(JSON.stringify(s)).toBe(before);
 });
 it('recognizes a legacy report before a paused save regenerates its rumor',()=>{
  const s=frontier();s.march!.seen.push('wayfarer-camp');delete s.march!.rumors;expect(conquestGuide(s,'tallowmere').status).toBe('scouted');
 });
 it('keeps Mossgate unlocated until it is actually sighted, even after finding the village trail',()=>{
  const s=frontier();s.march!.seen.push('village');const v=conquestGuide(s,'mossgate');expect(v.status).toBe('scouted');expect(v.clueMarker).toBe(true);expect(v.marker).toMatchObject({x:14,y:11});
 });
 for(const id of ['stonewake','redwater'] as const)it(`${id} guidance does not wake the neighboring rival kingdom`,()=>{
  const s=frontier(),hero=army(s)[0],nav:ConquestNavigation={id,stage:'',leg:0,path:[]};
  for(let steps=0;steps<500;steps++){
   const point=advanceRoute(s,nav)!,path=findPath(s,hero,point);if(!path.length)break;
   Object.assign(hero,path[0]);empireStep(s,.1);
   if(conquestGuide(s,id).status==='besieged')break;
  }
  expect(conquestGuide(s,id).status).toBe('besieged');const neighbor=id==='stonewake'?'redwater':'stonewake';expect(conquestGuide(s,neighbor).status).not.toBe('besieged');
 });
 it('lets Stonewake scouts stop after obtaining the report before entering the activation boundary',()=>{
  const stop=CONQUEST_ROUTES.stonewake.discovery.at(-1)!,site=LANDMARKS.find(p=>p.id==='stonewake-quarry')!;
  expect(Math.hypot(stop.x-site.x,stop.y-site.y)).toBeLessThan(4);expect(Math.hypot(stop.x-50,stop.y-9)).toBeGreaterThanOrEqual(8);
 });
 it('plans captured-hall visits beside the building footprint without granting rewards',()=>{
  const s=frontier();s.march!.rival!.status='captured';makeBuilding(s,'hearth',47,29,true).owner='player';const before=JSON.stringify(s),v=conquestGuide(s,'mossgate'),p=v.stops[0];
  expect(v.status).toBe('secured');expect(p).not.toMatchObject({x:47,y:29});expect(findPath(s,ROAD_EXIT,p).length).toBeGreaterThan(0);expect(JSON.stringify(s)).toBe(before);
 });
 it('advances presentation only after the commander physically reaches a leg',()=>{
  const s=frontier(),hero=army(s).find(u=>u.id===s.commander!.id)!,nav:ConquestNavigation={id:'stonewake',stage:'',leg:0,path:[]};
  const first=advanceRoute(s,nav)!;expect(first).toMatchObject({x:21,y:10});expect(nav.leg).toBe(0);Object.assign(hero,first);expect(advanceRoute(s,nav)).toMatchObject({x:35,y:9});expect(nav.leg).toBe(1);
  expect(hero.order).toBe('hold');expect(s.march!.seen).toEqual([]);
 });
 it('guides home travellers to the actual southern road, never teleports',()=>{
  const s=newGame(),before=JSON.stringify(s),nav:ConquestNavigation={id:'tallowmere',stage:'',leg:0,path:[]};expect(advanceRoute(s,nav)).toMatchObject(ROAD_EXIT);expect(JSON.stringify(s)).toBe(before);
 });
 for(const count of [5,100,200])it(`keeps a ${count}-soldier commander on the clue and unselected guards independent`,()=>{
  const s=frontier(),hero=army(s)[0];while(army(s).length<count)makeUnit(s,army(s).length%2?'ranger':'warden',14,24);
  const guard=army(s).at(-1)!;guard.order='defend';const before=JSON.stringify(guard),ids=army(s).filter(u=>u.id!==guard.id).map(u=>u.id),point={x:21,y:10};
  for(const order of conquestMoveOrders(s,ids,point))expect(command(s,order).ok).toBe(true);
  expect(hero.target).toEqual(point);expect(hero.order).toBe('move');expect(JSON.stringify(guard)).toBe(before);
  expect(new Set(army(s).filter(u=>ids.includes(u.id)&&u.id!==hero.id).map(u=>`${u.target.x},${u.target.y}`)).size).toBe(count-2);
 });
});
