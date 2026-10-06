# Battlefield polish and sustained verification

Local development, 5 October 2026. This pass preserves the version-two save format, original procedural assets, four soldier roles and Broken Standard expedition. No dependencies or external assets were added. No push, publication or deployment.

## Confirmed problems and fixes

- **One unavailable member blocked the army.** The baseline Chromium reproduction selected 200 soldiers, including one recovering soldier and one quarantined case. Hold affected zero soldiers. Select available now excludes unavailable troops; recalling a whole squad still includes its recovering members for inspection/treatment, while orders address only its ready members and report those excluded. Low-level command validation remains strict. Other squad orders and membership remain intact.
- **Body-targeted Escort inherited the ally's order.** A new input regression reproduced an Escort becoming Hold because the clicked ally object carried its own `order`. Command input now copies coordinates explicitly; a browser click regression checks the escort's focus while the ally retains Hold.
- **Selection clutter obscured large battles.** Healthy soldiers no longer show 200 selected health bars and two overlapping rings each. Small selections retain individual routes; large selections draw bounded destination summaries by squad/order. Friendly ground markers are quieter, while wounded, critical, infected, isolated and inspected people retain individual warnings. Offscreen unit overlays are omitted. Terrain and roofs retain their existing occlusion behavior.
- **Troops and residents occupied the same space.** They previously ran separate crowd passes. The main kingdom now runs one shared pass, with the existing obstacle checks and deterministic lateral yielding. Direct combat fixtures and expeditions retain their independent troop crowd pass. This improves mixed traffic without making a rigid physical collision guarantee.
- **Quarantined soldiers converged on three positions.** Isolated troops now reserve distinct open refuge positions, using a completed refuge or the Hearth. Their squad identities and prior orders remain saved.
- **Disease warnings overstated available time.** Warnings previously used only the 75-second disease-age deadline. The current estimate considers impending critical illness and HP loss as well. A six-HP patient at age 60 has about three seconds remaining, or twelve under quarantine. Future damage and healing can change that estimate. Treatment prioritizes the earliest current-health deadline, rather than age alone.
- **Outbreaks were hard to locate.** Case and tainted-remains buttons focus the camera. Infection and remains appear on the minimap. Sick residents are prioritized within the 64-person render sample. Stage colors, an isolation marker, persistent prone bodies, countdown arcs and stirring near reanimation communicate state. Treatment and cleanse costs/rules are retained.
- **Large route sets repeatedly evicted one another.** Two hundred separate destinations exceed the former 128-field cache. The bounded limit is now 256 fields, roughly two MiB of typed navigation arrays at full occupancy. A regression verifies that 200 repeated destinations stay warm. Topology changes still invalidate the cache and saves contain no cached navigation data.
- **Squad recall and touch targeting took too much scrolling.** A desktop sticky command deck and quick squad buttons provide access above the roster. On phones the deck scrolls normally so it cannot cover the roster or recruitment controls. Keys 1–9 recall squads; double-clicking a squad centers it. Visible character bodies are clickable, with screen-pixel touch margins that remain usable at small zoom. Touch targeting temporarily expands the map, and real two-touch pinch gestures zoom without accidentally issuing orders. Switching panels or choosing another selection clears unfinished targeting modes. The +/− camera controls remain available.
- **Army growth hid impending food depletion.** The army panel now shows net food production and an approximate reserve horizon when food is falling. Recruitment, settler invitations, capacity and upkeep retain their real costs; no free soldiers were introduced.

Walking uses four inexpensive baked poses instead of two. Original weapon poses gain restrained movement, attack lean and damage recoil; zombies use a hunched pose and distinct follow-through. There are no downloaded sprites or per-frame canvas texture generation.

## Verification methodology

Simulation regressions cover the original rules plus health-based treatment, exact ration casualties/reanimation, separate isolation goals, mixed resident/soldier separation, 200 warm navigation destinations and visible-body picking. Browser checks run in actual local Chromium with DOM controls and canvas/touch input. They are automated playtests, with no external human feedback claimed.

Scale sessions begin with explicitly prepared 10/50/100/200-soldier forces, buildings and supplies. Each uses three sixty-second live windows at 2× speed, independent five-person gate defense, external hunters and a patrol where army size permits. Natural night waves and seeded attackers use normal combat. Seeded outbreaks progress normally; one explicit terminal-case fixture per army size guarantees coverage of a timed death and single reanimation across a save cycle. At each pause, census/identity accounting is checked, saved state is reloaded, and units, people, infection, remains, squads, resources, jobs and stats must match. A real paid recruit is checked for census and supply consumption.

Frame intervals use requestAnimationFrame samples. Visual poses update near 30 Hz, simulation at 10 Hz; the measured display intervals do not promise that many unique animation poses. Windows include UI actions, natural waves and quiet periods as well as fighting. Post-GC memory uses Chromium's JavaScript heap and excludes GPU memory. Reloads between windows test storage and scene lifecycle; this is not an uninterrupted multi-hour leak test. Initial army size is disclosed; casualties change the force during play.

The separate earned-growth diagnostic starts a normal kingdom and uses legal commands for construction, work, paid recruitment, expansion, medicine and continued watch. It advances the pure simulation and records whatever outcome occurs. It is not browser play or human balance feedback. Its prepared scale tests must not be represented as naturally earned 200-soldier campaigns.

