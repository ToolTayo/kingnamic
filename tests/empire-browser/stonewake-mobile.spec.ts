import {test,expect} from '@playwright/test';
import {newGame,army} from '../../src/game/state';
import {command} from '../../src/game/commands';
import {decode} from '../../src/game/persistence';

test('touch Empire panel identifies the discovered Stonewake rival keep and exposes travel guidance',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
 try{
  const s=newGame(20261009);s.speed=0;const commander=army(s)[0];expect(command(s,{type:'commander-appoint',id:commander.id}).ok).toBe(true);for(const u of army(s))Object.assign(u,{x:14,y:24,target:{x:14,y:24},anchor:{x:14,y:24},path:[],order:'hold'});
  const departed=command(s,{type:'travel',ids:army(s).map(u=>u.id)});expect(departed.ok,departed.message).toBe(true);s.march!.seen.push('stonewake-quarry');s.march!.rumors!.push('stonewake');s.march!.stonewake!.status='occupied';
  const returned=command(s,{type:'travel',ids:[commander.id]});expect(returned.ok,returned.message).toBe(true);
  const remote=s.empire!.reserve;expect(remote.march!.seen).toContain('stonewake-quarry');expect(remote.march!.rumors).toContain('stonewake');remote.march!.stonewake!.status='occupied';expect(decode(JSON.stringify(s))).not.toBeNull();
  await page.goto('/');await page.evaluate(raw=>localStorage.setItem('kingnamic.save.v2',raw),JSON.stringify(s));await page.reload();await page.locator('#start').tap();await page.locator('#tab-empire').tap();
  await expect(page.locator('#panel')).toContainText('STONEWAKE HOLD · GREYBANK RIDGE');await expect(page.locator('#panel')).toContainText('Stonewake commands the quarry pass');await expect(page.locator('#panel')).toContainText('125 of 125 defenders remain');
  const capture=page.locator('#capture-stonewake');await expect(capture).toBeDisabled();await expect(page.locator('#panel')).toContainText('Travel to Briar March to secure the hall.');await capture.scrollIntoViewIfNeeded();
  const bounds=await capture.boundingBox();expect(bounds).toBeTruthy();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);expect(bounds!.width).toBeGreaterThan(0);
 }finally{await context.close();}
});
