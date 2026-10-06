# Crown rewards and settlement editing

6 October 2026. Local gameplay correctness milestone. Completed locally: 204 automated tests and 57 distinct automated browser scenarios passed across the documented runs, including a fresh five-night campaign and production offline checks.

## Reproduced causes and reward rules

The previous combat resolver credited player soldiers and towers, but `awardBounty` silently stopped paying after 40 Crowns in a day and rejected every expedition world. There was also a 9,999-Crown credit ceiling. The existing regression explicitly expected only 40 Crowns from 50 actual kills, which reproduced the cutoff. Historical omitted payments are not reconstructed: old saves do not record an eligible-kill ledger with enemy types and sources.

Eligible kills now pay 1 Crown per Hollow, 2 per runner and 3 per brute through one death-resolution path. Commander sword/spear/bow, wardens, spearmen, rangers, scouts, squads, allied battalions and towers share it. Passive walls and gates do not deal damage. An infected but living soldier earns ordinary combat rewards. Reanimated dead do not pay, avoiding deliberate infection/death farming. Uncredited removals are not combat rewards.

Death removal and the reward are part of the same fixed simulation step. A settled marker makes even repeated settlement of that enemy idempotent. The live Crown balance, floating reward labels, feedback banner and chronicle show payment. The former daily cutoff is gone; the legacy field still loads but no longer limits rewards. Crown storage accepts up to one billion rather than silently truncating ordinary rewards at the old inventory ceiling.

Expedition rewards go directly into the kingdom treasury. Persistent scout and ambush-slot claims span attempts and routes; each slot can pay once, irrespective of the final attacker. A retreat or defeat keeps already earned Crowns but cannot renew those claims. The finite recruitment/equipment ledger remains separate. Existing active legacy encounters can settle once without changing their equipment contract. Natural kingdom waves and regional incursions remain eligible: survival time, troop equipment and upkeep provide their cost.

## Editing and barriers

Choose an existing building on the map or in Build → Village, including palisades and gates. Edit / Move opens a ghost preview. Drag with a mouse, or drag/tap with touch, then Confirm move. Cancel/Escape leaves the original untouched. The original continues working until confirmation; relocation mutates its coordinates/orientation, never creates a replacement or grants resources. Identity, level, current/max health, construction progress, production jobs and upgrades survive. Worker and soldier routes are invalidated after a successful edit.

Rearrangement is free during peace. Attacks and incoming warnings block it, preventing tower kiting and teleporting siege defenses. Occupied destinations, unowned terrain, water, forest, bedrock, travel exits, blocked road routes, inaccessible workplaces and trapped people are rejected. Occupants at the old site are not transported. Existing legacy layouts are not forcibly rebuilt: access validation preserves reachable routes and checks the moved building's new doorway.

Two actual grid orientations are supported. Rotate or R changes the rail direction of isolated palisades and the passage direction of gates. Adjacent walls automatically connect at shared edges, including elbows and junctions. The rendered occupied base matches the square collision tile. All orientations remain solid to infected until destruction; allied pathfinding and swept movement cross gates through the opening, not their side posts. Rotation invalidates navigation fields. New construction previews use the same directional gate access checks; an opening that would trap a soldier is rejected before charging supplies. Access results are cached by layout and candidate, while live occupancy is checked every time. Damage, repairs, destruction and saved orientation use the original building identity.

Arbitrary-angle and corner-only diagonal barriers are not supported. Use stepped runs of edge-connected grid cells for diagonal perimeters. Connected walls adapt their rail shape to their neighbors; manual orientation chiefly controls free-standing segments and gates. These constraints are explained in the field guide.

## Verification

Browser interactions are automated Chromium play, not independent human feedback. Prepared combat/settlement fixtures are separate from fresh campaign play. Exact completed checks are indexed in [correctness-verification.json](evidence/correctness-verification.json).

- **204 automated tests passed**, including 25 focused correctness tests. Existing legacy migrations, Lost Battalions, regional travel, disease, troop accounting and large-company assembly remain covered.
- **39 existing browser regressions passed**: kingdom UI and progression, mobile controls, commander combat, the complete fresh expansion journey, Lost Battalions victory/retreat/defeat and legacy contracts, independent squads, infection/reanimation, saves and closed-gate siege.
- **10 new browser scenarios passed** in one run: desktop moving/cancel/invalid placement, touch moving/rotation, stepped walls, a real rotated-gate siege and once-paid reward, visible reanimation exclusion, a 45-second profile and four army-scale scenarios. A final six-scenario gameplay rerun passed after the shared new-placement guard and toast input fix, adding one new gate-trapping scenario: **11 distinct new scenarios** in total. The original 39-scenario run and performance captures preceded those last two fixes; focused gameplay and production checks use the final build.

