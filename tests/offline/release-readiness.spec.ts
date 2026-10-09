import { expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, sep, join, extname } from 'node:path';

test('fresh production install, release update, returning player and offline reopen preserve local progress', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [], externalRequests: string[] = [];
  let allowedOrigin = '';
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (allowedOrigin && !request.url().startsWith(allowedOrigin) && !request.url().startsWith('data:')) externalRequests.push(request.url());
  });

  const root = resolve('dist');
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'kingnamic-release-update-'));
  const oldRelease = join(fixtureRoot, 'old'), nextRelease = join(fixtureRoot, 'next');
  await cp(root, oldRelease, { recursive: true });
  await cp(root, nextRelease, { recursive: true });

  const oldWorker = await readFile(join(oldRelease, 'sw.js'), 'utf8');
  const oldCache = oldWorker.match(/const CACHE="([^"]+)"/)?.[1];
  if (!oldCache) throw new Error('Built service worker has no cache version');
  const nextCache = `${oldCache}-release-check`;
  const nextWorker = oldWorker.replace(`const CACHE="${oldCache}"`, `const CACHE="${nextCache}"`);
  expect(nextWorker).not.toBe(oldWorker);
  await writeFile(join(nextRelease, 'sw.js'), nextWorker);
  const oldIndex = await readFile(join(oldRelease, 'index.html'), 'utf8');
  await writeFile(join(nextRelease, 'index.html'), oldIndex.replace('<title>KINGNAMIC — The Last Hearth</title>', '<title>KINGNAMIC — Release update</title>').replace('</head>', '  <meta name="release-fixture" content="next-build" />\n  </head>'));

  let nextIsLive = false;
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const releaseRoot = nextIsLive ? nextRelease : oldRelease;
      const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
      const file = resolve(releaseRoot, relative);
      if (!file.startsWith(releaseRoot + sep)) { response.statusCode = 404; response.end(); return; }
      response.setHeader('Cache-Control', pathname === '/' || pathname === '/index.html' || pathname === '/sw.js' ? 'no-cache' : 'public, max-age=31536000, immutable');
      response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch {
      response.statusCode = 404; response.end();
    }
  });

  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  allowedOrigin = base;
  try {
    await page.goto(base);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#start')).toHaveText(/Light the beacon/);
    expect(await page.evaluate(() => localStorage.getItem('kingnamic.save.v2'))).toBeNull();
    expect(await page.locator('#dialog').evaluate(dialog => dialog.matches(':modal'))).toBe(true);

    await page.locator('#start').click();
    await page.locator('#pause').click();
    await page.locator('#tab-army').click();
    await page.locator('#army-recruit').click();
    await page.locator('#recruit-warden').click();
    await page.locator('#save').click();
    await expect(page.locator('#save-status')).toHaveText('Saved on this device');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const savedBeforeUpdate = await page.evaluate(() => JSON.parse(localStorage.getItem('kingnamic.save.v2')!));
    expect(savedBeforeUpdate.version).toBe(2);
    expect(savedBeforeUpdate.units.some((unit: { kind: string }) => unit.kind === 'warden')).toBe(true);
    expect(await page.evaluate(() => caches.keys())).toContain(oldCache);

    nextIsLive = true;
    await page.evaluate(() => {
      (window as any).__releaseControllerChanged = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    });
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('Service-worker registration missing');
      await registration.update();
    });
    await page.evaluate(() => (window as any).__releaseControllerChanged);
    await page.waitForFunction(async ({ previous, next }: { previous: string; next: string }) => {
      const keys = await caches.keys(); return keys.includes(next) && !keys.includes(previous);
    }, { previous: oldCache, next: nextCache });

    await page.reload();
    await expect(page).toHaveTitle('KINGNAMIC — Release update');
    await expect(page.locator('#start')).toHaveText(/Resume kingdom/);
    await page.locator('#start').click();
    await page.locator('#tab-army').click();
    const savedAfterUpdate = await page.evaluate(() => JSON.parse(localStorage.getItem('kingnamic.save.v2')!));
    expect(savedAfterUpdate.units).toEqual(savedBeforeUpdate.units);
    expect(savedAfterUpdate.resources).toEqual(savedBeforeUpdate.resources);
    expect(savedAfterUpdate.buildings).toEqual(savedBeforeUpdate.buildings);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#start')).toHaveText(/Resume kingdom/);
    await page.locator('#start').click();
    await expect(page.locator('#world canvas')).toBeVisible();
    const offlineSave = await page.evaluate(() => JSON.parse(localStorage.getItem('kingnamic.save.v2')!));
    expect(offlineSave.units).toEqual(savedBeforeUpdate.units);
    expect(offlineSave.resources).toEqual(savedBeforeUpdate.resources);
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  } finally {
    await context.setOffline(false).catch(() => {});
    await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});


test('production first-run controls stay usable in 320px and 390px touch layouts', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(baseURL!);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#start')).toHaveText(/Light the beacon/);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#start').tap();
    await page.locator('#pause').tap();
    await page.locator('#tab-army').tap();
    await page.locator('#army-recruit').tap();
    await page.locator('#recruit-class-ranger').tap();
    await expect(page.locator('.compact-recruit h3')).toHaveText('Ranger');
    for (const button of await page.locator('.recruit-classes button, .recruit-actions button').all()) {
      expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
