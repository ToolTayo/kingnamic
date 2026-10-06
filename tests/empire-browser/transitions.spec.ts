import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {newGame,army,makeUnit} from '../../src/game/state';
import {command} from '../../src/game/commands';
import {nearestOpen} from '../../src/game/navigation';
import {key} from '../../src/game/map';

test('repeated region swaps retain 200 soldier identities and release replaced terrain textures',async({page,context})=>{
 const s=newGame(),reserved=new Set(s.units.map(key));while(army(s).length<200){const p=nearestOpen(s,{x:14,y:12},reserved);reserved.add(key(p));makeUnit(s,'warden',p.x,p.y);}command(s,{type:'commander-appoint'});const hero=army(s)[0];Object.assign(hero,{x:14,y:24});command(s,{type:'travel',ids:[]});s.units=army(s);command(s,{type:'speed',speed:0});
 await page.addInitScript(raw=>{if(!localStorage.getItem('kingnamic.save.v2'))localStorage.setItem('kingnamic.save.v2',raw);},JSON.stringify(s));await page.goto('/');await page.locator('#start').click();await page.locator('#tab-empire').click();const cdp=await context.newCDPSession(page),heaps:number[]=[],transitions:any[]=[];
 await cdp.send('HeapProfiler.collectGarbage');heaps.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
 for(let n=0;n<8;n++){
  await page.evaluate(()=>{const a=(window as any).__KINGNAMIC__,sys=a.scene.sys,original=sys.sceneUpdate;let last=performance.now();(window as any).__transition={frameMaxMs:0,sceneMaxMs:0,saveMs:0};const r=(window as any).__transition;sys.sceneUpdate=function(time:number,dt:number){const now=performance.now();r.frameMaxMs=Math.max(r.frameMaxMs,now-last);last=now;const start=now;const result=original.call(this,time,dt);r.sceneMaxMs=Math.max(r.sceneMaxMs,performance.now()-start);return result;};(window as any).__restoreTransition=()=>{sys.sceneUpdate=original;};const rt=a.runtime,save=rt.persist;rt.persist=function(){const t=performance.now();const result=save.call(this);r.saveMs=Math.max(r.saveMs,performance.now()-t);return result;};(window as any).__restoreSave=()=>{rt.persist=save;};});
  const start=Date.now();await page.locator('#travel-region').click();await page.waitForTimeout(500);const sample=await page.evaluate(()=>{const a=(window as any).__KINGNAMIC__,s=a.runtime.state;(window as any).__restoreTransition();(window as any).__restoreSave();return {...(window as any).__transition,region:s.region??'home',soldiers:s.units.length+s.empire.reserve.units.length,terrainTextures:a.scene.textures.getTextureKeys().filter((k:string)=>k==='valley').length,ids:[...s.units,...s.empire.reserve.units].map((u:any)=>u.id),saveError:a.runtime.saveError};});expect(sample.soldiers).toBe(200);expect(new Set(sample.ids).size).toBe(200);expect(sample.terrainTextures).toBe(1);expect(sample.saveError).toBe(false);transitions.push({...sample,wallIncluding500msWait:Date.now()-start,ids:undefined});
  await cdp.send('HeapProfiler.collectGarbage');heaps.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
 }
 await writeFile('docs/evidence/empire-transitions.json',JSON.stringify({fixture:true,method:'Eight real Travel button presses with one commander and 199 held defenders, paused; replaced active terrain texture count, full scene callback and save cost; GC heap after each switch.',heaps,transitions},null,2));
});
