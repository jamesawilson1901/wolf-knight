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
- L1 Ember Hollow: IN PROGRESS — ROUTE COMPLETE CLEAN run 7 (la→le, real fights,
  hearts 5→2.5, music correct per zone incl. causeway/kiln/boss-loop, slab
  crossing, 0 errors; evidence test-evidence/level-1/). Shadowgrip: fight 1
  (45m) no damage — bot faced wrong way; fight 2 (45m) 20→1.6hp, 3 deaths all
  swipe-through-shield-burst, respawns correct, all 8 actions + wounds-
  remembered verified. Fight 3 running: shield held across whole window,
  potion sip, 80m clock. No game defects in L1 yet; phase field stays 1 for
  Shadowgrip (actions are his machine — check spec before calling defect).
  Next action (17:10 UTC): read fight-3 verdict; on kill verify bossDefeated,
  fire grant ceremony, onward door; then canary + suites + evidence + PASS.
- L2 Stoneroot: NOT STARTED
- L3 Wild Woods: NOT STARTED
- L4 Frostpeak: NOT STARTED
- L5 Stormreach: NOT STARTED
- L6 Sunken Vale: NOT STARTED
- L7 Shadow Court: NOT STARTED

## Intermittents flagged
- lb music: RESOLVED run 6 — settled read shows 'causeway' as intended
  (main.js:1149). The earlier region-ember reads raced the async track load.
  Not a defect.

## Next action
2026-08-13 11:20 UTC — commit harness; render-proof screenshot via driver; begin L1 played run (new game, no jump, real inputs).
