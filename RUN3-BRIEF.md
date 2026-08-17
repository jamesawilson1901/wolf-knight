# OVERNIGHT RUN 3 — Wild Woods and beyond

You are running autonomously from now until **07:00 tomorrow morning, my
local time**. In your FIRST heartbeat, state the run start time and your
computed deadline in UTC; if my timezone is ambiguous from context, pick
the EARLIER plausible deadline — end early, never late. Begin wind-down 90
minutes before the deadline.

Read PROGRESS.md, MORNING-REVIEW.md, and RUN2-REPORT.md before anything
else. PROGRESS.md wins any conflict with this brief. RUN2-REPORT.md is the
efficiency playbook this brief is built on.

## Mission

Play-test and fix, in order, one level at a time: **L3 Wild Woods → L4
Frostpeak → L5 Stormreach → L6 Sunken Vale → L7 Shadow Court.** Depth
beats coverage: one PASSED level beats two half-tested ones. Proof comes
from playing, never from reading. A level is PASS only after a real
played-through route on real inputs with evidence, zero console errors,
and spot suites green — otherwise it is BLOCKED with a written reason.
Ship passed work per the ship protocol below.

## First 30 minutes, in order

1. Tag rollback point `pre-overnight-run-3`; write the hash in PROGRESS.md.
2. Copy this brief's checklist items into PROGRESS.md as the RUN LEDGER.
   Every item ends the night DONE / DROPPED-because / BLOCKED. No silent
   drops — last run lost two promised checks that way.
3. Harness prep (details in RUN2-REPORT "step 0"):
   a. main.js dev timescale ceiling 1.0 → 4.0 (stays dev-gated and
      ship-inert; re-run the inertness check).
   b. wk-drive.mjs viewport 960x480 → 740x360; recalibrate the flat-frame
      screenshot threshold against a known-good frame before trusting it.
   c. verify-all.sh: add a 3-jobs parallel mode (boot stays first and
      serial). Measure one full sweep; record the new baseline time.
   d. Confirm boss-ladder rungs 0.5x/0.25x still work after (a).
   e. Static server is `node tools/serve.mjs` (not python).

## Per-level loop (target ≤3h per level)

