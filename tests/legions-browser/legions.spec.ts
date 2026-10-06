import {test,expect,type Page} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const exe=(page:Page)=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
async function tile(page:Page,x:number,y:number){const p=await page.evaluate(({x,y})=>(window as any).__KINGNAMIC__.scene.screenPoint({x,y}),{x,y});await page.locator('#world canvas').click({position:p});}
async function fixture(page:Page,count:number,foes=0){
  await page.goto('/');await page.locator('#start').click();await page.locator('#pause').click();
  return page.evaluate(async({count,foes})=>{
    const load=(path:string)=>import(/* @vite-ignore */path);
    const {newGame,makeUnit,makeBuilding}=await load('/src/game/state.ts'),{nearestOpen}=await load('/src/game/navigation.ts'),{key}=await load('/src/game/map.ts');
    const s=newGame();s.speed=0;s.units=[];s.resources={wood:2000,stone:1000,food:2000,herbs:100};s.tutorialSeen=true;
    // Explicit test fixture: these armies are equipped here for scale testing,
    // not represented as earned campaign recruitment.
    s.buildings.find((b:any)=>b.kind==='barracks').level=3;
    if(count>72)makeBuilding(s,'barracks',18,8,true).level=3;
    if(count>144)makeBuilding(s,'barracks',19,8,true).level=3;
    const reserved=new Set<number>(s.residents.map(key));
    for(let i=0;i<count;i++){const p=nearestOpen(s,{x:9+i%12,y:7+Math.floor(i/12)},reserved);reserved.add(key(p));makeUnit(s,['warden','ranger','spearman','scout'][i%4],p.x,p.y);}
    for(let i=0;i<foes;i++){const p=nearestOpen(s,{x:10+i%10,y:22+Math.floor(i/10)%4},reserved);reserved.add(key(p));makeUnit(s,i%7===0?'brute':i%3?'hollow':'runner',p.x,p.y);}
    const rt=(window as any).__KINGNAMIC__.runtime;rt.state=s;rt.selectedIds=[];rt.selection=null;rt.onChange();
    return s.units.slice(0,count).map((u:any)=>u.id);
  },{count,foes});
}
async function select(page:Page,ids:number[]){await page.locator('#army-orders').click();await page.locator('#select-none').click();await page.locator('#army-roster').click();for(const id of ids)await page.locator(`#unit-${id}`).click();}
test('two independent squads: five defend while five hunt, split, merge, patrol and persist',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const ids=await fixture(page,10,6);await page.locator('#tab-army').click();
  await select(page,ids.slice(0,5));await page.locator('#army-squads').click();await page.locator('#squad-name').fill('Gate Watch');await page.locator('#create-squad').click();await page.locator('#army-orders').click();await page.locator('#order-defend').click();await tile(page,14,17);
  const guardTargets=(await exe(page)).units.slice(0,5).map((u:any)=>u.target);
  await select(page,ids.slice(5));await page.locator('#army-squads').click();await page.locator('#squad-name').fill('Outriders');await page.locator('#create-squad').click();await page.locator('#army-orders').click();await page.locator('#order-hunt').click();await tile(page,14,23);
  let s=await exe(page);expect(s.units.slice(0,5).map((u:any)=>u.target)).toEqual(guardTargets);expect(s.units.slice(5,10).every((u:any)=>u.order==='hunt')).toBe(true);
  await page.locator('#speed-1').click();await page.waitForTimeout(12000);await page.locator('#pause').click();s=await exe(page);expect(s.stats.slain).toBeGreaterThan(0);
  await select(page,ids.slice(5,7));await page.locator('#army-squads').click();await page.locator('#squad-name').fill('Forward Pair');await page.locator('#create-squad').click();expect((await exe(page)).squads).toHaveLength(3);
  const watch=s.squads[0].id;await page.locator(`[data-squad-assign="${watch}"]`).click();await page.locator('#army-orders').click();await page.locator('#order-patrol').click();await tile(page,12,16);
  expect((await exe(page)).units.filter((u:any)=>ids.slice(5,7).includes(u.id)).every((u:any)=>u.order==='patrol')).toBe(true);
  await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');const before=await exe(page);await page.reload();await page.locator('#start').click();
  s=await exe(page);expect(s.squads).toEqual(before.squads);expect(s.units).toEqual(before.units);expect(s.residents).toEqual(before.residents);expect(errors).toEqual([]);
  await page.locator('#tab-army').click();await page.screenshot({path:'docs/evidence/legions-squads.png'});
});
test('symptoms, quarantine, selected treatment, death countdown and one reanimation survive reload',async({page})=>{
  const ids=await fixture(page,10);await page.evaluate(async id=>{const {infect}=await import('/src/game/disease.ts' as string);const s=(window as any).__KINGNAMIC__.runtime.state;infect(s,s.units.find((u:any)=>u.id===id),'bite',54);},ids[0]);
  await page.locator('#tab-people').click();await expect(page.locator('#panel')).toContainText('Symptomatic');await page.locator('#quarantine').click();await page.locator('#speed-1').click();await page.waitForTimeout(4000);await page.locator('#pause').click();expect((await exe(page)).infection[0].age).toBeLessThan(56);
  await page.locator('#tab-army').click();await select(page,[ids[0]]);await page.locator('#treat-selected').click();expect((await exe(page)).infection).toHaveLength(0);
  await page.locator('#tab-people').click();await page.locator('#quarantine').click();
  await page.evaluate(async id=>{const {infect}=await import('/src/game/disease.ts' as string);const s=(window as any).__KINGNAMIC__.runtime.state,u=s.units.find((u:any)=>u.id===id);u.immune=0;infect(s,u,'ground',74.8);s.units.forEach((v:any)=>{v.order='hold';});},ids[0]);
  await page.locator('#speed-1').click();await expect.poll(async()=>((await exe(page)).corpses??[]).length).toBe(1);await page.locator('#pause').click();const before=await exe(page);expect(before.units.some((u:any)=>u.id===ids[0])).toBe(false);await expect(page.locator('#alert-banner')).toContainText('Tainted remains');
  await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');await page.reload();await page.locator('#start').click();expect((await exe(page)).corpses).toEqual(before.corpses);
  await page.locator('#speed-1').click();await page.waitForFunction(id=>(window as any).__KINGNAMIC__.runtime.state.units.some((u:any)=>u.reanimatedFrom===id),ids[0],{timeout:12000});await page.locator('#pause').click();
  const risen=await exe(page);expect(risen.units.filter((u:any)=>u.reanimatedFrom===ids[0])).toHaveLength(1);expect(risen.stats.lost).toBe(1);await page.screenshot({path:'docs/evidence/legions-reanimation.png'});
});
test('touch roster selection, named squad and separate hold orders at 390px',async({page})=>{
  const ids=await fixture(page,10);await page.setViewportSize({width:390,height:844});await page.locator('#tab-army').click();await select(page,ids.slice(0,5));await page.locator('#army-squads').click();await page.locator('#squad-name').fill('Phone Watch');await page.locator('#create-squad').click();await page.locator('#army-orders').click();await page.locator('#order-hold').click();
  const s=await exe(page);expect(s.units.slice(0,5).every((u:any)=>u.order==='hold')).toBe(true);expect(s.units.slice(5).every((u:any)=>!u.order)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'docs/evidence/legions-touch.png'});
});
test('repeated 100-soldier world replacements release old scene and navigation state',async({page,context})=>{
  const cdp=await context.newCDPSession(page),heaps:number[]=[],counts:object[]=[];
  for(let round=0;round<4;round++){
    // Reuse the page and renderer, replacing only the explicitly seeded world.
    if(round===0)await fixture(page,100,50);
    else await page.evaluate(async()=>{const {makeUnit}=await import('/src/game/state.ts' as string);const rt=(window as any).__KINGNAMIC__.runtime;const s=JSON.parse((window as any).__legionTemplate);s.nextId+=roundSeed();function roundSeed(){return 10000;}rt.state=s;for(let i=0;i<10;i++)makeUnit(s,'hollow',14,23);rt.selectedIds=[];rt.onChange();});
    if(round===0)await page.evaluate(()=>{(window as any).__legionTemplate=JSON.stringify((window as any).__KINGNAMIC__.runtime.state);});
    await page.locator('#tab-army').click();await page.locator('#army-orders').click();await page.locator('#select-all').click();await page.locator('#army-orders').click();await page.locator('#order-hunt').click();await tile(page,14,23);await page.locator('#speed-1').click();await page.waitForTimeout(6000);await page.locator('#pause').click();
    await cdp.send('HeapProfiler.collectGarbage');const usage=await cdp.send('Runtime.getHeapUsage');heaps.push(usage.usedSize);
    counts.push(await page.evaluate(()=>{const a=(window as any).__KINGNAMIC__;return {unitSprites:a.scene.units.size,workerSprites:a.scene.workers.size,units:a.runtime.state.units.length};}));
  }
  await writeFile('docs/evidence/legions-retained-heap.json',JSON.stringify({scenario:'four 100-soldier worlds; 6 seconds each; explicit Chromium GC between worlds',heaps,counts},null,2));
  expect(heaps[3]-heaps[1]).toBeLessThan(12*1024*1024);expect(counts.every((c:any)=>c.unitSprites<=160&&c.workerSprites<=64)).toBe(true);
});
for(const count of [10,50,100,200])test(`${count} soldiers: live combat frame times, simulation work, memory and save`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const ids=await fixture(page,count,Math.max(10,count/2));await page.locator('#tab-army').click();await page.locator('#army-orders').click();await page.locator('#select-all').click();await page.locator('#army-orders').click();await page.locator('#order-hunt').click();await tile(page,14,23);
  await page.locator('#speed-1').click();
  const metrics=await page.evaluate(async()=>{
    const rt=(window as any).__KINGNAMIC__.runtime,frames:number[]=[],costs:number[]=[],tick=rt.tick.bind(rt),heap0=(performance as any).memory?.usedJSHeapSize??null,start=performance.now(),startSim=rt.state.time;
    rt.tick=(d:number)=>{const t=performance.now();tick(d);costs.push(performance.now()-t);};
    let previous=performance.now();await new Promise<void>(resolve=>{const frame=(now:number)=>{frames.push(now-previous);previous=now;if(now-start<12000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});rt.tick=tick;
    frames.shift();frames.sort((a,b)=>a-b);costs.sort((a,b)=>a-b);const pct=(a:number[],q:number)=>a[Math.min(a.length-1,Math.floor(a.length*q))];
    return {wallMs:performance.now()-start,simulationSeconds:rt.state.time-startSim,samples:frames.length,frameMedianMs:pct(frames,.5),frameP95Ms:pct(frames,.95),frameMaxMs:frames.at(-1),tickP95Ms:pct(costs,.95),tickMaxMs:costs.at(-1),heapStartBytes:heap0,heapEndBytes:(performance as any).memory?.usedJSHeapSize??null,units:rt.state.units.length,slain:rt.state.stats.slain,renderer:(window as any).__KINGNAMIC__.game.renderer.type};
  });
  await page.locator('#pause').click();await page.locator('#save').click();
  if(await page.locator('#save-status').textContent()!=='Saved on this device')await writeFile(`test-results/legions-save-failure-${count}.json`,JSON.stringify(await exe(page)));
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await mkdir('docs/evidence',{recursive:true});await writeFile(`docs/evidence/legions-browser-${count}.json`,JSON.stringify({fixture:true,soldiers:count,hostiles:Math.max(10,count/2),...metrics,errors},null,2));
  expect(metrics.slain).toBeGreaterThan(0);expect(metrics.simulationSeconds).toBeGreaterThan(9);expect(metrics.frameMedianMs).toBeLessThan(50);expect(errors).toEqual([]);
  const s=await exe(page);expect(s.units.filter((u:any)=>ids.includes(u.id)).length).toBeLessThanOrEqual(count);await page.screenshot({path:`docs/evidence/legions-${count}.png`});
});
