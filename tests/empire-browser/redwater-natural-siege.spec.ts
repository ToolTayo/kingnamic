import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {newGame,army,makeBuilding} from '../../src/game/state';
import {addResidents} from '../../src/game/population';
import {command} from '../../src/game/commands';
import {REDWATER_CAMPS} from '../../src/game/empire';
import {decode} from '../../src/game/persistence';
import {MAX_ARMY,MAX_UNITS} from '../../src/game/config';
import type {SoldierKind} from '../../src/game/types';

const read=(page:Page)=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
const waitRegion=(page:Page,region:'march'|'heartmere')=>expect.poll(async()=>{const s=await read(page);return s.region??'heartmere';},{timeout:90000,intervals:[100,250,500]}).toBe(region);
async function issue(page:Page,ids:number[],order:'move'|'attack'|'defend',x:number,y:number,focus?:number){
 const result=await page.evaluate(({ids,order,x,y,focus})=>{const rt=(window as any).__KINGNAMIC__.runtime;rt.selectUnits(ids);return rt['issueOrder'](order,{x,y},focus);},{ids,order,x,y,focus});
 if(!result.ok&&order==='attack'&&focus!==undefined&&result.message==='Choose a living enemy or hostile stronghold structure.'){
  const alive=await page.evaluate(({focus})=>{const rt=(window as any).__KINGNAMIC__.runtime;return rt.world.units.some((u:any)=>u.id===focus&&u.hp>0)||rt.world.buildings.some((b:any)=>b.id===focus&&b.owner==='rival'&&b.hp>0);},{focus});
  if(!alive)return{ok:true,message:'The focused target fell before the order resolved.'};
 }
 return result;
}
async function livingCompany(page:Page,ids:number[]){
 return page.evaluate((ids:number[])=>{const s=(window as any).__KINGNAMIC__.runtime.world;return ids.filter(id=>{const u=s.units.find((v:any)=>v.id===id);return !!u&&u.hp>0&&!u.injury&&!s.infection?.some((i:any)=>i.personId===id);});},ids);
}
const atCamp=(u:any,c:{x:number;y:number})=>Math.hypot((u.anchor??u).x-c.x,(u.anchor??u).y-c.y)<3.2;