1. **RECON (~30m, no browser).** Read the level file end to end. Write
   into PROGRESS.md: room chain and door graph; route waypoints derived
   FROM GEOMETRY (do not discover walls by collision — last run lost ~1h
   bumping into the narrows/switchback that were readable in the builders);
   hazard rooms (lava, ledges — these run 1x only); every scripted
   trigger, minigame, and world-pausing UI; the boss CLASS read in full,
   with its real state/action strings listed in the fight script header
   (the 38-death lesson: never fight from a sibling class's vocabulary).
   NOT-BUILT content is recorded in PROGRESS.md, not treated as a defect.
2. **ROUTE (~45m).** State-driven runner (run-l2 pattern). Timescale 3x
   for traversal legs; 1x for every fight, hazard room, and timing check.
   Real inputs only. Reuse the existing driver — perk chooser, narration
   waits, and the three-way stuck verdict are already built; if driver
   work exceeds small patches, stop and rethink before iterating.
3. **BOSS (~60m).** Focused dev-jump fight script using the recon
   vocabulary. Ladder on loss: 1x → 0.5x → 0.25x; a win below 1x is a
   flagged partial; every loss is diagnosed against the boss's machine
   before any game code is suspected. The ladder found the only real
   defect of run 2 — keep its discipline exactly.
4. **CLOSE (~20m).** Spot suites for what the level touched + canary.
   Evidence to the test-evidence branch. PROGRESS.md entry: PASS
   composition (what was played, at what timescale, what was flagged) or
   BLOCKED-why.
5. **TOUCH LEG.** At least one real-touch leg per level (two-pointer where
   the game needs simultaneous inputs), phone-landscape viewport.

## Dead-time rules (run 2's 4:1 overhead was these — treat as hard rules)

1. **No unwatched verdicts.** Before launching any long job, write in
   PROGRESS.md: the command, the log path, and what "done" looks like. If
   a waiter or container dies, the next action is READ THE LOG or RE-RUN
   THE CHECK — never wait a second time on output that may never come.
2. **Fix→proof same block.** A defect fix starts its confirming run
   immediately; a fix without its proof blocks all other work.
3. **Heartbeat.** A status line in chat at every phase boundary and at
   minimum every 40 minutes. Silence is the failure dad complained about
   twice. Going quiet is worse than reporting "still fighting the boss".
4. **The 45-minute time-box covers harness bugs too.** Two failed
   diagnostic approaches on a driver/probe bug → stop iterating and
   instrument instead (a whyFrozen-style dump of gate booleans + visible
   overlays + player._time delta comes FIRST, not after six runs).
5. **Kill by exact PID only.** `pkill -f` is banned (it matched its own
   shell three times across two runs).
6. **Environment crashes are not game defects.** Discard the run, retry
   once, note it in PROGRESS.md.

## Ship protocol (re-entrant, batched)

Ship after each PASSED level when the clock allows; batching two levels
into one ship event is fine. Sequence, driven from PROGRESS.md markers so
any crash resumes at the marker, all in ONE working block:
gates (parallel verify-all full sweep + harness-inertness + upgrade-path +
canary) → SHIPPING marker → version + SW cache bump → merge to main →
push → Pages build confirmed via GitHub API → SHIPPED marker + phone-check
line for me. Live github.io is unreachable from the sandbox: API build
confirm + exact-commit local gates IS the accepted verification — budget
zero time for an in-sandbox live screenshot. A targeted defect fix
re-proves FOCUSED (fight script or affected leg + spot suite), not the
whole level.

## Standing rules

- Work on branch `claude/wolfknight-reassemble-extract-5p9m8b`; merge to
  main only on PASS with gates green. Never force-push, never rewrite
  history, never push to any other branch.
- Save/profile/localStorage format: NO changes this run. MORNING-REVIEW #8
  (wardenHp in save.js) stays deferred unless I have explicitly approved
  it in chat before the run.
- Never loosen a gate, threshold, or spec to make a test pass.
- Gate-failure triage: prove game-vs-test with a direct state probe before
  touching game code.
- All doors stay open; boss doors act as normal. Difficulty lives in
  enemies (closing speed, numbers, ranged), never in locking players in.
- No code-built creatures — asset-pack models only. Terranigma is the
  design north star.
- Boss-earned forms are live for L1/L2 only; L3+ shrine-grant IS the
  current spec, not a defect. The re-key is design work — out of scope.
- Kids-play fidelity: real input paths only; flat or near-black
  screenshots are render failures; plain-English kid-readable UI text.
- One rendered browser job at a time, except the sanctioned parallel
  verify-all suites; any other parallel experiment needs a frame-pacing
  calibration measured and written down first.
- The model ID never appears in commits, code, or any pushed artifact.

## Inherited ledger items (must appear in the run ledger)

- Profile-isolation check (once, early).
- ≥1 real-touch leg per level (above).
- Intermittents list in PROGRESS.md: if any tripwire fires, re-examine
  immediately; intermittents are never dropped from a PASS.
- Phone-check lines maintained for everything shipped.

## Wind-down (start 90 minutes before deadline; do not overshoot again)

No new level or boss attempt starts inside the window. Finish or park the
current item cleanly. Ship if gates are green. Leave PROGRESS.md fully
self-sufficient: current state, any in-flight jobs with their resume
commands, rollback hash. Update MORNING-REVIEW.md with design-level
questions found tonight. Final chat report: per-level verdicts, defects
found and fixed with evidence paths, what shipped (versions + commits),
the ledger accounting (every item DONE/DROPPED/BLOCKED), and where run 4
starts.
