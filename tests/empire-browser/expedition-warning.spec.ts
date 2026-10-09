import {test,expect,type Page} from '@playwright/test';
import {newGame,army} from '../../src/game/state';
import {command} from '../../src/game/commands';

async function ready(page:Page){
 const s=newGame(88421);s.speed=0;const troops=army(s),hero=troops[0];expect(command(s,{type:'commander-appoint',id:hero.id}).ok).toBe(true);
 for(const u of troops)Object.assign(u,{x:14,y:24,target:{x:14,y:24},anchor:{x:14,y:24},path:[],order:'hold'});
 await page.goto('/');await page.evaluate(raw=>localStorage.setItem('kingnamic.save.v2',raw),JSON.stringify(s));await page.reload();await page.locator('#start').click();await page.locator('#tab-army').click();await page.locator('#select-all').click();await page.locator('#tab-empire').click();
}
test('dispatching every ready defender warns first and still honors deliberate confirmation',async({page})=>{
 await ready(page);const before=await page.evaluate(()=>JSON.stringify((window as any).__KINGNAMIC__.runtime.state.units.map((u:any)=>({id:u.id,x:u.x,y:u.y,order:u.order}))));
 await page.locator('#gather-road').click();await expect(page.locator('#dialog')).toHaveAttribute('open','');await expect(page.locator('#dialog')).toContainText('No fit soldiers will remain to defend Hearthmere');expect(await page.evaluate(()=>JSON.stringify((window as any).__KINGNAMIC__.runtime.state.units.map((u:any)=>({id:u.id,x:u.x,y:u.y,order:u.order}))))).toBe(before);
 await page.locator('#dispatch-all-cancel').click();await expect(page.locator('#dialog')).not.toHaveAttribute('open','');await page.locator('#gather-road').click();await page.locator('#dispatch-all-confirm').click();await expect(page.locator('#travel-region')).toBeEnabled();expect(await page.evaluate(()=>{const s=(window as any).__KINGNAMIC__.runtime.state;return s.units.filter((u:any)=>u.muster).length;})).toBeGreaterThan(0);
});
test('the complete-force warning fits the emulated touch viewport and is tappable',async({page,browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const mobile=await context.newPage();try{await ready(mobile);await mobile.locator('#gather-road').tap();const dialog=mobile.locator('#dialog');await expect(dialog).toContainText('Send the whole company?');const bounds=await mobile.locator('#dispatch-all-confirm').boundingBox();expect(bounds).toBeTruthy();expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(844);await mobile.locator('#dispatch-all-confirm').tap();await expect(mobile.locator('#travel-region')).toBeEnabled();}finally{await context.close();}
});
