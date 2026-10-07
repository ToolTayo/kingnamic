import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#tab-army')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__KINGNAMIC__?.runtime))).toBe(true);
  if (await page.evaluate(() => (window as any).__KINGNAMIC__.runtime.state.speed !== 0)) await page.locator('#pause').click();
  await page.evaluate(() => {
    const s = (window as any).__KINGNAMIC__.runtime.state;
    const template = s.residents.find((r: any) => r.job === 'idle');
    for (let i = 0; i < 330; i++) s.residents.push({ ...template, id: s.nextId++, path: [], goal: { x: template.x, y: template.y } });
    s.population = s.residents.length;
    const barracks = s.buildings.find((b: any) => b.kind === 'barracks');
    for (let i = 0; i < 3; i++) s.buildings.push({ ...barracks, id: s.nextId++, x: i, y: 0, level: 3 });
    s.resources.stone = 9_000;
    s.resources.food = 9_000;
  });
  await page.locator('#tab-army').click();
  await page.locator('#army-recruit').click();
}

async function summary(page: Page) {
  return page.evaluate(() => {
    const s = (window as any).__KINGNAMIC__.runtime.state;
    const soldiers = s.units.filter((u: any) => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind));
    return {
      population: s.population,
      residents: s.residents.length,
      soldiers: soldiers.length,
      census: s.residents.length + soldiers.length,
      uniqueIds: new Set([...s.residents, ...s.units].map((p: any) => p.id)).size,
      crowns: s.resources.stone,
      jobs: Object.values(s.jobs) as number[],
    };
  });
}

test('recruit batches to 200, preserves census, and separates command cost from browser/UI time', async ({ page }) => {
  test.setTimeout(300_000);
  await prepare(page);
  for (const count of [1, 5, 10, 50, 100]) await expect(page.locator(`#recruit-warden${count === 1 ? '' : `-${count}`}`)).toBeVisible();
  await expect(page.locator('#recruit-warden-max')).toContainText('Max');
  await expect(page.locator('.recruit-reason').first()).toContainText('fit eligible');
  await expect(page.locator('.recruit-batch-cost').first()).toContainText('Crowns');

  for (const count of [1, 5, 10, 50]) await page.locator(`#recruit-warden${count === 1 ? '' : `-${count}`}`).click();

  const measurements = await page.evaluate(async () => {
    const { command } = await import('/src/game/commands.ts');
    const { armyPanel } = await import('/src/ui/armyPanel.ts');
    const rt = (window as any).__KINGNAMIC__.runtime;
    const clone = structuredClone(rt.state);
    const simulationStart = performance.now();
    const directResult = command(clone, { type: 'recruit', kind: 'warden', count: 100 });
    const simulationMs = performance.now() - simulationStart;
    const priorView = rt.armyView;
    rt.armyView = 'recruit';
    const panelStart = performance.now();
    armyPanel(rt);
    const panelHtmlMs = performance.now() - panelStart;
    rt.armyView = priorView;

    const profile = { actMs: 0, changeMs: 0 };
    const originalChange = rt.onChange;
    rt.onChange = () => {
      const started = performance.now();
      originalChange();
      profile.changeMs = performance.now() - started;
    };
    const originalAct = rt.act.bind(rt);
    rt.act = (c: any) => {
      const started = performance.now();
      const result = originalAct(c);
      profile.actMs = performance.now() - started;
      return result;
    };
    (window as any).__RECRUIT_PROFILE__ = { simulationMs, panelHtmlMs, directOk: directResult.ok, profile };
    return (window as any).__RECRUIT_PROFILE__;
  });
  expect(measurements.directOk).toBe(true);
  const browserStart = Date.now();
  await page.locator('#recruit-warden-100').click();
  const browserActionMs = Date.now() - browserStart;
  const afterHundred = await summary(page);
  const timing = await page.evaluate(() => (window as any).__RECRUIT_PROFILE__);
  console.info(`Recruit 100 profile: command-only=${timing.simulationMs.toFixed(2)}ms; panel HTML=${timing.panelHtmlMs.toFixed(2)}ms; runtime act=${timing.profile.actMs.toFixed(2)}ms; synchronous UI update=${timing.profile.changeMs.toFixed(2)}ms; Playwright click=${browserActionMs}ms.`);
  expect(afterHundred.soldiers).toBe(169);
  expect(afterHundred.census).toBe(351);
  expect(timing.simulationMs).toBeLessThan(1_000);
  expect(timing.panelHtmlMs).toBeLessThan(1_000);
  expect(timing.profile.actMs).toBeLessThan(1_000);
  expect(timing.profile.changeMs).toBeLessThan(1_000);
  await expect(page.locator('#recruit-warden-max')).toContainText('31');
  await page.locator('#recruit-warden-max').click();
  const capped = await summary(page);
  expect(capped.soldiers).toBe(200);
  expect(capped.census).toBe(351);
  expect(capped.uniqueIds).toBe(capped.census);
  expect(capped.jobs.every(n => n >= 0)).toBe(true);
  await expect(page.locator('#recruit-warden')).toBeDisabled();
  await expect(page.locator('.recruit-reason').first()).toContainText('capacity');

  await page.locator('#save').click();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__KINGNAMIC__?.runtime?.loaded)), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#start')).toHaveText(/Resume kingdom/);
  await page.locator('#start').click();
  const recovered = await summary(page);
  expect(recovered).toMatchObject({ population: capped.population, residents: capped.residents, soldiers: 200, census: capped.census, crowns: capped.crowns });
  await page.locator('#tab-army').click();
  await expect(page.locator('.army-status')).toContainText('200 / 200 local soldiers');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
