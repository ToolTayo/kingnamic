import {test,expect,type Page} from '@playwright/test';
import {newGame,army,makeUnit} from '../../src/game/state';
import {key} from '../../src/game/map';
import {nearestOpen} from '../../src/game/navigation';
const read=(p:Page)=>p.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
test('desktop right-drag commits the previewed army order on release',async({page})=>{
 const s=newGame(1423);s.speed=0;const reserved=new Set([...s.units,...s.residents!].map(key));
 for(let n=0;n<47;n++){const p=nearestOpen(s,{x:8+n%10,y:7+Math.floor(n/10)},reserved);reserved.add(key(p));const u=makeUnit(s,['warden','ranger','spearman','scout'][n%4],p.x,p.y);u.order='hold';u.target={...p};}
 const ids=army(s).map(u=>u.id);expect(ids).toHaveLength(50);await page.addInitScript(raw=>localStorage.setItem('kingnamic.save.v2',raw),JSON.stringify(s));await page.goto('/');await page.locator('#start').click();await page.locator('#tab-army').click();await page.locator('#select-all').click();await page.locator('#formation-protected').click();
 await page.evaluate(()=>{const g:any=window as any,scene=g.__KINGNAMIC__.scene,trace:any[]=[];scene.input.on('pointerup',(p:any)=>trace.push({type:'up',x:p.x,y:p.y,button:p.button}));scene.input.on('pointerupoutside',(p:any)=>trace.push({type:'outside',x:p.x,y:p.y,button:p.button}));g.__desktopTrace=trace;});
 await page.evaluate(p=>(window as any).__KINGNAMIC__.scene.focus(p),{x:22,y:14});await page.waitForTimeout(400);const canvas=page.locator('#world canvas'),box=await canvas.boundingBox();expect(box).toBeTruthy();
 const start=await page.evaluate(p=>(window as any).__KINGNAMIC__.scene.screenPoint(p),{x:13,y:12}),end=await page.evaluate(p=>(window as any).__KINGNAMIC__.scene.screenPoint(p),{x:20,y:15});
 const bounds={x:box!.x,y:box!.y,width:box!.width,height:box!.height,start,end};await page.mouse.move(box!.x+start.x,box!.y+start.y);await page.mouse.down({button:'right'});await page.mouse.move(box!.x+end.x,box!.y+end.y,{steps:10});await page.waitForTimeout(100);expect(await page.evaluate(()=>!!(window as any).__KINGNAMIC__.scene.commandGesture?.active)).toBe(true);await page.screenshot({path:'docs/evidence/army-desktop-preview.png'});await page.mouse.move(box!.x+box!.width+24,box!.y+end.y);await page.mouse.up({button:'right'});await page.waitForTimeout(50);
 const state=await read(page),orders=state.units.filter((u:any)=>ids.includes(u.id));console.log('desktop release',JSON.stringify({bounds,trace:await page.evaluate(()=>((window as any).__desktopTrace)),ready:await page.evaluate(()=>({ready:(window as any).__KINGNAMIC__.runtime.ready,gesture:(window as any).__KINGNAMIC__.scene.commandGesture})),orders:[...new Set(orders.map((u:any)=>u.order))],targets:orders.slice(0,3).map((u:any)=>u.target)}));expect(orders.filter((u:any)=>u.order==='move')).toHaveLength(50);
});
