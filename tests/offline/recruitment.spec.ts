import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { addResidents, assignResidentJobs } from '../../src/game/population';
import { makeBuilding, newGame } from '../../src/game/state';

test('production UI recruits to 200 and reloads the exact army while offline', async ({ page, context }) => {
  test.setTimeout(300_000);
  const s = newGame();
  s.speed = 0;
  s.resources.stone = 9_000;
  s.resources.food = 9_000;
  for (let i = 0; i < 3; i++) {
    const barracks = makeBuilding(s, 'barracks', i, 0, true);
    barracks.level = 3;
  }
  addResidents(s, 330);
  assignResidentJobs(s);
  await page.addInitScript(raw => { if (!localStorage.getItem('kingnamic.save.v2')) localStorage.setItem('kingnamic.save.v2', raw); }, JSON.stringify(s));

  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#start')).toHaveText(/Resume kingdom/);
  await page.locator('#start').click();
  await page.locator('#tab-army').click();
  await page.locator('#army-recruit').click();
  for (const count of [1, 5, 10, 50]) await page.locator(`#recruit-warden${count === 1 ? '' : `-${count}`}`).click();
  const started = Date.now();
  await page.locator('#recruit-warden-100').click();
  const hundredBatchMs = Date.now() - started;
  console.info(`Production offline-build Recruit 100 click completed in ${hundredBatchMs} ms.`);
  expect(hundredBatchMs).toBeLessThan(5_000);
  await expect(page.locator('#recruit-warden-max')).toContainText('31');
  await page.locator('#recruit-warden-max').click();
  await expect(page.locator('.army-status')).toContainText('200 / 200 local soldiers');

  await page.locator('#save').click();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const before = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('kingnamic.save.v2')!);
    const soldiers = s.units.filter((u: any) => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind));
    return { population: s.population, residents: s.residents.length, soldiers: soldiers.length, crowns: s.resources.stone, census: s.population + soldiers.length, jobs: Object.values(s.jobs) as number[] };
  });
  expect(before.soldiers).toBe(200);
  expect(before.census).toBe(351);
  expect(before.jobs.every(n => n >= 0)).toBe(true);

  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('#start')).toHaveText(/Resume kingdom/, { timeout: 30_000 });
    await page.locator('#start').click();
    await page.locator('#tab-army').click();
    await expect(page.locator('.army-status')).toContainText('200 / 200 local soldiers');
    const after = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('kingnamic.save.v2')!);
      const soldiers = s.units.filter((u: any) => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind));
      return { population: s.population, residents: s.residents.length, soldiers: soldiers.length, crowns: s.resources.stone, census: s.population + soldiers.length, jobs: Object.values(s.jobs) as number[] };
    });
    expect(after).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});

test('a legacy census save resumes, recruits safely, and remains valid after offline reload', async ({ page, context }) => {
  test.setTimeout(300_000);
  const legacy = readFileSync(new URL('../fixtures/milestone-v2.json', import.meta.url), 'utf8');
  const original = JSON.parse(legacy);
  original.speed = 0;
  const legacySoldiers = original.units.filter((u: any) => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind)).length;
  await page.addInitScript(raw => { if (!localStorage.getItem('kingnamic.save.v2')) localStorage.setItem('kingnamic.save.v2', raw); }, JSON.stringify(original));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#start')).toHaveText(/Resume kingdom/);
  await page.locator('#start').click();
  await page.locator('#tab-army').click();
  await expect(page.locator('.army-status')).toContainText(`${legacySoldiers} /`);
  await page.locator('#army-recruit').click();
  await page.locator('#recruit-warden').click();
  await page.locator('#save').click();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  const recruited = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('kingnamic.save.v2')!);
    return { population: s.population, residents: s.residents.length, soldiers: s.units.filter((u: any) => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind)).length };
  });
  expect(recruited).toEqual({ population: original.population - 1, residents: original.population - 1, soldiers: legacySoldiers + 1 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.locator('#start')).toHaveText(/Resume kingdom/, { timeout: 30_000 });
    await page.locator('#start').click();
    await page.locator('#tab-army').click();
    await expect(page.locator('.army-status')).toContainText(`${legacySoldiers + 1} /`);
    const after = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('kingnamic.save.v2')!);
      return { population: s.population, residents: s.residents.length, soldiers: s.units.filter((u: any) => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind)).length };
    });
    expect(after).toEqual(recruited);
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
