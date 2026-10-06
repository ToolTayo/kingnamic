# Kingnamic movement and play-experience review

4 October 2026. Improved the existing chapter in place. No deployment, push, added dependency, external artwork, or save reset.

## Findings and changes

| Confirmed issue | Change | Limit |
|---|---|---|
| Doorsteps and crossing troops visibly crowded. Two of seven rallied troops failed to finish their orders in the baseline browser sample. | Deterministic doorstep slots, bounded spatial-grid separation, and precise final movement within the destination tile. Soldiers no longer keep a move order forever because A* has no remaining tile node. | Soft separation is not a reservation-based traffic system. Civilian and combat crowds resolve separately; transient crossing overlaps can still happen. |
| Trees were baked into the terrain and could conceal units; roofs concealed nearby workers. | Cached, depth-sorted tree/rock/reed sprites and actor-aware foreground fading. Ground contamination is drawn below characters. Friendly/enemy ground rings improve recognition. | Fading uses conservative screen-space bounds; crowded roofs can stay translucent. |
| Minimal attack/death feedback. | Original cached walk, strike and recovery poses; weapon/bow motion, short lunges, damage recoil, falling/fading bodies and dust. Construction completion pulses have correct timing. | Mirrored silhouettes, not fully directional animation. Ranged damage still resolves immediately; projectile travel is visual. |
| Every project received the entire builder count, multiplying the same workers' output. | Each of up to six builders is assigned to one unfinished site. Projects share finite crew effort, freed builders reassign automatically, and the detail panel shows the crew. Civilian destinations follow the same site assignment. | Travel does not gate production. Each project retains slow resident help; food/timber/stone/herb production stays aggregate to preserve pacing and inexpensive simulation. |
| Expansion increased waves without an immediate overview of the next threat. | Daytime wave-size and front forecast; nighttime live/approaching counts; orange entry markers near dusk and at night. | Fronts indicate possible entry routes, not the exact randomly selected next spawn. |
| The objective panel covered part of the southern approach during combat. | It collapses to a small objective heading/count while it is night or enemies remain, exposing more of the battlefield. | The HUD still occupies screen space; camera movement remains important on phones. |
| Resizing from desktop to phone shifted the view away from the kingdom. | Resize handling preserves world center and the player's current zoom. | Views at map boundaries may still be clamped to the map bounds. |

No required save fields were added. Version 2 saves retain buildings, construction progress, jobs, resources and explicit troop orders. Civilian routes and short-lived visual effects remain transient. New builder-sharing rules apply when a previous save resumes concurrent construction.

## Verification and evidence

- TypeScript check passed; **64 automated tests passed** (52 regression cases plus 12 legal-command balance diagnostics). Existing compatibility, deterministic simulation, navigation, infection, campaign and maximum-count checks remain included.
- **11 distinct real Chromium browser checks passed**: the initial ten-case suite, followed by the new viewport-resize regression. After the final HUD/camera edits, the affected natural-night and keyboard/camera checks also passed again. Actual buttons/canvas input covered two simultaneous worksites, crew display, save/resume, recruitment/rally, construction/upgrades, natural first-night fighting and death sprites, treatment, claims, camera/modal behavior and storage failure. The compact combat objective panel measured below 65 pixels high on desktop and phone.
- The touch check used genuine Chromium touch events at 390×844: invalid placement, preview/confirmation before spending, 44×44 controls and no horizontal page overflow. This is device emulation, not physical phone testing.
- The previous version-2 fixture loaded in a browser and saved again with matching resources, jobs, buildings and troop orders. Concurrent construction also survived save/reload unchanged.
- The **final production offline check passed** after the camera fix: save a recruited army, load the service worker, disable all network access, reload, resume and verify identical saved units. No external requests or JavaScript errors; the development inspector is absent from production.
- **Full real-time UI campaign won:** 552.2 simulation seconds, 321 wall seconds including command pauses at 2×; five nights, all three marches, 108 defeated infected, two casualties, 16 cures, 29 villagers, seven soldiers, 1500 Hearth health, zero JavaScript errors. All actions used real buttons/canvas input; no resource grants or time jumps. [Result](evidence/campaign.json) · [Victory](evidence/campaign.png). The later objective-card adjustment changes presentation only.
- Direct agent-operated browser review inspected the older day-four kingdom and updated live visuals. The user has **not** supplied a thorough personal playtest. None of this is represented as external human feedback or measured enjoyment.
- Leaving that recovered but underdeveloped kingdom running without further intervention ended in defeat during night five: four nights held, 79 infected defeated, 29 lives lost. This was an unattended continuation, not a novice-controlled campaign or a comparable difficulty experiment.

