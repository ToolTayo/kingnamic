import { describe, expect, it } from 'vitest';
import { separateCrowd } from '../src/game/crowd';
import { makeBuilding, makeUnit, newGame } from '../src/game/state';
import { army, enemies } from '../src/game/state';
import { combatStep } from '../src/game/combat';
import { command, repairCost } from '../src/game/commands';
import { decode } from '../src/game/persistence';
import { economyStep } from '../src/game/economy';
import { advance } from '../src/game/simulation';
import { BUILDINGS } from '../src/game/config';
import { movementBlocker, navigation } from '../src/game/navigation';
import { readFileSync } from 'node:fs';

describe('solid defense boundaries', () => {
  it('does not push infected through a closed gate under crowd pressure', () => {
    const s=newGame();s.units=[];s.buildings=[];s.residents=[];s.population=0;s.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};
    makeBuilding(s,'gate',14,18,true);
    const front=makeUnit(s,'hollow',14,18.64);
    makeUnit(s,'brute',14,18.85);
    for(let n=0;n<30;n++)separateCrowd(s,s.units,.1);
    expect(front.y).toBeGreaterThanOrEqual(18.62);
    expect(s.buildings[0].hp).toBe(s.buildings[0].maxHp);
  });
  it('allows allied passage but makes a brute damage and breach a closed crossing before entering',()=>{
    let s=newGame();s.units=[];s.population=0;s.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};s.residents=[];s.buildings=s.buildings.filter(b=>b.kind==='hearth');
    const gate=makeBuilding(s,'gate',14,20,true);makeBuilding(s,'wall',15,20,true);
    expect(movementBlocker(navigation(s),{x:14,y:20.7},{x:14,y:20},false)).toBeUndefined();
    expect(movementBlocker(navigation(s),{x:14,y:20.7},{x:14,y:20},true)).toBe(gate);
    const z=makeUnit(s,'brute',14,23);let damaged=false,breached=false;
    for(let n=0;n<700;n++){
      combatStep(s,.1);
      const g=s.buildings.find(b=>b.id===gate.id);damaged||=!!g&&g.hp<g.maxHp;
      for(const u of enemies(s))expect(s.buildings.some(b=>Math.round(u.x)===b.x&&Math.round(u.y)===b.y)).toBe(false);
      if(n===100){s=decode(JSON.stringify(s))!;expect(s).not.toBeNull();}
      if(!g&&s.units.find(u=>u.id===z.id)!.y<19.3){breached=true;break;}
    }
    expect(damaged).toBe(true);expect(breached).toBe(true);
  });
  it('blocks a stale diagonal movement segment and restores passage after destruction',()=>{
    const s=newGame();s.buildings=[];const b=makeBuilding(s,'wall',12,12,true),nav=navigation(s);
    expect(movementBlocker(nav,{x:11,y:12},{x:13,y:12},true)).toBe(b);
    b.hp=0;expect(movementBlocker(nav,{x:11,y:12},{x:13,y:12},true)).toBeUndefined();
  });
  it('repairs with timber while rejecting repair under siege, including a reload',()=>{
    let s=newGame();s.resources.stone=0;let gate=s.buildings.find(b=>b.kind==='gate')!;gate.hp-=180;
    expect(repairCost(gate)).toEqual({wood:10});const z=makeUnit(s,'hollow',14,19);
    expect(command(s,{type:'repair',id:gate.id}).ok).toBe(false);s.units=s.units.filter(u=>u.id!==z.id);
    s=decode(JSON.stringify(s))!;const wood=s.resources.wood;expect(command(s,{type:'repair',id:gate.id}).ok).toBe(true);
    gate=s.buildings.find(b=>b.id===gate.id)!;expect(gate.hp).toBe(gate.maxHp);expect(s.resources.wood).toBe(wood-10);
  });
});

