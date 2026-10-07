import {test,expect} from '@playwright/test';
import {newGame,army,makeUnit} from '../../src/game/state';
import {command} from '../../src/game/commands';
import {key} from '../../src/game/map';
import {nearestOpen} from '../../src/game/navigation';

const read=(page:any)=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));

test('mobile long-press drag previews and orders an unselected 50-soldier column',async({browser})=>{
 test.setTimeout(60000);const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
 const s=newGame();s.speed=0;command(s,{type:'formation',formation:'column'});const reserved=new Set([...s.units,...s.residents!].map(key));
 for(let n=0;n<47;n++){const p=nearestOpen(s,{x:8+n%11,y:7+Math.floor(n/11)},reserved);reserved.add(key(p));const u=makeUnit(s,['warden','ranger','spearman','scout'][n%4],p.x,p.y);u.order='hold';u.target={...p};}
 const ids=army(s).map(u=>u.id);expect(ids).toHaveLength(50);
 try{
  await page.addInitScript(raw=>localStorage.setItem('kingnamic.save.v2',raw),JSON.stringify(s));await page.goto('/');await page.locator('#start').click();
  const canvas=page.locator('#world canvas'),box=await canvas.boundingBox();expect(box).not.toBeNull();const start=await page.evaluate((p:any)=>(window as any).__KINGNAMIC__.scene.screenPoint(p),{x:13,y:9}),end=await page.evaluate((p:any)=>(window as any).__KINGNAMIC__.scene.screenPoint(p),{x:17,y:12});
  const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box!.x+start.x,y:box!.y+start.y,id:0}]});await page.waitForTimeout(500);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box!.x+end.x,y:box!.y+end.y,id:0}]});await page.waitForTimeout(80);
  const preview=await page.evaluate(()=>{const s:any=(window as any).__KINGNAMIC__.scene;return !!s.commandGesture?.active;});expect(preview).toBe(true);await page.screenshot({path:'docs/evidence/army-column-command-preview.png'});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});let state=await read(page);const rt:any=await page.evaluate(()=>({selected:(window as any).__KINGNAMIC__.runtime.selectedIds.length,targets:(window as any).__KINGNAMIC__.runtime.world.units.map((u:any)=>u.target)}));
  expect(rt.selected).toBe(0);expect(state.units.filter((u:any)=>ids.includes(u.id)&&u.order==='move')).toHaveLength(50);expect(new Set(rt.targets.map((p:any)=>`${p.x},${p.y}`)).size).toBe(50);
  const before=new Map(state.units.filter((u:any)=>ids.includes(u.id)).map((u:any)=>[u.id,`${u.x},${u.y}`]));await page.locator('#speed-1').click();await page.waitForTimeout(1600);state=await read(page);
  expect(state.units.some((u:any)=>ids.includes(u.id)&&before.get(u.id)!==`${u.x},${u.y}`)).toBe(true);await page.locator('#pause').click();await page.screenshot({path:'docs/evidence/army-column-movement.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await context.close();}
});