### Repeated movement measurement

Same fresh kingdom, four additional recruits, seven troops rallied across the gate/river, 2× speed, 35 samples at approximately 300 ms wall intervals. An overlap is a pair of body centers less than 0.3 tile apart; totals sum overlap pairs over samples, not distinct affected people.

| Metric | Before | After |
|---|---:|---:|
| Civilian overlap-pair observations | 45 | 0 |
| Troop overlap-pair observations | 32 | 0 |
| Troops with completed orders at final sample | 5 / 7 | 7 / 7 |

[Before data](evidence/motion-before.json) · [After data](evidence/motion-after.json) · [After screenshot](evidence/motion-after.png). This verifies this route and population, not zero overlap under every possible layout.

### Render measurements

1440×960 headless Chromium, WebGL, requestAnimationFrame timing after warmup. Visual-state updates remain capped near 30 Hz within the roughly 60 Hz engine. These are local browser observations, not mobile-device benchmarks or GPU frame-time traces.

| Scenario | Median interval | 95th percentile | Reported engine FPS | JS heap |
|---|---:|---:|---:|---:|
| Early settlement | 10.3 ms | 26.3 ms | 60 | 31 MB |
| Natural first-night battle, final resize/HUD build | 16.5 ms | 32.9 ms | 62 | 32 MB |

[Day metrics](evidence/experience-day-performance.json) · [Night metrics](evidence/experience-night-performance.json). Different engine/sampling clocks and host scheduling mean these intervals should not be inverted into a claimed sustained rendering FPS.

The maximum-count simulation fixture started with 150 buildings and 100 units. A focused run completed 100 steps in 717.1 ms (7.17 ms per step), ending with 58 surviving units. The fixed-step budget is 100 ms at 10 Hz. This fixture deliberately includes dense and unrealistic placement and measures simulation only; it does not establish worst-case combined rendering performance.

The final production build passed strict TypeScript and Vite compilation. Total output is 1,332,664 bytes raw / 374,817 bytes individually gzipped, including Phaser and notices: 2,036 gzip bytes (0.55%) above the previous recorded build. No bitmap files or dependencies were added. Vite retains its existing large-JavaScript-chunk advisory. [Build measurements](evidence/experience-build-size.json).

### Difficulty probes

[Twelve diagnostic campaigns](evidence/experience-balance.json), three seeds (74019, 1701, 9042), four policies: mixed recruiting with decisions every 3 or 10 simulation seconds, ranger-heavy recruiting, and no medicine. All used normal legal commands, resource costs and prerequisites; each followed a known strong tower-building/expansion strategy. They are pure simulation probes, separate from the real-time UI campaign.

All twelve won. Treated mixed armies lost 1–18 people/soldiers, ranger-heavy armies lost 0–4, and neglected medicine lost 31–32, ending with only two residents. Minimum Hearth health stayed at 94–100%. Food never dropped below 121. Faster decisions did not consistently improve outcomes because build/claim timing and infection exposure also changed.

This exposes generous tower-supported survival and weak consequences for a depopulated victory. It does **not** demonstrate a novice win rate or isolate troop strength experimentally. Enemy stats, chapter length and victory requirements were deliberately left stable pending a broader balance pass.

## Remaining priorities

1. **Human difficulty and enjoyment:** observe first-time players handling infection, expansion and multi-front defense. Investigate tower dominance, ranger-heavy outcomes, and victory with a nearly empty village before increasing raw enemy health.
2. **Crowds under extreme layouts:** opposing traffic, mixed civilian/soldier congestion and densely packed settlements need broader coverage. Soft separation can briefly overlap while resolving a collision; it does not reserve narrow corridors.
3. **Physical mobile performance/input:** test low-end Android, Safari and Firefox. Pinch zoom and keyboard-only map placement remain absent.
4. **Animation and village detail:** stronger directional poses, richer attack silhouettes and more distinct building upgrades. Construction now has individual crew contributions; harvesting and delivery economics remain aggregate.
5. **Longer progression and saves:** additional migration fixtures and export/import before expanding the chapter.