describe('Timber and Crowns ledger',()=>{
  it('migrates legacy balances once, keeps job/building identities and preserves repeated reloads',()=>{
    const raw=readFileSync(new URL('./fixtures/milestone-v2.json',import.meta.url),'utf8'),old=JSON.parse(raw);
    let s=decode(raw)!;expect(s.resources).toEqual(old.resources);expect(s.jobs).toEqual(old.jobs);expect(s.buildings).toEqual(old.buildings);expect(s.economyRevision).toBe(1);
    for(let n=0;n<5;n++)s=decode(JSON.stringify(s))!;
    expect(s.resources).toEqual(old.resources);expect(s.economyRevision).toBe(1);
    s.resources.stone=10100;economyStep(s,.1);expect(s.resources.stone).toBe(10100);
  });
  it('builds useful shelter, production and defenses with timber and no Crowns',()=>{
    for(const kind of ['cottage','farm','lumberyard','quarry','infirmary','wall','gate'] as const){
      const s=newGame();s.resources.stone=0;const before=s.resources.wood;
      expect(command(s,{type:'build',kind,x:19,y:15}).ok).toBe(true);
      expect(s.resources.wood).toBe(before-BUILDINGS[kind].cost.wood!);expect(s.resources.stone).toBe(0);
    }
  });
  it('funds a fresh army with paid Crown equipment and keeps survival supplies for upkeep',()=>{
    const s=newGame(),before={...s.resources},pop=s.population;
    expect(command(s,{type:'recruit',kind:'warden'}).ok).toBe(true);
    expect(command(s,{type:'recruit',kind:'ranger'}).ok).toBe(true);
    expect(s.resources).toEqual({...before,stone:before.stone-45});expect(s.population).toBe(pop-2);expect(army(s)).toHaveLength(5);
    s.completed=['build','recruit','night','claim','survive'];advance(s,1);expect(s.resources.food).not.toBe(before.food);
  });
  it('credits actual allied combat once and pays beyond the former day cutoff across reload',()=>{
    let s=newGame();s.units=[];s.residents=[];s.population=0;s.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};s.buildings=s.buildings.filter(b=>b.kind==='hearth');s.resources.stone=0;
    const ranger=makeUnit(s,'ranger',10,12);ranger.order='hold';
    for(let n=0;n<50;n++){const z=makeUnit(s,'hollow',12,12);z.hp=1;s.units.find(u=>u.id===ranger.id)!.cooldown=0;combatStep(s,.1);if(n===20)s=decode(JSON.stringify(s))!;}
    expect(s.resources.stone).toBe(50);expect(s.bountyTotal).toBe(50);combatStep(s,.1);expect(s.resources.stone).toBe(50);
  });
  it('pays no Crown bounty for uncredited deaths, reanimated people or detached expedition fixtures without a kingdom ledger',()=>{
    const s=newGame();s.units=[];s.buildings=s.buildings.filter(b=>b.kind==='hearth');s.resources.stone=0;
    let z=makeUnit(s,'hollow',10,10);z.hp=0;combatStep(s,.1);expect(s.resources.stone).toBe(0);
    z=makeUnit(s,'hollow',10,10);z.reanimatedFrom=s.nextId++;z.bountyEligible=true;z.hp=0;combatStep(s,.1);expect(s.resources.stone).toBe(0);
    s.theatre='expedition';z=makeUnit(s,'brute',10,10);z.bountyEligible=true;z.hp=0;combatStep(s,.1);expect(s.resources.stone).toBe(0);
  });
  it('settles an active legacy expedition in its original supplies exactly once',()=>{
    let s=newGame();s.resources.stone=200;command(s,{type:'recruit',kind:'warden'});command(s,{type:'recruit',kind:'ranger'});expect(command(s,{type:'expedition-launch'}).ok).toBe(true);
    // Reconstruct the previous milestone's paid reservation, not a new grant.
    s.resources.stone+=80;s.resources.food-=32;s.resources.wood-=32;delete s.expedition!.equipmentCurrency;delete s.economyRevision;
    const before={...s.resources};s=decode(JSON.stringify(s))!;expect(s.expedition?.equipmentCurrency).toBeUndefined();
    command(s,{type:'expedition-retreat'});expect(command(s,{type:'expedition-extract'}).ok).toBe(true);
    expect(s.resources).toEqual({...before,food:before.food+32,wood:before.wood+32});const once=JSON.stringify(s);
    expect(command(s,{type:'expedition-extract'}).ok).toBe(false);expect(JSON.stringify(s)).toBe(once);
  });
});
