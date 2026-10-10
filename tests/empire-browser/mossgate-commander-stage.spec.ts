import { test, expect, type Page } from '@playwright/test';
import { army, newGame } from '../../src/game/state';
import { command } from '../../src/game/commands';
import { createMarch, empireStep } from '../../src/game/empire';
import { decode } from '../../src/game/persistence';

const read = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__KINGNAMIC__.runtime.state)));

test('a commander can reach and hold Mossgate capture range after the field is clear', async ({ page }) => {
  const home = newGame(91573);
  home.speed = 0;
  const hero = army(home)[0];
  expect(command(home, { type: 'commander-appoint', id: hero.id }).ok).toBe(true);
  const s = createMarch(home);
  const reserve = { ...home, units: home.units.filter(u => u.id !== hero.id) };
  delete reserve.commander;
  s.empire = { reserve, elapsed: 0 };
  s.commander = home.commander;
  s.units.push(hero);
  Object.assign(hero, { x: 40, y: 29, target: { x: 40, y: 29 }, anchor: { x: 40, y: 29 }, path: [], order: 'hold' });
  empireStep(s, .1);
  expect(s.march.rival?.status).toBe('occupied');
  s.units = s.units.filter(u => u.faction !== 'rival' && !['hollow', 'runner', 'brute'].includes(u.kind));
  Object.assign(s.march.rival!, { remaining: 0, reserve: 0, casualties: 100, warning: 0 });
  s.corpses = [];
  expect(decode(JSON.stringify(s)), 'Commander staging fixture must be a valid regional save.').not.toBeNull();

  await page.goto('/');
  await page.evaluate(raw => localStorage.setItem('kingnamic.save.v2', raw), JSON.stringify(s));
  await page.reload();
  await page.locator('#start').click();
  const loaded = await read(page);
  expect(loaded.region).toBe('march');
  expect(loaded.commander?.id).toBe(hero.id);

  const order = await page.evaluate((id: number) => {
    const rt = (window as any).__KINGNAMIC__.runtime;
    return rt.act({ type: 'order', order: 'move', ids: [id], x: 42, y: 29 });
  }, hero.id);
  expect(order.ok, order.message).toBe(true);
  await page.locator('#speed-2').click();
  await expect.poll(async () => {
    const current = await read(page), unit = current.units.find((u: any) => u.id === hero.id);
    return unit ? Math.hypot(unit.x - 47, unit.y - 29) : Infinity;
  }, { timeout: 30000, intervals: [100, 250, 500] }).toBeLessThan(5.8);
  await page.locator('#pause').click();

  const final = await page.evaluate(async (id: number) => {
    const rt = (window as any).__KINGNAMIC__.runtime;
    const { strongholdCaptureError } = await import('/src/game/empire.ts' as string);
    const unit = rt.state.units.find((u: any) => u.id === id);
    return {
      commander: rt.state.commander?.id,
      unit: unit && { x: unit.x, y: unit.y, hp: unit.hp, order: unit.order, target: unit.target, pathLength: unit.path.length },
      center: { x: 47, y: 29 },
      distance: unit && Math.hypot(unit.x - 47, unit.y - 29),
      captureBlock: strongholdCaptureError(rt.state, 'mossgate')
    };
  }, hero.id);
  expect(final.commander).toBe(hero.id);
  expect(final.distance).toBeLessThan(6);
  expect(final.captureBlock).toBeNull();
  await page.locator('#tab-empire').click();
  await expect(page.locator('#capture-stronghold')).toBeEnabled();
  await page.locator('#capture-stronghold').click();
  let captured = await read(page);
  expect(captured.march.rival.status).toBe('captured');

  const existing = captured.buildings.map((b: any) => b.id);
  const site = await page.evaluate(async () => {
    const rt = (window as any).__KINGNAMIC__.runtime;
    const { buildError } = await import('/src/game/commands.ts' as string);
    const hall = rt.world.buildings.find((b: any) => b.name === 'Mossgate Hall');
    for (let r = 1; r <= 10; r++) for (let y = hall.y - r; y <= hall.y + r; y++) for (let x = hall.x - r; x <= hall.x + r; x++) {
      if (Math.max(Math.abs(x - hall.x), Math.abs(y - hall.y)) === r && !buildError(rt.world, 'cottage', x, y)) return { x, y };
    }
    return null;
  });
  expect(site).toBeTruthy();
  await page.locator('#tab-build').click();
  await page.locator('#category-settlement').click();
  await page.locator('#build-cottage').click();
  await page.evaluate(p => (window as any).__KINGNAMIC__.scene.focus(p), site);
  await page.waitForTimeout(400);
  const canvas = page.locator('#world canvas'), box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const point = await page.evaluate(p => (window as any).__KINGNAMIC__.scene.screenPoint(p), site);
  await page.mouse.move(box!.x + point.x, box!.y + point.y);
  await page.waitForTimeout(60);
  await page.mouse.click(box!.x + point.x, box!.y + point.y);
  captured = await read(page);
  const cottage = captured.buildings.find((b: any) => b.kind === 'cottage' && !existing.includes(b.id));
  expect(cottage, JSON.stringify(await page.evaluate(async p => {
    const rt = (window as any).__KINGNAMIC__.runtime;
    const { buildError } = await import('/src/game/commands.ts' as string);
    return { message: rt.message, placement: rt.placement, preview: rt.placementPreview, error: buildError(rt.world, 'cottage', p.x, p.y) };
  }, site))).toBeTruthy();
});
