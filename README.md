# KINGNAMIC — The Last Hearth

A playable, original medieval survival strategy game. Build Hearthmere, defend it against the Hollowing, and reclaim the Ashen Vale. The first chapter lasts about nine minutes of game time.

## Play locally

Requires Node.js 20.19+ or 22.12+ (developed and tested with Node 24).

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The development server is loopback-only.

For the production build and offline support:

```powershell
npm run build
npm run preview -- --port 4186 --strictPort
```

Open **http://127.0.0.1:4186**. Visit once while online so the service worker can cache the game, then it can reload offline. Run through HTTP; opening `dist/index.html` directly as a file is unsupported. Saves stay in this browser on this origin; the development and preview ports have separate saves. The game does not advance while hidden or closed.

## Your first chapter

1. Open **Build → Work** and place a **Trading post**. In **People**, assign three traders once it finishes. Basic buildings and palisades need only Timber.
2. In **Army → Recruit**, equip two more soldiers with Crowns. Wardens hold ground; rangers fire from behind them. The starting troops and watchtower cover the southern crossing.
3. Build a **Herbalist’s refuge**, assign a healer, and treat the sick after the first dawn. Quarantine buys time at a production cost.
4. Add watchtowers toward the west, north, and east. Reclaim **Pinewatch → Greybank → Saintless Fen** during peaceful daylight. Each march improves production and opens a new invasion route.
5. Upgrade your towers and Hearth, repair between attacks, and maintain food production. Survive five nights and clear the remaining infected with all four banners held to win.

Crowns are earned by traders, one-time objectives and combat bounties (1 per Hollow, 2 per runner, 3 per brute, without a daily cutoff). The first defeat of each expedition encounter slot pays into the kingdom immediately; repeat visits and reanimated people do not pay again. Rewards are shown over the battlefield, in the Crown banner and in the chronicle. Successful battalion enlistment returns a 3-Crown commendation per recruited survivor, within its finite four-person roster.

Legacy stone converts one-for-one to Crowns in the existing save ledger; balances are never added together or credited again on reload. Stoneworks and miners become trading posts and traders with levels, assignments and identities preserved. Active older expeditions retain their original equipment reservation and refund terms.

The initial supplies can support several different openings. Building, recruitment and treatment are allowed while paused so decisions can be deliberate.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Pan | Drag, WASD, or arrow keys | Drag the map |
| Zoom | Wheel zooms toward pointer; +/− buttons | Pinch or +/− buttons |
| Inspect | Click a building, troop or territory | Tap |
| Build | Choose a card, then a tile | Choose a card, tap a tile to preview, then Build here |
| Select troops | Click; Shift-click / Shift-drag; Ctrl+A | Tap with Multi-select or roster checkboxes |
| Give orders | Army command buttons, then a map target | Same buttons, then tap a target |
| Recall squad | Quick squad buttons or keys 1–9; double-click to center | Quick squad buttons |
| Move selected troops | Right-click or R, then click; no selection rallies the army | Army → Set rally point, then tap |
| Pause | Space or footer control | Footer control |
| Speed | 1× / 2× | 1× / 2× |
| Center camera | H or crosshair button | Crosshair button |
| Cancel placement | Escape or Cancel | Cancel |
| Guide / reset | ? or Field guide | Field guide |

## Implemented slice

- One isometric valley with a settlement and three connected, reclaimable territories.
- Population, five worker assignments, two primary purchase resources (Timber and Crowns), contextual provisions and medicine, housing, construction, repairs and three building levels.
- Ten building types including the Hearth, crofts, cottages, workplaces, garrison, infirmary, towers, palisades and allied-passable gates.
- Wardens, rangers, spearmen and scouts; persistent squads; nine independent orders; formations, terrain effects, destructible defenses and cached reverse navigation fields.
- Day/night lighting, scaling waves, three infected enemy types, combat, casualties and defeat/victory.
- Individual civilian and military health; environmental, supplies, contact and bite exposure; incubation, symptoms, quarantine, treatment, casualties and delayed reanimation.
- Onboarding, milestones, chronological event log, minimap, pause, speed controls, optional procedural sound and responsive desktop/phone interface.
- Validated versioned saves, backup recovery, reset confirmation and production offline caching.

Residents now have saved identities, health, exposure, work assignments and routes. Movement runs in the fixed-step simulation; rendering observes up to 64 of the same people. Infection removes actual residents from available labor; death removes them from the census. Production remains an efficient rate calculation over staffed jobs; builders still contribute finite effort to individual sites. Deliveries are visual feedback, not extra production transactions. Missing individual records in legacy saves migrate once without changing population, resources, troops or campaign progress.

