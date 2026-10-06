import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const state=(page:Page)=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.world)));
async function seed(page:Page,count:number){
  await page.goto('/');await page.locator('#start').click();await page.locator('#pause').click();
  return page.evaluate(async count=>{
    const load=(p:string)=>import(/* @vite-ignore */p);
    const {newGame,makeUnit,makeBuilding}=await load('/src/game/state.ts');
    const {nearestOpen}=await load('/src/game/navigation.ts'),{key}=await load('/src/game/map.ts');
    const s=newGame();s.speed=0;s.units=[];s.resources={wood:4000,stone:2000,food:4000,herbs:150};s.tutorialSeen=true;
    // Prepared scale fixture, not an earned large-army campaign.
    const barracks=s.buildings.find((b:any)=>b.kind==='barracks');barracks.level=3;
    if(count>72)makeBuilding(s,'barracks',18,8,true).level=3;
    if(count>144)makeBuilding(s,'barracks',19,8,true).level=3;
    const reserved=new Set<number>(s.residents.map(key));
    for(let i=0;i<count;i++){const p=nearestOpen(s,{x:9+i%12,y:7+Math.floor(i/12)},reserved);reserved.add(key(p));makeUnit(s,['warden','ranger','spearman','scout'][i%4],p.x,p.y);}
    const rt=(window as any).__KINGNAMIC__.runtime;rt.state=s;rt.selectedIds=[];rt.selection=null;rt.onChange();
    return s.units.map((u:any)=>u.id);
  },count);
}
async function tile(page:Page,x:number,y:number){const p=await page.evaluate(p=>(window as any).__KINGNAMIC__.scene.screenPoint(p),{x,y});await page.locator('#world canvas').click({position:p});}
test('available selection, mixed injured squad orders and dense overlays',async({page})=>{
  const ids=await seed(page,200);
  await page.evaluate(async ids=>{const {infect}=await import('/src/game/disease.ts' as string);const rt=(window as any).__KINGNAMIC__.runtime;rt.world.units[0].injury=40;infect(rt.world,rt.world.units[1],'bite',20);rt.world.quarantine=true;rt.onChange();},ids);
  await page.locator('#tab-army').click();
  await page.evaluate(()=>{const a=(window as any).__KINGNAMIC__,rt=a.runtime,original=rt.act.bind(rt);let lastInput=0;document.addEventListener('click',()=>{lastInput=performance.now();},true);rt.act=(c:any)=>{const started=performance.now(),r=original(c);if(c.type==='order')(window as any).__orderLatency={inputToApplyMs:performance.now()-lastInput,applyMs:performance.now()-started};return r;};});
  await page.locator('#army-orders').click();await page.locator('#select-all').click();await page.locator('#army-orders').click();await page.locator('#order-hold').click();
  const result=await page.evaluate(()=>{const rt=(window as any).__KINGNAMIC__.runtime;return {selected:rt.selectedIds.length,held:rt.world.units.filter((u:any)=>u.order==='hold').length,message:rt.message,orderLatency:(window as any).__orderLatency};});
  const bodyScales=await page.evaluate(()=>[...(window as any).__KINGNAMIC__.scene.units.values()].map((sprite:any)=>sprite.scaleX));
  expect(bodyScales).toHaveLength(200);expect(bodyScales.some(scale=>scale<1)).toBe(true);expect(bodyScales.every(scale=>scale>=.72&&scale<=1)).toBe(true);
  await writeFile('docs/evidence/renewal-sustain-selection.json',JSON.stringify(result,null,2));
  await page.screenshot({path:'docs/evidence/renewal-sustain-polished-200.png'});
  expect(result.selected).toBe(198);expect(result.held).toBe(198);
  await page.evaluate(async ids=>{const {command}=await import('/src/game/commands.ts' as string);const rt=(window as any).__KINGNAMIC__.runtime;command(rt.state,{type:'squad-create',ids,name:'Complete Watch'});rt.onChange();},ids);
  await page.locator('[data-squad]').first().click();await page.locator('#army-orders').click();await page.locator('#order-hold').click();await expect(page.locator('#selection-summary')).toContainText('198 ready · 2 recovering or isolated');
  expect((await state(page)).units.slice(0,2).every((u:any)=>!u.order)).toBe(true);
  await page.locator('#army-orders').click();await page.locator('#order-attack').click();await page.keyboard.press('r');expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.orderMode)).toBe('move');
  await page.locator('#tab-people').click();expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.orderMode)).toBeNull();
  await page.keyboard.press('Escape');await page.keyboard.press('1');expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.selectedIds.length)).toBe(200);
  await page.locator('#army-orders').click();await page.locator('#select-none').click();await page.locator('#army-roster').click();await page.locator('#unit-'+ids[3]).click();await page.locator('#army-orders').click();await page.locator('#order-escort').click();const ally=(await state(page)).units.find((u:any)=>u.id===ids[7]);await tile(page,ally.x,ally.y);
  const escort=(await state(page)).units.find((u:any)=>u.id===ids[3]);expect(escort.order).toBe('escort');expect(escort.focus).toBe(ids[7]);expect((await state(page)).units.find((u:any)=>u.id===ids[7]).order).toBe('hold');
});

