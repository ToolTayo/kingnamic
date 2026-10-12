# World Conquest release acceptance

12 October 2026. Feature `875f4bd93323a564f4d4ae3d5c3fd692fd109dde`
was merged into the released `ebea928` ancestry by `110dc80`. This document
accompanies the verified follow-up correction. Source worktrees were untouched.

## Confirmed issues and corrections

- Five rival kingdoms were implemented, but the three resource Marches were
  the prominent navigation choices. World Conquest now presents five objectives,
  discovery clues, real terrain markers, validated movement waypoints, preparation
  guidance, campaign status and existing siege controls. Planning does not move
  troops or manufacture discoveries, rewards or capture results.
- The Alderwatch return test exposed a real collision defect. A companion at
  approximately (11, 43.48) overlapped the corner of an occupation cottage at
  (11, 44). The swept collision check rejected even movement away from that
  pre-existing overlap. Recovery now permits motion away from an already
  overlapped neighboring edge; movement toward or through solid barriers remains
  blocked. Regression coverage exercises movement after reload and wall safety.
- The return party also encountered infected on the unsecured frontier road.
  The test now sends a legitimate 40-soldier escort and uses paid treatment for
  confirmed bites. The 90-second travel deadline, combat rules and casualty
  accounting are unchanged. The commander was alive throughout the diagnosed
  timeout; its later death while failure evidence was collected was not the
  original cause of the timeout.
- Vite watching/HMR caused a Windows evidence-file lock failure and a browser
  reload during an earlier siege run. Empire acceptance now owns a fresh server
  with watching and HMR disabled. Production configuration is unchanged.

## Final sequential gates

| Gate | Result |
| --- | --- |
| TypeScript | Passed |
| Unit suite | 298 passed, 19 files; existing timeout retained |
| Production build | Passed |
| Production offline suite | 11 passed; no skips, failures or flaky retries |
| Complete Empire suite | 42 passed in 33.1 minutes; no skips, failures or flaky retries |
| Profiler within complete Empire suite | Passed; 261 UI and 2,694 WebGL samples |
| Five natural conquests | Mossgate, Tallowmere, Stonewake, Alderwatch and Redwater passed |
| World routes | All five physically discovered/reached with legally recruited companies |
| New-player and touch journeys | Fresh road/village/outpost journey, mouse controls and 320/390px emulated touch passed |

Mossgate accounted for all 100 original soldiers: 83 living and 17 fallen.
Tallowmere accounted for all 181 tracked participants: 152 living and 29 fallen.
Both had zero missing or duplicated identities. Campaign tests verify capture,
construction, stationed defenders, return/revisit and save/reload through normal
commands and live combat. Mature campaign fixtures prepare supplies and capacity;
these are not five conquests earned sequentially from one fresh economy.

Offline checks include legacy recruitment, the 200-soldier cap, expedition
extraction without duplicate rewards, connected settlements, infection/remains,
rotation/reward persistence, old-cache updates and first-run touch controls.
The v2 save key/schema and service-worker behavior were preserved.

## Performance and build

The final 45-second Briar March profile began with 200 soldiers and 120 infected.
The renderer confirmed AMD Radeon Vega 11 through ANGLE Direct3D11.

| Measurement | Median / p95 / p99 / maximum (ms) |
| --- | --- |
| Frame interval | 16.7 / 16.8 / 16.8 / 66.7 |
| Simulation wrapper | 0 / 4.4 / 9.8 / 66.2 |
| UI wrapper | 1.8 / 3.8 / 4.6 / 5.3 |
| WebGL render wrapper | 3.1 / 4.4 / 5.6 / 18.0 |

Two long tasks measured 72 and 51 ms. Post-GC heap rose from 10.86 to 13.91 MB
in this short sample; this is not a leak certification. Nested timings are not
additive. Separate sustained 100/200-soldier runs passed with p95 frame intervals
of 16.7/16.8 ms and isolated 81–86 ms long tasks. No speculative performance
rewrite or acceptance-threshold reduction was made.

The production artifact is 1,556,410 bytes raw, 445,734 bytes summed gzip.
JavaScript is 1,500,929 bytes raw / 431,883 gzip; CSS is 51,489 / 11,951.
Vite's existing large-chunk advisory remains. No dependencies were added.

## Publication gate and limits

**GO for authorized publication.** Before pushing, fetch and verify the expected
remote ancestry and clean main. After automatic Vercel deployment, verify the
deployed SHA and asset bytes, then exercise the live World interface, an isolated
pre-deployment browser save/cache, fresh and legacy saves, offline reopening and
emulated mobile layouts. Do not use real player storage for destructive QA.

These are automated browser playthroughs and screenshot review, not human
playtest feedback. Physical Android/iOS, Safari, a continuous fresh-economy
five-kingdom campaign and long-duration leak behavior remain unverified.
Occasional long-frame outliers and crowded passage throughput remain limitations.
Raw traces, screenshots, save fixtures and reports are local Git-ignored evidence.
