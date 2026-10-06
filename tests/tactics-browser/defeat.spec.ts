import { expect, test } from '@playwright/test';
import { command } from '../../src/game/commands';
import { expeditionParty, ROUTE } from '../../src/game/expedition';
import { makeUnit, newGame } from '../../src/game/state';

test('a trusted battalion awards no recruits after a real patrol wipe and the kingdom can rebuild its army', async ({page}) => {
  // Explicit terminal-state fixture: combat below causes the deaths. This is
  // a casualty regression, not a claim that a human played to this situation.
  const s=newGame();s.resources.stone=200;command(s,{type:'recruit',kind:'warden'}); command(s,{type:'recruit',kind:'ranger'}); command(s,{type:'expedition-launch'});
  const e = s.expedition!; e.discovered=true; e.shared=true; e.held=true; e.standard=true; e.stage='return'; e.wave=2; e.holdTime=12; e.supplies=4; e.medicine=1;
  e.world.units=expeditionParty(e); for(const u of [...e.world.units]){u.hp=1;u.cooldown=10;makeUnit(e.world,'brute',u.x-.3,u.y);}
  for(const kind of e.initialAllies){const u=makeUnit(e.world,kind,ROUTE.exit.x,ROUTE.exit.y-2);u.origin='battalion';}
  s.speed=0;
  await page.addInitScript(raw=>{if(!localStorage.getItem('kingnamic.save.v2'))localStorage.setItem('kingnamic.save.v2',raw);},JSON.stringify(s));
  await page.goto('/');await page.locator('#start').click();await page.locator('#speed-1').click();
  await expect(page.locator('#panel')).toContainText('The patrol was lost',{timeout:15000});
  const result=await page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
  expect(result.lostBattalions.report).toMatchObject({outcome:'defeat',returned:0,recruited:0,lost:3,stranded:4});
  expect(result.units).toHaveLength(2);expect(result.resources.wood).toBe(s.resources.wood);expect(result.resources.stone).toBe(s.resources.stone+80);
  await page.screenshot({path:'docs/evidence/tactics-defeat.png'});
  await page.reload();await page.locator('#start').click();await page.locator('#tab-army').click();await page.locator('#army-recruit').click();await page.locator('#recruit-warden').click();
  expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.state.units.length)).toBe(3);
  await page.locator('#save').click();await page.reload();await page.locator('#start').click();expect(await page.evaluate(()=>(window as any).__KINGNAMIC__.runtime.state.units.length)).toBe(3);
  await expect(page.locator('#save-status')).toHaveText(/Saved/);
});
