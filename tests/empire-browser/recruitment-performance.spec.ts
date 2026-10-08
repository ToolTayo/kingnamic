import {test,expect} from '@playwright/test';
import {addResidents,assignResidentJobs} from '../../src/game/population';
import {makeBuilding,newGame} from '../../src/game/state';

test('profiles Recruit 100 command, panel render, and browser click separately',async({page})=>{
 test.setTimeout(180000);
 const s=newGame();s.speed=0;s.resources.stone=9_000;s.resources.food=9_000;
 for(let i=0;i<3;i++){const barracks=makeBuilding(s,'barracks',i,0,true);barracks.level=3;}
 addResidents(s,330);assignResidentJobs(s);
 await page.addInitScript(raw=>{if(!localStorage.getItem('kingnamic.save.v2'))localStorage.setItem('kingnamic.save.v2',raw);},JSON.stringify(s));
 await page.goto('/');await page.locator('#start').click();await page.locator('#tab-army').click();await page.locator('#army-recruit').click();
 for(const count of [1,5,10,50])await page.locator(`#recruit-warden${count===1?'':`-${count}`}`).click();
 await page.evaluate(()=>{
  const rt=(window as any).__KINGNAMIC__.runtime,act=rt.act.bind(rt),render=rt.onChange;
  rt.act=(command:any)=>{
   if(command.type!=='recruit'||command.count!==100)return act(command);
   rt.onChange=()=>{};const started=performance.now();let result;
   try{result=act(command);}finally{rt.onChange=render;}
   const commandMs=performance.now()-started,renderStarted=performance.now();render();
   (window as any).__recruit100Profile={commandMs,renderMs:performance.now()-renderStarted};return result;
  };
 });
 const clickStarted=process.hrtime.bigint();await page.locator('#recruit-warden-100').click();
 const clickMs=Number(process.hrtime.bigint()-clickStarted)/1e6;
 const profile=await page.evaluate(()=>({profile:(window as any).__recruit100Profile,workerCount:(window as any).__KINGNAMIC__.runtime.world.units.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind)).length}));
 expect(profile.workerCount).toBe(169);
 expect(profile.profile).toBeTruthy();
 console.info(`Recruit 100 timing: command ${profile.profile.commandMs.toFixed(2)} ms; synchronous render ${profile.profile.renderMs.toFixed(2)} ms; Playwright click ${clickMs.toFixed(2)} ms; browser/action remainder ${Math.max(0,clickMs-profile.profile.commandMs-profile.profile.renderMs).toFixed(2)} ms.`);
});
