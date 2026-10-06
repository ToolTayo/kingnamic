import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {command,buildError} from '../src/game/commands';
import {army,enemies,newGame} from '../src/game/state';
import {canAfford,capacity,idle,jobCapacity,rates} from '../src/game/economy';
import {armyCapacity} from '../src/game/army';
import {step} from '../src/game/simulation';
import {decode} from '../src/game/persistence';
import {TILES,distance} from '../src/game/map';
import type {BuildingKind,Job} from '../src/game/types';
// Diagnostic earned-progression policy: no seeded supplies, population,
// buildings, units or outcome. Simulation advances normally, not in a browser.
it('records an earned continued-watch economy and paid army growth over thirty game minutes',()=>{
  let s=newGame(),next=0,peakArmy=3,first50:number|null=null,first100:number|null=null,first200:number|null=null,continueAt:number|null=null,reloads=0;
  const queue:[BuildingKind,number,number][]=[['quarry',18,13],['infirmary',18,15],['tower',10,13],['tower',13,8],['tower',19,13],['tower',12,17],['farm',12,9],['cottage',16,8]];
  const milestones:object[]=[];let lastRecorded=0;
  const grow=(kind:BuildingKind)=>{
    const upgrade=s.buildings.find(b=>b.kind===kind&&b.progress===1&&b.level<3);
    if(upgrade&&command(s,{type:'upgrade',id:upgrade.id}).ok)return;
    const candidates=TILES.filter(t=>t.territory!=='wild'&&s.owned.includes(t.territory)&&t.terrain!=='water').sort((a,b)=>distance(a,{x:14,y:11})-distance(b,{x:14,y:11}));
    for(const p of candidates)if(!buildError(s,kind,p.x,p.y)){command(s,{type:'build',kind,x:p.x,y:p.y});break;}
  };
  const started=performance.now();
  for(let tick=0;tick<18000&&s.outcome!=='lost';tick++){
    if(s.outcome==='won'){continueAt=s.time;expect(command(s,{type:'continue'}).ok).toBe(true);}
    if(tick%30===0){
      if(next<queue.length){const[kind,x,y]=queue[next];if(command(s,{type:'build',kind,x,y}).ok)next++;}
      if(s.infection.length){if(!command(s,{type:'treat'}).ok&&!s.quarantine)command(s,{type:'quarantine'});}
      else if(s.quarantine)command(s,{type:'quarantine'});
      const n=army(s).length;
      for(const[job,wanted]of [['miners',s.endless?8:3],['woodcutters',s.endless?8:4],['healers',s.endless?3:1],['farmers',Math.max(4,Math.ceil(((s.population+n)*.04+2)/.55))],['builders',2]] as [Job,number][]){
        while(s.jobs[job]<wanted&&idle(s)>0&&s.jobs[job]<jobCapacity(s,job)){if(!command(s,{type:'job',job,delta:1}).ok)break;}
      }
      if(s.time>120)for(const territory of ['pinewatch','greybank','fen'] as const)command(s,{type:'claim',territory});
      for(const b of s.buildings){
        if(b.hp<b.maxHp*.8)command(s,{type:'repair',id:b.id});
        if(s.owned.length===4&&s.resources.wood>90&&s.resources.stone>70&&['tower','hearth'].includes(b.kind)&&b.level<3)command(s,{type:'upgrade',id:b.id});
      }
      if(!s.endless){if(n<7)command(s,{type:'recruit',kind:n%3?'warden':'ranger'});}
      else{
        if(!s.buildings.some(b=>b.kind==='barracks'&&b.progress===1&&b.level>=2))grow('barracks');
        if(jobCapacity(s,'miners')<8)grow('quarry');
        if(jobCapacity(s,'woodcutters')<8)grow('lumberyard');
        if(jobCapacity(s,'farmers')<Math.ceil(((s.population+n)*.04+3)/.55))grow('farm');
        if(capacity(s)-s.population<5)grow('cottage');
        if(armyCapacity(s)<Math.min(200,n+5))grow('barracks');
        if(s.resources.food>120&&s.resources.wood>45)command(s,{type:'settlers'});
        if(rates(s).food>1&&s.resources.food>200&&s.resources.wood>90&&idle(s)>=5&&n<200)command(s,{type:'recruit',kind:n%4===0?'ranger':n%4===1?'spearman':n%4===2?'scout':'warden',count:Math.min(5,200-n)});
        if(tick%300===0)command(s,{type:'order',order:'defend',ids:army(s).filter(u=>!u.injury&&!(s.quarantine&&s.infection.some(i=>i.personId===u.id))).map(u=>u.id),x:14,y:16});
      }
      peakArmy=Math.max(peakArmy,army(s).length);if(peakArmy>=50&&first50===null)first50=s.time;if(peakArmy>=100&&first100===null)first100=s.time;if(peakArmy>=200&&first200===null)first200=s.time;
    }
    step(s);
    if(s.time-lastRecorded>=300){lastRecorded=s.time;const parsed=decode(JSON.stringify(s));expect(parsed).not.toBeNull();s=parsed!;reloads++;milestones.push({time:Math.round(s.time),day:s.day,army:army(s).length,population:s.population,capacity:armyCapacity(s),food:Math.round(s.resources.food),foodRate:rates(s).food,wood:Math.round(s.resources.wood),slain:s.stats.slain,lost:s.stats.lost,infected:s.infection.length,hostiles:enemies(s).length,hearth:s.buildings.find(b=>b.kind==='hearth')?.hp});}
  }
  const result={fixture:false,automatedPolicy:true,browser:false,maximumRequestedSeconds:1800,simulationSeconds:s.time,elapsedMs:performance.now()-started,outcome:s.outcome,continueAt,peakArmy,first50,first100,first200,reloads,milestones,final:{army:army(s).length,population:s.population,buildings:s.buildings.length,foodRate:rates(s).food,resources:s.resources,stats:s.stats}};
  writeFileSync('docs/evidence/renewal-earned-growth.json',JSON.stringify(result,null,2));expect(decode(JSON.stringify(s))).not.toBeNull();expect(Object.values(s.resources).every(n=>Number.isFinite(n)&&n>=0)).toBe(true);expect(army(s).length).toBeLessThanOrEqual(200);
},180000);