test('a naturally recruited company clears Redwater camps, defeats its warned reserves, captures and revisits the keep',async({page})=>{
 test.setTimeout(900000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const s=newGame(905211);s.speed=0;s.resources={wood:2200,stone:5200,food:10100,herbs:160};
 const originalIds=new Set(army(s).map(u=>u.id));
 const barracks=s.buildings.find(b=>b.kind==='barracks')!;barracks.level=3;
 makeBuilding(s,'barracks',19,10,true).level=3;makeBuilding(s,'barracks',21,10,true).level=3;
 for(const [x,y]of [[23,9],[25,9],[27,9]])makeBuilding(s,'farm',x,y,true);
 s.jobs.farmers=20;addResidents(s,210);
 const recruitment:[SoldierKind,number][]=[['warden',60],['spearman',60],['ranger',50],['scout',27]];
 for(const [kind,count]of recruitment){const r=command(s,{type:'recruit',kind,count});expect(r.ok,'Legal '+kind+' recruitment must complete: '+r.message).toBe(true);}
 const force=army(s),company=force.filter(u=>!originalIds.has(u.id)),companyIds=company.map(u=>u.id);
 const commander=force.find(u=>u.id===s.commander?.id)??force.find(u=>u.kind==='warden')!;
 expect(company).toHaveLength(MAX_ARMY-3);expect(force).toHaveLength(MAX_ARMY);
 expect(command(s,{type:'commander-appoint',id:commander.id}).ok).toBe(true);
 for(const u of force)Object.assign(u,{x:14,y:24,target:{x:14,y:24},anchor:{x:14,y:24},path:[],order:'hold'});
 for(const [i,u]of force.filter(u=>originalIds.has(u.id)&&u.id!==commander.id).entries()){
  const p={x:i===0?13:15,y:17};Object.assign(u,p,{target:{...p},anchor:{x:14,y:17},path:[],order:'defend'});
 }
 const companyTravel=[...companyIds,commander.id],prepared=decode(JSON.stringify(s));
 expect(prepared,'Recruitment and saved identities must validate before travel.').toBeTruthy();
 await page.goto('/');await page.evaluate(raw=>localStorage.setItem('kingnamic.save.v2',raw),JSON.stringify(s));await page.reload();await page.locator('#start').click();
 await page.evaluate(()=>{const root=window as any;root.__redwaterSiegeMetrics={warnings:[],calls:[],seen:[],last:120};root.__redwaterSiegeTimer=window.setInterval(()=>{const war=root.__KINGNAMIC__?.runtime?.world?.march?.redwater,m=root.__redwaterSiegeMetrics;if(!war||!m)return;if(war.warning>0&&!m.seen.includes(war.reserve)){m.seen.push(war.reserve);m.warnings.push({reserve:war.reserve,remainingWarning:war.warning});}if(war.reserve<m.last){m.calls.push({remaining:war.reserve,deployed:m.last-war.reserve});m.last=war.reserve;}},100);});
 await page.locator('#tab-army').click();await page.evaluate((ids:number[])=>(window as any).__KINGNAMIC__.runtime.selectUnits(ids),companyIds);await page.locator('#tab-empire').click();
 await page.locator('#gather-road').click();await page.locator('#speed-2').click();await expect(page.locator('#travel-region')).toBeEnabled({timeout:90000});await page.locator('#travel-region').click();await waitRegion(page,'march');
 const homeGuards=[...originalIds].filter(id=>id!==commander.id);let state=await read(page);
 expect(state.units.filter((u:any)=>companyTravel.includes(u.id))).toHaveLength(198);
 expect(state.empire.reserve.units.filter((u:any)=>homeGuards.includes(u.id)&&u.hp>0&&u.order==='defend')).toHaveLength(2);
 // Keep the company at a safe west-heath staging point while the commander
 // scouts Redwater; otherwise a full 200-person formation can breach its
 // central gates before the test reaches the deliberate gate-order step.
 const march=await issue(page,companyIds,'move',29,29);expect(march.ok,march.message).toBe(true);
 const hero=await issue(page,[commander.id],'move',35,14);expect(hero.ok,hero.message).toBe(true);
 if(state.speed===0)await page.locator('#speed-2').click();
 await expect.poll(async()=>{const v=await read(page);return v.march.seen.includes('redwater-cairn')&&v.march.rumors.includes('redwater')&&v.march.redwater.status==='occupied';},{timeout:180000,intervals:[500,1000]}).toBe(true);
 state=await read(page);expect(state.march.redwater.remaining+state.march.redwater.casualties).toBe(160);
 expect(state.march.redwater.reserve).toBe(120);expect(state.units.filter((u:any)=>u.faction==='rival'&&u.rivalId==='redwater')).toHaveLength(state.march.redwater.remaining-state.march.redwater.reserve);
 await page.locator('#pause').click();await page.locator('#tab-empire').click();await expect(page.locator('#panel')).toContainText('REDWATER REACH');
 await page.screenshot({path:'docs/evidence/redwater-discovery.png'});

 const camps=REDWATER_CAMPS.map(camp=>({name:camp.name,point:{x:camp.x,y:camp.y}}));
 const reserveCalls:{remaining:number;deployed:number}[]=[],reserveWarnings:{reserve:number;remainingWarning:number}[]=[],seenWarnings=new Set<number>();let reserveBefore=120,maxActiveRivals=40,maxBattleUnits=state.units.length;
 let lastReport=Date.now()+15000,started=Date.now(),targetId:number|undefined;
 await page.locator('#speed-2').click();
 for(let index=0;index<camps.length;index++){
  const camp=camps[index];
  const approach=await issue(page,companyIds,'move',camp.point.x,camp.point.y);expect(approach.ok,approach.message).toBe(true);
  const stageStart=Date.now();
  while(Date.now()-stageStart<240000){
   state=await read(page);const war=state.march.redwater;if(war.warning>0&&!seenWarnings.has(war.reserve)){seenWarnings.add(war.reserve);reserveWarnings.push({reserve:war.reserve,remainingWarning:war.warning});}if(war.reserve<reserveBefore){reserveCalls.push({remaining:war.reserve,deployed:reserveBefore-war.reserve});reserveBefore=war.reserve;}const allRivals=state.units.filter((u:any)=>u.faction==='rival'&&u.rivalId==='redwater'&&u.hp>0);maxActiveRivals=Math.max(maxActiveRivals,allRivals.length);maxBattleUnits=Math.max(maxBattleUnits,state.units.length);const guards=allRivals.filter((u:any)=>atCamp(u,camp.point));
   if(!guards.length)break;
   const target=[...guards].sort((a:any,b:any)=>Math.hypot(a.x-camp.point.x,a.y-camp.point.y)-Math.hypot(b.x-camp.point.x,b.y-camp.point.y))[0];
   const ready=await livingCompany(page,companyIds);expect(ready.length,'The expedition must retain soldiers to continue.').toBeGreaterThan(0);
   if(target.id!==targetId){const order=await issue(page,ready,'attack',target.x,target.y,target.id);expect(order.ok,order.message).toBe(true);targetId=target.id;}
   if(Date.now()>=lastReport){console.log('Redwater campaign',JSON.stringify({stage:camp.name,elapsedMs:Date.now()-started,campsCleared:state.march.redwater.campsCleared,remaining:state.march.redwater.remaining,reserve:state.march.redwater.reserve,active:state.units.filter((u:any)=>u.faction==='rival'&&u.rivalId==='redwater'&&u.hp>0).length,party:ready.length,commander:state.units.find((u:any)=>u.id===commander.id)}));lastReport=Date.now()+15000;}
   await page.waitForTimeout(350);
  }
  state=await read(page);
  expect(state.march.redwater.campsCleared,'Outer camp '+camp.name+' must clear after its real defenders fall.').toBeGreaterThanOrEqual(index+1);
  targetId=undefined;
  if(index===2){await page.locator('#pause').click();await page.screenshot({path:'docs/evidence/redwater-camps-cleared.png'});await page.locator('#speed-2').click();}
 }

 state=await read(page);
 const westGate=state.buildings.find((b:any)=>b.name==='West Heath Gate')!,eastGate=state.buildings.find((b:any)=>b.name==='East Ravine Gate')!;
 expect(westGate&&eastGate).toBeTruthy();
 let order=await issue(page,companyIds.filter((id:number)=>state.units.find((u:any)=>u.id===id)?.kind!=='ranger'&&state.units.find((u:any)=>u.id===id)?.kind!=='scout'),'attack',westGate.x,westGate.y,westGate.id);
 expect(order.ok,order.message).toBe(true);
 order=await issue(page,companyIds.filter((id:number)=>state.units.find((u:any)=>u.id===id)?.kind==='ranger'||state.units.find((u:any)=>u.id===id)?.kind==='scout'),'attack',eastGate.x,eastGate.y,eastGate.id);
 expect(order.ok,order.message).toBe(true);
 await page.locator('#speed-2').click();
 await expect.poll(async()=>{const v=await read(page);return v.buildings.filter((b:any)=>b.id===westGate.id||b.id===eastGate.id).every((b:any)=>b.hp<=0);},{timeout:180000,intervals:[500,1000]}).toBe(true);

 let targetId2:number|undefined,loopStart=Date.now(),lastSnapshot=Date.now()+15000;
 while(Date.now()-loopStart<540000){
  state=await read(page);const war=state.march.redwater,active=state.units.filter((u:any)=>u.faction==='rival'&&u.rivalId==='redwater'&&u.hp>0);maxActiveRivals=Math.max(maxActiveRivals,active.length);maxBattleUnits=Math.max(maxBattleUnits,state.units.length);if(war.warning>0&&!seenWarnings.has(war.reserve)){seenWarnings.add(war.reserve);reserveWarnings.push({reserve:war.reserve,remainingWarning:war.warning});}if(war.reserve<reserveBefore){reserveCalls.push({remaining:war.reserve,deployed:reserveBefore-war.reserve});reserveBefore=war.reserve;}
  if(war.remaining===0&&war.reserve===0&&!active.length)break;
  const ready=await livingCompany(page,companyIds);expect(ready.length,'Redwater must remain a winnable expedition.').toBeGreaterThan(0);
  if(active.length){
   const heroNow=state.units.find((u:any)=>u.id===commander.id),target=[...active].sort((a:any,b:any)=>Math.hypot(a.x-(heroNow?.x??36),a.y-(heroNow?.y??21))-Math.hypot(b.x-(heroNow?.x??36),b.y-(heroNow?.y??21)))[0];
   if(target.id!==targetId2){const attack=await issue(page,ready,'attack',target.x,target.y,target.id);expect(attack.ok,attack.message).toBe(true);targetId2=target.id;}
  }
  if(Date.now()>=lastSnapshot){console.log('Redwater keep siege',JSON.stringify({elapsedMs:Date.now()-loopStart,remaining:war.remaining,reserve:war.reserve,casualties:war.casualties,warning:war.warning,active:active.length,party:ready.length,nearbyInfected:state.units.filter((u:any)=>['hollow','runner','brute'].includes(u.kind)&&u.hp>0&&Math.hypot(u.x-36,u.y-21)<7).length}));lastSnapshot=Date.now()+15000;}
  await page.waitForTimeout(400);
 }
 state=await read(page);
 expect(state.march.redwater.remaining).toBe(0);expect(state.march.redwater.reserve).toBe(0);
 expect(state.march.redwater.casualties).toBe(160);expect(state.march.redwater.campsCleared).toBe(3);
 const sampled=await page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__redwaterSiegeMetrics))),warningsByReserve=new Map<number,{reserve:number;remainingWarning:number}>(reserveWarnings.map(w=>[w.reserve,w]));for(const w of sampled.warnings)warningsByReserve.set(w.reserve,w);
 const callsByRemaining=new Map<number,{remaining:number;deployed:number}>(reserveCalls.map(w=>[w.remaining,w]));for(const w of sampled.calls)callsByRemaining.set(w.remaining,w);
 const allWarnings=[...warningsByReserve.values()],allCalls=[...callsByRemaining.values()];console.log('Redwater reserve telemetry',JSON.stringify({allWarnings,allCalls}));
 expect(allWarnings).toHaveLength(10);expect(allWarnings.every(warning=>warning.remainingWarning>0&&warning.remainingWarning<=8)).toBe(true);
 expect(allCalls).toHaveLength(10);expect(allCalls.every(call=>call.deployed===12)).toBe(true);
 expect(maxActiveRivals).toBeLessThanOrEqual(40);expect(maxBattleUnits).toBeLessThanOrEqual(MAX_UNITS);
 expect(state.units.some((u:any)=>u.faction==='rival'&&u.rivalId==='redwater'&&u.hp>0)).toBe(false);
 const infectedCleared:number[]=[],cleanupStarted=Date.now();
 while(Date.now()-cleanupStarted<180000){
  state=await read(page);const zombie=state.units.find((u:any)=>['hollow','runner','brute'].includes(u.kind)&&u.hp>0&&Math.hypot(u.x-36,u.y-21)<7),tainted=state.corpses?.some((c:any)=>c.tainted&&Math.hypot(c.x-36,c.y-21)<7);
  if(zombie){const ready=await livingCompany(page,companyIds);const r=await issue(page,ready,'attack',zombie.x,zombie.y,zombie.id);expect(r.ok,r.message).toBe(true);infectedCleared.push(zombie.id);await expect.poll(async()=>{const v=await read(page);return !v.units.some((u:any)=>u.id===zombie.id&&u.hp>0);},{timeout:60000}).toBe(true);continue;}
  if(!tainted)break;
  await page.waitForTimeout(350);
 }
 state=await read(page);expect(state.units.some((u:any)=>['hollow','runner','brute'].includes(u.kind)&&u.hp>0&&Math.hypot(u.x-36,u.y-21)<7)).toBe(false);expect(state.corpses?.some((c:any)=>c.tainted&&Math.hypot(c.x-36,c.y-21)<7)).toBe(false);
 let activeCommanderId=commander.id;state=await read(page);
 if(!state.units.some((u:any)=>u.id===activeCommanderId&&u.hp>0)){
  // The original commander may fall in a natural siege. Appoint a fit survivor
  // through the existing Army and Empire controls; casualties stay untouched.
  await page.locator('#tab-army').click();await page.locator('#select-none').click();await page.locator('#tab-empire').click();
  await expect(page.locator('#appoint-commander')).toBeEnabled();await page.locator('#appoint-commander').click();
  await expect.poll(async()=>{const v=await read(page);return v.units.some((u:any)=>u.id===v.commander?.id&&u.hp>0);}).toBe(true);
  state=await read(page);activeCommanderId=state.commander.id;
  console.log('Redwater replacement commander appointed',JSON.stringify({id:activeCommanderId,originalCommanderAlive:false,casualties:state.stats.lost}));
 }
 const commanderMove=await issue(page,[activeCommanderId],'move',36,21);expect(commanderMove.ok,commanderMove.message).toBe(true);
 try{await expect.poll(async()=>{const v=await read(page),heroNow=v.units.find((u:any)=>u.id===activeCommanderId);return !!heroNow&&Math.hypot(heroNow.x-36,heroNow.y-21)<6;},{timeout:60000}).toBe(true);}catch(error){const diagnostic=await page.evaluate((id:number)=>{const rt=(window as any).__KINGNAMIC__?.runtime,w=rt?.world,h=w?.units?.find((u:any)=>u.id===id);return{time:w?.time,speed:w?.speed,hero:h&&{x:h.x,y:h.y,hp:h.hp,injury:h.injury,order:h.order,target:h.target,path:h.path?.slice(0,4),repath:h.repath},redwater:w?.march?.redwater,gates:w?.buildings?.filter((b:any)=>b.rivalId==='redwater'&&b.kind==='gate').map((b:any)=>({id:b.id,name:b.name,x:b.x,y:b.y,hp:b.hp})),infected:w?.units?.filter((u:any)=>['hollow','runner','brute'].includes(u.kind)&&u.hp>0).map((u:any)=>({id:u.id,x:u.x,y:u.y,hp:u.hp})),logs:rt?.state?.logs?.slice(0,8)};},activeCommanderId);console.error('Redwater commander path diagnostic',JSON.stringify(diagnostic));throw error;}
 await page.locator('#pause').click();await page.locator('#tab-empire').click();
 const captureBlock=await page.evaluate(async()=>{const rt=(window as any).__KINGNAMIC__.runtime,{strongholdCaptureError}=await import('/src/game/empire.ts' as string);return strongholdCaptureError(rt.world,'redwater');});
 console.log('Redwater capture blocker',captureBlock);
 expect(captureBlock).toBeNull();
 await expect(page.locator('#capture-redwater')).toBeEnabled({timeout:30000});
 state=await read(page);const timberBefore=state.resources.wood,crownsBefore=state.resources.stone;
 await page.screenshot({path:'docs/evidence/redwater-before-capture.png'});
 await page.locator('#capture-redwater').click();state=await read(page);
 expect(state.march.redwater.status).toBe('captured');expect(state.buildings.find((b:any)=>b.name==='Redwater Hall')?.owner).toBe('player');
 expect(state.population).toBe(8);expect(state.resources.wood-timberBefore).toBe(70);expect(state.resources.stone-crownsBefore).toBe(40);
 const repeat=await page.evaluate(()=>{const rt=(window as any).__KINGNAMIC__.runtime,before={...rt.state.resources},population=rt.state.population,result=rt.act({type:'stronghold-capture',id:'redwater'});return{result,before,after:{...rt.state.resources},population,afterPopulation:rt.state.population};});
 expect(repeat.result.ok).toBe(false);expect(repeat.after).toEqual(repeat.before);expect(repeat.afterPopulation).toBe(repeat.population);
 const hall=state.buildings.find((b:any)=>b.name==='Redwater Hall')!;expect(hall.hp).toBeLessThan(hall.maxHp);
 const repaired=await page.evaluate((id:number)=>(window as any).__KINGNAMIC__.runtime.act({type:'repair',id}),hall.id);expect(repaired.ok,repaired.message).toBe(true);
 state=await read(page);expect(state.buildings.find((b:any)=>b.id===hall.id)!.hp).toBe(hall.maxHp);
 const site=await page.evaluate(async()=>{const {buildError}=await import('/src/game/commands.ts' as string),s=(window as any).__KINGNAMIC__.runtime.world,h=s.buildings.find((b:any)=>b.name==='Redwater Hall'),places:any[]=[];for(let r=1;r<=10;r++)for(let y=h.y-r;y<=h.y+r;y++)for(let x=h.x-r;x<=h.x+r;x++)if(Math.max(Math.abs(x-h.x),Math.abs(y-h.y))===r&&!buildError(s,'cottage',x,y))places.push({x,y});return places[0]??null;});
 expect(site).toBeTruthy();const built=await page.evaluate((p:any)=>(window as any).__KINGNAMIC__.runtime.act({type:'build',kind:'cottage',...p}),site);expect(built.ok,built.message).toBe(true);
 state=await read(page);const stationed=(await livingCompany(page,companyIds)).filter(id=>id!==activeCommanderId).slice(0,12);expect(stationed.length).toBeGreaterThan(0);
 await page.locator('#speed-2').click();
 const garrison=await issue(page,stationed,'defend',36,21);expect(garrison.ok,garrison.message).toBe(true);
 const stationedIds=stationed;
 await expect.poll(async()=>{const v=await read(page);return stationedIds.every(id=>{const u=v.units.find((unit:any)=>unit.id===id);return u?.order==='defend'&&Math.hypot(u.x-36,u.y-21)<5.5;});},{timeout:120000,intervals:[500,1000]}).toBe(true);
 await page.locator('#save').click();await expect(page.locator('#save-status')).toHaveText('Saved on this device');await page.reload();await page.locator('#start').click();state=await read(page);
 expect(state.march.redwater.status).toBe('captured');expect(state.buildings.find((b:any)=>b.id===hall.id)?.hp).toBe(state.buildings.find((b:any)=>b.id===hall.id)?.maxHp);
 expect(state.buildings.some((b:any)=>b.x===site.x&&b.y===site.y)).toBe(true);
 expect(state.units.filter((u:any)=>stationedIds.includes(u.id)&&u.hp>0)).toHaveLength(stationedIds.length);
 expect(state.units.filter((u:any)=>stationedIds.includes(u.id)).every((u:any)=>u.order==='defend'&&Math.hypot(u.x-36,u.y-21)<5.5)).toBe(true);
 await page.screenshot({path:'docs/evidence/redwater-occupation.png'});

 const survivors=await livingCompany(page,companyIds),fit=[activeCommanderId,...survivors.filter(id=>id!==activeCommanderId&& !stationedIds.includes(id))],returnParty=fit.slice(0,8);
 await page.locator('#tab-army').click();await page.evaluate((ids:number[])=>(window as any).__KINGNAMIC__.runtime.selectUnits(ids.filter(id=>id!==(window as any).__KINGNAMIC__.runtime.state.commander?.id)),returnParty);
 await page.locator('#tab-empire').click();await page.locator('#gather-road').click();await page.locator('#speed-2').click();
 await expect(page.locator('#travel-region')).toBeEnabled({timeout:90000});await page.locator('#travel-region').click();await waitRegion(page,'heartmere');
 state=await read(page);expect(state.empire.reserve.march.redwater.status).toBe('captured');
 const parkedMarch=state.empire.reserve,parkedGarrisonAlive=stationedIds.filter((id:number)=>parkedMarch.units.some((u:any)=>u.id===id&&u.hp>0)),parkedGarrisonDead=stationedIds.filter((id:number)=>parkedMarch.fallenIds?.includes(id));
 expect(parkedGarrisonAlive.length+parkedGarrisonDead.length).toBe(stationedIds.length);
 expect(stationedIds.every((id:number)=>(parkedGarrisonAlive.includes(id))!==(parkedGarrisonDead.includes(id)))).toBe(true);
 expect(new Set(parkedMarch.fallenIds??[]).size).toBe((parkedMarch.fallenIds??[]).length);
 const stationedSurvivorIds=parkedGarrisonAlive;
 await page.locator('#save').click();await page.reload();await page.locator('#start').click();state=await read(page);
 expect(state.region).toBeUndefined();expect(state.empire.reserve.march.redwater.status).toBe('captured');
 expect(state.empire.reserve.units.filter((u:any)=>stationedSurvivorIds.includes(u.id)&&u.hp>0).map((u:any)=>u.id).sort((a:number,b:number)=>a-b)).toEqual([...stationedSurvivorIds].sort((a:number,b:number)=>a-b));
 expect(stationedIds.filter((id:number)=>state.empire.reserve.fallenIds?.includes(id))).toEqual(parkedGarrisonDead);
 const returning=state.units.filter((u:any)=>returnParty.includes(u.id)&&u.hp>0).map((u:any)=>u.id);expect(returning).toContain(activeCommanderId);
 await page.locator('#tab-army').click();await page.evaluate((ids:number[])=>(window as any).__KINGNAMIC__.runtime.selectUnits(ids.filter(id=>id!==(window as any).__KINGNAMIC__.runtime.state.commander?.id)),returning);
 await page.locator('#tab-empire').click();await page.locator('#gather-road').click();await page.locator('#speed-2').click();
 await expect(page.locator('#travel-region')).toBeEnabled({timeout:90000});await page.locator('#travel-region').click();await waitRegion(page,'march');
 state=await read(page);expect(state.march.redwater.status).toBe('captured');expect(state.march.redwater.campsCleared).toBe(3);
 expect(state.buildings.find((b:any)=>b.id===hall.id)?.hp).toBe(state.buildings.find((b:any)=>b.id===hall.id)?.maxHp);
 expect(state.buildings.some((b:any)=>b.x===site.x&&b.y===site.y)).toBe(true);
 expect(state.units.filter((u:any)=>stationedSurvivorIds.includes(u.id)&&u.hp>0).map((u:any)=>u.id).sort((a:number,b:number)=>a-b)).toEqual([...stationedSurvivorIds].sort((a:number,b:number)=>a-b));
 expect(stationedIds.filter((id:number)=>state.fallenIds?.includes(id))).toEqual(parkedGarrisonDead);
 expect(state.units.filter((u:any)=>stationedSurvivorIds.includes(u.id)).every((u:any)=>u.order==='defend'&&Math.hypot(u.x-36,u.y-21)<5.5)).toBe(true);
 expect(decode(JSON.stringify(state))).not.toBeNull();expect(errors).toEqual([]);
 await writeFile('docs/evidence/redwater-campaign.json',JSON.stringify({seed:905211,faction:'The Redwater Watch',stronghold:'Redwater Reach',defenders:{total:160,initialGarrison:40,finiteReserve:120,casualties:state.march.redwater.casualties,remaining:state.march.redwater.remaining},outerCamps:{cleared:state.march.redwater.campsCleared,names:camps.map(c=>c.name)},reserveWarnings,reserveCalls,maxActiveRivals,maxBattleUnits,players:{armyCap:MAX_ARMY,arrived:198,partyCasualties:state.stats.lost,infectedSlain:state.stats.slain,infectedCleanupKills:infectedCleared.length,infectedSoldiers:state.infection.filter((i:any)=>state.units.some((u:any)=>u.id===i.personId&&u.faction!=='rival')).length,stationed:stationedIds.length},capture:{status:state.march.redwater.status,settlement:'Redwater Hall',repaired:true,extraBuilding:{kind:'cottage',...site},travelAwayAndBack:true},browserErrors:errors},null,2));
 await page.locator('#pause').click();await page.screenshot({path:'docs/evidence/redwater-revisited.png'});
});
