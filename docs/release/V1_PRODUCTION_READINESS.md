# KINGNAMIC V1 production readiness

## Static deployment checklist

- Publish the complete `dist/` directory at the **root of one stable HTTPS origin**. The generated page and crest use root-relative `/assets/...` and `/crest.svg` URLs; the worker registers at `./sw.js` and caches within its scope. A subpath deployment needs an explicit Vite `base` change and a fresh production/offline verification. `file://` is unsupported.
- Serve `/` as `index.html`. The current game has no client-side URL routes, so no catch-all SPA rewrite is needed. Preserve correct HTML, JavaScript, CSS, SVG, and text MIME types.
- Publish each build atomically, or upload all new hashed assets before replacing `index.html` and `sw.js`. Keep previous full build artifacts for rollback.
- Set `index.html` and `sw.js` to revalidate (`Cache-Control: no-cache` or equivalent). Content-hashed files under `/assets/` may use `public, max-age=31536000, immutable`; stable files such as `crest.svg` should revalidate. Enable ordinary gzip/Brotli compression where the host supports it.
- Keep the public scheme, hostname, and port stable. Saves live in origin-scoped browser `localStorage` (`kingnamic.save.v2`, with `kingnamic.backup.v2` recovery); changing origin does not transfer them. This release keeps save schema version 2 and retains the existing legacy decoder.
- The service worker is production-only. It precaches the generated static files, activates the replacement immediately, claims clients, and removes older `kingnamic-*` caches. It does not clear local saves. A first successful online visit is needed before reopening offline.

No hosting provider is selected and no provider-specific deployment file is included. Configure these requirements in the chosen static host before release.

## Release checklist

- [ ] From a clean checkout: `npm ci`, `npm run check`, `npm test`, and `npm run build` all pass.
- [ ] Inspect `dist/`: it contains `index.html`, `sw.js`, the built JS/CSS, `crest.svg`, and `THIRD_PARTY_NOTICES.txt`; all referenced URLs resolve from the public root.
- [ ] In a clean browser profile on the final HTTPS origin, verify first-time onboarding, start and save a fresh kingdom, confirm the service worker controls the page, and reload with network disabled.
- [ ] With a real saved kingdom present, publish a new complete build, leave the old page open through service-worker activation, reload into the returning-player screen, and compare the saved troops/resources/buildings. Reopen offline and verify the same save again.
- [ ] Check desktop and narrow touch layouts, keyboard-visible focus, named controls, modal dialog behavior, readable text at browser zoom, and zero horizontal page overflow. Test physical target devices before claiming device-specific support.
- [ ] Check browser console, failed requests, and outbound requests. The production page must not expose the development-only `__KINGNAMIC__` inspection API.
- [ ] Keep a copy of the exact deployed `dist/` and commit ID with the release record.

## Known issues and limits

- Saves are local to the browser profile and origin; there is no cloud sync or in-game export/import. Browser storage clearing, private browsing policies, or changing domains can make a save unavailable. The game reports save failures, but players must keep the tab open if browser storage is blocked or full.
- Offline reopening is supported after the service worker has installed on a successful online visit and the host serves the complete cache manifest. If worker installation fails, the game still runs online and local saves remain available, but offline reopening is not guaranteed.
- This audit used local Chromium production builds and emulated touch layouts. It does not certify physical Android, iOS/Safari, Firefox, or assistive-technology behavior, and it is not a human usability study.
- The production JS is 1,459.53 KB raw / 418.84 KB gzip; Vite emits its advisory for a raw chunk above 500 KB. Prior controlled 200-vs-120 battle profiles showed typical frames near one 60 Hz refresh, with occasional 75–81 ms long tasks. This is a known dense-battle hitch risk, not a deployment blocker.
- Large-scale frame timing and the bundled-size warning are not grounds to split gameplay or add dependencies during release preparation.

## Rollback procedure

1. Restore the **entire previous `dist/` release** at the same HTTPS origin, including its `index.html`, hashed assets, `sw.js`, and notices. Do not restore only the HTML or worker, and do not change DNS/origin as part of rollback.
2. Ensure `index.html` and `sw.js` revalidate. The browser will detect the restored worker, install its matching asset cache, and activate it; keep the tab open until the controller changes, then reload and verify the restored version.
3. Do not clear browser storage or Cache Storage. This release does not change the version-2 save schema; the current save and validated backup should remain readable after rollback. Ask affected players to preserve their browser profile if an unexpected save-validation warning appears.
4. Smoke-test a returning save and offline reload on the restored build. Keep the failed release artifacts and logs for diagnosis; correct forward from a verified full build before trying deployment again.