test('outbreak focus and health-aware death warnings identify a wounded soldier and timed remains',async({page})=>{
  const ids=await seed(page,10);
  await page.evaluate(async id=>{const {infect}=await import('/src/game/disease.ts' as string);const rt=(window as any).__KINGNAMIC__.runtime,u=rt.world.units.find((u:any)=>u.id===id);rt.world.phase='night';u.hp=6;infect(rt.world,u,'bite',60);rt.onChange();},ids[0]);
  await page.locator('#tab-people').click();await expect(page.locator('#alert-banner')).toContainText('death risk ≈ 3s');
  await expect(page.locator(`[data-person-focus="${ids[0]}"]`)).toContainText('6 HP');await page.locator(`[data-person-focus="${ids[0]}"]`).click();
  expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.inspectedPersonId)).toBe(ids[0]);
  await page.locator('#quarantine').click();await expect(page.locator('#alert-banner')).toContainText('death risk ≈ 12s');
  await page.locator('#speed-2').click();await expect.poll(async()=>((await state(page)).corpses??[]).some((c:any)=>c.personId===ids[0]),{timeout:20000}).toBe(true);
  await page.locator('#pause').click();const s=await state(page),corpse=s.corpses.find((c:any)=>c.personId===ids[0]);
  await page.locator(`[data-remains-focus="${corpse.id}"]`).click();await page.screenshot({path:'docs/evidence/renewal-sustain-outbreak.png'});
  expect(s.units.some((u:any)=>u.id===ids[0])).toBe(false);
});

test('real touch body selection, enlarged targeting space, pan and pinch avoid accidental orders',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();
  try{
    const ids=await seed(page,10);await page.locator('#tab-army').click();
    await page.evaluate(id=>{const a=(window as any).__KINGNAMIC__;a.scene.focus(a.runtime.world.units.find((u:any)=>u.id===id));},ids[3]);await page.waitForTimeout(500);
    const tap=await page.evaluate(id=>{const a=(window as any).__KINGNAMIC__,p=a.scene.screenPoint(a.runtime.world.units.find((u:any)=>u.id===id));return {x:p.x,y:p.y-19*a.scene.cameras.main.zoom};},ids[3]);
    const canvas=await page.locator('#world canvas').boundingBox();await page.touchscreen.tap(tap.x+canvas!.x,tap.y+canvas!.y);expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.selectedIds)).toEqual([ids[3]]);
    const before=await page.locator('#world canvas').boundingBox();await page.locator('#army-orders').tap();await page.locator('#order-move').tap();await expect(page.locator('#app')).toHaveClass(/targeting/);
    await expect.poll(async()=>(await page.locator('#world canvas').boundingBox())!.height).toBeGreaterThan(before!.height+150);const aiming=await page.locator('#world canvas').boundingBox();
    const cdp=await context.newCDPSession(page),center={x:195,y:Math.min(360,aiming!.y+aiming!.height/2)};
    const camera=()=>page.evaluate(()=>{const c=(window as any).__KINGNAMIC__.scene.cameras.main;return {zoom:c.zoom,x:c.midPoint.x,y:c.midPoint.y};});const old=await camera();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:center.x-35,y:center.y,id:0},{x:center.x+35,y:center.y,id:1}]});
    for(let n=1;n<=5;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x-35-n*7,y:center.y,id:0},{x:center.x+35+n*7,y:center.y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
    expect((await camera()).zoom).toBeGreaterThan(old.zoom+.2);expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.rallyMode)).toBe(true);
    await page.locator('#cancel-placement').tap();await expect(page.locator('#app')).not.toHaveClass(/targeting/);
    const beforePan=await camera();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:220,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:225,y:235,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
    expect(Math.hypot((await camera()).x-beforePan.x,(await camera()).y-beforePan.y)).toBeGreaterThan(10);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#army-roster').tap();await page.locator('#unit-'+ids.at(-1)).tap();expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.selectedIds)).toContain(ids.at(-1));
    await page.locator('#army-recruit').tap();await page.locator('#recruit-warden').tap();expect((await state(page)).units.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind))).toHaveLength(11);
    await page.screenshot({path:'docs/evidence/renewal-sustain-touch.png'});
  }finally{await context.close();}
});

