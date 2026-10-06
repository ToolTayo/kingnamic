import {describe,it,expect} from 'vitest';
import {army,enemies,newGame,makeUnit,makeBuilding} from '../src/game/state';
import {command,buildError} from '../src/game/commands';
import {ROAD_EXIT,empireArmy,empireStep,travelError} from '../src/game/empire';
import {decode} from '../src/game/persistence';
import {combatStep} from '../src/game/combat';
import {advance} from '../src/game/simulation';
import {infect,plagueStep} from '../src/game/disease';
import {rates} from '../src/game/economy';
import {launchError} from '../src/game/expedition';
import {nearestOpen} from '../src/game/navigation';
import {tileAt,tilesFor} from '../src/game/map';
import {MAP_W,MAP_H} from '../src/game/config';
import type {State} from '../src/game/types';
function depart(){const s=newGame();command(s,{type:'commander-appoint'});const party=army(s).slice(0,2);for(const u of party)Object.assign(u,ROAD_EXIT,{target:{...ROAD_EXIT},order:'hold'});expect(command(s,{type:'travel',ids:party.map(u=>u.id)}).ok).toBe(true);return s;}
function cleared(){const s=depart();s.units=army(s);s.resources.wood=500;s.resources.stone=500;return s;}
function founded(){const s=cleared();expect(command(s,{type:'build',kind:'hearth',x:16,y:21})).toMatchObject({ok:true});return s;}
function road(s:State){const u=army(s).find(u=>u.id===s.commander!.id)!;Object.assign(u,ROAD_EXIT,{target:{...ROAD_EXIT},anchor:{...ROAD_EXIT},path:[]});}
const reload=(s:State)=>{const d=decode(JSON.stringify(s));expect(d).not.toBeNull();return d!;};
describe('connected regions and identity ledger',()=>{
 it('requires physical gathering, a healthy commander and safe departure',()=>{
  const s=newGame();expect(travelError(s,[])).toContain('Appoint');command(s,{type:'commander-appoint'});expect(travelError(s,[])).toContain('southern');road(s);
  const companion=army(s)[1];expect(travelError(s,[companion.id])).toContain('Gather');Object.assign(companion,ROAD_EXIT);companion.injury=1;expect(travelError(s,[companion.id])).toContain('fit');delete companion.injury;
  infect(s,companion,'bite');expect(travelError(s,[companion.id])).toContain('fit');command(s,{type:'treat',ids:[companion.id]});expect(travelError(s,[companion.id])).toBeNull();
  makeUnit(s,'runner',14,23);expect(travelError(s,[])).toContain('threats');
 });
 it('moves exact bodies, shares supplies and leaves defenders at independent posts across repeated reloads',()=>{
  let s=depart();const hero=s.commander!.id,guard=army(s.empire!.reserve)[0];guard.order='defend';guard.anchor={x:17,y:17};guard.hp-=9;const before=JSON.stringify(guard),wealth={...s.resources};
  for(let n=0;n<4;n++){s=reload(s);road(s);expect(command(s,{type:'travel',ids:[]}).ok).toBe(true);s=reload(s);expect(empireArmy(s)).toBe(3);expect(s.resources).toEqual(wealth);expect(s.units.some(u=>u.id===hero)).toBe(true);expect(s.resources).toBe(s.empire!.reserve.resources);}
  expect(JSON.stringify(army(s.empire!.reserve)[0])).toBe(before);
 });
 it('holds distant disease and encounters while charging global upkeep and paying both workforces',()=>{
  const s=depart(),home=s.empire!.reserve;infect(home,army(home)[0],'bite');s.nextId=home.nextId;const i=home.infection[0],age=i.age,hp=army(home)[0].hp;
  const global=rates(s),local=rates({...s,empire:undefined}),other=rates(home);expect(global.food).toBeCloseTo(local.food+other.food);expect(global.wood).toBeCloseTo(other.wood);
  s.units=army(s);advance(s,5);expect(i.age).toBe(age);expect(army(home)[0].hp).toBe(hp);expect(s.resources.food).toBeCloseTo(180+global.food*5);reload(s);
 });
 it('preserves shared squad names and removes dissolved assignments in both settlements immediately',()=>{
  let s=depart();command(s,{type:'squad-create',ids:army(s).map(u=>u.id),name:'Road company'});const q=s.squads![0];army(s.empire!.reserve)[0].squadId=q.id;
  command(s,{type:'squad-rename',squadId:q.id,name:'Briar watch'});s=reload(s);expect(s.empire!.reserve.squads![0].name).toBe('Briar watch');command(s,{type:'squad-delete',squadId:q.id});s=reload(s);expect([...army(s),...army(s.empire!.reserve)].every(u=>u.squadId===undefined)).toBe(true);
 });
 it('rejects cross-region duplicated people, nested regions and conflicting treasuries',()=>{
  const s=depart();let bad=structuredClone(s);bad.empire!.reserve.units.push(structuredClone(army(bad)[0]));expect(decode(JSON.stringify(bad))).toBeNull();
  bad=structuredClone(s);bad.empire!.reserve.empire={reserve:newGame(),elapsed:0};expect(decode(JSON.stringify(bad))).toBeNull();
  bad=JSON.parse(JSON.stringify(s));bad.empire!.reserve.resources.food++;expect(decode(JSON.stringify(bad))).toBeNull();
 });
 it('records distant starvation deaths once, keeps ids unique and never resurrects them during travel',()=>{
  let s=cleared(),home=s.empire!.reserve;home.jobs.farmers=0;s.resources.food=0;const victim=army(home)[0];victim.hp=1;infect(home,victim,'bite');s.nextId=home.nextId;
  empireStep(s,12);expect(army(home)).toHaveLength(0);expect(home.corpses!.some(c=>c.personId===victim.id&&c.tainted)).toBe(true);s=reload(s);road(s);command(s,{type:'travel',ids:[]});expect(army(s).some(u=>u.id===victim.id)).toBe(false);reload(s);
 });
 it('includes distant soldiers in garrison reservations for Lost Battalions',()=>{
  const s=depart();s.units=army(s);road(s);command(s,{type:'travel',ids:[]});s.resources.stone=500;
  while(empireArmy(s)<22)makeUnit(s,'warden',14,15);expect(launchError(s)).toContain('reserve room');
 });
 it('keeps original Lost Battalions launch, retreat, extraction and saves valid after travel',()=>{
  let s=cleared();road(s);command(s,{type:'travel',ids:army(s).map(u=>u.id)});command(s,{type:'recruit',kind:'warden',count:2});expect(command(s,{type:'expedition-launch'})).toMatchObject({ok:true});s=reload(s);advance(s,1);s=reload(s);
  command(s,{type:'expedition-retreat'});expect(command(s,{type:'expedition-extract'})).toMatchObject({ok:true});s=reload(s);expect(empireArmy(s)).toBe(5);expect(s.empire!.reserve.region).toBe('march');
 });
});
describe('secure territory and free construction',()=>{
 it('discovers places through proximity, recovers their supplies once and needs no map purchase',()=>{
  const s=cleared(),hero=army(s)[0],before={...s.resources};Object.assign(hero,{x:14,y:12});empireStep(s,.1);expect(s.march!.seen).toEqual(['village']);expect(s.resources).toEqual({...before,food:before.food+18});expect(command(s,{type:'claim',territory:'pinewatch'}).ok).toBe(false);
 });
 it('opens a large connected landscape with varied terrain and a road to distant landmarks',()=>{
  const s=depart(),march=tilesFor(s),kinds=new Set(march.map(t=>t.terrain));expect(march).toHaveLength(MAP_W*MAP_H);for(const kind of ['grass','forest','rock','water','road','marsh','heath','field'])expect(kinds.has(kind as any)).toBe(true);expect(tileAt(52,35,s)).toBeDefined();expect(tileAt(60,35,s)).toBeUndefined();expect(march.filter(t=>t.terrain==='road'&&t.x>30&&t.y>30).length).toBeGreaterThan(10);
 });
 it('spawns a finite ambush at a discovered camp and escorts its real survivors back once',()=>{
  const s=cleared(),home=s.empire!.reserve,before=home.population,hero=army(s)[0];Object.assign(hero,{x:33,y:24});empireStep(s,.1);expect(s.march!.seen).toContain('splitford');expect(enemies(s)).toHaveLength(3);
  s.units=army(s);Object.assign(hero,{x:47,y:29});empireStep(s,.1);expect(s.march!.seen).toContain('mossgate');expect(enemies(s)).toHaveLength(3);s.units=army(s);empireStep(s,.1);expect(home.population).toBe(before+3);expect(s.march!.rescued).toContain('mossgate');const saved=reload(s);expect(saved.empire!.reserve.population).toBe(before+3);expect(saved.march!.rescued).toEqual(['mossgate']);
 });
 it('requires clearing and a genuine defensive and civilian founding crew',()=>{
  const s=depart();expect(buildError(s,'hearth',16,21)).toContain('Clear');s.units=army(s);s.resources.stone=100;s.empire!.reserve.jobs.builders=6;s.empire!.reserve.jobs.miners=8;expect(buildError(s,'hearth',16,21)).toContain('unassigned');
 });
 it('transfers two real home workers and awards recovered stores only once after rebuilding',()=>{
  let s=cleared(),pop=s.empire!.reserve.population,ids=new Set(s.empire!.reserve.residents!.map(r=>r.id));expect(command(s,{type:'build',kind:'hearth',x:16,y:21}).ok).toBe(true);
  expect(s.resources.wood).toBe(480);expect(s.resources.stone).toBe(480);expect(s.population).toBe(2);expect(s.empire!.reserve.population).toBe(pop-2);expect(s.residents!.every(r=>ids.has(r.id))).toBe(true);s=reload(s);
  s.buildings=s.buildings.filter(b=>b.kind!=='hearth');empireStep(s,.1);expect(s.march!.secured).toBe(false);expect(command(s,{type:'build',kind:'hearth',x:16,y:21}).ok).toBe(true);expect(s.resources.wood).toBe(400);expect(s.resources.stone).toBe(440);reload(s);
 });
 it('allows diverse open sites and rejects water, dense forest, occupied exits and trapped doorways',()=>{
  const s=founded();expect(command(s,{type:'build',kind:'farm',x:18,y:20}).ok).toBe(true);expect(command(s,{type:'build',kind:'cottage',x:19,y:20}).ok).toBe(true);expect(buildError(s,'farm',18,20)).toContain('already');
  expect(buildError(s,'wall',8,20)).toContain('river');const forest=tilesFor(s).find(t=>t.terrain==='forest')!;expect(buildError(s,'cottage',forest.x,forest.y)).toContain('grove');s.units=army(s).filter(u=>u.id===s.commander!.id);Object.assign(s.units[0],{x:15,y:22});expect(buildError(s,'wall',14,24)).toContain('banners');
  makeBuilding(s,'wall',15,21,true);makeBuilding(s,'wall',17,21,true);makeBuilding(s,'wall',16,20,true);expect(buildError(s,'wall',16,22)).toContain('doorway');expect(buildError(s,'gate',16,22)).toBeNull();
 });
 it('constructs using the outpost crew and retains buildings, damage and local defense orders on return',()=>{
  let s=founded();command(s,{type:'build',kind:'farm',x:18,y:20});advance(s,25);const farm=s.buildings.find(b=>b.kind==='farm')!;expect(farm.progress).toBe(1);farm.hp-=17;const defender=army(s).find(u=>u.id!==s.commander!.id)!;defender.order='defend';defender.anchor={x:16,y:21};const snapshot=JSON.stringify(s.buildings);
  road(s);expect(command(s,{type:'travel',ids:[]}).ok).toBe(true);s=reload(s);advance(s,2);road(s);expect(command(s,{type:'travel',ids:[]}).ok).toBe(true);expect(JSON.stringify(s.buildings)).toBe(snapshot);expect(army(s).find(u=>u.id===defender.id)!.order).toBe('defend');reload(s);
 });
 it('names and persists multiple distant settlements with separate construction crews',()=>{
  let s=founded(),first=s.buildings.find(b=>b.kind==='hearth')!;expect(first.name).toBe('Briar Outpost');expect(command(s,{type:'settlement-rename',id:first.id,name:'Greenhollow'}).ok).toBe(true);
  const hero=army(s).find(u=>u.id===s.commander!.id)!,guard=army(s).find(u=>u.id!==hero.id)!,candidate=tilesFor(s).filter(t=>t.x>=30&&t.y>=30&&['grass','field','heath'].includes(t.terrain)&&Math.hypot(t.x-first.x,t.y-first.y)>=12).find(t=>{Object.assign(hero,{x:t.x-2,y:t.y});Object.assign(guard,{x:t.x-1,y:t.y+1});return buildError(s,'hearth',t.x,t.y)===null;});
  expect(candidate).toBeDefined();expect(command(s,{type:'build',kind:'hearth',x:candidate!.x,y:candidate!.y})).toMatchObject({ok:true});const second=s.buildings.filter(b=>b.kind==='hearth').at(-1)!;expect(command(s,{type:'settlement-rename',id:second.id,name:'Northwatch'}).ok).toBe(true);expect(s.buildings.filter(b=>b.kind==='hearth').map(b=>b.name)).toEqual(['Greenhollow','Northwatch']);expect(s.empire!.reserve.population).toBe(14);expect(s.population).toBe(4);s=reload(s);expect(s.buildings.filter(b=>b.kind==='hearth').map(b=>b.name)).toEqual(['Greenhollow','Northwatch']);expect(s.buildings.some(b=>b.x===candidate!.x&&b.y===candidate!.y)).toBe(true);
 });
 it('warns before a bounded incursion and persists the warning without rerolling',()=>{
  let s=founded();s.march!.incursion=89.9;empireStep(s,.1);expect(s.march!.warning).toBe(8);expect(enemies(s)).toHaveLength(0);s=reload(s);empireStep(s,7);expect(enemies(s)).toHaveLength(0);empireStep(s,1);expect(enemies(s)).toHaveLength(4);expect(new Set(enemies(s).map(u=>u.x+','+u.y)).size).toBe(4);reload(s);
 });
});
describe('commander is an actual mortal soldier',()=>{
 for(const [weapon,range,damage]of [['sword',1.1,22],['spear',2,19],['bow',4,14]] as const)it(weapon+' has its own usable range and cooldown, without free healing',()=>{
  const s=cleared(),hero=army(s)[0];s.units=[hero];Object.assign(hero,{x:14,y:14});hero.hp-=20;const hp=hero.hp;expect(command(s,{type:'commander-weapon',weapon}).ok).toBe(true);expect(hero.hp).toBe(hp);const z=makeUnit(s,'hollow',14+range,14),before=z.hp;
  combatStep(s,.1,false,{walk:{x:0,y:0},attack:true,aim:z});expect(before-z.hp).toBe(damage);const after=z.hp;combatStep(s,.1,false,{walk:{x:0,y:0},attack:true,aim:z});expect(z.hp).toBe(after);reload(s);
 });
 it('honors collision, symptomatic weakness and credited kills while excluding reanimated rewards',()=>{
  const s=cleared(),hero=army(s)[0];s.units=[hero];Object.assign(hero,{x:14,y:14});makeBuilding(s,'wall',15,14,true);for(let n=0;n<10;n++)combatStep(s,.1,false,{walk:{x:1,y:0},attack:false});expect(hero.x).toBeLessThan(14.39);
  Object.assign(hero,{x:14,y:14});infect(s,hero,'bite',20);const z=makeUnit(s,'hollow',14,15);const hp=z.hp;combatStep(s,.1,false,{walk:{x:0,y:0},attack:true,aim:z});expect(hp-z.hp).toBeCloseTo(22*.8);
  z.hp=1;hero.cooldown=0;combatStep(s,.1,false,{walk:{x:0,y:0},attack:true,aim:z});expect(s.commander!.xp).toBe(1);const rise=makeUnit(s,'hollow',14,15);rise.reanimatedFrom=s.nextId++;rise.hp=1;hero.cooldown=0;combatStep(s,.1,false,{walk:{x:0,y:0},attack:true,aim:rise});expect(s.commander!.xp).toBe(1);
 });
 it('preserves the fallen commander and tainted remains, then appoints a survivor without duplication',()=>{
  let s=cleared(),hero=army(s)[0];infect(s,hero,'bite');hero.hp=0;combatStep(s,.1);s=reload(s);expect(army(s).some(u=>u.id===hero.id)).toBe(false);expect(travelError(s,[])).toContain('living');plagueStep(s,8);expect(enemies(s).some(u=>u.reanimatedFrom===hero.id)).toBe(true);s=reload(s);expect(command(s,{type:'commander-appoint',id:army(s)[0].id}).ok).toBe(true);expect(empireArmy(s)).toBe(2);reload(s);
 });
});

