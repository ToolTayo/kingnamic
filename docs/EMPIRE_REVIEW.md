# Empire expansion: Briar March

Local development and verification, 6 October 2026. This milestone integrates the previously unfinished commander and connected exploration prerequisites into the existing game. The verification below distinguishes normal resource-earned play, prepared combat fixtures and automated checks from human feedback.

## Playable loop

Open **Empire**, appoint an existing fit soldier, choose the travelling company in **Army → Roster**, and **Gather at road**. Soldiers physically walk to separate gathering positions. The commander must reach the southern road; every chosen soldier must be healthy and gathered, with no nearby attackers or pending reinforcements. Travel pauses on arrival and moves existing bodies, never copies or grants troops. Unselected defenders retain their positions and independent orders.

**Lead personally** enables WASD/arrows, F toward the cursor, 1–3 weapons, click-to-walk and touch direction/Strike controls. Escape or Return to tactics restores squad/camera control. Sword, spear and bow have different reach, damage and cooldowns. Switching weapons does not heal. Original health, exposure, infection, collision, casualties and reanimation remain authoritative. Credited kills improve personal attack damage every six kills, capped at five improvements; reanimated people give no experience. A dead commander remains dead; direct controls release automatically and a surviving soldier may be appointed. If the entire company is lost in the March, Return to the home watch resumes command of the existing home settlement. It transports no soldiers and preserves regional casualties, threats and buildings, so paid recruitment can rebuild the company.

Briar March is one deterministic connected region with plains, a river crossing, a timber grove, an abandoned village and an old watch. Initial infected defend local pockets instead of all charging the entrance. Proximity discovers three landmarks without a currency unlock. Clear the infected and tainted remains, bring two fit soldiers, and place an outpost near the commander for **80 Timber + 40 Crowns**. Two actual healthy idle residents move from home as the building crew. First founding recovers **60 Timber + 20 Crowns**, once only. Building after an outpost loss costs supplies again and does not repay the reward.

The existing catalog works in the secured March. Homes, crofts, work sites, garrisons, refuges, towers, palisades and gates use the same construction, staffing, recruiting and repair rules. Foundations reject water, dense forest, bedrock, occupied sites, nearby threats and the travel banners. A bounded connectivity check prevents enclosing any workplace without a passable doorway to the road; gates provide access through walls. Dense forest remains traversable and supports the visual identity of the grove, but cannot be built over.

After founding, an eight-second warning precedes bounded eastern incursions every 90 active regional seconds when no earlier hostiles remain. Threats make the outpost contested; losing its beacon requires securing and founding again. Defenders, buildings, damage, residents, illness, discoveries and incursions persist across travel and reloads. A player may leave troops here and return to the original kingdom.

## State and compatibility

There is one active fixed-size map and one inactive settlement snapshot. Only the active map performs combat, movement, disease and construction. The inactive place preserves encounters, illness, recovery and building progress. Its staffed production and all resident/soldier provision costs still enter the common treasury; starvation can kill there. These rules are explained in the Empire panel. This is intentionally not a fully simulated distant war.

The existing v2 save key, backup, legacy migrations, resource slots and offline service worker remain. The old stone slot still stores Crowns. Shared global IDs, troop capacity and squad names span both settlements. Validation rejects duplicate people and living/dead identities, mismatched treasuries, nested regions and invalid region metadata. Recruitment and Lost Battalion capacity reservations count distant soldiers. Lost Battalions continues from Hearthmere with its existing finite recruitment ledger, injuries and extraction rules.

A single active terrain texture replaces the previous one on travel. Navigation caches include the region. No dependency, downloaded art pack, streaming engine, account or new currency was added. No push, publication or deployment is part of this work.

## Verification and measurements

The final machine-readable index is [empire-verification.json](evidence/empire-verification.json). Automated browser play means actual Chromium running the game; it is not human feedback. Desktop and phone screenshots were also visually inspected.

- **179 / 179 automated tests passed**, including 25 new commander/region tests. TypeScript checking and the production build passed. Coverage includes 100/200-soldier physical convoy assembly, original legacy migrations, cross-region identity and treasury validation, Lost Battalion capacity reservations, construction access, one-time rewards and recovery after a complete company wipe.
- **15 new browser scenarios passed across focused runs:** the complete fresh journey; phone commander input; regional infection, quarantine and reanimation; sword and spear combat; warned incursions; commander death; phone building validation; company-wipe recovery; four army sizes; repeated region transitions; and separate hitch instrumentation.
- **30 existing browser scenarios passed** in the broad regression: kingdom 11, Lost Battalions 4, army/plague 8, economy/siege 3, tactics 4. This run preceded the final isolated recovery/save guards; those changed paths were checked by focused browser scenarios, the final full unit suite and production offline checks.
- **The original five-night campaign passed** in 301 wall seconds / 561.5 game seconds: all three territories reclaimed, 112 infected slain, 6 military casualties, 21 cures, 26 residents and 7 soldiers surviving, Hearth at 2,000 HP and no browser JavaScript errors. Every action used real controls and normal resources. See [campaign evidence](evidence/empire-campaign.json). Together with the runs below, this is **51 unique passing browser scenarios across runs**.
- **5 / 5 production offline scenarios passed** on the final build: connected settlements, plague/squads, saved kingdom, updating an older cached build and an active expedition. No development inspector was available in these production tests.

