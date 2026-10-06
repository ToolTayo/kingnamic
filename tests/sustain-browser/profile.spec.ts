import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test('attribute dense-battle stalls to simulation, scene work or persistence',async({page})=>{
  test.setTimeout(180000);
  const results:any[]=[];
  for(const count of [100,200]){
    await page.goto('/');await page.locator('#start').click();
    await page.evaluate(async count=>{
      const {newGame,makeUnit,makeBuilding}=await import('/src/game/state.ts' as string);
      const {nearestOpen}=await import('/src/game/navigation.ts' as string),{key}=await import('/src/game/map.ts' as string);
      const s=newGame();s.speed=0;s.units=[];s.resources={wood:4000,stone:2000,food:4000,herbs:150};s.tutorialSeen=true;
      s.buildings.find((b:any)=>b.kind==='barracks').level=3;makeBuilding(s,'barracks',18,8,true).level=3;if(count>144)makeBuilding(s,'barracks',19,8,true).level=3;
      const reserved=new Set<number>(s.residents.map(key));
      for(let n=0;n<count;n++){const p=nearestOpen(s,{x:9+n%12,y:7+Math.floor(n/12)},reserved);reserved.add(key(p));makeUnit(s,['warden','ranger','spearman','scout'][n%4],p.x,p.y);}
      for(let n=0;n<Math.floor(count/3);n++)makeUnit(s,n%7===0?'brute':n%3===0?'runner':'hollow',12+n%5,23+n%2);
      const rt=(window as any).__KINGNAMIC__.runtime;rt.state=s;rt.selectedIds=[];rt.selection=null;rt.onChange();
    },count);
    await page.locator('#tab-army').click();await page.locator('#army-orders').click();await page.locator('#select-all').click();await page.locator('#order-hunt').click();
    const p=await page.evaluate(()=>(window as any).__KINGNAMIC__.scene.screenPoint({x:14,y:23}));await page.locator('#world canvas').click({position:p});await page.locator('#speed-2').click();
    const result=await page.evaluate(async()=>{
      const a=(window as any).__KINGNAMIC__,rt=a.runtime,sys=a.scene.sys;
      const tick=rt.tick,persist=rt.persist,update=sys.sceneUpdate;
      const ticks:number[]=[],scenes:number[]=[],saves:number[]=[],frames:number[]=[],longTasks:number[]=[];
      const started=performance.now(),sim=rt.world.time;let last=started;
      const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push(e.duration);});observer.observe({entryTypes:['longtask']});
      rt.tick=function(delta:number){const t=performance.now();try{return tick.call(this,delta);}finally{ticks.push(performance.now()-t);}};
      rt.persist=function(){const t=performance.now();try{return persist.call(this);}finally{saves.push(performance.now()-t);}};
      // Phaser caches this hook; replacing scene.update after boot measures nothing.
      sys.sceneUpdate=function(time:number,delta:number){const t=performance.now();try{return update.call(this,time,delta);}finally{scenes.push(performance.now()-t);}};
      try{await new Promise<void>(resolve=>{const frame=(now:number)=>{frames.push(now-last);last=now;if(now-started<30000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});}
      finally{rt.tick=tick;rt.persist=persist;sys.sceneUpdate=update;observer.disconnect();}
      frames.shift();const stats=(v:number[])=>{v.sort((a,b)=>a-b);return {samples:v.length,p95Ms:v[Math.floor(v.length*.95)],maxMs:v.at(-1)};};
      return {wallMs:performance.now()-started,simulationSeconds:rt.world.time-sim,frames:stats(frames),simulation:stats(ticks),sceneInclusive:stats(scenes),persistence:stats(saves),longTasks:stats(longTasks),finalUnits:rt.world.units.length};
    });
    await page.locator('#pause').click();expect(result.sceneInclusive.samples).toBeGreaterThan(100);expect(result.persistence.samples).toBeGreaterThanOrEqual(2);expect(result.simulationSeconds).toBeGreaterThan(45);
    results.push({fixture:true,initialSoldiers:count,...result});
  }
  await writeFile('docs/evidence/renewal-hitch-diagnostic.json',JSON.stringify({method:'30 seconds at 2x per scale; inclusive scene callback, runtime tick and autosave instrumented separately; prepared armies',results},null,2));
});
