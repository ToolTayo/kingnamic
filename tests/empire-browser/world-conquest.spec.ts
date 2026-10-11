import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {newGame,army,makeBuilding} from '../../src/game/state';
import {addResidents} from '../../src/game/population';
import {command} from '../../src/game/commands';
import {CONQUEST_IDS} from '../../src/game/conquestGuide';
const read=(p:Page)=>p.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
const nav=(p:Page)=>p.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.conquestNavigation)));
const warOf=(s:any,id:string)=>s.march[id==='mossgate'?'rival':id==='tallowmere'?'weirward':id];
async function pause(p:Page){if((await read(p)).speed)await p.locator('#pause').click();}
test('fresh player sees all rivals, follows the real road, and scouts Briar village',async({page})=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.locator('#start').click();await pause(page);await page.locator('#tab-territories').click();
 await expect(page.locator('.conquest-index button')).toHaveCount(5);for(const name of ['Mossgate','Tallowmere','Stonewake','Alderwatch','Redwater'])await expect(page.locator('.conquest-index')).toContainText(name);
 await expect(page.locator('#panel')).toContainText('Resource territories, separate from the five rival kingdoms');await page.locator('#conquest-local').click();await expect(page.locator('#claim-pinewatch')).toBeVisible();await page.locator('#tab-territories').click();await page.locator('.conquest-index').scrollIntoViewIfNeeded();await page.screenshot({path:'docs/evidence/world-conquest-fresh.png'});
 const before=await read(page);await page.locator('.conquest-index [data-conquest-route="mossgate"]').click();expect(await read(page)).toEqual(before);expect((await nav(page)).point).toMatchObject({x:14,y:24});
 await page.locator('.conquest-route [data-tab="empire"]').click();await page.locator('#appoint-commander').click();
 const s=await read(page),company=army(s).slice(0,2).map(u=>u.id),guard=army(s).at(-1)!.id;
 await page.locator('#tab-army').click();await page.locator('#army-orders').click();await page.locator('#select-none').click();await page.locator('#army-roster').click();for(const id of company)await page.locator('#unit-'+id).click();
 await page.locator('#tab-empire').click();await page.locator('#gather-road').click();await page.locator('#speed-2').click();await expect(page.locator('#travel-region')).toBeEnabled({timeout:45000});await page.locator('#travel-region').click();expect((await read(page)).region).toBe('march');
 await page.locator('#tab-territories').click();await page.locator('#conquest-select').click();const guardState=(await read(page)).empire.reserve.units.find((u:any)=>u.id===guard);
 let point=(await nav(page)).point;await page.locator('#conquest-move').click();expect((await read(page)).speed).toBe(0);expect((await read(page)).units.find((u:any)=>u.id===s.commander.id).target).toMatchObject({x:point.x,y:point.y});await page.locator('#speed-2').click();
 await expect.poll(async()=>(await nav(page)).leg,{timeout:45000}).toBe(1);await pause(page);await page.locator('#conquest-move').click();await page.locator('#speed-2').click();await expect.poll(async()=>(await read(page)).march.seen.includes('village'),{timeout:60000}).toBe(true);await pause(page);
 await expect(page.locator('#conquest-mossgate')).toContainText('Trail found');expect((await read(page)).empire.reserve.units.find((u:any)=>u.id===guard)).toEqual(guardState);await page.screenshot({path:'docs/evidence/world-conquest-village.png'});
 await page.locator('#save').click();const saved=await read(page);await page.reload();await page.locator('#start').click();expect((await read(page)).march.seen).toEqual(saved.march.seen);await pause(page);await page.locator('#tab-territories').click();await expect(page.locator('#conquest-mossgate')).toContainText('Trail found');expect(await nav(page)).toBeNull();expect(errors).toEqual([]);
 // Fault injection verifies rejected commands remain visible, without changing
 // any combat outcome, casualty, discovery or soldier state.
 await page.locator('.conquest-index [data-conquest-route="mossgate"]').click();const unchanged=await read(page);await page.evaluate(()=>{const rt=(window as any).__KINGNAMIC__.runtime,act=rt.act.bind(rt);rt.act=(c:any)=>{if(c.type!=='order')return act(c);rt.notify('Order rejected by command validator.','warn');return{ok:false,message:'Order rejected by command validator.'};};});await page.locator('#conquest-move').click();await expect(page.locator('#toast')).toHaveText('Order rejected by command validator.');expect(await read(page)).toEqual(unchanged);
});
for(const width of [320,390])test(`touch World navigation fits ${width}px and planning does not dispatch troops`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await page.goto('/');await page.locator('#start').tap();await pause(page);await page.locator('#tab-territories').tap();await page.screenshot({path:`docs/evidence/world-conquest-mobile-${width}-fresh.png`});
 for(const id of CONQUEST_IDS){const b=page.locator('.conquest-index [data-conquest-route="'+id+'"]');await b.scrollIntoViewIfNeeded();const box=await b.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);const before=await read(page);await b.tap();expect(await read(page)).toEqual(before);await expect(page.locator('.conquest-route')).toContainText('Southern road');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`docs/evidence/world-conquest-mobile-${width}.png`});await context.close();
});
for(const id of CONQUEST_IDS)test(`World route naturally discovers and reaches ${id} with a recruited company`,async({page})=>{
 test.setTimeout(360000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Mature-save provisions/capacity only. Every traveller is recruited legally;
 // no discoveries, enemies, campaign counters or combat outcomes are edited.
 const s=newGame(604271);s.speed=0;s.resources={wood:2500,stone:5000,food:10000,herbs:200};s.buildings.find(b=>b.kind==='barracks')!.level=3;makeBuilding(s,'barracks',19,10,true).level=3;addResidents(s,120);
 for(const [kind,count] of [['warden',50],['ranger',40],['scout',7]] as const)expect(command(s,{type:'recruit',kind,count}).ok).toBe(true);
 expect(army(s)).toHaveLength(100);expect(command(s,{type:'commander-appoint',id:army(s)[0].id}).ok).toBe(true);command(s,{type:'commander-weapon',weapon:'bow'});
 await page.goto('/');await page.evaluate(raw=>localStorage.setItem('kingnamic.save.v2',raw),JSON.stringify(s));await page.reload();await page.locator('#start').click();
 const hero=s.commander!.id,company=army(s).filter(u=>u.id!==army(s).at(-1)!.id).map(u=>u.id),guard=army(s).at(-1)!.id;
 await page.evaluate(ids=>(window as any).__KINGNAMIC__.runtime.selectUnits(ids),company);await page.locator('#tab-empire').click();await page.locator('#gather-road').click();await page.locator('#speed-2').click();await expect(page.locator('#travel-region')).toBeEnabled({timeout:90000});await page.locator('#travel-region').click();await page.locator('#tab-territories').click();
 await page.locator('.conquest-index [data-conquest-route="'+id+'"]').click();await page.locator('#conquest-select').click();let target='',history:any[]=[];
 const started=Date.now();while(Date.now()-started<270000){
  const state=await read(page),n=await nav(page),commander=state.units.find((u:any)=>u.id===hero),war=warOf(state,id);
  history.push({atMs:Date.now()-started,leg:n.leg,stage:n.stage,point:n.point,commander:commander&&{x:commander.x,y:commander.y,hp:commander.hp},remaining:war?.remaining,status:war?.status,infected:state.infection.length,kingdoms:Object.fromEntries(CONQUEST_IDS.map(k=>[k,warOf(state,k)?.status]))});
  if(war?.status==='occupied')break;expect(commander,'The route must not lose its living commander').toBeTruthy();
  if(state.infection.some((i:any)=>i.personId===hero)){await pause(page);await page.locator('#tab-people').click();await page.locator('#treat').click();await page.locator('#tab-territories').click();target='';}
  const key=n.stage+':'+n.leg;if(key!==target){await page.locator('#conquest-move').click();target=key;}
  if(!(await read(page)).speed)await page.locator('#speed-2').click();await page.waitForTimeout(1000);
 }
 await pause(page);const final=await read(page),war=warOf(final,id);await writeFile(`docs/evidence/world-route-${id}.json`,JSON.stringify({fixture:'Mature supplies and capacity, legal recruits; real gathering, UI waypoints, movement, discovery and activation.',history,seen:final.march.seen,status:war?.status,remaining:war?.remaining,guardAtHome:final.empire.reserve.units.some((u:any)=>u.id===guard),errors},null,2));
 expect(war?.status,JSON.stringify(history.slice(-4))).toBe('occupied');if(id==='stonewake'||id==='redwater')expect(warOf(final,id==='stonewake'?'redwater':'stonewake').status).toBe('unseen');expect(final.empire.reserve.units.some((u:any)=>u.id===guard)).toBe(true);await expect(page.locator('#conquest-'+id)).toContainText('Contested');await expect(page.locator('[data-conquest-siege="'+id+'"]')).toBeVisible();await page.screenshot({path:`docs/evidence/world-route-${id}.png`});await page.locator('[data-conquest-siege="'+id+'"]').click();await expect(page.locator(id==='mossgate'?'#capture-stronghold':'#capture-'+id)).toBeDisabled();await page.locator('#save').click();await page.reload();await page.locator('#start').click();expect(warOf(await read(page),id).status).toBe('occupied');expect(errors).toEqual([]);
});
