# Hearth renewal — implementation sequence

5 October 2026. Current source and persistence were inspected; earlier test counts are historical until rerun.

## Milestone 1: an affordable, readable, defensible kingdom

1. Reproduce crowd pressure at closed gates and stale paths through new construction. Use one allegiance-aware movement boundary for combat and crowd corrections; test siege, breach, repairs, friendly passage and reloads.
2. Make Timber and Crowns the two purchase resources. Ordinary structures and repairs cost timber; recruitment and advanced improvements use crowns. Retain provisions and medicine as contextual survival supplies. Preserve the legacy `stone` storage field as the crown balance with an explicit economy revision: one old stone becomes one crown, without a second balance or repeat conversion. Existing Stoneworks and miners become trading posts and traders in place.
3. Add bounded, combat-attributed crown bounties, with no bounties for reanimated people or repeated expedition enemies. Preserve mission equipment reservations and refund contracts for active legacy expeditions.
4. Replace the long shop with compact categories, visible costs and shortage explanations, with details on demand. Split army management into Orders, Recruit, Squads and Roster while preserving independent selection and commands.
5. Run current regressions, update assertions for intentional economy/UI changes, add migration/reward/barrier coverage, and play fresh and legacy kingdoms in real Chromium. Repeat stress measurements and production offline checks. Record failures and limits honestly.

## Following cohesive milestone

The commander and connected-region exploration require new control ownership, progression, persistent discoveries and defeat rules. Implement these after the economy/barrier foundation is verified. Prefer one connected expedition region and one complete commander control loop; do not expand the fixed map constants or add streaming until profiling and navigation requirements justify it. Automatic discovery should reveal locations, with combat securing construction rights. Current infection already records death before reanimation; keep this contract and verify it during this pass.

No publication, deployment, push, account service, new dependency, or replacement of player saves is planned. Prepared stress armies are not evidence of naturally earned progression, and automated browser play is not human feedback.
