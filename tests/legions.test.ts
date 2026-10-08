import { describe,it,expect } from 'vitest';
import { readFileSync,writeFileSync } from 'node:fs';
import { army,enemies,makeBuilding,makeUnit,newGame } from '../src/game/state';
import { command } from '../src/game/commands';
import { combatStep, waveSize } from '../src/game/combat';
import { separateCrowd } from '../src/game/crowd';
import { cure,expose,infect,plagueStep,resolveResidentDeaths } from '../src/game/disease';
import { armyCapacity,assignDestinations,formationSlots } from '../src/game/army';
import { addResidents,assignResidentJobs } from '../src/game/population';
import { decode } from '../src/game/persistence';
import { distance,key,tileAt } from '../src/game/map';
import { movementBlocker,nearestOpen,navigation,navigationMetrics } from '../src/game/navigation';
import { MAP_H, MAP_W } from '../src/game/config';
import { healthy,rebalanceJobs,economyStep } from '../src/game/economy';
import { step } from '../src/game/simulation';
import { expeditionParty } from '../src/game/expedition';
import { CivilianSystem } from '../src/game/civilians';
import type { State } from '../src/game/types';

function empty(){const s=newGame();s.units=[];s.residents=[];s.population=0;s.jobs={farmers:0,miners:0,woodcutters:0,healers:0,builders:0};s.buildings=s.buildings.filter(b=>b.kind==='hearth');return s;}
const ticks=(s:State,n:number)=>{for(let j=0;j<n;j++){plagueStep(s,.1);combatStep(s,.1);}};
describe('individual plague lifecycle',()=>{
  it('keeps proximity harmless and requires a living zombie bite before treatment applies',()=>{
    const s=empty();addResidents(s,2);const [a,b]=s.residents!;a.x=b.x=10;a.y=b.y=10;infect(s,a,'bite');
    for(let i=0;i<570;i++)plagueStep(s,.1);expect(b.exposure).toBe(0);expect(s.infection.some(i=>i.personId===b.id)).toBe(false);
    const zombie=makeUnit(s,'hollow',11,10);expose(s,b,100,'contact',zombie.id);expect(b.exposure??0).toBe(0);
    expose(s,b,35,'bite',zombie.id);expect(s.infection.some(i=>i.personId===b.id)).toBe(false);
    expose(s,b,35,'bite',zombie.id);expose(s,b,35,'bite',zombie.id);expect(s.infection.find(i=>i.personId===b.id)?.sourceId).toBe(zombie.id);
    expect(cure(s,1,[b.id])).toBe(1);expect(s.infection.some(i=>i.personId===b.id)).toBe(false);expect(b.immune).toBe(35);
  });
  it('quarantine stops close-contact transmission and withdraws infected soldiers',()=>{
    const s=empty();const a=makeUnit(s,'warden',10,10),b=makeUnit(s,'warden',10,11);infect(s,a,'bite',20);s.quarantine=true;
    const p={x:a.x,y:a.y};ticks(s,100);expect(s.infection[0].age).toBeCloseTo(22.5);expect(b.exposure).toBe(0);expect(distance(a,p)).toBeGreaterThan(1);
    expect(command(s,{type:'order',order:'hunt',ids:[a.id],x:10,y:15}).ok).toBe(false);
  });
  it('does not infect residents from contaminated ground or supplies',()=>{
    const s=empty();const farm=makeBuilding(s,'farm',12,12,true);addResidents(s,2);const [a,b]=s.residents!;a.x=10;a.y=10;b.x=18;b.y=10;s.suppliesTaint=100;
    for(let n=0;n<950;n++){s.contamination[key(a)]=100;s.contamination[key(farm)]=100;plagueStep(s,.1);}
    expect(s.infection.some(i=>i.personId===b.id)).toBe(false);expect(b.exposure??0).toBe(0);
    expect(s.stats.lost).toBeGreaterThanOrEqual(0);expect(enemies(s)).toHaveLength(0);
  });
  it('removes a dead soldier once and reanimates once across reloads',()=>{
    let s=empty();const u=makeUnit(s,'warden',10,10);infect(s,u,'bite',74.95);ticks(s,1);
    expect(army(s)).toHaveLength(0);expect(s.stats.lost).toBe(1);expect(s.corpses).toHaveLength(1);expect(enemies(s)).toHaveLength(0);
    s=decode(JSON.stringify(s))!;expect(s).not.toBeNull();ticks(s,35);s=decode(JSON.stringify(s))!;ticks(s,47);
    expect(enemies(s).filter(z=>z.reanimatedFrom===u.id)).toHaveLength(1);expect(s.corpses).toHaveLength(0);expect(s.stats.lost).toBe(1);
    s=decode(JSON.stringify(s))!;ticks(s,20);expect(enemies(s).filter(z=>z.reanimatedFrom===u.id)).toHaveLength(1);
  });
  it('takes sick residents out of the workforce and preserves census loss',()=>{
    const s=newGame();assignResidentJobs(s);const r=s.residents!.find(r=>r.job==='farmers')!;infect(s,r,'bite',74.95);rebalanceJobs(s);expect(healthy(s)).toBe(17);
    plagueStep(s,.1);expect(s.population).toBe(17);expect(s.residents!.some(v=>v.id===r.id)).toBe(false);expect(s.jobs.farmers).toBe(3);
    expect(decode(JSON.stringify(s))?.population).toBe(17);s.population++;expect(decode(JSON.stringify(s))).toBeNull();
  });
  it('cleanses tainted remains and rejects living/dead duplication',()=>{
    const s=empty();makeBuilding(s,'infirmary',18,13,true);const u=makeUnit(s,'warden',10,10);infect(s,u,'bite');u.hp=0;combatStep(s,.1);
    const invalid=structuredClone(s);invalid.units.push({...u,hp:1});expect(decode(JSON.stringify(invalid))).toBeNull();
    expect(command(s,{type:'cleanse'}).ok).toBe(true);ticks(s,90);expect(enemies(s)).toHaveLength(0);
  });
  it('clean deaths stay dead, while untreated residents leave timed infected remains',()=>{
    const s=empty();addResidents(s,2);const [clean,ill]=s.residents!;infect(s,ill,'bite',74.95);clean.hp=0;resolveResidentDeaths(s);plagueStep(s,.1);
    expect(s.population).toBe(0);expect(s.stats.lost).toBe(2);expect(s.corpses!.filter(c=>c.tainted)).toHaveLength(1);ticks(s,82);expect(enemies(s)).toHaveLength(1);
  });
});
describe('persistent independent armies',()=>{
  it('moves protected 50-, 100- and 200-soldier formations to distinct posts when the field is clear',()=>{
    const samples:any[]=[];
    for(const count of [50,100,200]){
      const s=empty(),reserved=new Set<number>();for(let i=0;i<count;i++){const p=nearestOpen(s,{x:8+i%12,y:7+Math.floor(i/12)},reserved);reserved.add(key(p));const u=makeUnit(s,(['warden','ranger','spearman','scout'] as const)[i%4],p.x,p.y);u.order='hold';u.formation='protected';}
      const troops=army(s),ids=troops.map(u=>u.id),destination={x:35,y:24};s.formation='protected';expect(command(s,{type:'order',order:'move',ids,x:destination.x,y:destination.y,heading:{x:1,y:0}}).ok).toBe(true);
      const assigned=new Set(troops.map(u=>key(u.target)));expect(assigned.size).toBe(count);
      for(let i=0;i<1200&&troops.some(u=>u.path.length);i++)combatStep(s,.1,false);
      const distances=troops.map(u=>distance(u,u.target)),arrived=troops.filter((u,i)=>!u.path.length&&distances[i]<1).length;
      samples.push({soldiers:count,uniqueDestinations:assigned.size,arrived,arrivalRate:arrived/count,moving:troops.filter(u=>u.path.length).length,medianDistance:distances.sort((a,b)=>a-b)[Math.floor(count/2)]});
      expect(arrived/count).toBeGreaterThan(.8);expect(decode(JSON.stringify(s))).not.toBeNull();
    }
    console.info('CLEAR-FIELD FORMATION ARRIVAL',JSON.stringify(samples));
  });
  it('queues 50-, 100- and 200-soldier columns through a single intact gate without wall breaches',()=>{
    const samples:any[]=[];
    for(const count of [50,100,200]){
      const s=empty(),reserved=new Set<number>();for(let y=0;y<MAP_H;y++)makeBuilding(s,y===24?'gate':'wall',30,y,true);
      for(let i=0;i<count;i++){const p=nearestOpen(s,{x:23+i%6,y:8+Math.floor(i/6)},reserved);reserved.add(key(p));const u=makeUnit(s,i%4===0?'ranger':'warden',p.x,p.y);u.formation='column';u.order='hold';}
      const troops=army(s),ids=troops.map(u=>u.id);s.formation='column';const gate=s.buildings.find(b=>b.kind==='gate')!;
      expect(command(s,{type:'order',order:'move',ids,x:36,y:24,heading:{x:1,y:0}}).ok).toBe(true);expect(new Set(troops.map(u=>key(u.target))).size).toBe(count);
      const nav=navigation(s);let crossed=0;
      for(let step=0;step<2400;step++){
        const before=troops.map(u=>({x:u.x,y:u.y}));combatStep(s,.1,false);
        for(let i=0;i<troops.length;i++)if(before[i].x<=gate.x&&troops[i].x>gate.x){expect(Math.abs(troops[i].y-gate.y)).toBeLessThan(.8);crossed++;expect(movementBlocker(nav,before[i],troops[i],false,false,'player')).toBeUndefined();}
        if(troops.every(u=>!u.path.length))break;
      }
      const arrived=troops.filter(u=>distance(u,u.target)<.3).length;samples.push({soldiers:count,crossed,inside:troops.filter(u=>u.x>gate.x+1).length,arrived,moving:troops.filter(u=>u.path.length).length});
      expect(crossed).toBeGreaterThan(0);expect(arrived/count).toBeGreaterThan(.8);expect(troops.every(u=>Number.isFinite(u.x)&&Number.isFinite(u.y))).toBe(true);expect(decode(JSON.stringify(s))).not.toBeNull();
    }
    console.info('SINGLE-GATE FORMATION FLOW',JSON.stringify(samples));
  });
  it('builds distinct heading-aware line, protected-ranged and two-file column destinations',()=>{
    const s=empty();for(let i=0;i<12;i++)makeUnit(s,(i<6?'warden':i<8?'spearman':i<11?'ranger':'scout'),8+i%6,8+Math.floor(i/6));const troops=army(s),center={x:24,y:22},heading={x:1,y:0};
    s.formation='line';const line=formationSlots(s,troops,center,heading);expect(new Set(line.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size).toBe(troops.length);
    expect(Math.max(...line.map(p=>p.y))-Math.min(...line.map(p=>p.y))).toBeGreaterThan(2);
    s.formation='protected';for(const u of troops)u.formation='protected';const protectedSlots=formationSlots(s,troops,center,heading),melee=protectedSlots.filter(p=>!p.rear),bows=protectedSlots.filter(p=>p.rear);
    expect(melee).toHaveLength(8);expect(bows).toHaveLength(4);expect(Math.min(...bows.map(p=>p.rank))-Math.max(...melee.map(p=>p.rank))).toBeGreaterThanOrEqual(3);
    s.formation='column';for(const u of troops)u.formation='column';const column=formationSlots(s,troops,center,heading);expect(Math.max(...column.map(p=>p.y))-Math.min(...column.map(p=>p.y))).toBeLessThan(1);
    for(const u of troops)u.formation='protected';assignDestinations(s,troops,center,'move',undefined,heading);expect(new Set(troops.map(u=>key(u.target))).size).toBe(troops.length);expect(troops.every(u=>u.anchor?.x===u.target.x&&u.anchor?.y===u.target.y)).toBe(true);
    expect(decode(JSON.stringify(s))?.units.every(u=>u.formation==='protected')).toBe(true);
  });
  it('keeps a solo selected ranger on the commanded tile in any formation',()=>{
    const s=empty(),ranger=makeUnit(s,'ranger',10,10),point={x:21,y:17};ranger.formation='protected';
    expect(formationSlots(s,[ranger],point,{x:0,y:1})).toEqual([{id:ranger.id,kind:'ranger',rank:0,rear:false,...point}]);
    assignDestinations(s,[ranger],point,'move',undefined,{x:0,y:1});expect(ranger.target).toEqual(point);
  });
  it('can demobilize to rebuild the workforce without refunding equipment or healing wounds',()=>{
    const s=newGame();const u=army(s)[0],id=u.id;u.hp=u.maxHp*.8;const resources={...s.resources};
    expect(command(s,{type:'demobilize',ids:[id]}).ok).toBe(true);expect(s.residents!.find(r=>r.id===id)?.hp).toBe(40);expect(s.resources).toEqual(resources);expect(army(s).some(u=>u.id===id)).toBe(false);
    expect(command(s,{type:'demobilize',ids:[id]}).ok).toBe(false);expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('army rations have real consequences and later watch waves scale within hard bounds',()=>{
    const s=empty();const u=makeUnit(s,'warden',10,10);s.resources.food=0;economyStep(s,12);expect(u.hp).toBe(u.maxHp-6);s.endless=true;s.day=10;expect(waveSize(s)).toBe(45);
    for(let i=1;i<200;i++)makeUnit(s,'warden',10,10);expect(waveSize(s)).toBe(135);expect(armyCapacity(s)).toBe(0);
  });
  it('targeted attacks, regroup and scoped formations leave another squad untouched',()=>{
    const s=empty(),a=makeUnit(s,'warden',10,10),b=makeUnit(s,'ranger',12,10),z=makeUnit(s,'hollow',10,13);command(s,{type:'order',order:'hold',ids:[b.id]});const saved=structuredClone(b);
    expect(command(s,{type:'order',order:'attack',ids:[a.id],focus:z.id}).ok).toBe(true);for(let n=0;n<30;n++)combatStep(s,.1);expect(z.hp).toBeLessThan(z.maxHp);
    command(s,{type:'formation',formation:'loose',ids:[a.id]});expect(b.formation).toBe(saved.formation);command(s,{type:'order',order:'regroup',ids:[a.id]});expect(b.order).toBe('hold');expect(b.target).toEqual(saved.target);
  });
  it('focused gate attackers intercept an immediately threatening infected before striking the wall',()=>{
    const s=empty(),guard=makeUnit(s,'warden',10,10),infected=makeUnit(s,'hollow',10,11),gate=makeBuilding(s,'gate',18,10,true),gateHp=gate.hp,infectedHp=infected.hp;gate.owner='rival';
    expect(command(s,{type:'order',order:'attack',ids:[guard.id],x:gate.x,y:gate.y,focus:gate.id}).ok).toBe(true);
    combatStep(s,.1,false);
    expect(infected.hp).toBeLessThan(infectedHp);expect(gate.hp).toBe(gateHp);
  });
  it('grows capacity through garrisons and pays for recruitment from individual residents',()=>{
    const s=newGame();expect(armyCapacity(s)).toBe(24);const b=s.buildings.find(b=>b.kind==='barracks')!;s.resources={wood:9999,stone:9999,food:9999,herbs:99};
    command(s,{type:'upgrade',id:b.id});expect(armyCapacity(s)).toBe(48);const before=s.population,crowns=s.resources.stone,ids=s.residents!.map(r=>r.id);
    expect(command(s,{type:'recruit',kind:'spearman',count:5}).ok).toBe(true);expect(s.population).toBe(before-5);expect(s.resources.stone).toBe(crowns-110);expect(army(s).filter(u=>ids.includes(u.id))).toHaveLength(5);expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('equips a 100-soldier army with real recruitment commands, census consumption and full costs',()=>{
    const s=newGame();s.resources={wood:9999,stone:9999,food:9999,herbs:50};addResidents(s,100);
    for(const [x,y]of [[18,8],[19,8]])makeBuilding(s,'barracks',x,y,true);
    for(const b of s.buildings.filter(b=>b.kind==='barracks')){command(s,{type:'upgrade',id:b.id});command(s,{type:'upgrade',id:b.id});}
    expect(armyCapacity(s)).toBe(200);const pop=s.population,food=s.resources.food,wood=s.resources.wood,crowns=s.resources.stone;
    while(army(s).length<100){const n=Math.min(5,100-army(s).length);expect(command(s,{type:'recruit',kind:'warden',count:n}).ok).toBe(true);}
    expect(s.population).toBe(pop-97);expect(s.resources.food).toBe(food);expect(s.resources.wood).toBe(wood);expect(s.resources.stone).toBe(crowns-97*20);expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('keeps five guards independent of five hunters, including split, merge and reload',()=>{
    let s=empty();for(let i=0;i<10;i++)makeUnit(s,i%3?'warden':'ranger',10+i%5,14+Math.floor(i/5));const ids=army(s).map(u=>u.id),home=ids.slice(0,5),hunt=ids.slice(5);
    command(s,{type:'squad-create',ids:home,name:'Gate Watch'});command(s,{type:'squad-create',ids:hunt,name:'Outriders'});
    command(s,{type:'order',order:'defend',ids:home,x:14,y:17});const destinations=army(s).slice(0,5).map(u=>({...u.target}));
    command(s,{type:'order',order:'hunt',ids:hunt,x:14,y:23});expect(army(s).slice(0,5).map(u=>u.target)).toEqual(destinations);
    s=decode(JSON.stringify(s))!;expect(s.squads).toHaveLength(2);expect(army(s).filter(u=>u.order==='hunt')).toHaveLength(5);
    command(s,{type:'squad-create',ids:hunt.slice(0,2),name:'Scouts'});command(s,{type:'squad-assign',ids:hunt,squadId:s.squads![0].id});
    expect(army(s).filter(u=>u.squadId===s.squads![0].id)).toHaveLength(10);expect(army(s).slice(0,5).map(u=>u.target)).toEqual(destinations);
  });
  it('patrol reverses at its destination, hold stays put, escort follows, retreat survives contact',()=>{
    const s=empty();const a=makeUnit(s,'warden',10,10),b=makeUnit(s,'scout',10,12);
    command(s,{type:'order',order:'patrol',ids:[a.id],x:12,y:10});let reversed=false;for(let i=0;i<50;i++){combatStep(s,.1);reversed ||= a.patrol?.leg===0;}expect(reversed).toBe(true);
    command(s,{type:'order',order:'hold',ids:[a.id]});const p={x:a.x,y:a.y};makeUnit(s,'hollow',a.x+4,a.y);combatStep(s,.1);expect(distance(a,p)).toBe(0);
    command(s,{type:'order',order:'escort',ids:[b.id],focus:a.id});a.x=16;a.y=12;combatStep(s,.1);expect(distance(b.target,a)).toBeLessThan(2);
    command(s,{type:'order',order:'retreat',ids:[b.id]});const d=distance(b,b.target);for(let i=0;i<10;i++)combatStep(s,.1);expect(distance(b,b.target)).toBeLessThan(d);
  });
  it('preserves expedition veterans, squad identities and infection on return',()=>{
    const s=newGame();s.resources={wood:500,stone:500,food:500,herbs:50};command(s,{type:'recruit',kind:'warden',count:2});const ids=army(s).slice(0,3).map(u=>u.id);
    command(s,{type:'squad-create',ids,name:'Veterans'});expect(command(s,{type:'expedition-launch',ids}).ok).toBe(true);const veteran=expeditionParty(s.expedition!)[0];infect(s.expedition!.world,veteran,'bite',20);
    expect(decode(JSON.stringify(s))).not.toBeNull();command(s,{type:'expedition-retreat'});expect(command(s,{type:'expedition-extract'}).ok).toBe(true);
    expect(army(s).filter(u=>ids.includes(u.id))).toHaveLength(3);expect(s.infection[0].personId).toBe(veteran.id);expect(army(s).find(u=>u.id===veteran.id)?.squadId).toBe(s.squads![0].id);expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('renames and replaces full squad ledgers in the field without overflowing the home save',()=>{
    const s=newGame();s.resources={wood:500,stone:500,food:500,herbs:50};command(s,{type:'recruit',kind:'warden',count:2});const ids=army(s).slice(0,3).map(u=>u.id);
    for(let n=0;n<20;n++)expect(command(s,{type:'squad-create',ids,name:'Watch '+n}).ok).toBe(true);
    command(s,{type:'expedition-launch',ids});const removed=s.squads![0].id,renamed=s.squads![19].id;
    command(s,{type:'squad-delete',squadId:removed});command(s,{type:'squad-rename',squadId:renamed,name:'Veterans'});command(s,{type:'squad-create',ids,name:'Field Watch'});
    expect(decode(JSON.stringify(s))).not.toBeNull();command(s,{type:'expedition-retreat'});command(s,{type:'expedition-extract'});
    expect(s.squads).toHaveLength(20);expect(s.squads!.find(q=>q.id===renamed)?.name).toBe('Veterans');expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('migrates legacy census and plague cases once without changing progress',()=>{
    const legacy=JSON.parse(readFileSync(new URL('./fixtures/milestone-v2.json',import.meta.url),'utf8'));const s=decode(JSON.stringify(legacy))!;
    expect(s.population).toBe(legacy.population);expect(s.residents).toHaveLength(legacy.population);expect(s.units).toEqual(legacy.units);expect(s.resources).toEqual(legacy.resources);
    expect(decode(JSON.stringify(s))?.residents?.map(r=>r.id)).toEqual(s.residents!.map(r=>r.id));
  });
  it('invites paid settlers only with housing and cooldown and continues after chapter victory',()=>{
    const s=newGame();const crowns=s.resources.stone;expect(command(s,{type:'settlers'}).ok).toBe(true);expect(s.population).toBe(23);expect(s.resources.stone).toBe(crowns-20);expect(command(s,{type:'settlers'}).ok).toBe(false);
    s.outcome='won';expect(command(s,{type:'continue'}).ok).toBe(true);expect(s.endless).toBe(true);s.stats.nights=5;s.owned=['hearthmere','pinewatch','greybank','fen'];step(s);expect(s.outcome).toBe('playing');
  });
});
const stress:object[]=[];
describe('large army simulation',()=>{
  it('routes 100 soldiers across the southern crossing with bounded congestion',()=>{
    const s=empty();s.buildings=newGame().buildings;const reserved=new Set<number>();
    for(let i=0;i<100;i++){const p=nearestOpen(s,{x:9+i%12,y:8+Math.floor(i/12)},reserved);reserved.add(key(p));makeUnit(s,'warden',p.x,p.y);}
    command(s,{type:'order',order:'move',ids:army(s).map(u=>u.id),x:14,y:23});
    for(let n=0;n<900;n++)combatStep(s,.1);
    const arrived=army(s).filter(u=>distance(u,u.target)<.5).length;
    writeFileSync('docs/evidence/legions-crossing.json',JSON.stringify({soldiers:100,seconds:90,arrived,moving:army(s).filter(u=>u.order==='move').length,stuck:army(s).filter(u=>distance(u,u.target)>=.5).map(u=>({id:u.id,x:u.x,y:u.y,target:u.target}))},null,2));
    expect(arrived).toBe(100);expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  it('keeps dense edge formations inside the saved coordinate bounds',()=>{
    const s=empty();for(let i=0;i<20;i++)makeUnit(s,'warden',i%2?0:29,i<10?0:25);for(let n=0;n<100;n++)separateCrowd(s,s.units,.1);
    expect(s.units.every(u=>u.x>=0&&u.x<=MAP_W-1&&u.y>=0&&u.y<=MAP_H-1)).toBe(true);expect(decode(JSON.stringify(s))).not.toBeNull();
  });
  for(const count of [10,50,100,200])it(`moves and saves ${count} soldiers under combat stress`,()=>{
    const s=empty();s.buildings=newGame().buildings;s.nextId=Math.max(s.nextId,...s.buildings.map(b=>b.id+1));const reserved=new Set<number>();
    for(let i=0;i<count;i++){const p=nearestOpen(s,{x:9+i%12,y:7+Math.floor(i/12)},reserved);reserved.add(key(p));makeUnit(s,(['warden','ranger','spearman','scout'] as const)[i%4],p.x,p.y);}
    for(let i=0;i<Math.max(10,count/2);i++){const p=nearestOpen(s,{x:10+i%10,y:22+Math.floor(i/10)%4},reserved);reserved.add(key(p));makeUnit(s,i%7===0?'brute':i%3?'hollow':'runner',p.x,p.y);}
    const ids=army(s).map(u=>u.id);command(s,{type:'order',order:'defend',ids:ids.slice(0,5),x:14,y:17});const queriesBefore=navigationMetrics.pathQueries;command(s,{type:'order',order:'hunt',ids:ids.slice(5),x:14,y:23});const singleGroupRouteQueries=navigationMetrics.pathQueries-queriesBefore,orderedGroup=s.units.filter(u=>ids.slice(5).includes(u.id)),uniqueFormationSlots=new Set(orderedGroup.map(u=>key(u.target))).size;
    expect(uniqueFormationSlots).toBe(count-5);
    const started=performance.now(),fields=navigationMetrics.fieldsBuilt;for(let i=0;i<200;i++){combatStep(s,.1);plagueStep(s,.1);}
    const elapsed=performance.now()-started;stress.push({soldiers:count,hostiles:Math.max(10,count/2),steps:200,msPerStep:elapsed/200,singleGroupRouteQueries,uniqueFormationSlots,fieldsBuilt:navigationMetrics.fieldsBuilt-fields,surviving:army(s).length,slain:s.stats.slain});
    expect(singleGroupRouteQueries).toBe(1);expect(army(s).length).toBeLessThanOrEqual(count);expect(s.units.every(u=>Number.isFinite(u.x)&&tileAt(Math.round(u.x),Math.round(u.y))?.terrain!=='water')).toBe(true);expect(s.stats.slain).toBeGreaterThan(0);expect(decode(JSON.stringify(s))).not.toBeNull();expect(elapsed).toBeLessThan(15000);
    writeFileSync('docs/evidence/legions-simulation.json',JSON.stringify(stress,null,2));
  });
  it('settles residents at their doorsteps',()=>{const s=newGame();s.phase='night';const system=new CivilianSystem();for(let n=0;n<400;n++){s.time+=.1;system.update(s,.1);}expect(system.people.filter(r=>r.path.length)).toHaveLength(0);});
});
