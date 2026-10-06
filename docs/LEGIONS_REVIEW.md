# Kingnamic — armies and the Hollowing

5 October 2026. Local development only. No push, publication or deployment. This milestone preserves the original valley, chapter objectives, procedural assets, fixed-step simulation, offline storage keys and Broken Standard mission.

## Playable systems

Residents now have persistent identities, positions, routes, individual HP, exposure and immunity. The civilian system advances in the simulation, and the renderer observes a bounded sample of those same people. Infection removes actual people from available labor. Recruitment converts an unassigned, fit resident into a soldier with the same identity; demobilization reverses that conversion without refunding equipment or restoring lost health. Soldiers and residents can die from combat or illness. Army and population counts exclude casualties immediately.

Exposure accumulates through bites, contaminated ground, tainted croft supplies and proximity to symptomatic people. Infection begins at 100 exposure; incubation lasts 18 seconds, critical illness begins at 55, and untreated illness is fatal by 75 seconds of disease progression. Critical illness damages HP, so an already wounded person can die earlier. Symptoms reduce military damage by 20%. Quarantine stops social transmission, slows disease progression to one quarter, withdraws infected soldiers, mitigates environmental exposure and reduces production by 20%. Manual treatment, staffed herbalists and expedition medicine use the same individual case records. Treatment gives 35 seconds of immunity. Warnings identify affected people and explain the source and deadline.

Deaths with an active infection, at least 40 exposure, or at least 50 ground contamination leave tainted remains. A visible eight-second countdown precedes one hostile reanimation. Clean deaths do not reanimate. Cleansing clears supply contamination, reduces ground contamination and makes existing remains safe. A corpse is consumed on reanimation; its source identity cannot also exist as a living resident, soldier or another active reanimation. These records survive reloads.

The main valley supports up to 200 friendly soldiers and 200 infected, with independent selections and 20 named squads. Click, Shift-click, Shift-drag, Ctrl+A, roster buttons and touch Multi-select provide selection. Move, Attack, Hunt, Defend, Patrol, Hold, Retreat, Regroup and Escort address explicit soldier IDs. Other soldiers keep their orders. Naming a subset splits it into a new squad; assigning members merges groups. Squad names, membership, formation and orders persist. Wardens fill the armored swordsman/guard role; spearmen counter runners, rangers offer long-range fire with a close-range penalty, and scouts offer speed and shorter-range evasive bow support.

Capacity costs infrastructure: each completed garrison level supplies 24 places, up to 200. Recruitment costs supplies and living residents; batch recruitment equips at most five per action. Specialists require a level-two garrison or successful battalion enlistment. Soldiers consume 0.04 food/second each. Without rations they lose six HP every 12 seconds. Paid settler invitations require five beds and peaceful daylight; fit soldiers can return to civilian work. The original five-night victory remains. Continue the watch enables further growth, with disclosed army-scaled waves capped at 135 and a heavier enemy mix.

The authored expedition still uses three patrol members and pauses home time. Independent simultaneous guard/hunt squads operate on the main valley map. The expedition retains finite recruitment, equipment reservations, trust requirements, wounds, retreat, defeat and recovery. Returned veterans preserve identity, squad membership and illness; stranded allies preserve wounds and active illness. Sharing supplies can cure allied cases, and packed herbs can treat individual emergencies. A failed patrol cannot award recruits.

## Architecture and fixes

- Spatial grids bound local combat and disease queries. Reverse Dijkstra navigation fields share route computation across goals; at most 128 fields remain cached per world. Reloading with an empty cache produces the same decisions.
- Fixed simulation remains 10 Hz, with presentation near 30 Hz and bounded combat effects. Up to 64 actual residents are rendered; the saved census retains the previous 1,000-person validation ceiling. This is not a claim that 1,000-person movement was performance-tested.
- Unique initial resident positions and tolerant intermediate waypoint completion remove a reproduced doorway deadlock. Deterministic lateral yielding resolves head-on traffic without crossing blocked edges.
- A 200-soldier browser run exposed crowd displacement outside save-coordinate bounds. Boundary checks fixed the save failure, and the scenario was rerun successfully.
- A 100-soldier formation test originally left six troops short of their slots. After the lateral-yield fix, all 100 reached their slots within the 90-second test, with zero pending move orders. See `evidence/legions-crossing.json`.
- Expedition squad renaming/replacement now updates the kingdom ledger, avoiding a full-ledger return that would exceed the squad save limit.
- Existing version-two saves without individual residents migrate once. Modern census mismatches, duplicate IDs, invalid references and simultaneous living/dead identities are rejected. Saves retain their existing primary/backup keys; a failed save preserves the previous valid data.

Production still uses original code-generated textures, with no new dependencies or downloaded assets. Individual case rings, squad colors, selection outlines, destinations and persistent remains add visual feedback. The existing sword/bow/spear poses, damage recoil, fading roofs and arrow effects are reused.

## Verification record

The final simulation regression passes **133 tests across seven files**. Coverage includes the prior kingdom/tactical rules; legacy migration; deterministic save/resume; exposure from ground, supplies and contact; incubation; quarantine; treatment immunity; individual census loss; delayed single reanimation; duplicate identity rejection; independent squads; patrol/hold/escort/retreat/attack/regroup; formation scope; paid recruitment; demobilization; rations; expedition identities and illness; squad ledger replacement; map-edge saves; and 10/50/100/200-soldier combat fixtures.

The 100-soldier recruitment accounting test uses prepared population, buildings and supplies, then executes real recruitment commands and checks every cost and census change. It is **not** an uninterrupted campaign that naturally earned 100 troops. The rendering stress fixtures are likewise explicitly seeded armies.