for(const count of [100,200])it(count+' soldiers physically assemble a convoy without overlapping target slots or lost bodies',()=>{
 const s=newGame();s.units=[];const reserved=new Set<number>();for(let n=0;n<count;n++){const p=nearestOpen(s,{x:10+n%12,y:7+Math.floor(n/12)},reserved);reserved.add(Math.round(p.y)*30+Math.round(p.x));makeUnit(s,n%3===0?'ranger':'warden',p.x,p.y);}command(s,{type:'commander-appoint',id:army(s)[0].id});const ids=army(s).map(u=>u.id);
 expect(command(s,{type:'gather-company',ids}).ok).toBe(true);expect(new Set(army(s).map(u=>u.target.x+','+u.target.y)).size).toBe(count);const hero=army(s)[0];expect(hero.target).toEqual(ROAD_EXIT);
 for(let n=0;n<900&&travelError(s,ids);n++)combatStep(s,.1);
 expect(travelError(s,ids)).toBeNull();expect(command(s,{type:'travel',ids}).ok).toBe(true);expect(empireArmy(s)).toBe(count);expect(army(s).map(u=>u.id).sort()).toEqual(ids.sort());reload(s);
});

it('does not admit settlers before the March has a founded beacon',()=>{
 const s=cleared(),before=s.population;expect(command(s,{type:'settlers'}).ok).toBe(false);expect(s.population).toBe(before);expect(command(s,{type:'build',kind:'hearth',x:16,y:21}).ok).toBe(true);expect(command(s,{type:'settlers'}).ok).toBe(true);expect(s.population).toBe(7);reload(s);
});
it('rejects a soldier duplicated between an active Lost Battalion patrol and a distant settlement',()=>{
 const s=cleared();road(s);command(s,{type:'travel',ids:army(s).map(u=>u.id)});command(s,{type:'recruit',kind:'warden',count:2});expect(command(s,{type:'expedition-launch'}).ok).toBe(true);reload(s);
 const duplicate=structuredClone(army(s.expedition!.world)[0]);delete duplicate.origin;delete duplicate.homeId;s.empire!.reserve.units.push(duplicate);expect(decode(JSON.stringify(s))).toBeNull();
});

