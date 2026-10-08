import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

const read=(page:any)=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));
const click=(page:any,selector:string)=>page.locator(selector).click();

test('a selected company travels from Heartmere into Briar March and survives reload',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await click(page,'#start');await click(page,'#pause');
 const starting=await read(page),company=starting.units.filter((u:any)=>['warden','ranger','spearman','scout'].includes(u.kind)).slice(0,2).map((u:any)=>u.id);
 expect(company).toHaveLength(2);
 await click(page,'#tab-army');await click(page,'#army-orders');await click(page,'#select-none');await click(page,'#army-roster');
 for(const id of company)await click(page,'#unit-'+id);
 await click(page,'#tab-empire');await click(page,'#appoint-commander');
 expect((await read(page)).commander.id).toBe(company[0]);
 await click(page,'#gather-road');await click(page,'#speed-2');
 await expect(page.locator('#travel-region')).toBeEnabled({timeout:30000});
 const gathered=await read(page);expect(gathered.speed).toBe(2);expect(gathered.units.filter((u:any)=>company.includes(u.id)).every((u:any)=>u.muster&&Math.hypot(u.x-14,u.y-24)<2)).toBe(true);
 await page.screenshot({path:'docs/evidence/empire-road-gathered.png'});await click(page,'#travel-region');
 let state=await read(page);expect(state.region).toBe('march');expect(state.speed).toBe(0);expect(state.units.filter((u:any)=>company.includes(u.id))).toHaveLength(2);expect(state.empire.reserve.units.filter((u:any)=>!company.includes(u.id))).toHaveLength(1);
 await click(page,'#save');expect(await page.locator('#save-status').textContent()).not.toContain('unavailable');await page.reload();await click(page,'#start');state=await read(page);
 expect(state.region).toBe('march');expect(state.units.filter((u:any)=>company.includes(u.id))).toHaveLength(2);expect(errors).toEqual([]);
 await page.screenshot({path:'docs/evidence/empire-road-arrival.png'});
 await writeFile('docs/evidence/empire-travel-browser.json',JSON.stringify({freshSave:true,fixture:false,company,commander:state.commander,region:state.region,travellers:state.units.filter((u:any)=>company.includes(u.id)).length,unselectedAtHome:state.empire.reserve.units.length,errors},null,2));
});
