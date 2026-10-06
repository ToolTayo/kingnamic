import {test,expect,type Page} from '@playwright/test';
import {newGame,makeBuilding,makeUnit} from '../../src/game/state';
import {readFile,writeFile} from 'node:fs/promises';
const read=(p:Page)=>p.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
async function start(p:Page){await p.goto('/');await p.locator('#start').click();if((await read(p)).speed)await p.locator('#pause').click();}
async function tile(p:Page,x:number,y:number){const pt=await p.evaluate(p=>(window as any).__KINGNAMIC__.scene.screenPoint(p),{x,y});await p.locator('#world canvas').click({position:pt});}

test('legacy zero-stone kingdom builds defenses, shows shortfalls, and migrates without changing wealth',async({page})=>{
  const old=JSON.parse(await readFile('tests/fixtures/milestone-v2.json','utf8'));old.resources.wood=500;old.resources.stone=0;old.speed=0;
  await page.addInitScript(raw=>{if(!localStorage.getItem('kingnamic.save.v2'))localStorage.setItem('kingnamic.save.v2',raw);},JSON.stringify(old));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await start(page);
  expect((await read(page)).resources).toEqual(old.resources);await expect(page.locator('.resource.stone')).toContainText('CROWNS');
  await page.locator('#category-defense').click();await expect(page.locator('#build-wall')).toBeEnabled();await expect(page.locator('#build-tower')).toBeDisabled();
  await expect(page.locator('.shop-card').filter({has:page.locator('#build-tower')})).toContainText('Need 30 Crowns more');
  await page.locator('#details-gate').click();await expect(page.locator('.shop-description')).toContainText('Infected must go around or destroy it');
  await page.locator('#build-wall').click();await tile(page,18,13);expect((await read(page)).resources.wood).toBe(492);expect((await read(page)).resources.stone).toBe(0);
  await page.locator('#save').click();const before=await read(page);await page.reload();await page.locator('#start').click();expect((await read(page)).resources).toEqual(before.resources);expect((await read(page)).buildings).toEqual(before.buildings);
  await page.locator('#category-defense').click();await page.screenshot({path:'docs/evidence/renewal-shop.png'});expect(errors).toEqual([]);
});

test('closed-gate siege damages, persists, breaches and then admits infected',async({page})=>{
  const s=newGame();s.speed=0;s.population=0;s.residents=[];s.jobs={farmers:0,woodcutters:0,miners:0,healers:0,builders:0};s.units=[];s.buildings=s.buildings.filter(b=>b.kind==='hearth');
  const gate=makeBuilding(s,'gate',14,20,true);makeBuilding(s,'wall',15,20,true);const z=makeUnit(s,'brute',14,23);
  await page.addInitScript(raw=>{if(!localStorage.getItem('kingnamic.save.v2'))localStorage.setItem('kingnamic.save.v2',raw);},JSON.stringify(s));
  await start(page);await page.evaluate(()=>{const a=(window as any).__KINGNAMIC__;a.scene.focus({x:14,y:20});(window as any).__breaches=[];const old=a.runtime.tick.bind(a.runtime);a.runtime.tick=(dt:number)=>{old(dt);const s=a.runtime.state;for(const u of s.units)if(['hollow','runner','brute'].includes(u.kind)&&s.buildings.some((b:any)=>Math.round(u.x)===b.x&&Math.round(u.y)===b.y))(window as any).__breaches.push({id:u.id,x:u.x,y:u.y});};});
  await page.locator('#speed-2').click();await expect.poll(async()=>(await read(page)).buildings.find((b:any)=>b.id===gate.id)?.hp,{timeout:15000}).toBeLessThan(gate.hp);
  await page.locator('#pause').click();const damaged=(await read(page)).buildings.find((b:any)=>b.id===gate.id);await page.screenshot({path:'docs/evidence/renewal-siege.png'});expect(await page.evaluate(()=>(window as any).__breaches)).toEqual([]);
  await page.locator('#save').click();await page.reload();await page.locator('#start').click();expect((await read(page)).buildings.find((b:any)=>b.id===gate.id).hp).toBe(damaged.hp);
  await page.locator('#speed-2').click();await expect.poll(async()=>(await read(page)).buildings.some((b:any)=>b.id===gate.id),{timeout:50000}).toBe(false);
  await expect.poll(async()=>(await read(page)).units.find((u:any)=>u.id===z.id)?.y,{timeout:15000}).toBeLessThan(19.3);await page.locator('#pause').click();
  await writeFile('docs/evidence/renewal-siege.json',JSON.stringify({fixture:true,gateId:gate.id,damagedHp:damaged.hp,final:await read(page)},null,2));
});

test('fresh mobile shop and focused army views work through actual touch controls',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  try{await start(page);await expect(page.locator('.shop-card')).toHaveCount(3);await page.locator('#category-production').tap();await expect(page.locator('.shop-card')).toHaveCount(2);
    await page.locator('#details-quarry').tap();await expect(page.locator('.shop-description')).toContainText('Crowns');const button=await page.locator('#build-quarry').boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);
    await page.locator('#tab-army').tap();await page.locator('#army-recruit').tap();const before=await read(page);await page.locator('#recruit-warden').tap();expect((await read(page)).resources.stone).toBe(before.resources.stone-20);
    await page.locator('#army-orders').tap();await page.locator('#select-all').tap();await page.locator('#order-hold').tap();expect((await read(page)).units.every((u:any)=>u.order==='hold')).toBe(true);
    await page.locator('#army-squads').tap();await page.locator('#squad-name').fill('Hearth watch');await page.locator('#create-squad').tap();await page.locator('#army-roster').tap();await expect(page.locator('.unit-row')).toHaveCount(4);
    await page.locator('#army-recruit').tap();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'docs/evidence/renewal-mobile.png'});
  }finally{await context.close();}
});
