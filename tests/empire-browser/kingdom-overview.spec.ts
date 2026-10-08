import {test,expect,type Page} from '@playwright/test';

const read=(page:Page)=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
const click=(page:Page,selector:string)=>page.locator(selector).evaluate((el:any)=>(el as HTMLElement).click());
async function pause(page:Page){if((await read(page)).speed)await click(page,'#pause');await expect.poll(async()=>(await read(page)).speed).toBe(0);}
async function focus(page:Page,p:{x:number;y:number}){await page.evaluate(p=>(window as any).__KINGNAMIC__.scene.focus(p),p);await page.waitForTimeout(450);}
async function chooseTile(page:Page,p:{x:number;y:number},kind:'hearth'|'tower'){
 await focus(page,p);const canvas=page.locator('#world canvas'),box=await canvas.boundingBox();if(!box)throw new Error('Game map canvas is not visible.');
 const candidates=[p,{x:p.x,y:p.y-1},{x:p.x,y:p.y+1},{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x-1,y:p.y-1},{x:p.x+1,y:p.y+1}];let screen:any=null,actual:any=null,error:string|null=null;
 for(const candidate of candidates){screen=await page.evaluate(q=>(window as any).__KINGNAMIC__.scene.screenPoint(q),candidate);if(screen.x<0||screen.y<0||screen.x>=box.width||screen.y>=box.height)continue;await page.mouse.move(box.x+screen.x,box.y+screen.y);await page.waitForTimeout(50);const preview=await page.evaluate(()=>{const {scene,runtime}= (window as any).__KINGNAMIC__,p=scene.hoverTile;return{placement:runtime.placement,point:p&&{x:p.x,y:p.y}};});if(preview.placement!==kind||!preview.point)continue;actual=preview.point;error=await page.evaluate(q=>(window as any).__KINGNAMIC__.runtime.placementError(q),actual);if(!error)break;}
 if(!actual||error)throw new Error('No visible legal '+kind+' preview near '+JSON.stringify(p)+': '+String(error));
 await canvas.click({position:screen});const confirm=page.locator('#confirm-placement');if(await confirm.count()&&await confirm.isEnabled())await confirm.click();
 const outcome=await page.evaluate(()=>{const {runtime,scene}= (window as any).__KINGNAMIC__;return{placement:runtime.placement,preview:runtime.placementPreview,hover:scene.hoverTile,message:runtime.message};});
 if(outcome.placement===kind)throw new Error('Valid '+kind+' placement click did not apply at '+JSON.stringify(actual)+': '+JSON.stringify(outcome));return actual;
}
test('Kingdom Overview manages captured and founded settlements, real garrisons, travel and reload',async({page})=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#start').click();await pause(page);
 // Fixture-assisted campaign setup: enter Briar March, reveal Mossgate, and clear its forces so the management loop can be tested deterministically.
 const campaign=await page.evaluate(async()=>{
  const {army}=await import('/src/game/state.ts' as string),{ROAD_EXIT,empireStep}=await import('/src/game/empire.ts' as string),rt=(window as any).__KINGNAMIC__.runtime;
  if(!rt.state.commander){const appointed=rt.act({type:'commander-appoint'});if(!appointed.ok)throw Error(appointed.message);}
  const party=army(rt.state);for(const u of party)Object.assign(u,{x:ROAD_EXIT.x,y:ROAD_EXIT.y,target:{...ROAD_EXIT},anchor:{...ROAD_EXIT},path:[],order:'hold'});
  const departed=rt.act({type:'travel',ids:party.map((u:any)=>u.id)});if(!departed.ok)throw Error(departed.message);
  const s=rt.world,hero=army(s).find((u:any)=>u.id===s.commander.id)!;Object.assign(hero,{x:47,y:29,target:{x:47,y:29},anchor:{x:47,y:29},path:[],order:'hold'});empireStep(s,.1);
  const war=s.march?.rival;if(!war||war.status!=='occupied')throw Error('Mossgate did not enter its real occupied state.');
  s.units=s.units.filter((u:any)=>u.faction!=='rival'&&!['hollow','runner','brute'].includes(u.kind));s.infection=[];s.corpses=[];s.waveRemaining=0;s.march.warning=0;war.warning=0;war.remaining=0;war.reserve=0;war.casualties=100;war.leaderId=undefined;rt.onChange();
  return {troops:party.map((u:any)=>u.id),commander:hero.id};
 });
 await page.locator('#tab-empire').click();await page.locator('#capture-stronghold').click();
 await expect.poll(async()=>(await read(page)).march.rival.status).toBe('captured');
 const preparation=await page.evaluate(async()=>{
  const rt=(window as any).__KINGNAMIC__.runtime,s=rt.world,{army}=await import('/src/game/state.ts' as string),{buildError}=await import('/src/game/commands.ts' as string),{tileAt}=await import('/src/game/map.ts' as string);
  const friends=army(s),candidates=[{x:16,y:21},{x:17,y:21},{x:16,y:22},{x:18,y:21},{x:15,y:21},{x:17,y:22}];let site:any=null;
  for(const p of candidates){if(Math.hypot(p.x-47,p.y-29)<12)continue;const offsets=[[1,0],[-1,0],[0,1]],positions=friends.map((_:any,i:number)=>({x:p.x+offsets[i%3][0],y:p.y+offsets[i%3][1]}));if(positions.some((q:any)=>!tileAt(q.x,q.y,s)||tileAt(q.x,q.y,s).terrain==='water'))continue;for(let i=0;i<friends.length;i++){const u=friends[i],q=positions[i];Object.assign(u,{...q,target:{...q},anchor:{...q},path:[],order:'hold',repath:0});}if(!buildError(s,'hearth',p.x,p.y)){site=p;break;}}
  if(!site)throw Error('No valid test settlement site was found under the real founding rules.');
  return {site,mossgate:s.buildings.find((b:any)=>b.kind==='hearth'&&b.name==='Mossgate Hall').id,frontierWorkers:s.empire.reserve.residents.filter((r:any)=>r.job==='idle').length};
 }); await page.locator('#place-outpost').click();await chooseTile(page,preparation.site,'hearth');
 await expect.poll(async()=>(await read(page)).buildings.filter((b:any)=>b.kind==='hearth').length).toBe(2);
 const frontier=await page.evaluate(()=>{const s=(window as any).__KINGNAMIC__.runtime.world;return s.buildings.find((b:any)=>b.kind==='hearth'&&b.name!=='Mossgate Hall')?.id;});
 await page.locator('#tab-empire').click();await expect(page.locator('.kingdom-overview')).toContainText('Kingdom overview');await expect(page.locator('.kingdom-settlement')).toHaveCount(3);
 const desktopOverview=await read(page);expect(desktopOverview.population+desktopOverview.empire.reserve.population).toBe(22);await page.screenshot({path:'test-results/empire-browser/kingdom-overview-desktop.png',fullPage:false});
 const beforeRepair=await read(page),hall=beforeRepair.buildings.find((b:any)=>b.id===preparation.mossgate);expect(hall.hp).toBeLessThan(hall.maxHp);
 await page.locator('.kingdom-settlement[data-settlement="'+preparation.mossgate+'"] [data-kingdom-repair]').click();
 let repaired=await read(page);expect(repaired.buildings.find((b:any)=>b.id===preparation.mossgate).hp).toBe(repaired.buildings.find((b:any)=>b.id===preparation.mossgate).maxHp);expect(repaired.resources.wood).toBeLessThan(beforeRepair.resources.wood);
 const towerSite=await page.evaluate(async()=>{const s=(window as any).__KINGNAMIC__.runtime.world,{buildError}=await import('/src/game/commands.ts' as string),candidates=[{x:18,y:21},{x:16,y:23},{x:17,y:22},{x:15,y:22},{x:19,y:21},{x:18,y:22}];return candidates.find(p=>!buildError(s,'tower',p.x,p.y))??null;});
 expect(towerSite,'Find a legal defensive tower site using the production build rules.').not.toBeNull(); await page.locator('.kingdom-settlement[data-settlement="'+frontier+'"] [data-kingdom-build]').click();await page.locator('#build-tower').click();await chooseTile(page,towerSite!,'tower');
 let built=await read(page);const tower=built.buildings.find((b:any)=>b.kind==='tower'&&!beforeRepair.buildings.some((v:any)=>v.id===b.id));expect(tower).toBeTruthy();expect(tower.progress).toBeLessThanOrEqual(1);
 await page.locator('#tab-empire').click();
 const movable=campaign.troops.find(id=>id!==campaign.commander)!;let soldier=armyView(await read(page),movable);expect(soldier).toBeTruthy();
 await page.locator('.kingdom-settlement[data-settlement="'+frontier+'"] [data-kingdom-company]').click();await page.locator('#unit-'+movable).click();await page.locator('#tab-empire').click();
 const beforeOrder=await read(page),beforeSoldier=beforeOrder.units.find((u:any)=>u.id===movable),target=beforeOrder.buildings.find((b:any)=>b.id===preparation.mossgate);
 await page.locator('.kingdom-settlement[data-settlement="'+preparation.mossgate+'"] [data-kingdom-defend]').click();
 let ordered=await read(page);soldier=ordered.units.find((u:any)=>u.id===movable);expect(soldier.order).toBe('defend');expect(Math.hypot(soldier.x-beforeSoldier.x,soldier.y-beforeSoldier.y)).toBeLessThan(.001);expect(Math.hypot(soldier.target.x-target.x,soldier.target.y-target.y)).toBeLessThan(2);
 await page.locator('.kingdom-settlement[data-settlement="'+preparation.mossgate+'"] [data-kingdom-recall]').click();
 const recalled=await read(page),hero=recalled.units.find((u:any)=>u.id===campaign.commander),recalledSoldier=recalled.units.find((u:any)=>u.id===movable);expect(recalledSoldier.order).toBe('move');expect(Math.hypot(recalledSoldier.x-soldier.x,recalledSoldier.y-soldier.y)).toBeLessThan(.001);expect(Math.hypot(recalledSoldier.target.x-hero.x,recalledSoldier.target.y-hero.y)).toBeLessThan(2);
 // The gathered party physically reaches the road; the selected companion and commander travel, while the remaining soldier stays behind.
 await page.locator('#gather-road').click();await page.locator('#speed-2').click();
 await expect.poll(async()=>page.evaluate(async()=>{const rt=(window as any).__KINGNAMIC__.runtime,{travelError}=await import('/src/game/empire.ts' as string);return travelError(rt.state,rt.selectedIds);}),{timeout:45000}).toBeNull();
 await pause(page);expect(await page.locator('#travel-region').isEnabled()).toBe(true);await page.locator('#travel-region').click();await expect.poll(async()=>(await read(page)).region).toBeUndefined();
 const home=await read(page),idsAtHome=home.units.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind)).map((u:any)=>u.id);expect(idsAtHome).toEqual([campaign.commander,movable]);
 await page.evaluate((id:number)=>{const rt=(window as any).__KINGNAMIC__,hall=rt.runtime.state.empire.reserve.buildings.find((b:any)=>b.id===id);hall.hp=Math.max(1,hall.maxHp-40);rt.runtime.onChange();},preparation.mossgate);
 const remoteRepairAlert=page.locator('.kingdom-alert[data-kingdom-alert="repairs"][data-settlement-id="'+preparation.mossgate+'"]');await expect(remoteRepairAlert).toContainText('Mossgate Hall');await remoteRepairAlert.click();await expect(page.locator('#tab-army')).toHaveClass(/active/);await expect(page.locator('#toast')).toContainText('Travel to Mossgate Hall');
 await page.evaluate((id:number)=>{const rt=(window as any).__KINGNAMIC__,hall=rt.runtime.state.empire.reserve.buildings.find((b:any)=>b.id===id);hall.hp=hall.maxHp;rt.runtime.onChange();},preparation.mossgate);await page.locator('#tab-empire').click();
 await expect(page.locator('#travel-region')).toBeEnabled();await page.locator('#travel-region').click();await expect.poll(async()=>(await read(page)).region).toBe('march');
 const back=await read(page);expect(back.buildings.some((b:any)=>b.id===tower.id&&b.kind==='tower')).toBe(true);expect(back.buildings.find((b:any)=>b.id===preparation.mossgate)?.hp).toBe(back.buildings.find((b:any)=>b.id===preparation.mossgate)?.maxHp);
 const stay=campaign.troops.find(id=>id!==campaign.commander&&id!==movable)!;
 await page.locator('.kingdom-settlement[data-settlement="'+frontier+'"] [data-kingdom-company]').click();await page.locator('#unit-'+stay).click();await page.locator('#tab-empire').click();await page.locator('.kingdom-settlement[data-settlement="'+frontier+'"] [data-kingdom-defend]').click();
 const beforeSave=await read(page),allUnits=[...beforeSave.units,...beforeSave.empire.reserve.units],allResidents=[...beforeSave.residents,...beforeSave.empire.reserve.residents];expect(allUnits.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind))).toHaveLength(3);expect(new Set(allUnits.map((u:any)=>u.id)).size).toBe(allUnits.length);expect(new Set(allResidents.map((u:any)=>u.id)).size).toBe(allResidents.length);expect(new Set([...allUnits.map((u:any)=>u.id),...allResidents.map((u:any)=>u.id)]).size).toBe(allUnits.length+allResidents.length);
 await page.locator('#save').click();expect(await page.locator('#save-status').textContent()).toContain('Saved');await page.reload();await page.locator('#start').click();await page.locator('#tab-empire').click();
 const afterReload=await read(page);expect(afterReload.buildings).toEqual(beforeSave.buildings);expect(afterReload.resources).toEqual(beforeSave.resources);expect(afterReload.population+afterReload.empire.reserve.population).toBe(beforeSave.population+beforeSave.empire.reserve.population);expect([...afterReload.units,...afterReload.empire.reserve.units].map((u:any)=>[u.id,u.order,u.anchor,u.target]).sort((a:any,b:any)=>a[0]-b[0])).toEqual([...beforeSave.units,...beforeSave.empire.reserve.units].map((u:any)=>[u.id,u.order,u.anchor,u.target]).sort((a:any,b:any)=>a[0]-b[0]));expect(errors).toEqual([]);
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.kingdom-overview')).toContainText('Kingdom overview');const widths=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,panel:document.querySelector('#panel')?.scrollWidth,client:document.querySelector('#panel')?.clientWidth}));expect(widths.document).toBeLessThanOrEqual(widths.viewport);await page.screenshot({path:'test-results/empire-browser/kingdom-overview-mobile.png',fullPage:false});
});

async function armyView(state:any,id:number){return state.units.find((u:any)=>u.id===id&&['warden','ranger','spearman','scout'].includes(u.kind));}