async function measure(page:Page,milliseconds:number){
  return page.evaluate(async milliseconds=>{
    const rt=(window as any).__KINGNAMIC__.runtime,frames:number[]=[],ticks:number[]=[],riseLogs=new Set<number>(),risen=new Set<number>(),tick=rt.tick.bind(rt),start=performance.now(),sim=rt.world.time;
    const longTasks:number[]=[],sceneTimes:number[]=[],scene=(window as any).__KINGNAMIC__.scene,update=scene.sys.sceneUpdate.bind(scene);let observer:PerformanceObserver|undefined;
    try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push(entry.duration);});observer.observe({entryTypes:['longtask']});}catch{}
    scene.sys.sceneUpdate=(...args:any[])=>{const begin=performance.now();update(...args);sceneTimes.push(performance.now()-begin);};
    let peakUnits=rt.world.units.length,peakCases=rt.world.infection.length,peakCorpses=0,previous=start;
    rt.tick=(delta:number)=>{const a=performance.now();tick(delta);ticks.push(performance.now()-a);const s=rt.world;peakUnits=Math.max(peakUnits,s.units.length);peakCases=Math.max(peakCases,s.infection.length);peakCorpses=Math.max(peakCorpses,s.corpses?.length??0);for(const u of s.units)if(u.reanimatedFrom)risen.add(u.reanimatedFrom);for(const l of s.logs)if(/remains of #\d+ have risen/.test(l.text)){riseLogs.add(l.id);risen.add(Number(l.text.match(/#(\d+)/)[1]));}};
    await new Promise<void>(resolve=>{const sample=(now:number)=>{frames.push(now-previous);previous=now;if(now-start<milliseconds)requestAnimationFrame(sample);else resolve();};requestAnimationFrame(sample);});rt.tick=tick;scene.sys.sceneUpdate=update;observer?.disconnect();
    sceneTimes.sort((a,b)=>a-b);frames.shift();frames.sort((a,b)=>a-b);ticks.sort((a,b)=>a-b);const at=(a:number[],q:number)=>a[Math.min(a.length-1,Math.floor(a.length*q))];
    return {wallMs:performance.now()-start,simulationSeconds:rt.world.time-sim,samples:frames.length,frameMedianMs:at(frames,.5),frameP95Ms:at(frames,.95),frameP99Ms:at(frames,.99),frameMaxMs:frames.at(-1),tickP95Ms:at(ticks,.95),tickMaxMs:ticks.at(-1),longTaskCount:longTasks.length,longTaskMaxMs:Math.max(0,...longTasks),sceneUpdateP95Ms:at(sceneTimes,.95),sceneUpdateMaxMs:sceneTimes.at(-1),peakUnits,peakCases,peakCorpses,risen:[...risen],riseLogIds:[...riseLogs]};
  },milliseconds);
}

