import {test,expect} from '@playwright/test';
import {newGame,army} from '../../src/game/state';
import {command} from '../../src/game/commands';
import {empireStep} from '../../src/game/empire';
import {decode} from '../../src/game/persistence';

test('touch Empire panel keeps the Redwater campaign readable at a phone viewport',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
 try{
  const s=newGame(20261009);s.speed=0;const commander=army(s)[0];expect(command(s,{type:'commander-appoint',id:commander.id}).ok).toBe(true);
  for(const u of army(s))Object.assign(u,{x:14,y:24,target:{x:14,y:24},anchor:{x:14,y:24},path:[],order:'hold'});
  const travel=command(s,{type:'travel',ids:army(s).map(u=>u.id)});expect(travel.ok,travel.message).toBe(true);
  s.march!.seen.push('redwater-cairn');s.march!.rumors!.push('redwater');
  const hero=s.units.find(u=>u.id===s.commander!.id)!;Object.assign(hero,{x:41,y:20,target:{x:41,y:20},anchor:{x:41,y:20},path:[],order:'hold'});empireStep(s,.1);
  expect(decode(JSON.stringify(s))).not.toBeNull();
  await page.goto('/');await page.evaluate(raw=>localStorage.setItem('kingnamic.save.v2',raw),JSON.stringify(s));await page.reload();await page.locator('#start').tap();await page.locator('#tab-empire').tap();
  await page.evaluate(()=>{const app=(window as any).__KINGNAMIC__;app.scene.focus({x:41,y:20});});await page.waitForTimeout(400);
  await expect(page.locator('#panel')).toContainText('REDWATER REACH · THE REDWATER WATCH');
  await expect(page.locator('#panel')).toContainText('Redwater Reach is contested');
  await expect(page.locator('#panel')).toContainText('160 of 160 defenders remain');
  await expect(page.locator('#panel')).toContainText('0/3 outer camps cleared');
  await expect(page.locator('#objectives')).toContainText('Clear Redwater outer camps');
  await expect(page.locator('#objectives')).toContainText('Breach each outer camp gate before clearing its garrison.');
  await expect(page.locator('#objectives')).toContainText('120 finite reserves wait behind the camps.');
  const capture=page.locator('#capture-redwater');await expect(capture).toBeDisabled();await expect(page.locator('#panel')).toContainText('Clear all three Redwater outer camps before securing the keep.');
  await capture.scrollIntoViewIfNeeded();const bounds=await capture.boundingBox();expect(bounds).toBeTruthy();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);expect(bounds!.width).toBeGreaterThan(0);
  await page.screenshot({path:'docs/evidence/redwater-mobile.png',fullPage:true});
 }finally{await context.close();}
});
