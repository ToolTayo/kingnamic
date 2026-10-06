# Lost Battalions — The Broken Standard

This records the original 79-test milestone. Current routes, equipment costs, encounter timing, wound persistence and verification are documented in [TACTICS_REVIEW.md](TACTICS_REVIEW.md); the measurements below remain historical.

5 October 2026. A complete, optional expedition integrated into Kingnamic's existing chapter. The former Adventure/Survivor Rescue extension point has been replaced; there was no working adventure implementation to discard.

## Playing the mission

Open **Army → Lost Battalions**. Select three fit soldiers from an army with at least five fit members, leaving two fit guards at home. Soldiers must have at least 70% health and no recovery timer. Depart in peaceful daylight with 30 provisions and 4 herbs; reserve enough of the 24 army slots for the finite stranded battalion.

1. Lead the patrol from the entry banners through infected ground to the deserted forward outpost. Use the waypoint buttons or the existing rally controls to choose positions.
2. Discover the Grey Pennants: one swordsman, one archer, one spearman and one scout. These are live combat entities with health, weapons, pathfinding, attack cooldowns, targeting and casualties. Gold ground rings identify the stranded allies.
3. Fight beside them through the first ambush. Share eight packed provisions and three herbs at the outpost to heal them and earn their cooperation. Each pack can be shared only once.
4. Lead the mixed force to the broken standard. A second, warned ambush attacks from several approaches. Hold the ridge together for 12 seconds and defeat the attackers to restore the standard and complete their trust conditions.
5. Escort the surviving soldiers to the entry banners. Every living patrol member must reach extraction, and the ground must be clear of nearby infected. Once trust is earned, all living allied survivors must also reach the banners. Extraction enlists those survivors permanently.

The kingdom clock is held while the expedition is active. This is a deliberate single-mission scope choice: the player does not have to command two battles at once. The costs persist through the spent pack, missing troops, casualties, and recovery on return. No resources are produced at home during this held time.

## Roles and consequences

| Soldier | Behavior | Persistent result |
|---|---|---|
| Swordsman / existing Warden | Sword, shield, armor, close combat and the existing shield-line bonus. | Joins or returns as a Warden. |
| Archer / existing Ranger | Bow, ranged support, holds assigned rear ground instead of chasing. | Joins or returns as a Ranger. |
| Spearman | Longer melee reach, spear animation, extra damage against fast runners. | A permanent Spearman, usable in defense, rally formations and selected patrols. |
| Scout | Fast movement, light bow, moves away from enemies at close range. | A permanent Scout with the same behavior at home and on expeditions. |

After relief, allied infantry follow the patrol's advance and ranged allies take rear positions. Allies fight actual enemies; there is no scripted damage or guaranteed survival. Explicit retreat orders take priority. Scouts' short evasive movement remains bounded by the existing navigation graph and structures.

Returning troops receive 20–80 seconds of recovery according to their wounds. They cannot fight or deploy during recovery and remain vulnerable if enemies reach them. Recovery advances only while the kingdom is clear of enemies and has more than 15 provisions; a staffed refuge accelerates it. Returning soldiers receive distinct unoccupied rally slots. Their health and remaining recovery time survive a reload. A finished chapter permits expedition play and peaceful recovery without restarting kingdom waves.

A fighting retreat can be ordered at any time. It does not complete trust objectives or refund the pack. A defeated patrol awards no recruits. If the whole stranded battalion dies, the surviving patrol is ordered to withdraw. Dead stranded soldiers stay absent on later attempts; unaccounted survivors remain available after a 45-second kingdom cooldown. Once every member is enlisted or dead, the mission closes. This is one finite recruitment opportunity, not a repeatable soldier farm.

Patrol selection supports all four friendly classes, so recruited specialists share the ordinary army and expedition interfaces. This delivery contains one authored mission; it does not claim additional playable missions after that battalion is exhausted.

## Integration and save safety

- Reuses the current 10 Hz combat simulation, A* navigation, separation, formations, procedural art, health/effects, renderer, pause/speed controls and command validation.
- A separate `State` battlefield is stored under an optional expedition field. No nested expeditions are accepted. Only the active battlefield advances.
- Existing version-2 saves need no destructive migration. Optional battalion-ledger, origin and injury fields are validated. Older saves without them retain their normal behavior.
- The home army really loses the three deployed soldiers. Extraction transfers only actual survivors and consumes the active expedition exactly once; later extraction commands cannot repeat rewards.
- Launch, sharing, retreat and extraction persist immediately. Automatic defeat also persists its final report. Autosaves include positions, health, paths, consumed supplies, trust, ambush progress and surviving allies. Visual effects are excluded at both save levels.
- The ledger is intentionally small: four unique stranded roles, one active patrol, two ambushes, no new dependencies, no downloaded art, no new physics layer.