it('keeps regional gates solid to infected crowd pressure while allowing friendly passage',async()=>{
 const {movementBlocker,navigation}=await import('../src/game/navigation'),{separateCrowd}=await import('../src/game/crowd');const s=cleared();s.units=[];const gate=makeBuilding(s,'gate',14,20,true),front=makeUnit(s,'hollow',14,20.64);makeUnit(s,'brute',14,20.85);
 expect(movementBlocker(navigation(s),{x:14,y:20.7},{x:14,y:20},true)).toBe(gate);expect(movementBlocker(navigation(s),{x:14,y:20.7},{x:14,y:20},false)).toBeUndefined();for(let n=0;n<30;n++)separateCrowd(s,s.units,.1);expect(front.y).toBeGreaterThanOrEqual(20.62);gate.hp=0;expect(movementBlocker(navigation(s),{x:14,y:20.7},{x:14,y:20},true)).toBeUndefined();
});

it('recovers command at home after a complete regional wipe without returning dead soldiers or erasing the outpost',()=>{
 let s=founded();expect(command(s,{type:'home-watch'}).ok).toBe(false);const fallen=army(s).map(u=>u.id),home=army(s.empire!.reserve).map(u=>u.id);for(const u of army(s))u.hp=0;combatStep(s,.1);const outpost=JSON.stringify(s.buildings),people=s.population;expect(army(s)).toHaveLength(0);s=reload(s);expect(command(s,{type:'home-watch'}).ok).toBe(true);expect(s.region).toBeUndefined();expect(army(s).map(u=>u.id)).toEqual(home);expect(army(s).some(u=>fallen.includes(u.id))).toBe(false);expect(JSON.stringify(s.empire!.reserve.buildings)).toBe(outpost);expect(s.empire!.reserve.population).toBe(people);expect(s.empire!.reserve.corpses!.map(c=>c.personId).sort()).toEqual(fallen.sort());reload(s);
});