for(const count of [10,50,100,200])test(`${count} soldiers: three-minute live squad, outbreak, upkeep and reload session`,async({page,context})=>{
  test.setTimeout(420000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const ids=await seed(page,count);
  const groups=await page.evaluate(async ids=>{
    const {command}=await import('/src/game/commands.ts' as string),{infect}=await import('/src/game/disease.ts' as string),{makeUnit}=await import('/src/game/state.ts' as string);
    const rt=(window as any).__KINGNAMIC__.runtime,s=rt.world,cut=Math.max(10,Math.floor(ids.length*.6));
    command(s,{type:'squad-create',ids:ids.slice(0,5),name:'Gate Watch'});command(s,{type:'squad-create',ids:ids.slice(5,cut),name:'Hunters'});if(cut<ids.length)command(s,{type:'squad-create',ids:ids.slice(cut),name:'Patrol'});
    for(let n=0;n<Math.max(6,Math.floor(ids.length/3));n++)makeUnit(s,n%7===0?'brute':n%3===0?'runner':'hollow',12+n%5,23+n%2);
    infect(s,s.units.find((u:any)=>u.id===ids.at(-1)),'bite');infect(s,s.residents[0],'arrival');rt.onChange();return s.squads.map((q:any)=>q.id);
  },ids);
  await page.locator('#tab-army').click();await page.locator(`#squad-${groups[0]}`).click();await page.locator('#army-orders').click();await page.locator('#order-defend').click();await tile(page,14,17);
  const guardTargets=(await state(page)).units.filter((u:any)=>ids.slice(0,5).includes(u.id)).map((u:any)=>({id:u.id,target:u.target}));
  await page.locator(`#squad-${groups[1]}`).click();const clickStart=Date.now();await page.locator('#army-orders').click();await page.locator('#order-hunt').click();await tile(page,14,23);const commandWallMs=Date.now()-clickStart;
  if(groups[2]){await page.locator(`#squad-${groups[2]}`).click();await page.locator('#army-orders').click();await page.locator('#order-patrol').click();await tile(page,11,15);}
  const cdp=await context.newCDPSession(page),windows:any[]=[],heaps:number[]=[],saves:any[]=[];let terminalId:number|undefined;
  for(let epoch=0;epoch<3;epoch++){
    console.log(`SUSTAIN ${count}: window ${epoch+1}/3, 60 seconds at 2x`);
    await cdp.send('HeapProfiler.collectGarbage');heaps.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
    await page.locator('#speed-2').click();const pending=measure(page,60000);
    if(epoch===0){await page.waitForTimeout(10000);await page.locator('#tab-people').click();await page.locator('#quarantine').click();await page.locator('#treat').click();}
    const m=await pending;windows.push(m);await page.locator('#pause').click();
    const snapshot=await state(page);expect(snapshot.outcome).toBe('playing');expect(snapshot.population).toBe(snapshot.residents.length);expect(snapshot.units.length).toBeLessThanOrEqual(400);
    for(const g of guardTargets){const u=snapshot.units.find((u:any)=>u.id===g.id);if(u){expect(u.order).toBe('defend');expect(u.target).toEqual(g.target);}}
    expect(new Set([...snapshot.units.map((u:any)=>u.id),...snapshot.residents.map((r:any)=>r.id)]).size).toBe(snapshot.units.length+snapshot.residents.length);
    if(epoch===0){
      // Explicit terminal-case fixture to guarantee a timed death/reanimation
      // in each scale run, alongside naturally progressing seeded outbreaks.
      terminalId=await page.evaluate(async guards=>{const {infect}=await import('/src/game/disease.ts' as string),s=(window as any).__KINGNAMIC__.runtime.world,u=s.units.find((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind)&&!guards.includes(u.id));if(!u)throw Error('No survivor for terminal case');s.infection=s.infection.filter((i:any)=>i.personId!==u.id);u.immune=0;u.hp=6;infect(s,u,'bite',74.8);return u.id;},ids.slice(0,5));
      await page.locator('#speed-2').click();await expect.poll(async()=>((await state(page)).corpses??[]).some((c:any)=>c.personId===terminalId),{timeout:8000}).toBe(true);await page.locator('#pause').click();
    }
    await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');const saved=await state(page);
    await page.reload();await page.locator('#start').click();const loaded=await state(page);
    for(const key of ['units','residents','infection','corpses','squads','resources','jobs','stats'])expect(loaded[key]).toEqual(saved[key]);saves.push({epoch:epoch+1,army:loaded.units.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind)).length,population:loaded.population,cases:loaded.infection.length,corpses:loaded.corpses.length});
    if(epoch===1){
      const before=await state(page);await page.locator('#tab-army').click();await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click();const after=await state(page);
      expect(after.population).toBe(before.population-1);expect(after.resources.food).toBeCloseTo(before.resources.food,5);expect(after.resources.wood).toBeCloseTo(before.resources.wood,5);expect(after.resources.stone).toBeCloseTo(before.resources.stone-20,5);
      const newId=after.units.find((u:any)=>!before.units.some((v:any)=>v.id===u.id)&&u.kind==='warden')?.id;expect(newId).toBeTruthy();
    }
    await page.locator('#tab-army').click();await page.screenshot({path:`docs/evidence/renewal-sustain-${count}-epoch-${epoch+1}.png`});
  }
  await cdp.send('HeapProfiler.collectGarbage');heaps.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
  const final=await state(page);expect(windows.slice(1).some(m=>m.risen.includes(terminalId))).toBe(true);expect(final.units.some((u:any)=>u.id===terminalId)).toBe(false);expect(errors).toEqual([]);
  expect(windows.reduce((n,m)=>n+m.simulationSeconds,0)).toBeGreaterThan(300);expect(windows.every(m=>m.frameMedianMs<50)).toBe(true);
  const result={fixture:true,initialSoldiers:count,activeWallSeconds:windows.reduce((n,m)=>n+m.wallMs,0)/1000,simulationSeconds:windows.reduce((n,m)=>n+m.simulationSeconds,0),windows,postGCHeapBytes:heaps,commandAutomationWallMs:commandWallMs,saves,terminalId,final:{army:final.units.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind)).length,population:final.population,stats:final.stats,resources:final.resources},errors};
  await writeFile(`docs/evidence/renewal-sustain-${count}.json`,JSON.stringify(result,null,2));console.log('SUSTAIN RESULT '+JSON.stringify(result));
});
