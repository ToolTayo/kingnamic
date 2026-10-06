# KINGNAMIC: The Last Hearth

## First playable vision
A quiet, inhabited valley under a gathering threat. Rule Hearthmere, the last settlement whose beacon still burns. The plague, called the Hollowing, follows infected creatures and contaminated ground. Survive five nights and reclaim the three neighboring marches. A run is approximately 8–10 minutes at normal speed; pause and double speed are available.

The loop: assign scarce villagers → produce supplies → construct defenses and recruit → position troops → survive a night → heal and expand. Expansion rewards the player with production bonuses and survivors while opening additional invasion routes. Infection removes workers, untreated cases spread and may kill their host; eligible corpses later reanimate, and food/medicine can reverse a crisis.

## Architecture and alternatives
- Phaser 3 + TypeScript + Vite. Phaser supplies scalable rendering, cameras, input, and a local asset pipeline. Vanilla Canvas would save engine bytes but require rebuilding input/camera/lifecycle infrastructure; a 3D engine adds unnecessary cost.
- Pure fixed-step TypeScript simulation, seeded PRNG, serializable state and command boundary. Rendering never owns game rules. No physics engine: a bounded tile graph, local movement, and cooldown combat suffice.
- Independent map/config, economy, navigation, combat/plague, persistence, and world/UI modules. Lost Battalions uses a separate bounded battlefield in the same fixed-step simulation and save. The Broken Standard is the single authored mission; real survivors return as permanent soldiers. See LOST_BATTALIONS.md.
- Original code-generated isometric art. Cache static terrain and buildings; redraw lightweight unit overlays. No remote fonts, analytics, backend, or asset requests.
- Versioned local saves, bounded validation, a backup slot, and migration for the initial schema. Persist seeded random state, clocks, paths, waves, jobs, casualties, and construction; no real-time offline catch-up.

## Slice scope
One hand-authored valley and three connected territories: Pinewatch (timber), Greybank (Crown trade), and Saintless Fen (herbs). Buildings: hearth, cottages, farms, lumberyards, quarries, barracks, infirmaries, watchtowers, palisades, and gates. Infantry hold ground; archers need protection. A line formation improves infantry armor; a loose formation improves ranged reach. Gates admit allies but block enemies. Water funnels movement onto crossings; high ground benefits archers. Buildings can be repaired and upgraded.

## Milestones
1. Simulation, map, build/recruit commands, economy, and deterministic tests.
2. Integrated original isometric world, responsive command UI, selection and camera.
3. Waves, pathfinding, fortifications, plague, territories, objectives and persistence.
4. Browser playthroughs, stress/balance checks, mobile layout, production build and measured report.

## Risks and guardrails
- Visual density: restrained palette, visible selection, clear health and ownership, contextual panels.
- Pathfinding spikes: small fixed map, bounded entities, cached/repath intervals; avoid per-frame searches.
- Economy death spirals: initial reserves, transparent jobs/capacity, emergency food/medicine, actionable notifications.
- Save corruption: explicit shape/range checks, backup recovery, user-visible storage failures.
- Scope creep: no multiplayer, procedural campaign, backend, monetization, or a broad expedition campaign. The scope is one complete Lost Battalions mission.
- Device assumptions: browser measurements describe the actual test machine; low-end Android remains unverified.

## Acceptance

The Broken Standard now offers two approaches to the same mission: elevated ridge and narrow river crossing. Three disclosed, deterministic enemy compositions and staggered fronts vary the encounter without random rewards. New departures reserve 20 Crowns per possible recruit, refunding equipment for soldiers who do not enlist. A finite four-role ledger retains stranded wounds and casualties. Existing active expeditions retain their original route and paid costs. Capture is contested by nearby enemies and waits for every scheduled arrival; retreat cancels future arrivals but leaves living enemies in play. The kingdom clock still waits during expeditions. Current economy/defense milestone: HEARTH_RENEWAL_REVIEW.md. Earlier tactical milestone: TACTICS_REVIEW.md.
Complete an actual local browser loop of construction, jobs, recruitment, combat, infection, territory claims, and save/resume. Static and automated simulation checks complement browser evidence; report their limits separately.