The chapter includes one complete Lost Battalions expedition: The Broken Standard. Open Army → Lost Battalions, choose three fit soldiers from an army of at least five, and choose the ridge or ford approach. Pack 30 food and four herbs, plus reserve 20 Crowns per possible recruit; unused equipment is refunded. Find stranded swordsmen, archers, a spearman and a scout; earn their trust through shared supplies and two cooperative battles, then escort survivors to extraction. Three deterministic enemy mixes and staggered fronts vary the fighting. Recruits join the permanent army, casualties and stranded wounds persist, and returning troops need rest. The finite four-member roster cannot be farmed for unlimited soldiers.

Rally commands take priority over enemy pursuit, and reserve separate troop positions. Rangers hold their assigned ground. Idle guards fall back to defend the Hearth when attackers breach the settlement. Melee cannot pass through occupied building footprints.

## Armies and the Hollowing

Select soldiers individually or as a named squad. Move, Attack, Hunt, Defend, Patrol, Hold, Retreat, Regroup and Escort affect only those soldiers. Use Army → Orders, Recruit, Squads or Roster to reach the relevant controls directly. Name a subset to split a squad; assign selected members to another to merge. Hunt searches within 12 tiles of its assigned destination. Patrol travels between its starting position and destination. Hold never pursues. A Warden on guard duty is the kingdom's armored guard role.

Select available skips recovering and quarantined troops. Recalling a squad includes every living member for inspection and treatment; orders apply to its available members and report those excluded. Other members retain their assignments. Visible character bodies can be tapped at small zoom. Touch targeting temporarily expands the map; pinch and drag gestures do not issue an order. Large selections use quieter ground markers and group destination summaries. Case and tainted-remains buttons in People focus the camera, and outbreak markers appear on the minimap. Death-risk estimates use current HP as well as illness age; further wounds or healing can change them. Treatment prioritizes urgent cases.

Build and upgrade garrisons for capacity. Specialists unlock at garrison level 2 or after Lost Battalion recruitment. Recruit in groups of one or five, paying equipment costs and consuming healthy, unassigned residents. Each soldier consumes 0.04 food per second; an army without rations loses health. Invite five settlers for 20 Crowns when five beds are free, or return fit soldiers to civilian work without an equipment refund. After the original victory, Continue the watch enables further growth with disclosed waves scaled to army size.

Exposure accumulates from bites, tainted ground, contaminated croft supplies and nearby symptomatic people. At 100%, it becomes infection. Incubation lasts 18 seconds; critical illness begins at 55 and becomes fatal by 75 seconds of disease progression. Wounded people can die earlier from critical HP loss. Quarantine stops contact spread, slows illness by 75%, isolates infected soldiers and reduces production by 20%. Treatment cures up to three people for 5 herbs and 8 food, with 35 seconds of immunity. A staffed refuge also treats cases. In expeditions, one packed herb treats the most urgent case; sharing the three-herb relief pack cures up to three allied cases.

Tainted deaths leave visible remains with an eight-second countdown before one hostile reanimation. Cleansing removes 70 ground contamination, clears supply contamination and renders current remains safe. Clean deaths stay dead. Casualties leave the active census and army immediately; save validation rejects duplicate living/dead identities. Returned expedition veterans retain identity and infection as well as their recovery timers. Home time is held during the authored three-person expedition; independent squads operate simultaneously on the main kingdom map.

## Commander and connected settlements

Open **Empire**, appoint an existing soldier and select a company in **Army → Roster**. **Gather at road** gives every soldier a separate physical gathering position. Travel requires a fit commander at the south road, a gathered healthy company and no nearby threats. Unselected troops stay at their posts.

In **Briar March**, discover three landmarks by proximity, defeat their infected pockets and found an outpost near the commander for 80 Timber + 40 Crowns. Bring two fit soldiers and leave two healthy idle residents at home: those actual residents become your builders. First founding recovers 60 Timber + 20 Crowns once. Build freely on valid open terrain, keep doorways connected through gates, staff the settlement and leave defenders when returning home. Eight-second warnings precede eastern incursions.

**Lead personally** uses WASD/arrows, F toward the cursor, 1–3 for sword/spear/bow and click-to-walk. Touch has direction and Strike buttons. Escape or Return to tactics restores squad control. Weapon changes never heal. A dead commander remains dead; appoint a survivor. If the entire company falls, Return to the home watch resumes the existing kingdom without resurrecting anyone.

Both settlements share supplies, army capacity and squad names. Inactive workers produce and all people consume provisions; starvation still costs lives. Inactive combat, disease, recovery and construction are held and resume from their exact state on return. Only one region is fully simulated and rendered. Legacy v2 saves gain the new optional fields when used; existing progress remains compatible.

## Rearrange buildings and defenses

