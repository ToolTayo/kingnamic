import {test,expect} from '@playwright/test';
test('production World Conquest remains available offline without mutating the saved campaign',async({page,context})=>{
 await page.goto('/');await page.locator('#start').click();await page.locator('#pause').click();await page.locator('#save').click();await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const before=await page.evaluate(()=>localStorage.getItem('kingnamic.save.v2'));await context.setOffline(true);await page.reload();await page.locator('#start').click();await page.locator('#tab-territories').click();
 await expect(page.locator('.conquest-index button')).toHaveCount(5);for(const name of ['Mossgate','Tallowmere','Stonewake','Alderwatch','Redwater'])await expect(page.locator('.conquest-index')).toContainText(name);
 await page.locator('.conquest-index [data-conquest-route="stonewake"]').click();await expect(page.locator('.conquest-route')).toContainText('Southern road');await page.locator('#save').click();expect(await page.evaluate(()=>localStorage.getItem('kingnamic.save.v2'))).toBe(before);
 await page.reload();await page.locator('#start').click();await page.locator('#tab-territories').click();await expect(page.locator('#conquest-stonewake')).toContainText('Uncharted');await expect(page.locator('.conquest-route')).toHaveCount(0);await context.setOffline(false);
});