Final verification: **144 automated tests across nine files passed**, plus **39 distinct real Chromium browser scenarios** (32 existing, three control/outbreak/touch scenarios and four sustained scale sessions). The final coordinate-only Escort fix was followed by a rerun of all three affected control scenarios and all four production offline checks; all passed. Broad suites and sustained scale sessions passed earlier in this same milestone. Scale sessions precede the final tab-cancel/mobile-scroll polish and Escort correction; their simulation and rendering paths were unchanged by those final edits. The detailed run scope and measured results are recorded in `evidence/sustain-verification.json`.

The full original chapter browser campaign won after **558.6 simulated seconds / 303 wall seconds**: five nights, four territories, 115 infected slain, eight total casualties, six cures, 25 villagers and seven soldiers remaining, with the Hearth at 1,500 HP and zero JavaScript errors. It used normal controls without granting supplies or skipping time. Timing and losses vary with the automated decision policy; this is not a controlled comparison of human difficulty with the prior milestone.

### Sustained measurements

Each scale test passed its three live windows, three exact save/reload comparisons and paid recruitment checks. They accumulated **720.2 active wall seconds / 1,441.2 simulated seconds** across the four sessions, excluding pauses and setup. The 200-soldier sample peaked at 262 live units during measurement. All four reported zero JavaScript errors. Casualties below include residents and soldiers; initial forces are not maintained artificially after death.

| Initial soldiers | Simulated seconds | Frame interval p95 across windows | Worst interval | Highest runtime tick p95 | Post-GC JS heap range | Final soldiers | Total casualties |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 360.4 | 16.8–25.1 ms | 75.1 ms | 1.5 ms | 8.07–9.81 MiB | 9 | 2 |
| 50 | 360.3 | 16.6–16.9 ms | 109.2 ms | 1.7 ms | 8.31–9.56 MiB | 49 | 2 |
| 100 | 359.9 | 16.8–16.9 ms | 266.5 ms | 2.0 ms | 8.86–10.62 MiB | 97 | 4 |
| 200 | 360.6 | 16.9–24.9 ms | 133.3 ms | 2.9 ms | 9.28–9.80 MiB | 170 | 31 |

These timings include real combat, night waves, management actions and quieter periods. The force loses members, especially in the 200-soldier outbreak, so the later windows are not constant-200 benchmarks. Runtime tick samples include frames without a fixed simulation step. The first three minutes do not establish multi-hour stability. Occasional large frame spikes remain, with the cause not isolated: the 100-soldier run's maximum runtime tick was 15.4 ms, much smaller than its worst overall display interval. Further main-thread/render/host profiling is needed; the evidence does not justify attributing the spike to one subsystem or claiming hitch-free play.

The desktop Hold test applied an order to 198 available soldiers approximately **12.1 ms after the click handler began**, including 10.4 ms in command application and synchronous UI refresh. This is one sample, not a latency distribution. The scale files also record automation wall time for two button/map actions; those values include Playwright waits and scrolling and are not game input latency.

Evidence: `evidence/sustain-{10,50,100,200}.json`, `evidence/sustain-selection.json`, `evidence/sustain-polished-200.png`, `evidence/sustain-outbreak.png` and `evidence/sustain-touch.png`.

### Earned growth and build cost

The corrected legal-command diagnostic won Chapter I at 557.3 simulated seconds, continued the watch and reached 50 soldiers at 1,140 seconds. Over 1,800 game seconds it peaked at **96 soldiers** and finished with 93 soldiers, 39 villagers, 31 buildings, 200 capacity, +2.42 food/second, 883 infected slain, 40 total casualties, 36 cures and 16 nights survived. Five validated decode/reload checkpoints preserved progress. It did not earn 100 or 200 soldiers. This supports continued progression under one scripted policy; its deliberate reserve thresholds, construction choices and repeated commands are not evidence that people find growth enjoyable. An earlier policy stalled attempting specialists before unlocking level-two training; the corrected policy pays for that prerequisite. Evidence: `evidence/sustain-earned-growth.json`.

TypeScript and the production/offline build passed. The final distribution is **1,401,969 raw bytes / 397,561 individually gzipped bytes**, 2,913 gzip bytes (0.74%) above the prior 394,648-byte milestone. Cache: `kingnamic-5d6128472aeb`. The existing Phaser chunk-size advisory remains. Evidence: `evidence/sustain-build-size.json`.

## Remaining priorities

1. Human difficulty testing and an uninterrupted browser campaign that earns a large army. The diagnostic reached 96; earned 100–200 progression remains unverified. Review casualty/reinfection pressure and the number of settler/recruitment actions before tuning costs or wave rules from one policy.
2. Dense mixed-role traffic and visual geography. The existing small valley remains crowded at 200 soldiers. Soft separation, bounded ranged evasion and terrain routes do not constitute predictive tactical planning or rigid collision physics.
3. Physical mobile, Safari/Firefox and lower-end hardware. Touch input is exercised in Chromium emulation, rather than on a phone GPU.
4. Occasional display hitches, multi-hour memory and storage pressure. Minute-scale windows and reloads do not cover hours of continuous play or the maximum legacy resident census. Isolate the measured large frame spikes with a longer browser trace before selecting a fix.
5. Formation spacing still comes from issued group destinations; changing the formation stance alone primarily changes armor/range. A clearer re-form action would be more valuable than more orders or missions.
