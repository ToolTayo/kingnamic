# First-playable verification

Historical milestone report. The subsequent gameplay/visual review is recorded in [REVIEW.md](REVIEW.md). Reusable browser evidence filenames now contain the latest runs; numerical results below describe the first milestone, not the later polish pass.

Date: 4 October 2026 (Asia/Shanghai). Local Windows host, Node 24.19.0, Chromium, Phaser 3.90.0, TypeScript 5.9.3, Vite 7.3.6 and Vitest 4.1.11. Exact dependency versions are locked in package-lock.json.

## Verified functionality

- TypeScript strict check and production build pass.
- 32 simulation/persistence tests pass: deterministic runs and save/resume, affordability and placement rejection, construction → capacity → job → production, healthy population limits, recruitment costs, upgrades/repairs, gates and river crossing navigation, shield-line armor, high-ground/loose-order ranger range and damage, role-aware rally positions, combat and contamination, turning/treatment/quarantine/automatic recovery, connected territory rules, victory/defeat, migration, malformed-save rejection, backup recovery, blocked storage and bounded stress conditions.
- A legal-command simulation strategy won at 554.0 seconds: five nights, all territories, 108 enemies defeated, 19 cures, one casualty, seven soldiers remaining. This is automated balance evidence, not a claim that all strategies win or that difficulty has been validated with new players.
- All six core browser checks passed. Actual interactions verified construction placement and completion, worker assignment, both troop recruitments, rally, formations, upgrades, pause, save/reload, a naturally timed first night, combat, first-dawn infection, quarantine, treatment and Pinewatch reclamation.
- Responsive testing used 1440×960 and 390×844 viewports. No page overflow was found. The phone run exercised placement, job buttons and reset cancellation/confirmation. This is viewport emulation on desktop Chromium, not a physical Android test.
- After the final rally-order and panel-scroll refinements, all 32 simulation tests and both affected desktop/phone browser cases passed again. The full campaign evidence predates those two refinements; its strategy does not issue rally commands.
- Browser storage blocked with a throwing SecurityError: the game remains playable and visibly reports unavailable saving.
- Production excludes the development inspection object.
- The production offline browser check passed: after caching, the network was disabled, the page reloaded, the saved army resumed intact, and the rendered interface remained usable. It recorded no external requests or JavaScript errors.
- npm install/audit after the Vitest patch reports **0 known vulnerabilities**. No credentials, network account integration, dynamic code execution or backend were added.

## Measurements

One desktop Chromium sample at 1440×960, after initial warm-up, recorded **WebGL**, **16.3 ms median frame time**, **25.1 ms p95**, an engine estimate of **62 FPS**, and **29 MiB JavaScript heap**. A repeat with other browser/build work active recorded **18.6 ms median**, **41.7 ms p95**, **49 FPS**, and **28 MiB heap**. Each sample covers an early settlement and about 149 frames. JS heap excludes GPU textures and browser overhead. These samples do not establish low-end Android performance or frame stability throughout every battle.

The production output is **1,316,137 bytes raw** and **369,417 bytes gzip**, measured file by file across JavaScript, CSS, HTML, crest, service worker and dependency notices. [Exact measurements](evidence/build-size.json). Original art is generated locally at startup; evidence screenshots and development dependencies are not shipped. Vite reports one large-chunk advisory because Phaser is in the main bundle; this is not a build failure, and the complete initial payload is well below the requested asset budget.

## Browser evidence

- [Desktop settlement](evidence/desktop.png)
- [Live first-night defense](evidence/night.png)
- [Dawn infection and treatment controls](evidence/plague.png)
- [Phone layout](evidence/mobile.png)
- [Offline production reload](evidence/offline-production.png)

The **complete live browser campaign passed** in **311 seconds wall time** at 2×, with normal pauses to issue orders: **558.6 seconds of simulation**, five nights, all three territories reclaimed, 108 infected defeated, 15 cures, one casualty, 29 villagers and seven soldiers remaining. The Hearth survived with 64 health. All actions used real buttons and map clicks; no resource injection or time jumps. Zero JavaScript errors. [Result data](evidence/campaign.json) · [Victory screenshot](evidence/campaign.png).

This close finish indicates that the chapter is winnable but demanding. Broader new-player balance testing remains the highest-priority improvement.

## Issues found and resolved during development

- The initial army/tower strategy lost after fifth dawn. Adding legal defensive upgrades produced a victory. The guide now recommends reinforcing the Hearth and towers before late waves.
- A storage property access could throw before the save layer handled it. Storage access now occurs inside the guarded adapter; the dedicated browser test covers it.
- Save validation previously used prototype-inclusive enum lookup. It now requires own properties and rejects malicious enum values, impossible coordinates, duplicate entities, invalid numbers and excessive arrays.
- The original test runner had two moderate development advisories. Upgraded to patched Vitest 4.1.11; current audit is clear.
- The default preview port was already used by another local app. Offline testing was moved to a dedicated strict port without changing the other app.
- Concurrent Playwright configurations initially shared output directories, causing one trace-cleanup failure after phone gameplay assertions succeeded. Separate artifact directories resolve that test-harness race.
- The real offline check exposed a cache mismatch from the preview server's `Vary: Origin` header on anonymous module/style requests. The static-assets-only cache now ignores that header when matching. Offline reload and restored units are verified after the fix.
- The long campaign harness originally attempted to inspect a wall through the major-building list. Walls are selected on the map. Its repair policy now uses only the major buildings exposed by that list, and individual browser actions have bounded timeouts.
- A live healer could consume herbs between the campaign harness checking affordability and clicking treatment. The harness now uses the game's real pause button while issuing orders. Continuous tracing of hundreds of DOM snapshots was also expensive because it embedded procedural thumbnails; the long campaign uses structured results and screenshots instead. Those trace files were removed after diagnosis.
- In this restricted Windows execution host, Playwright's automatic preview-server teardown stalled after the successful offline check. Explicitly stopped only that test's owned preview process; the runner then exited successfully. This was a test-process lifecycle issue, not an offline gameplay failure.
- Rally formation now groups rangers behind wardens regardless of recruitment order, with an explicit regression check. Switching management tabs resets the panel scroll to its heading.

## Critical review and remaining limits

Gameplay: a complete survival/expansion loop exists and is demonstrably winnable. Difficulty has one authored map and needs human playtest feedback. The first dawn introduces an infected refugee explicitly; later infection follows exposure/spread rules. Food and medical demand should receive broader balancing.

Architecture: rules are independent from presentation and all state uses a fixed-step seeded simulation. The expedition contract is intentionally only an extension point. Buildings and civilians use aggregate economic rules; representative civilian animation is cosmetic and does not independently navigate around obstacles.

UX/accessibility: labeled DOM controls, pause, readable selection/health, native dialog focus trapping, keyboard shortcuts and a phone layout are present. Canvas world placement still needs a pointer/touch, small supporting labels and touch targets merit refinement, and screen-reader-only gameplay is not complete. No pinch-zoom; +/− controls work on touch.

Performance: bounded entities and cached art limit work; weighted A* uses a small fixed graph. Browser frame timing was measured on this host only. Stress tests exercise simulation limits without asserting mobile hardware performance. No leak-duration test or thermal/battery profile has been completed.

Persistence: schema validation, a backup and initial migration are tested. No cross-device sync or export/import UI. Offline reload requires a successful first production visit and a secure context (loopback qualifies). No Safari/Firefox/physical Android or multi-tab concurrent-save tests yet.

Content/legal: all game art and sounds are original procedural work; third-party runtime notices ship with the build. Trademark/name clearance is outstanding. No reference-game content was used.