Select a building on the map or in Build → Village, then **Edit / Move building**. Drag or tap a destination and use **Confirm move**. **Cancel** or Escape leaves the original in place. Moving costs nothing and preserves identity, health, upgrades, construction effort and worker assignments. Current attacks must be cleared first. Occupied footprints, unowned ground, blocked roads and layouts that trap people or workplaces are rejected. Buildings continue operating at their original site until confirmation.

**Rotate** or **R** selects either real isometric grid axis for palisades and gates. Walls automatically join adjacent compatible segments, including corners and junctions. Gates admit allies across their opening and remain solid to infected until destroyed. Build stepped, edge-connected runs for diagonals; arbitrary-angle and corner-only barriers are unsupported. Every segment retains a full occupied grid cell.

## Architecture

`src/game` is a pure fixed-step TypeScript simulation. A seeded random generator and serializable state make runs reproducible. Commands validate and apply player actions. Map/config, economy, navigation, combat, infection/progression, and persistence have separate responsibilities.

`src/render` contains original procedural art and the Phaser scene. Terrain, depth-sorted scenery, buildings and character poses use cached procedural textures. Foreground trees and roofs fade when they obscure actors. Spatial-grid separation reduces crowd overlap. Rendered workers and combat effects are bounded. `src/ui` provides DOM controls, accessible button labels, responsive panels and native modal dialogs. No game rules depend on a renderer or DOM. The expedition is a separate bounded battlefield inside the existing version-2 save, using the same combat, navigation, formations, art and renderer. Only one battlefield advances at a time; home time is held. The finite battalion ledger prevents repeated recruitment, while explicit patrol selection accepts recovered specialists for later missions.

Limits: 150 buildings, 200 soldiers plus 200 hostile units, 20 named squads, 1,000 saved residents (legacy census limit), 64 rendered civilian actors, 100 short-lived effects and 35 log entries. Each garrison level supports 24 soldiers, capped at 200. Civilian route requests are limited to two per simulation step; reverse navigation fields share work across destinations and retain at most 256 fields per world. Simulation advances at 10 Hz; visual updates are capped near 30 Hz within a 60 Hz renderer. Hidden tabs do not accumulate catch-up time.

## Verification

```powershell
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:offline
npm run test:campaign
npm run test:expedition
npm run test:legions
npm run test:sustain
npm run test:renewal
npm run test:empire
npm run test:correctness
```

The campaign test takes roughly five minutes at 2×, plus decision and test-host overhead. It uses actual buttons and canvas clicks, reading the development inspector only to choose actions. It never grants resources or skips simulation time. The inspector is excluded from the production bundle. Run browser suites serially to avoid competing renderers distorting timings. `npm run test:tactics` covers guided onboarding, the river route, an active legacy expedition, and combat defeat/rebuilding.

If Chromium is already installed elsewhere, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path before browser tests. UI, offline, and campaign runs have distinct artifact directories. Offline tests use port 4187 (override with `OFFLINE_TEST_PORT`) so the playable preview on 4186 remains available.

The sustained suite includes three minutes of live browser play at each of 10, 50, 100 and 200 initial soldiers, with independent orders, outbreaks, recruitment and reloads. These forces and supplies are explicit scale fixtures. The earned-growth diagnostic in the unit suite starts a normal kingdom and advances the pure simulation with legal commands; it is distinct from browser play and human difficulty feedback.

See the latest [gameplay correctness review](docs/CORRECTNESS_REVIEW.md), [Empire expansion review](docs/EMPIRE_REVIEW.md), [Hearth renewal review](docs/HEARTH_RENEWAL_REVIEW.md), [sustained battlefield review](docs/SUSTAINED_REVIEW.md), [army and plague verification](docs/LEGIONS_REVIEW.md), [tactics and replayability review](docs/TACTICS_REVIEW.md), [original Lost Battalions milestone](docs/LOST_BATTALIONS.md), [play-experience review](docs/EXPERIENCE.md), [previous studio review](docs/REVIEW.md), [first milestone verification](docs/QA.md), [design and risks](docs/DESIGN.md), and [asset provenance](docs/ASSETS.md).

## Next priorities

1. Attribute remaining intermittent frame stalls and validate repeated travel on modest physical hardware. The commander and first connected region are now playable.
2. Playtest difficulty with new players; tune incoming fronts, healing demand, and instruction timing.
3. Test on physical low-end Android hardware, Safari and Firefox; add keyboard-only world placement and assess pinch zoom.
4. Broaden opposing-traffic and mixed civilian/soldier congestion tests; improve directional poses and decoration on expanded land.
5. Review patrol/formation behavior and player-facing difficulty before extending the feature set.
6. Add save export/import and stronger long-campaign migration fixtures before extending progression.

No backend, accounts, paid services, tracking, ads, deployment or monetization. No external art or font downloads. Branding remains provisional.
