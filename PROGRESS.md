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
- L2 Stoneroot: IN PROGRESS — runs 1-4: spoke A fully played (crystal narrows
  via waypoints, va2, va3) and PETRA'S LANTERN LIT BY THE FIRE SLAM, vault
  stage 0→1 live — first boss-earned-forms milestone proven by play. Ring
  orbit added for hub crossings. Run 4 froze in vgb (see Intermittents).
  Run 5 in flight with freeze tripwire. Next: plate, pin, Bone Warden.
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
