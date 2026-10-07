import {describe,it,expect} from 'vitest';
import {army,enemies,makeBuilding,makeUnit,newGame} from '../src/game/state';
import {command} from '../src/game/commands';
import {commandableIds} from '../src/game/army';
import {cure,infect,illnessDeadline,nextIllnessDeadline,plagueStep} from '../src/game/disease';
import {combatStep} from '../src/game/combat';
import {CivilianSystem} from '../src/game/civilians';
import {decode} from '../src/game/persistence';
import {findPath,navigation,navigationMetrics,NAV_FIELD_LIMIT} from '../src/game/navigation';
import {TILES,distance} from '../src/game/map';
import {advance} from '../src/game/simulation';
import {pickSoldier} from '../src/render/battlefield';
import {Runtime} from '../src/game/runtime';
function empty(){const s=newGame();s.units=[];s.residents=[];s.population=0;s.infection=[];s.jobs={farmers:0,miners:0,woodcutters:0,healers:0,builders:0};s.buildings=s.buildings.filter(b=>b.kind==='hearth');return s;}
describe('battlefield polish regressions',()=>{
  it('escorts an ordered ally without inheriting that ally\'s hold command',()=>{
    const s=empty(),a=makeUnit(s,'warden',10,10),b=makeUnit(s,'ranger',12,10);b.order='hold';
    // Exercise the input boundary without constructing DOM/storage listeners.
    const rt=Object.assign(Object.create(Runtime.prototype),{state:s,selectedIds:[a.id],orderMode:'escort',onChange:()=>{},onSound:()=>{}}) as Runtime;
    rt.orderAt(b,b.id);expect(a.order).toBe('escort');expect(a.focus).toBe(b.id);expect(b.order).toBe('hold');expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('warns about critical wound loss before the disease-age deadline and extends both under quarantine',()=>{
    const s=empty(),u=makeUnit(s,'ranger',10,10);u.hp=6;infect(s,u,'bite',60);const i=s.infection[0];
    expect(illnessDeadline(s,i)).toBe(3);expect(nextIllnessDeadline(s)).toBe(3);s.quarantine=true;expect(illnessDeadline(s,i)).toBe(12);
    i.age=50;expect(illnessDeadline(s,i)).toBe(32);
  });
  it('prioritizes an urgently wounded patient over an older but healthier case',()=>{
    const s=empty(),older=makeUnit(s,'warden',10,10),urgent=makeUnit(s,'ranger',12,10);older.hp=100;urgent.hp=2;infect(s,older,'bite',63);infect(s,urgent,'ground',56);
    infect(s,urgent,'bite',56);expect(cure(s,1)).toBe(1);expect(s.infection.map(i=>i.personId)).toEqual([older.id]);expect(urgent.immune).toBe(35);
  });
  it('finds available members without changing the assignments of wounded or isolated squadmates',()=>{
    const s=empty();for(let i=0;i<10;i++)makeUnit(s,'warden',10+i%5,10+Math.floor(i/5));const ids=army(s).map(u=>u.id);s.units[0].injury=20;infect(s,s.units[1],'bite',20);s.quarantine=true;
    command(s,{type:'squad-create',ids,name:'Watch'});const q=s.squads![0].id;
    expect(commandableIds(s,ids)).toEqual(ids.slice(2));expect(command(s,{type:'order',ids:commandableIds(s,ids),order:'hold'}).ok).toBe(true);
    expect(s.units.slice(0,2).every(u=>!u.order&&u.squadId===q)).toBe(true);expect(army(s).filter(u=>u.order==='hold')).toHaveLength(8);expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('routes quarantined soldiers to distinct refuge places without replacing their saved squad orders',()=>{
    const s=empty();makeBuilding(s,'infirmary',14,10,true);for(let i=0;i<10;i++){const u=makeUnit(s,'warden',9+i%5,15+Math.floor(i/5));infect(s,u,'bite',20);}
    const targets=s.units.map(u=>({...u.target}));s.quarantine=true;combatStep(s,.1);
    const goals=s.units.map(u=>u.path.at(-1)).filter(Boolean);expect(goals).toHaveLength(10);expect(new Set(goals.map(p=>p!.x+','+p!.y)).size).toBe(10);expect(s.units.map(u=>u.target)).toEqual(targets);
  });
  it('separates a resting villager and a soldier occupying the same doorway',()=>{
    const s=newGame();s.units=[];s.phase='night';s.jobs={farmers:0,miners:0,woodcutters:0,healers:0,builders:0};s.residents=s.residents!.slice(0,1);s.population=1;
    const c=s.residents![0],system=new CivilianSystem();system.update(s,0);c.x=c.goal.x;c.y=c.goal.y;c.path=[];const u=makeUnit(s,'warden',c.x,c.y);u.order='hold';
    for(let n=0;n<20;n++)system.update(s,.1);expect(distance(c,u)).toBeGreaterThan(.4);expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('keeps 200 distinct destination fields warm and bounded rather than rebuilding them every route cycle',()=>{
    const s=empty(),goals=TILES.filter(t=>t.terrain!=='water'&&!s.buildings.some(b=>b.x===t.x&&b.y===t.y)&&distance(t,{x:14,y:10})>2).slice(0,200);
    const initial=navigationMetrics.fieldsBuilt;for(const p of goals)findPath(s,{x:14,y:10},p);const warm=navigationMetrics.fieldsBuilt;
    for(let cycle=0;cycle<3;cycle++)for(const p of goals)findPath(s,{x:14,y:10},p);
    expect(warm-initial).toBe(200);expect(navigationMetrics.fieldsBuilt).toBe(warm);expect(navigation(s).fields.size).toBeLessThanOrEqual(NAV_FIELD_LIMIT);
    for(const p of TILES.filter(t=>t.terrain!=='water').slice(200,500))findPath(s,{x:14,y:10},p);expect(navigation(s).fields.size).toBeLessThanOrEqual(NAV_FIELD_LIMIT);
  });
  it('picks a soldier by the visible body at small zoom and restricts attack/escort focus by allegiance',()=>{
    const s=empty(),u=makeUnit(s,'warden',10,10),z=makeUnit(s,'hollow',10,10),project=()=>({x:100,y:100});
    expect(pickSoldier([u],{x:100,y:80},project,.6,true)?.id).toBe(u.id);expect(pickSoldier([u,z],{x:100,y:100},project,1,false,'attack')?.id).toBe(z.id);
    expect(pickSoldier([u,z],{x:100,y:100},project,1,false,'escort')?.id).toBe(u.id);expect(pickSoldier([u],{x:150,y:80},project,.6,true)).toBeUndefined();
  });
  it('does not render an outbreak beyond the first 64 residents as an invisible case',()=>{
    const s=newGame();const first=s.residents![0];for(let i=0;i<70;i++)s.residents!.push({...structuredClone(first),id:s.nextId++,sick:false});s.population=s.residents!.length;const last=s.residents!.at(-1)!;last.sick=true;
    const system=new CivilianSystem();system.observe(s);expect(system.people).toHaveLength(64);expect(system.people.some(r=>r.id===last.id)).toBe(true);
  });
  it('keeps uninfected ration deaths dead and reanimates confirmed infections once across reloads',()=>{
    let s=empty();s.resources.food=0;const ids:number[]=[];for(let i=0;i<10;i++){const u=makeUnit(s,'warden',8+i,15);u.hp=12;u.exposure=80;ids.push(u.id);}
    advance(s,25);expect(army(s)).toHaveLength(0);expect(s.stats.lost).toBe(10);expect(s.corpses?.every(c=>!c.tainted)).toBe(true);s=decode(JSON.stringify(s))!;expect(s).not.toBeNull();advance(s,20);
    expect(enemies(s).filter(u=>ids.includes(u.reanimatedFrom!))).toHaveLength(0);s=empty();const infected=makeUnit(s,'warden',10,10);infect(s,infected,'bite',74.95);plagueStep(s,.1);combatStep(s,.1);expect(s.corpses?.some(c=>c.personId===infected.id&&c.tainted)).toBe(true);s=decode(JSON.stringify(s))!;advance(s,9);
    expect(enemies(s).filter(u=>u.reanimatedFrom===infected.id)).toHaveLength(1);s=decode(JSON.stringify(s))!;advance(s,4);expect(s.stats.lost).toBe(1);expect(new Set(enemies(s).map(u=>u.reanimatedFrom)).size).toBe(1);
  });
});
