import {expect,type Page} from '@playwright/test';
// Earn the expedition equipment reserve with normal controls, no balance grant.
export async function fundExpedition(page:Page){
  const read=()=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
  let s=await read();if(s.resources.stone>=80)return;
  if(s.speed)await page.locator('#pause').click();
  if(!s.buildings.some((b:any)=>b.kind==='quarry')){
    await page.locator('#tab-build').click();await page.locator('#category-production').click();await page.locator('#build-quarry').click();
    const p=await page.evaluate(()=>(window as any).__KINGNAMIC__.scene.screenPoint({x:18,y:13}));
    await page.locator('#world canvas').click({position:p});
    if(await page.locator('#confirm-placement').isVisible())await page.locator('#confirm-placement').click();
  }
  await page.locator('#speed-2').click();await expect.poll(async()=>(await read()).buildings.find((b:any)=>b.kind==='quarry')?.progress,{timeout:20000}).toBe(1);
  await page.locator('#pause').click();await page.locator('#tab-people').click();s=await read();
  for(let n=s.jobs.miners;n<3;n++)await page.locator('#job-miners-plus').click();
  await page.locator('#speed-2').click();await expect.poll(async()=>(await read()).resources.stone,{timeout:65000}).toBeGreaterThanOrEqual(80);
  await page.locator('#pause').click();await page.locator('#tab-army').click();
}
