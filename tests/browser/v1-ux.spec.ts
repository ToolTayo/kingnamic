import { expect, test, type Page } from '@playwright/test';

const soldiers = (page: Page) => page.evaluate(() => {
  const s = (window as any).__KINGNAMIC__.runtime.state;
  return s.units.filter((u: any) => ['warden', 'ranger', 'spearman', 'scout'].includes(u.kind));
});

test('desktop first session explains the real opening moves and exposes compact recruitment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#dialog')).toContainText('Place a Trading post');
  await expect(page.locator('#dialog')).toContainText('eligible workers can follow automatically');
  await expect(page.locator('#dialog')).toContainText('gather a company at the southern road');
  await page.screenshot({ path: 'docs/evidence/v1-onboarding-desktop.png' });

  await page.locator('#start').click();
  await page.locator('#pause').click();
  await expect(page.locator('#objectives')).toContainText('Raise a new building');
  await page.locator('#tab-army').click();
  await page.locator('#army-recruit').click();
  await expect(page.locator('.army-status')).toContainText('local soldiers');
  for (const id of ['#recruit-warden', '#recruit-warden-5', '#recruit-warden-10', '#recruit-warden-50', '#recruit-warden-100', '#recruit-warden-max']) {
    await expect(page.locator(id)).toBeVisible();
  }
  for (const [kind, name] of [['warden', 'Warden'], ['ranger', 'Ranger'], ['spearman', 'Spearman'], ['scout', 'Scout']]) {
    await page.locator(`#recruit-class-${kind}`).click();
    await expect(page.locator('.compact-recruit h3')).toHaveText(name);
  }
  await page.locator('#recruit-class-warden').click();
  await page.screenshot({ path: 'docs/evidence/v1-recruitment-desktop.png' });
  expect(errors).toEqual([]);
});

test('touch onboarding and recruitment layout fit narrow phones', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('#dialog')).toContainText('Recruit your guard');
    await page.screenshot({ path: 'docs/evidence/v1-onboarding-mobile.png' });
    await page.locator('#start').tap();
    await page.locator('#pause').tap();
    await expect(page.locator('#world-hint')).toBeVisible();
    await expect(page.locator('#world-hint')).toContainText('Army to set orders');
    await page.locator('#tab-army').tap();
    await page.locator('#army-recruit').tap();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const button of await page.locator('.recruit-classes button').all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    for (const button of await page.locator('.recruit-actions button').all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: 'docs/evidence/v1-recruitment-mobile.png' });
  } finally {
    await context.close();
  }
});

test('touch players can recruit, issue a map order, save, and reload without accounting drift', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    await page.locator('#start').tap();
    await page.locator('#pause').tap();
    await page.locator('#tab-army').tap();
    await page.locator('#army-recruit').tap();
    const before = await soldiers(page);
    await page.locator('#recruit-warden').tap();
    await expect.poll(async () => (await soldiers(page)).length).toBe(before.length + 1);
    await page.locator('#army-orders').tap();
    await expect(page.locator('.army-help').first()).toContainText('Tap Set rally point');
    await page.screenshot({ path: 'docs/evidence/v1-touch-orders.png' });
    await page.locator('#rally').tap();
    await expect(page.locator('#rally')).toHaveAttribute('aria-pressed', 'true');
    const point = await page.evaluate(() => (window as any).__KINGNAMIC__.scene.screenPoint({ x: 18, y: 16 }));
    const canvas = await page.locator('#world canvas').boundingBox();
    await page.touchscreen.tap(canvas!.x + point.x, canvas!.y + point.y);
    await expect(page.locator('#rally')).toHaveAttribute('aria-pressed', 'false');
    const ordered = await soldiers(page);
    expect(ordered.every((u: any) => u.order === 'move')).toBe(true);
    const census = await page.evaluate(() => {
      const s = (window as any).__KINGNAMIC__.runtime.state;
      const people = [...s.residents, ...s.units];
      return { uniqueIds: new Set(people.map((p: any) => p.id)).size, total: people.length };
    });
    expect(census.uniqueIds).toBe(census.total);

    await page.locator('#save').tap();
    const saved = await page.evaluate(() => {
      const s = (window as any).__KINGNAMIC__.runtime.state;
      return { residents: s.residents, units: s.units, jobs: s.jobs, resources: s.resources, population: s.population, buildings: s.buildings };
    });
    await page.reload();
    await expect(page.locator('#start')).toHaveText(/Resume kingdom/);
    await page.locator('#start').tap();
    const loaded = await page.evaluate(() => {
      const s = (window as any).__KINGNAMIC__.runtime.state;
      return { residents: s.residents, units: s.units, jobs: s.jobs, resources: s.resources, population: s.population, buildings: s.buildings };
    });
    expect(loaded).toEqual(saved);
    await page.screenshot({ path: 'docs/evidence/v1-touch-reload.png' });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