## Verification record

The automated and browser checks are recorded separately. An injected compatibility fixture is not described as an uninjected mission playthrough. No external human playtest or physical mobile benchmark is claimed.

- **79 automated tests passed**, including 15 expedition-specific cases and all existing regressions. A Windows temporary-cache rename denial initially prevented execution; rerunning with a project-local temporary directory passed. That setup failure is not counted as a test pass.
- **All 11 existing browser regressions passed**: original construction, economy/jobs, combat, treatment, claims, camera, desktop/touch input, storage failures, resize, and the earlier version-2 save fixture.
- **All four expedition browser scenarios passed**: the complete mission and a specialist fighting at home after recovery; withdrawal during an actual ambush with a reload; phone touch withdrawal; and an existing victorious save resuming an active expedition without a duplicate ending dialog.
- **Both production offline scenarios passed** with network access disabled: original kingdom save/resume and active expedition save/withdrawal/resume. The development inspector is absent from the production build.
- The successful UI mission returned three patrol soldiers and enlisted four allies, with zero casualties and zero JavaScript errors. The deliberate combat retreat returned three patrol soldiers, enlisted none, and left four survivors stranded. Death and partial-loss outcomes are covered separately by deterministic simulation tests, not claimed as observed deaths in the successful browser mission.

An earlier browser recovery check was interrupted by a source-triggered development reload. It failed and was repeated with the source held stable; it is not included in the passing results above.

A later specialist-defense check also timed out: the rear-positioned specialists had no guaranteed attack opportunity before older troops killed the opening enemies. The final successful retest used the existing loose-formation and map rally controls to position the army at the forward crossing, then observed a specialist attack against actual kingdom enemies. This was a test-positioning correction, not a claimed combat-AI fix.

Automated coverage includes normal completion, deployment costs and guards, repeated launch/extraction rejection, retreat, all-patrol defeat, all-allies defeat, partial ally losses on a retry, injury/recovery, deterministic active-save reload, nested-save validation, actual specialist attacks, friendly targeting, post-victory recovery, chosen specialist patrols and capacity/resource restrictions. Existing simulation, economy, plague, navigation, compatibility and balance regressions remain included.

Browser scenarios use real controls in Chromium for discovery, cooperation, both ambushes, extraction, save/reload, injury recovery, specialist defense at home, combat withdrawal and touch withdrawal. The post-victory scenario uses a clearly labeled old-save fixture. Production offline checks cover both the original kingdom save and an active expedition/withdrawal save.

The final browser mission took **54.9 simulated seconds**, or **33.4 seconds of wall time** on its prepared, mostly double-speed route, including the mid-mission reload. That is a short, practiced route, not a prediction of first-time play duration. An active second-ambush sample over 180 animation frames measured a **16.6 ms median / 33.2 ms 95th-percentile frame interval**, with **15 peak units** and approximately **35.1 MiB JavaScript heap** at the end of the sample. Browser scheduling, rendering and test-host load are included; this is not an isolated simulation benchmark or a low-end-device guarantee.

The final TypeScript/Vite production build passed. Its files total **1,354,224 bytes raw / 381,829 bytes individually gzipped**, an increase of **7,012 gzip bytes (1.87%)** over the previous experience milestone. No dependencies or downloaded assets were added. Vite still reports the existing large JavaScript chunk advisory.

Evidence files: [mission and defense results](evidence/battalion-browser.json), [combat performance](evidence/battalion-performance.json), [build size](evidence/battalion-build-size.json), [combat retreat](evidence/battalion-retreat.json), [discovery](evidence/battalion-discovery.png), [ridge](evidence/battalion-ridge.png), [return report](evidence/battalion-return.png), [kingdom defense](evidence/battalion-kingdom-defense.png), [phone](evidence/battalion-phone.png), [offline](evidence/battalion-offline.png).

## Remaining priorities

1. Observe new human players choosing and positioning their patrol. The experienced automated route is not evidence of a novice difficulty curve, emotional attachment, or broad balance.
2. Assess the power of four permanent recruits against the existing tower-heavy kingdom strategies. The fixed roster, costs, guards and recovery limit reward farming, but do not establish perfect progression balance.
3. Improve encounter variety and directional animation only after the single mission is well understood. The map reuses the valley terrain with an outpost layout; there is no fog-of-war or procedural exploration campaign.
4. Test physical low-end phones and more browsers. Current phone verification uses Chromium touch emulation. Dense opposing traffic can still briefly overlap while soft separation resolves it.
