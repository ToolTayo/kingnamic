# Hearth renewal: economy, controls and solid defenses

Local milestone begun 5 October 2026, with verification continued on 6 October. This is the first cohesive delivery from `HEARTH_RENEWAL_PLAN.md`. The controllable commander and connected exploration region remain planned; this build does not claim those features.

## Implemented behavior

**Timber and Crowns are the purchase economy.** Cottages, crofts, woodcutters' lodges, trading posts, refuges, palisades and gates cost only Timber. Repair costs only Timber. Garrisons, towers and upgrades use Timber/Crowns; soldier equipment and settler invitations use Crowns. Provisions still sustain people and armies, and herbs still treat the plague. They appear in management contexts and low-supply/outbreak conditions rather than blocking ordinary construction.

The old stone slot is now the sole Crown ledger, exchanged one-for-one without adding or rounding a second balance. Legacy Stoneworks and miners become trading posts and traders with the same IDs, levels and assignments. The original version-two save key and backup behavior remain. An explicit economy revision and resume notice explain the change. Repeated decode/save cycles preserve wealth. Legacy balances slightly above the soft production cap are not truncated by the next economy step.

Traders retain the existing production rate (0.22 Crowns per worker-second, with Greybank's 40% bonus). Recruitment costs 20/25/22/24 Crowns for wardens/rangers/spearmen/scouts. Five settlers cost 20 Crowns with the existing housing, daylight and cooldown requirements. Crown income is not an excuse to grant a free army: census, capacity, fit residents, equipment and provisions remain real constraints.

Defense kills pay 1/2/3 Crowns for Hollow/runners/brutes only after allied combat damage, with a persisted 40-Crown daily cap reset at dawn. Reanimated people and expedition enemies pay no bounty. One-time milestones award 20 Timber and 15 Crowns. New expeditions reserve 20 Crowns per possible recruit, refunding only unused equipment; a successfully enlisted survivor earns a 3-Crown commendation within the finite four-person battalion ledger. Active legacy expeditions settle their original provisions/Timber reservation, without retroactive charges or Crown refunds. The pack of 30 provisions and four herbs is still spent on departure.

**The store is a compact catalog.** Homes, Work and Defenses show concise cards with procedural thumbnails, named prices, visible shortfalls, a Place action and optional details. The separate Village view contains the building list. Basic palisades remain purchasable at zero Crowns. Army management is split into Orders, Recruit, Squads and Roster; selection persists across views, and map/squad selection returns to Orders. Recruitment explains missing residents, capacity, equipment and specialist prerequisites. Roster pagination is twelve soldiers per page. Touch controls retain 44-pixel targets.

**Closed gates now block infected crowd motion.** A focused regression first demonstrated an infected front unit being pushed from y=18.64 to y=18.495 inside an intact gate at y=18 without damage. The crowd pass incorrectly excluded gates for every allegiance. Combat movement and crowd corrections now use an allegiance-aware swept footprint check. Paths may include a costly siege target, but physical movement stops at the defense while infected attack it. Friendly passage remains allowed through gates. Destroyed structures cease blocking, navigation invalidates and attackers enter the breach. Closed gate art now shows a timber leaf; straight north/south barrier runs orient to their neighbors. Trading posts have original procedural stall art.

The existing infection contract remains: living hosts incubate and become symptomatic, then may die from damage/illness; eligible dead bodies wait eight seconds before one hostile reanimation. This pass did not replace that simulation or invent a living-to-zombie transformation.

## Verification

Completed measurements and run scope are collected in `evidence/renewal-verification.json`. Historical reports are not evidence that the current build passed their tests. A browser scenario means automated play in actual Chromium, not human feedback.

Focused browser scenarios have verified a zero-stone legacy save purchasing a palisade and reloading exact balances, an actual gate siege with damage/reload/breach, and fresh mobile-emulated catalog/recruitment/squad controls. The old kingdom browser suite initially missed the new Work category in one test; that harness navigation was corrected and the failed scenario passed on rerun. No engine behavior was bypassed to pass it.

The ridge expedition completed with all three patrol soldiers and four allied recruits alive. Its first post-return test then left recovery unattended and lost the army; its old “no injuries remain” assertion could also accept a dead roster. The corrected playtest builds and staffs a refuge, responds to infection with treatment/quarantine, requires living recovered specialists, and observes a specialist attacking at home. That rerun passed with nine soldiers. This supports recoverability with medical management, not safe unattended recovery or a human difficulty judgment. Evidence: `evidence/battalion-browser.json`.

The first tactical rerun exposed duplicate formation controls in the expedition and embedded army panels. The army panel now leaves the expedition's existing formation controls in place instead of rendering another copy. The mission playtest explicitly requires a single formation button; the full four-scenario tactical rerun passed.

The complete fresh Chromium chapter passed in **561.6 game seconds / 304 wall seconds**: five nights, all four territories, 116 infected slain, eight casualties, three cures, 23 villagers and seven soldiers remaining, and a 2,000-HP Hearth. Eight new buildings were completed. The test used actual UI actions without resource grants or time jumps; zero JavaScript errors were recorded. Evidence: `evidence/renewal-campaign.json`.

The 30-minute earned-growth diagnostic uses legal commands from a new kingdom, in pure simulation. The original policy kept only three traders and was Crown-limited, peaking at 51 soldiers. A policy that expands Crown production to eight traders peaked at 96, first reached 50 at 1,047 game seconds, and finished with 95 soldiers. This demonstrates a strategic production tradeoff under a scripted policy; it does not establish human enjoyment, optimum balance, or earned 100–200 browser progression.

## Final results — 6 October 2026

- **154/154 automated tests, ten files, passed** on final source. Production TypeScript and Vite build passed. The existing Phaser bundle-size advisory remains.
- **42 distinct gameplay browser scenarios passed, plus one timing diagnostic**: kingdom 11, fresh campaign 1, expeditions 4, tactics 4, legions 8, sustained 7, production offline 4, renewal 3. Reruns do not increase the count. These are automated Chromium scenarios, not human playtests.
- Final production offline checks covered individual plague/corpses/squads, ordinary saves without network, upgrade from a stale cached build with a legacy save, and expedition withdrawal without duplicate recruitment. The three final renewal checks covered zero-Crown construction/migration, actual siege/reload/breach, and touch shop/recruitment/squad controls.
- Complete source/build/run details and failed attempts are retained in the verification JSON. The kingdom/campaign broad checks preceded final small UI corrections; affected expedition, army, mobile, offline and siege checks were repeated after those corrections.

### Sustained performance

Each row is a prepared army with real casualties, three active minutes at 2× speed and three save/reload cycles. Five guards retain separate orders while other soldiers hunt/patrol. Outbreaks, quarantine/treatment, a guaranteed terminal infection, delayed reanimation, a paid recruit, identity uniqueness and population accounting are checked. None of these prepared armies is presented as earned campaign progression.

| Starting soldiers | Final soldiers | Window p95 frame range (ms) | Worst frame (ms) | Highest window p95 simulation tick (ms) |
|---:|---:|---:|---:|---:|
| 10 | 9 | 8.5–8.6 | 1291.7 | 0.8 |
| 50 | 49 | 8.6–8.7 | 142.0 | 1.1 |
| 100 | 98 | 16.7–16.8 | 33.3 | 1.8 |
| 200 | 169 | 16.8–16.9 | 308.4 | 3.4 |

The 100-soldier run had no recorded long tasks and a 33.3 ms worst frame. At 200, the first window peaked at 262 total units; 32 casualties and one paid recruit left 169 soldiers. All twelve reload checkpoints preserved units, residents, cases, corpses, squads, resources, jobs and statistics exactly. No JavaScript errors were recorded in the four sustained sessions.

The 10-soldier run included a **1.29-second stall**, and the 200-soldier run included a **308 ms frame gap**. Neither is hidden by the p95 values. The latter had no corresponding recorded long task. A separate 30-second-per-scale diagnostic correctly instrumented Phaser's cached scene callback: at 100/200 soldiers, inclusive scene-update p95 was 3.5/5.4 ms and autosave maximum was 4.5/3.5 ms. It did not reproduce the long stalls, so their cause remains unresolved. The earlier attempted scene.update wrapper had no samples and is not counted as a measurement; its hook is corrected for future runs.

These are requestAnimationFrame intervals; procedural pose updates are capped near 30 Hz. Measurements used Windows, a Ryzen 5 PRO 3350G (eight logical processors), Vega 11 graphics and Chromium 151.0.7922.34. The production smoke check reported ANGLE/Vega 11 through Direct3D11 (WebGL) and HTTP 200; the development inspector was absent. They are not physical-phone, Safari/Firefox or low-end hardware validation.

Post-GC JavaScript heap across the sustained checkpoints was about **8.5–10.8 MiB**. Four repeated 100-soldier world replacements retained about 9.7–10.8 MiB after explicit GC, with sprite counts tracking current units. This bounds observed retention in these sessions; it excludes GPU memory and does not establish indefinite leak freedom. The 198-available-soldier Hold command applied in **9.1 ms from DOM click dispatch** (8.4 ms command application); automated pointer travel/waits are not player input latency.

### Download and local delivery

The complete production output is **1,409,071 bytes raw / 399,713 bytes individually gzipped** (390.3 KiB gzip), including HTML, JS, CSS, crest, worker and license notice. This is 2,152 bytes / 0.54% above the previous recorded 397,561-byte total. No dependencies or downloaded art were added. Offline cache: `kingnamic-1d82081c2058`. Production preview: `http://127.0.0.1:4186/`. Final production screenshot: `evidence/renewal-production.png`.

## Remaining priorities

1. Complete one commander control/combat loop and one connected exploration region. Existing territory purchase/claim rules and the fixed valley remain; there is no new automatic region discovery or continuous RPG world in this milestone.
2. Human opening and growth feedback. Crowns unify spending, so recruitment competes directly with equipment, towers and expansion. The legal diagnostic is not enough to decide that these tradeoffs feel good to people.
3. Dense 200-soldier geography, sustained hitch attribution and lower-end hardware. Soft separation still permits small body overlaps; the guarantee is against moving through solid barriers, not rigid-body physics or perfect formations.
4. Physical mobile and other browsers. Chromium touch emulation does not verify a phone GPU or Safari/Firefox.
5. Clearer formation reforming, saved tactical deployment layouts, and save export/import before a much larger world. None should silently change existing individual orders.

No dependencies, external art downloads, paid services, push, deployment or publication were introduced. Existing history and player-origin saves were preserved.