The fresh journey used actual controls and normal supplies, with no resource grants or time jumps. It recruited two soldiers, left two home guards, took three to Briar March, killed all eight initial enemies, treated one bite and kept all three travellers alive. It discovered all landmarks, founded at (16,19), completed and staffed a croft at (18,19), stationed two defenders, returned the commander home, reloaded and revisited. People, defender orders, building damage and the once-only reward persisted. Regional simulation time at completion was 91.1 seconds. See [journey evidence](evidence/empire-journey.json) and [outpost screenshot](evidence/empire-outpost.png).

The initial broad browser run incorrectly gave the five-night campaign a 180-second timeout. That attempt timed out and is not counted as a pass; the full retry passed using the original 900-second campaign configuration. The sword/spear checks initially inspected a brief animation after its lifetime; their assertions now use persistent commander damage credit. A later isolated sword run timed out while opening the start screen; its immediate isolated retry passed. These were recorded rather than discarded from the verification history.

### Measured performance

Prepared armies and supplies were used for scale measurement, not claimed as earned progression. Each size ran two live browser windows at 2x with an exact paused save/reload between them. Counts below are initial friendly soldiers; casualties remain real. The older three-minute-per-size suite was not rerun for this milestone.

| Soldiers | Measured real time | Worst window frame p95 | Worst frame | Maximum save | Post-GC JS heap range |
|---|---:|---:|---:|---:|---:|
| 10 | 2 x 15 s | 8.6 ms | 41.7 ms | 3.3 ms | 8.80-9.22 MB |
| 50 | 2 x 15 s | 16.7 ms | 158.3 ms | 5.3 ms | 9.55-10.46 MB |
| 100 | 2 x 30 s | 16.9 ms | 50.0 ms | 6.8 ms | 9.78-10.91 MB |
| 200 | 2 x 30 s | 17.0 ms | 275.0 ms | 6.7 ms | 10.33-11.11 MB |

The 200-soldier fixture started with 120 infected and advanced 119.6 game seconds across both windows. It ended with 170 soldiers, 30 recorded casualties, 156 slain enemies including later incursions/reanimation, and positive provisions. Distinct guard/hunt orders, disease and exact reload state were checked. Per-size evidence is in [10](evidence/empire-stress-10.json), [50](evidence/empire-stress-50.json), [100](evidence/empire-stress-100.json) and [200](evidence/empire-stress-200.json).

Eight actual travel-button transitions with 200 total soldiers preserved every soldier ID and kept exactly one active valley texture. The worst transition frame was 76.2 ms, scene callback 64.0 ms and save 6.2 ms. Post-GC JS heap was 8.63 MB initially, 10.20-11.08 MB after warm transitions and 10.67 MB at the end. See [transition evidence](evidence/empire-transitions.json). These are browser JS heap measurements after explicit GC and reload; they exclude GPU and total process memory and cannot establish that a long session is leak-free.

A separate 45-second, 200-soldier/120-infected instrumentation run measured UI p95 3.5 ms, simulation 2.7 ms, scene callback 5.5 ms, WebGL render 8.8 ms and save maximum 6.7 ms. Its frame p95 was 16.7 ms, maximum 66.2 ms, with no reported long tasks. Callback timings overlap and must not be added. Neither the 275 ms hitch nor the previously reported 1.29-second stall reproduced under this instrumentation, so their cause remains unresolved. See [attribution attempt](evidence/empire-hitch-attribution.json).

The final production output is **1,436,797 raw bytes / 408,412 summed per-file gzip bytes**, including the offline worker and notices. This is 8,699 gzip bytes above the recorded 399,713-byte previous renewal build (about 2.2%). No dependencies or external assets were added. Vite retains its large-JavaScript-chunk warning. See [build sizes](evidence/empire-build-size.json). The local [preview](http://127.0.0.1:4186/) serves byte-identical built JS/CSS and worker files: [preview verification](evidence/empire-preview.json).

## Remaining priorities

1. Reproduce and attribute intermittent long browser tasks. Dense-battle measurements did not reproduce the earlier 1.29-second stall, but occasional shorter stalls remain. Short runs on this machine cannot establish modest-device or all-day performance.
2. Conduct independent human difficulty and usability sessions, especially the commander aim and touch camera. Phone-sized Chromium emulation is not a physical mobile device.
3. Tune long-term two-settlement economics and the tradeoff between held distant threats and shared production. This delivery proves the complete first region loop, not a balanced unlimited empire campaign.
4. Improve landmark/ruin visual distinction and encounter variation before adding regions. The region reuses lightweight original art; there is no fog-of-war, transport logistics, offscreen combat or additional region chain.
