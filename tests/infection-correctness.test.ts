import { describe, expect, it } from 'vitest';
import { combatStep } from '../src/game/combat';
import { expose, cure, plagueStep, recordDeath, RISE_DELAY } from '../src/game/disease';
import { addResidents } from '../src/game/population';
import { decode } from '../src/game/persistence';
import { army, enemies, makeUnit, newGame } from '../src/game/state';
import type { State, Unit } from '../src/game/types';

function arena(){
  const s=newGame();s.units=[];s.residents=[];s.population=0;s.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};
  s.buildings=s.buildings.filter(b=>b.kind==='hearth');
  const human=makeUnit(s,'warden',13,14),zombie=makeUnit(s,'hollow',14,14);
  return {s,human,zombie};
}

describe('bite-only infection and corpse lifecycle',()=>{
  it('ignores ordinary damage, proximity, contaminated ground, and tainted supplies',()=>{
    const {s,human,zombie}=arena();
    addResidents(s,2);const [infected,bystander]=s.residents!;infected.x=10;infected.y=10;bystander.x=10.2;bystander.y=10;
    expose(s,infected,100,'bite',zombie.id);plagueStep(s,18);
    bystander.hp-=10;s.contamination.fill(100);s.suppliesTaint=100;
    for(let n=0;n<120;n++)plagueStep(s,.1);
    expect(bystander.hp).toBe(40);expect(bystander.exposure??0).toBe(0);expect(s.infection.some(i=>i.personId===bystander.id)).toBe(false);
    expect(human.hp).toBeGreaterThan(0);expect(army(s)).toContain(human);
  });

  it('records only real living-zombie bites and makes the source visible',()=>{
    const {s,human,zombie}=arena();
    expose(s,human,100,'contact',zombie.id);expose(s,human,100,'bite',-1);
    expect(s.infection).toHaveLength(0);expect(human.exposure??0).toBe(0);
    expose(s,human,35,'bite',zombie.id);expect(human.exposure).toBe(35);expect(human.exposureSourceId).toBe(zombie.id);expect(s.infection).toHaveLength(0);
    expose(s,human,35,'bite',zombie.id);expect(s.infection).toHaveLength(0);
    expose(s,human,35,'bite',zombie.id);
    const infection=s.infection.find(i=>i.personId===human.id)!;
    expect(infection.source).toBe('bite');expect(infection.sourceId).toBe(zombie.id);expect(human.hp).toBeGreaterThan(0);
    plagueStep(s,20);expect(human.hp).toBeGreaterThan(0);expect(army(s)).toContain(human);expect(enemies(s)).toContain(zombie);
    expect(s.logs.some(l=>l.text.includes(`zombie bite from #${zombie.id}`))).toBe(true);
  });

  it('routes the same confirmed-bite combat rule through civilian HP and infection',()=>{
    const s=newGame();s.units=[];s.buildings=s.buildings.filter(b=>b.kind==='hearth');addResidents(s,1);s.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};
    const resident=s.residents![0];Object.assign(resident,{x:14,y:14,job:'idle',activity:'rest',path:[],goal:{x:14,y:14}});const zombie=makeUnit(s,'hollow',14,12);
    for(let n=0;n<160&&!s.infection.length;n++){combatStep(s,.1,false);plagueStep(s,.1);}
    expect(resident.hp).toBeGreaterThan(0);expect(s.infection.find(i=>i.personId===resident.id)).toMatchObject({source:'bite',sourceId:zombie.id,host:'resident'});expect(resident.sick).toBe(true);
  });

  it('leaves a human alive and curable until HP reaches zero',()=>{
    const {s,human,zombie}=arena();expose(s,human,100,'bite',zombie.id);plagueStep(s,54);
    expect(human.hp).toBeGreaterThan(0);expect(army(s).some(u=>u.id===human.id)).toBe(true);expect(enemies(s).some(u=>u.id===human.id)).toBe(false);
    expect(cure(s,1,[human.id])).toBe(1);expect(human.hp).toBeGreaterThan(0);expect(s.infection).toHaveLength(0);expect(human.immune).toBe(35);
  });

  it('requires an actual dead state and delays reanimation of infected corpses exactly once',()=>{
    let {s,human,zombie}=arena();expose(s,human,100,'bite',zombie.id);
    recordDeath(s,human);expect(s.corpses??[]).toHaveLength(0);expect(human.hp).toBeGreaterThan(0);
    human.hp=0;recordDeath(s,human);expect(s.corpses?.[0]).toMatchObject({personId:human.id,tainted:true,sourceId:zombie.id,remaining:RISE_DELAY});
    combatStep(s,.01);expect(army(s).some(u=>u.id===human.id)).toBe(false);plagueStep(s,RISE_DELAY-.1);expect(enemies(s).filter(u=>u.reanimatedFrom===human.id)).toHaveLength(0);
    plagueStep(s,.1);expect(enemies(s).filter(u=>u.reanimatedFrom===human.id)).toHaveLength(1);expect(enemies(s).find(u=>u.reanimatedFrom===human.id)?.reanimatedBy).toBe(zombie.id);
    s=decode(JSON.stringify(s))!;plagueStep(s,10);expect(enemies(s).filter(u=>u.reanimatedFrom===human.id)).toHaveLength(1);
  });

  it('never animates an uninfected death, even with max bite exposure and contaminated terrain',()=>{
    const {s,human}=arena();human.exposure=100;s.contamination.fill(100);human.hp=0;recordDeath(s,human);
    expect(s.corpses?.[0]).toMatchObject({personId:human.id,tainted:false});plagueStep(s,20);
    expect(enemies(s).filter(u=>u.reanimatedFrom===human.id)).toHaveLength(0);
  });

  it('preserves bite source through save/load and strips obsolete non-bite infections from legacy saves',()=>{
    const {s,human,zombie}=arena();expose(s,human,100,'bite',zombie.id);
    const restored=decode(JSON.stringify(s))!;expect(restored.infection[0]).toMatchObject({personId:human.id,source:'bite',sourceId:zombie.id});
    const old=newGame();const resident=old.residents![0];resident.sick=true;resident.exposure=80;old.infection.push({id:old.nextId++,age:20,personId:resident.id,host:'resident',source:'ground'} as any);delete old.biteRulesRevision;
    const migrated=decode(JSON.stringify(old))!;expect(migrated.biteRulesRevision).toBe(1);expect(migrated.infection).toHaveLength(0);expect(migrated.residents![0].exposure).toBeUndefined();expect(migrated.residents![0].sick).toBe(false);
  });

  it('accepts a living commander as a bite target and retains the state through a save',()=>{
    const {s,human,zombie}=arena();s.commander={id:human.id,weapon:'sword',xp:0};expose(s,human,105,'bite',zombie.id);
    const saved=decode(JSON.stringify(s))!;expect(saved.commander?.id).toBe(human.id);expect(saved.infection[0].personId).toBe(human.id);expect((saved.units.find(u=>u.id===human.id) as Unit).hp).toBeGreaterThan(0);
  });
});
