import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const scene = (page: Page) => page.evaluate(() => {
  const app = (window as any).__KINGNAMIC__;
  return { people: JSON.parse(JSON.stringify(app.scene.civilians.people)), zoom: app.scene.cameras.main.zoom, x: app.scene.cameras.main.scrollX, y: app.scene.cameras.main.scrollY, state: JSON.parse(JSON.stringify(app.runtime.state)) };
});
const tile = async (page: Page, x: number, y: number) => page.evaluate(({ x, y }) => (window as any).__KINGNAMIC__.scene.screenPoint({ x, y }), { x, y });

test('living residents keep their positions across jobs and pause; legacy save loads and persists orders', async ({ page }) => {
  const fixture = await readFile('tests/fixtures/milestone-v2.json', 'utf8');
  await page.addInitScript(raw => localStorage.setItem('kingnamic.save.v2', raw), fixture);
  await page.goto('/'); await page.locator('#start').click();
  const initial = await scene(page); expect(initial.state.resources).toEqual(JSON.parse(fixture).resources);
  await page.locator('#speed-2').click(); await page.waitForTimeout(6000); await page.locator('#pause').click();
  const before = await scene(page); expect(before.people.some((c: any, i: number) => c.x !== initial.people[i].x || c.y !== initial.people[i].y)).toBe(true);
  await page.locator('#tab-people').click(); await page.locator('#job-farmers-plus').click();
  await page.waitForTimeout(350); const changed = await scene(page);
  expect(changed.people.map((c: any) => [c.id, c.x, c.y])).toEqual(before.people.map((c: any) => [c.id, c.x, c.y]));
  await page.locator('#tab-army').click(); await page.locator('#army-orders').click();await page.locator('#rally').click(); await page.locator('#world canvas').click({ position: await tile(page, 18, 16) });
  const ordered = await scene(page); expect(ordered.state.units.every((u: any) => u.order === 'move')).toBe(true);
  await page.locator('#save').click();
  // Remove the fixture initializer before reload, retaining the real saved result.
  const raw = await page.evaluate(() => localStorage.getItem('kingnamic.save.v2'));
  // A separate context verifies the saved result without reapplying the legacy fixture.
  const clean = await page.context().browser()!.newContext();
  await clean.addInitScript(save => localStorage.setItem('kingnamic.save.v2', save!), raw);
  const resume = await clean.newPage(); await resume.goto(page.url()); await resume.locator('#start').click();
  const after = await scene(resume);
  expect(after.state.units).toEqual(ordered.state.units); expect(after.state.jobs).toEqual(ordered.state.jobs);
  expect(after.state.buildings).toEqual(ordered.state.buildings); expect(after.state.resources).toEqual(ordered.state.resources);
  await clean.close();
});

test('wheel zoom stays anchored to the pointer and camera keys respect modal dialogs', async ({ page }) => {
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#pause').click();
  const canvas = await page.locator('#world canvas').boundingBox();
  const point = { x: canvas!.width * .65, y: canvas!.height * .5 };
  const before = await page.evaluate(p => { const w = (window as any).__KINGNAMIC__.scene.cameras.main.getWorldPoint(p.x, p.y); return { x: w.x, y: w.y }; }, point);
  await page.mouse.move(canvas!.x + point.x, canvas!.y + point.y); await page.mouse.wheel(0, -100); await page.waitForTimeout(150);
  const after = await page.evaluate(p => { const w = (window as any).__KINGNAMIC__.scene.cameras.main.getWorldPoint(p.x, p.y); return { x: w.x, y: w.y }; }, point);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(2);
  await page.locator('#help').click(); const camera = await scene(page);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
  const held = await scene(page); expect(held.x).toBe(camera.x); expect(held.y).toBe(camera.y);
  await page.locator('#close-dialog').click();
});

test.describe('real touch input', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('previews placement, rejects occupied ground, confirms once, and offers 44px controls', async ({ page }) => {
    await page.goto('/'); await page.locator('#start').tap(); await page.locator('#pause').tap();
    const before = (await scene(page)).state;
    await page.locator('#category-production').tap();await page.locator('#build-quarry').tap(); await page.locator('#world canvas').tap({ position: await tile(page, 14, 11) });
    await expect(page.locator('#confirm-placement')).toBeDisabled();
    await page.locator('#world canvas').tap({ position: await tile(page, 18, 13) });
    await expect(page.locator('#confirm-placement')).toBeEnabled();
    expect((await scene(page)).state.buildings).toHaveLength(before.buildings.length);
    expect((await scene(page)).state.resources).toEqual(before.resources);
    await page.locator('#confirm-placement').tap();
    expect((await scene(page)).state.buildings).toHaveLength(before.buildings.length + 1);
    await page.locator('#tab-people').tap();
    for (const id of ['#job-farmers-plus', '#pause', '#zoom-in', '#speed-2', '#help']) {
      const rect = await page.locator(id).boundingBox(); expect(rect!.width).toBeGreaterThanOrEqual(44); expect(rect!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'docs/evidence/polish-touch.png' });
  });
});