- **6 production offline scenarios passed** in 37.9 seconds. These cover saved settlements, squads and plague, an older service worker upgrade, active expedition extraction and two offline reloads preserving a rotated level-2 gate at 260/340 HP and its once-paid reward. The development inspector is absent from production.
- Production typecheck/build passed. The whole distribution is **1,448,719 bytes raw / 412,222 bytes individually gzipped**, 3,810 gzip bytes (0.93%) above the preceding Empire build. No dependencies or downloaded assets were added. The existing large-JavaScript-chunk warning remains. The preview at `http://127.0.0.1:4186/` serves byte-identical production assets and service worker; see [build measurements](evidence/correctness-build-size.json) and [preview hashes](evidence/correctness-preview.json).
- **Fresh five-night campaign passed** through actual buttons and canvas clicks, with normal resources and no time jumps: 558 simulation seconds / 299 real seconds, all three territories reclaimed, 111 infected slain, 3 military losses, 7 surviving soldiers, 27 villagers, 8 buildings constructed, 5 cures and a fully healthy upgraded Hearth at 2,000 HP. No JavaScript errors. [Campaign result](evidence/correctness-campaign.json) and [final screenshot](evidence/correctness-campaign.png).

That is **57 distinct passing browser scenarios across the documented runs**: 39 existing + 11 new + 6 offline + 1 fresh campaign. The six final focused gameplay checks overlap five of the original ten new scenarios; they are not added twice. Failed diagnostic attempts are recorded below and excluded from that total.

### Scale measurements

Prepared armies ran two live windows at 2x with an exact paused save/reload between windows. This is 30 real seconds total for 10/50 soldiers and 60 seconds for 100/200 soldiers, not an all-day soak or independent hardware qualification.

| Initial soldiers | Window duration | Worst frame p95 | Worst frame | Max save | Post-GC JS heap range |
|---|---:|---:|---:|---:|---:|
| 10 | 2 x 15 s | 8.5 ms | 25.0 ms | 2.2 ms | 8.78-9.48 MB |
| 50 | 2 x 15 s | 16.4 ms | 25.3 ms | 6.0 ms | 9.51-10.25 MB |
| 100 | 2 x 30 s | 16.8 ms | 41.9 ms | 5.3 ms | 10.32-10.94 MB |
| 200 | 2 x 30 s | 17.0 ms | 58.3 ms | 5.9 ms | 9.22-10.11 MB |

The 200-soldier fixture began with 120 infected and finished with 168 surviving units, 32 military losses and 156 infected slain including later reanimation/incursions. Defenders kept their independent hold orders, bodies and regional state survived reload, provisions stayed positive, and no JavaScript errors occurred. The 200-soldier run recorded one 52 ms long task in its second window. Evidence: [10](evidence/correctness-stress-10.json), [50](evidence/correctness-stress-50.json), [100](evidence/correctness-stress-100.json), [200](evidence/correctness-stress-200.json). Heap measurements follow explicit collection and include reloads; they exclude GPU and total process memory and are not a leak-free guarantee.

The separate [45-second profile](evidence/correctness-hitch-attribution.json) measured UI p95 3.3 ms, simulation callback 3.1 ms, full scene callback 5.6 ms, WebGL rendering 8.2 ms, frame p95 16.7 ms and worst frame 33.3 ms. It reported no long tasks; maximum save was 9.9 ms. Callback times include nested work and are not additive. Earlier 275 ms / 1.29 s hitches were not reproduced; they are not claimed fixed.

### Recovered failures and limitations

The first new browser run found that the Village list excluded walls and gates, making them hard to select on a phone. The list now includes them with coordinates. A wall-cost test assumed 10 Timber instead of the actual 8; the assertion now reads the catalog. A temporary compile error in reward feedback was repaired before further browser tests. The last review then reproduced a new-gate orientation access gap, now addressed through shared validation. Its browser retest exposed a real input defect: the status toast intercepted map clicks beneath it. Toasts now ignore pointer input, and the regression verifies that the canvas receives those clicks. Older fixture destinations with a resident or a soldier inside a tower were corrected to test real legal placement/attacks. The production rotation fixture likewise initially targeted an occupied gate; the disabled confirmation and reason were correct. Moving the prepared gate to clear ground allowed all six offline checks to pass without weakening occupancy validation. Failed attempts were not counted as passes.

The game supports two real grid orientations and stepped diagonal runs, not arbitrary angles. Gates are friendly-passable automatically, with no manual open/close state. Editing is deliberately unavailable while the current region is under attack. Older saved layouts are preserved, and validation prevents new edits from worsening connected access.

Priorities: physical low-end phone input/performance testing; independent human economy and difficulty feedback after removing the daily reward cap; longer empire sessions and device-specific hitch investigation. Richer diagonal geometry would require a deliberate navigation redesign. No new dependency, external asset, push, publication or deployment was introduced.
