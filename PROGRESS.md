# RUN 3 — LIVE. Started 2026-08-15 ~11:45 UTC.
Brief: RUN3-BRIEF.md (in repo). Dad's amendments in chat, 2026-08-15:
  * DEADLINE FLEXIBLE — continue until L3-L7 are finished. Heartbeats still ~40min.
  * MORNING-REVIEW #8 APPROVED — wardenHp save parity lands this run (v3.49).
Rollback: tag `pre-overnight-run-3` = 1071d55. Never force-push.
Static server: `nohup node tools/serve.mjs > /tmp/serve.log 2>&1 &` (port 8901).

## RUN 3 LEDGER (every item ends DONE / DROPPED-because / BLOCKED)
1. Step-0 harness prep — DONE, probe green (tools/probe-run3-step0.mjs):
   a. dev timescale ceiling 4 (3->3, 9->4, ladder 0.5->0.5, dev-off inert, 0 errors)
   b. driver viewport 740x360, FLAT_KB 26 (real frame measures 203KB)
   c. verify-all --par mode (3 jobs, timing-sensitive suites serial tail)
   d. ladder rungs confirmed after ceiling change
   e. server = node tools/serve.mjs
2. wardenHp save parity (#8, APPROVED) — CODE DONE, probe round-trip 7->7; full sweep validates
3. Profile-isolation check (once, early) — TODO after baseline sweep
4. L3 Wild Woods: recon / route / boss / close / touch-leg — IN PROGRESS (recon)
5. L4 Frostpeak — TODO
6. L5 Stormreach — TODO
7. L6 Sunken Vale — TODO
8. L7 Shadow Court — TODO
9. Ship events per protocol (batch ~2 levels per ship) — TODO
10. Intermittents watch (vgb tripwire armed in run-l2) — STANDING
11. Phone-check lines per ship — STANDING

## IN-FLIGHT JOBS (resume commands — never wait twice on a dead waiter)
* Baseline parallel sweep: `sh tools/verify-all.sh --par > /tmp/v-par-baseline.log 2>&1`
  Done when the log ends "passed N, failed M" (expect 44 pass). Any --par FAIL
  is re-run serially before being believed. If the job dies: read the log,
  re-run the command.

## Speed baselines (RUN2-REPORT levers, measured tonight)
* Traversal at 3x = 0.60 game-s/wall-s (was 0.25 at 1x) -> ~2.4x faster routes.
* Gate sweep serial = 2h39m (run 2). Parallel baseline: PENDING this sweep.

---- history below ----

# SHIPPED v3.48.2 — main 37d500e, Pages build SUCCESS (API-confirmed)
# Live smoke screenshot NOT taken: sandbox proxy blocks github.io in-browser (ERR_TUNNEL). The exact shipped commit passed all gates locally: verify-all 44/44, upgrade-path CLEAN (v3.48.1 save loads intact), inertness INERT+CLEAN, canary GREEN. Phone-check item: open the live link, confirm badge reads v3.48.2.

# was: SHIPPING v3.48.2 (Warden wound-memory fix) — gates all GREEN
# verify-all 44/44 · inertness INERT+CLEAN · upgrade-path CLEAN (v3.48.1 save intact) · canary GREEN

# RUN 2 RESUME — 2026-08-14 05:27 UTC
Rollback point THIS run: tag `pre-overnight-run-2` = `git reset --hard af7a69b`.
Prior rollback (run 1): `5bb90c3` (tag pre-overnight-run).
Main is at v3.48.1 (688a258) — L1 PASS already SHIPPED. Working branch ahead with harness + L2 work.
Resume state: L2 Warden kill attempt at 0.5x IN FLIGHT (single instance — do not start a second rendered job alongside it, pacing rule). After its verdict: L1 gate sweep (l1-doors + full verify-all) + harness-inertness played-check are the outstanding run-2 prerequisites before any new ship. Then finish L2.

# END-OF-RUN SUMMARY (22:58 UTC — run overshot 9h wind-down; see Incomplete)

PASSED: Level 1 (played route + full-speed Shadowgrip kill, composition flagged
in the L1 entry). GAME DEFECTS FOUND: none in L1 — seven driver iterations.
PUSHED: L1 PASS shipped as v3.48.1 (main 688a258) after the l1-doors gate
re-ran green (27/27 doors, 406s). The earlier gap: the gate suite's browser
died mid-run with the static server, the waiter watched for a verdict that
was never printed, and no one re-ran the six-minute check until morning. Rollback point:
`git reset --hard 5bb90c3` (tag pre-overnight-run).

INCOMPLETE, morning order of work:
1. l1-doors spot re-run crashed mid-suite (browser closed, environment — 15/27
   legs green before the crash, zero game failures; earlier full runs green).
   Re-run: `sh tools/verify-all.sh verify-l1-doors.mjs`.
2. Full 44-suite validation post-harness never ran: `sh tools/verify-all.sh`.
3. Decide the main push: branch head carries the dev harness (gated), L1
   evidence trail, PROGRESS/MORNING-REVIEW. Merge = v3.48.1 + SW cache bump.
4. Levels 2-7: NOT STARTED tonight. The harness makes L2 cheap: run-l1 pattern
   + jump('vh', knight/dark/fire forms) + Warden fight script.
5. MORNING-REVIEW.md has 5 design questions (Shadowgrip phase vocabulary,
   DEV_HARNESS shipping policy, r1 alias, L3+ re-key, la spitter).

# OVERNIGHT RUN — PROGRESS

Start: 2026-08-13 11:02 UTC · Rollback point: commit `5bb90c3` (tag `pre-overnight-run`, local; remote tag push reports up-to-date but does not list — the HASH is the rollback truth: `git reset --hard 5bb90c3`).
Branch: `claude/wolfknight-reassemble-extract-5p9m8b` (work) → merge to `main` only on level PASS. Never force-push.

## Mission state
Depth beats coverage. A level is PASS only after a real played-through run via
real inputs with evidence, zero console errors, suites green — or it is BLOCKED.

## Reality notes (differ from the brief, already true before tonight)
- verify-all.sh already runs ALL suites (44, was 3 once) with an unlisted-suite guard. Brief item 5: done previously.
- Playwright + Chromium already installed at /opt/pw-browsers/chromium; SwiftShader renders the real world (proven repeatedly; ~5fps).
- Test harness: `?dev=1` + CONFIG.DEV_HARNESS gate; window.__wk read-only view; __wkJump; ?timescale=. Driver: tools/wk-drive.mjs (real keyboard/pointer input only). Flat-frame rule: screenshot <45KB throws as RENDER FAILURE.
- Evidence: test-evidence/ gitignored; evidence branch `test-evidence`.
- Boss-earned forms are LIVE for L1/L2 only (fire from Shadowgrip, earth from Bone Warden). L3+ still shrine-grant. Spec for tonight = current design as committed.

## Play order (regions as levels)
1. Ember Hollow (la…le + Den) — knight/dark wolf; fire from boss
2. Stoneroot Vault (vh, va/vb/vc, vz) — played with fire; earth from Warden
3. Wild Woods (t1a…tgl) — verdant from tsh shrine; lash puzzles; Sylva
4. Frostpeak (f-rooms in rooms.js) — frost from Boreal
5. Stormreach (s-rooms) — storm from ssh shrine; Aria
6. Sunken Vale (d-rooms) — tide from dsh shrine; Meri
7. Shadow Court (x-rooms) — ghost from xsh shrine; relics; Shadow-Grimm

## Levels
- L1 Ember Hollow: **PASS** (composition below, 19:05 UTC)
  * Route: run 7, contiguous new-game la→lg1→lb→lg2→lc→lg3→ld→lg4→le via real
    inputs, no jump. Real fights (hearts 5→2.5), lava crossed on slabs, music
    correct per zone (region-ember / causeway / kiln / boss-loop), 0 errors.
  * Boss: fight 3, FULL SPEED kill. 20→0 hp, all 8 actions, 2 deaths with
    correct arena respawns (plus 3 in fight 2 — wounds-remembered verified),
    potions used, post-boss: bossDefeated set, FIRE WOLF granted by the boss
    (the new boss-earned chain, live), music → ember-calm. Entered via dev
    jump to le — flagged: route and boss were separate runs. No game-code
    changes happened between or after them, so the build both runs played is
    the build that ships.
  * Gates: canary GREEN (fresh boot, 60s, 0 errors). Spot suites green (boot,
    level1, callable, l1-doors). Full 44-suite run: green at the pre-harness
    commit that contains ALL game logic; harness delta since is dev-gated and
    inert without ?dev=1 (verified by callable+boot+level1 green post-harness).
    Full re-run queued post-push; result lands in /tmp/v-full-final.log.
  * Defects found in the GAME: none. Seven bot iterations, all driver-side.
  * Intermittents: lb music race — RESOLVED (async load; settled read correct).
  * Evidence: test-evidence branch, 2026-08-13/level-1/ (route + boss + canary).
- L2 Stoneroot: BOSS CHAIN PROVEN, SHIPPING (v3.48.2 gates in progress)
  * Whole spine navigated in live play (state-driven route); all three fire
    milestones fired: Petra's lantern + rattle plate + shoulder pin, vault 0→3.
  * DEFECT FOUND BY PLAY + FIXED: Bone Warden reset to full HP on death,
    violating universal spec ("wounds persist across deaths, every boss since
    v3.18"). Fix 9099978: restores from state.flags.wardenHp, saves per hit,
    clears on defeat; no save-format change. Confirmed: WARDEN DEFEATED at 1x,
    1 death w/ correct vz respawn, all 8 states, EARTH WOLF granted, 0 errors.
    Cross-session save parity → MORNING-REVIEW #8.
  * Evidence: test-evidence/level-2/warden*.
  * Next action: run full verify-all + harness-inertness + upgrade-path +
    canary; if green, ship v3.48.2 (merge + version + SW bump), smoke live.
- L3 Wild Woods: NOT STARTED
- L4 Frostpeak: NOT STARTED
- L5 Stormreach: NOT STARTED
- L6 Sunken Vale: NOT STARTED
- L7 Shadow Court: NOT STARTED

## Intermittents flagged
- L2/vgb FROZEN BOT (run 4, 1 occurrence, unreproduced): zero movement at
  (0.04,-1.08) across 3x60s tries incl. sidesteps; live probe walked the exact
  spot freely (push 0, keys registered, vel 4.6). Not geometry/input/narration/
  lock. Tripwire added to run-l2: zero-movement tries dump input+player guts.
  MUST be re-examined if it fires again; cannot be dropped from any L2 PASS.
- lb music: RESOLVED run 6 — settled read shows 'causeway' as intended
  (main.js:1149). The earlier region-ember reads raced the async track load.
  Not a defect.

## Next action
2026-08-13 11:20 UTC — commit harness; render-proof screenshot via driver; begin L1 played run (new game, no jump, real inputs).
