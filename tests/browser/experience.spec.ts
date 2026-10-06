import { expect, test } from '@playwright/test';

test('resizing from desktop to phone preserves the viewed world center and zoom', async ({ page }) => {
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#pause').click();
  const center = () => page.evaluate(() => { const c = (window as any).__KINGNAMIC__.scene.cameras.main; return { x: c.worldView.centerX, y: c.worldView.centerY, zoom: c.zoom, width: c.width }; });
  const before = await center();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await center()).width).toBe(390);
  const after = await center(); expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(2); expect(after.zoom).toBe(before.zoom);
  await page.screenshot({ path: 'docs/evidence/experience-resize.png' });
});

test('two building sites share the displayed crew and resume compatible progress', async ({ page }) => {
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#pause').click();
  for (const [kind, x, y] of [['quarry', 18, 13], ['infirmary', 18, 15]] as const) {
    await page.locator(kind==='quarry'?'#category-production':'#category-settlement').click();await page.locator(`#build-${kind}`).click();
    const point = await page.evaluate(({ x, y }) => (window as any).__KINGNAMIC__.scene.screenPoint({ x, y }), { x, y });
    await page.locator('#world canvas').click({ position: point });
  }
  const unfinished = () => page.evaluate(() => (window as any).__KINGNAMIC__.runtime.state.buildings.filter((b: any) => b.progress < 1));
  const initial = await unfinished(); expect(initial).toHaveLength(2);
  await page.locator('#category-owned').click();await page.locator(`#inspect-${initial[0].id}`).click();
  await expect(page.locator('.crew-note')).toContainText('1 builder assigned');
  const started = await page.evaluate(() => (window as any).__KINGNAMIC__.runtime.state.time);
  await page.locator('#speed-2').click();
  await page.waitForFunction(started => (window as any).__KINGNAMIC__.runtime.state.time >= started + 4, started);
  await page.locator('#pause').click();
  const sites = () => page.evaluate(ids => (window as any).__KINGNAMIC__.runtime.state.buildings.filter((b: any) => ids.includes(b.id)), initial.map((b: any) => b.id));
  const progress = await sites(); expect(progress).toHaveLength(2);
  expect(progress[0].progress).toBeGreaterThan(0);
  expect(progress[1].progress).toBeGreaterThan(0);
  // Each of the two sites gets one of the displayed two builders. Compare
  // actual elapsed simulation time, including any delay in the pause click.
  const elapsed = await page.evaluate(started => (window as any).__KINGNAMIC__.runtime.state.time - started, started);
  if (elapsed < 12) expect(progress[0].progress).toBeLessThanOrEqual(elapsed / 12 + .02);
  await page.locator('#save').click(); await page.reload(); await page.locator('#start').click();
  expect(await sites()).toEqual(progress);
  await expect(page.locator('#world-subtitle')).toContainText('Tonight: 9 infected');
  await page.screenshot({ path: 'docs/evidence/experience-worksites.png' });
});