All **32 distinct browser scenarios passed** on the final implementation: 11 kingdom checks, four expedition checks, four tactical checks, eight army/plague/scale checks, one complete five-night campaign and four production offline checks. The suites ran serially. Offline checks covered individual plague, timed remains and separate squads; ordinary kingdom resume without network access; an update from an older cached build; and expedition extraction without duplicate recruitment after offline reload. Completed coverage and final measured values are recorded in `evidence/legions-verification.json`. Browser runs use actual Chromium, DOM controls and canvas input; development inspection reads state, and only the explicitly labeled stress/terminal/legacy fixtures seed state. No external human playtest, physical phone benchmark or cross-browser certification is claimed.

The final full original campaign used only normal controls, no resource grants or time jumps: victory after **557.1 simulated seconds / 303 wall seconds**, five nights, four territories, 113 infected slain, six casualties, 11 cures, 27 remaining villagers and seven soldiers. The Hearth retained 1,500 HP. No JavaScript errors occurred. An earlier run before the final movement fix also won, with 12 casualties; browser decision timing varies, so this is not a controlled claim that the fix halved losses. This automated policy demonstrates a recoverable, winnable campaign; it does not establish an ideal human difficulty curve.

Complete ridge, ford and reconstructed legacy missions returned three patrol members and enlisted four allies in the recorded runs. Returning infected soldiers were treated before recovery, and recruited specialists were observed fighting at home. Retreat and complete-patrol-defeat checks awarded no unearned recruits. See `evidence/battalion-browser.json`, `evidence/tactics-ford-browser.json` and `evidence/tactics-legacy-browser.json`.

The production build and TypeScript check passed. The latest build totals **1,392,961 raw bytes / 394,648 individually gzipped bytes**, an increase of 9,779 gzip bytes (2.54%) over the prior 384,869-byte milestone. Cache: `kingnamic-f3cf398cdb5f`. The existing large Phaser chunk advisory remains. Build evidence: `evidence/legions-build-size.json`.

### Final army performance samples

Desktop Chromium, WebGL renderer, 1440×960 viewport. Each live sample runs for approximately 12 wall seconds with 18 actual residents, original kingdom buildings, a selected mixed army ordered to Hunt, and real combat. The initial force sizes below are seeded fixtures; casualties reduce counts during each sample. The simulation advanced 11.9–12.1 seconds per sample.

| Soldiers | Initial enemies | Median frame interval | 95th percentile | Maximum interval | Runtime tick p95 |
|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 8.4 ms | 16.5 ms | 33.2 ms | 1.2 ms |
| 50 | 25 | 8.4 ms | 16.7 ms | 25.2 ms | 1.9 ms |
| 100 | 50 | 8.4 ms | 16.9 ms | 58.4 ms | 2.9 ms |
| 200 | 100 | 16.5 ms | 25.0 ms | 41.6 ms | 5.0 ms |

These are requestAnimationFrame intervals, not a promise of that many distinct animation frames: visual pose updates remain capped near 30 Hz. Runtime tick samples include frames that do not advance the 10 Hz simulation. The pure simulation fixtures measured approximately 0.96, 1.99, 3.63 and 7.53 ms per fixed step respectively, over 200 steps; these CPU measurements vary with host load and are not directly comparable to browser frame costs. Raw files are `evidence/legions-browser-{10,50,100,200}.json` and `evidence/legions-simulation.json`.

All four scale scenarios saved successfully with no JavaScript errors. Two hundred soldiers were practical in this short desktop sample, while 100 remains the conservative target for untested devices. Maximum frame spikes are retained in the table rather than hidden by averages.

The repeated-world test replaced four 100-soldier worlds in one renderer, ran each for six seconds, and invoked Chromium garbage collection between measurements. Retained JavaScript heap was **10,213,312; 11,261,980; 11,080,620; and 11,650,420 bytes**. Active unit-sprite counts matched live unit counts; worker sprites remained at 18. The difference from the second to fourth sample was 388,440 bytes. This does not prove absence of a long-session leak or measure GPU memory. See `evidence/legions-retained-heap.json`.

## Remaining weaknesses, in priority order

1. **Human difficulty and long-army progression.** The first chapter and authored missions are verified, but an uninterrupted earned 100–200-soldier economy and many hours of continued-watch balancing have not been playtested. Evaluate food pressure, herb demand, casualty warnings and army-scaled waves with new players before stronger tuning.
2. **Dense battle readability and constrained geography.** Two hundred soldiers fit the simulation budget on this machine, but the small valley and narrow crossings become visually crowded. Large selections create many health bars and selection rings. Smaller independent squads are clearer. Mixed civilian/soldier and opposing traffic still deserve longer adversarial tests; soft collision is not a rigid physical packing guarantee.
3. **Physical mobile and other browsers.** Responsive and touch-input checks run in desktop Chromium emulation. Low-end Android GPUs, iOS/Safari and Firefox are unmeasured. Keep 100 as the conservative army target until hardware testing confirms otherwise.
4. **UI density.** The roster is paginated and individual orders are explicit, but the army panel is long. Faster squad recall and a compact order summary would be more valuable than additional mission content. Keyboard-only canvas targeting and pinch zoom remain incomplete.
5. **Simulation abstraction.** Production uses rates over assigned healthy workers; visual deliveries do not generate extra resources. Quarantine is a kingdom-wide policy with withdrawal to refuge/home, rather than a new isolation-building subsystem. Bow safety uses bounded evasion and formations rather than predictive tactical planning.
6. **Long-session storage and memory.** Save bounds, migration and repeated-world checks are covered, but multi-hour heap behavior and near-maximum resident/building census storage pressure need soak testing. Save export/import remains a useful follow-up.
