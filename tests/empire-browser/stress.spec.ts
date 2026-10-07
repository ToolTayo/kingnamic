import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
for(const count of [10,50,100,200])test(count+' soldiers in Briar March: sustained combat, autosaves, distinct orders, transitions and heap samples',async({page,context})=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#start').click();
 const fixture=await page.evaluate(async count=>{
  const load=(p:string)=>import(/* @vite-ignore */p),{newGame,army,makeUnit,makeBuilding}=await load('/src/game/state.ts'),{command}=await load('/src/game/commands.ts'),{nearestOpen}=await load('/src/game/navigation.ts'),{key}=await load('/src/game/map.ts');
  const s=newGame();s.resources={wood:4000,stone:3000,food:4000,herbs:100};command(s,{type:'commander-appoint'});for(const u of army(s))Object.assign(u,{x:14,y:24});command(s,{type:'travel',ids:army(s).map((u:any)=>u.id)});s.units=army(s);command(s,{type:'build',kind:'hearth',x:16,y:21});s.units=[];
  const reserved=new Set<number>(s.residents.map(key));for(let n=0;n<count;n++){const p=nearestOpen(s,{x:11+n%11,y:11+Math.floor(n/11)},reserved);reserved.add(key(p));makeUnit(s,['warden','ranger','spearman','scout'][n%4],p.x,p.y);}command(s,{type:'commander-appoint',id:s.units[0].id});
  const guards=s.units.slice(-5).map((u:any)=>u.id),hunters=s.units.slice(0,-5).map((u:any)=>u.id);command(s,{type:'squad-create',ids:guards,name:'Outpost watch'});command(s,{type:'squad-create',ids:hunters,name:'March company'});command(s,{type:'order',order:'defend',ids:guards,x:16,y:20});command(s,{type:'order',order:'hunt',ids:hunters,x:21,y:12});
  const slots=new Set<number>(s.units.map(key));for(let n=0;n<Math.max(8,Math.floor(count*.6));n++){const p=nearestOpen(s,{x:26,y:8+n%8},slots);slots.add(key(p));makeUnit(s,n%7===0?'brute':n%3===0?'runner':'hollow',p.x,p.y);}command(s,{type:'speed',speed:0});
  const rt=(window as any).__KINGNAMIC__.runtime;rt.state=s;rt.selection=null;rt.selectedIds=[];rt.heroMode=false;rt.onChange();return {guards,hunters,commander:s.commander.id,initialArmy:army(s).length,initialEnemies:s.units.length-army(s).length};
 },count);
 await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');await page.locator('#tab-army').click();await page.locator('[data-squad]').first().click();await page.locator('#army-orders').click();await page.locator('#order-hold').click();
 const cdp=await context.newCDPSession(page),heaps:number[]=[],windows:any[]=[];await cdp.send('HeapProfiler.collectGarbage');heaps.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
 for(let epoch=0;epoch<2;epoch++){
  await page.locator('#speed-2').click();const report=await page.evaluate(async duration=>{
   const a=(window as any).__KINGNAMIC__,rt=a.runtime,sys=a.scene.sys,tick=rt.tick,persist=rt.persist,update=sys.sceneUpdate;
   const ticks:number[]=[],scenes:number[]=[],saves:number[]=[],frames:number[]=[],longTasks:number[]=[];let peakUnits=rt.world.units.length,last=performance.now();const start=last,sim=rt.world.time;
   const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push(e.duration);});observer.observe({entryTypes:['longtask']});
   rt.tick=function(dt:number){const t=performance.now();try{return tick.call(this,dt);}finally{ticks.push(performance.now()-t);peakUnits=Math.max(peakUnits,rt.world.units.length);}};rt.persist=function(){const t=performance.now();try{return persist.call(this);}finally{saves.push(performance.now()-t);}};sys.sceneUpdate=function(time:number,dt:number){const t=performance.now();try{return update.call(this,time,dt);}finally{scenes.push(performance.now()-t);}};
   try{await new Promise<void>(resolve=>{const frame=(now:number)=>{frames.push(now-last);last=now;if(now-start<duration)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});}finally{rt.tick=tick;rt.persist=persist;sys.sceneUpdate=update;observer.disconnect();}
   frames.shift();const stats=(v:number[])=>{v.sort((a,b)=>a-b);return {samples:v.length,p50:v[Math.floor(v.length*.5)]??0,p95:v[Math.floor(v.length*.95)]??0,p99:v[Math.floor(v.length*.99)]??0,max:v.at(-1)??0};};return {wallMs:performance.now()-start,simulationSeconds:rt.world.time-sim,frames:stats(frames),tick:stats(ticks),sceneInclusive:stats(scenes),save:stats(saves),longTasks:stats(longTasks),peakUnits};
  },count>=100?30000:15000);windows.push(report);await page.locator('#pause').click();
  // Require ongoing simulation, while recording the actual speed multiplier;
  // constrained headless runs may fall below real time even at 2x.
  expect(report.simulationSeconds).toBeGreaterThan(report.wallMs/1000*0.5);expect(report.sceneInclusive.samples).toBeGreaterThan(80);
  await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');const before=await page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));await page.reload();await page.locator('#start').click();const after=await page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));for(const k of ['units','resources','residents','infection','corpses','empire','squads'])expect(after[k]).toEqual(before[k]);
  await cdp.send('HeapProfiler.collectGarbage');heaps.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
 }
 const s=await page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));for(const id of fixture.guards){const u=s.units.find((u:any)=>u.id===id);if(u)expect(u.order).toBe('hold');}expect(new Set(s.units.map((u:any)=>u.id)).size).toBe(s.units.length);expect(s.population).toBe(s.residents.length);expect(s.units.length).toBeLessThanOrEqual(400);expect(s.empire.reserve.time).toBe(0);expect(errors).toEqual([]);
 await page.screenshot({path:'docs/evidence/empire-stress-'+count+'.png'});await writeFile('docs/evidence/empire-stress-'+count+'.json',JSON.stringify({fixture:true,initial:fixture,method:'Two live browser windows at 2x, paused exact save/reload between windows; full scene includes simulation and saves; heap after explicit GC, including reloads.',windows,heapUsedBytes:heaps,final:{units:s.units.length,slain:s.stats.slain,lost:s.stats.lost,food:s.resources.food},errors},null,2));
});
