# RUN 2 REPORT v2 — measured costs + the run-3 playbook

Rewrite of the first retrospective after a data pass over git timestamps,
gate logs, and the harness source. The first version graded process; this
one answers the actual question: **why did two levels take two days, and
what makes L3+ take ~3 hours each.** V1 is in git history (597af42).

## Verdict

Shipped: v3.48.1 (L1 proven by play) and v3.48.2 (L2 proven by play, one
real defect — Warden HP reset on death — found, fixed, confirmed). Gates
all green. The METHOD works: proof-by-play found the only real bug, and the
gate pipeline caught every regression including bugs in my own tests.
The THROUGHPUT was terrible, and the data says exactly where it went.

## Where the hours went (measured, git timestamps + log mtimes)

| Block | Wall | What it was | Verdict |
|---|---|---|---|
| L1 route + boss + evidence | 3h37m | 11:02→14:39 Aug 13 | REAL WORK — this is what a level costs |
| Gate stall run 1 | ~8h | 14:39→23:06, nothing pushed | DEAD — waiter died with the browser, nobody re-ran a 7-min check |
| The "wedge" saga | ~1h53m | 23:16→00:59, 11 commits | AVOIDABLE — driver debugging, zero game defects found |
| L2 waypointing + spine | ~2h44m | 01:13→03:57 | Half real (spine proof), half wall-bumping discoverable by recon |
| Warden fix | 50m | 05:28→06:18 Aug 14 | REAL WORK — the run's one defect, found and fixed. Best hour of the project |
| Fix → confirmed kill | **~19h elapsed** | 06:18→01:18 Aug 15 | MOSTLY DEAD — a ≤45-min fight plus prerequisites, stretched by unreported waiting and churn |
| Gate sweep + ship gates | 2h49m | 01:18→04:07 | REAL but 44 suites ran SERIALLY (sweep alone 2h39m) |
| SHIPPING → SHIPPED | **6h21m** | 04:07→10:28 | DEAD — ~15 min of actual work (merge, bump, push, API confirm). The "you went dark" window |

Productive compute across both runs: **~9–10h for two levels + one defect
+ two ships.** Elapsed: ~47h. **Overhead ratio ~4:1.** Fix the overhead,
not the method.

## Three structural discoveries (none were in report v1)

1. **The bot has been playing at QUARTER SPEED the whole time.**
   Headless SwiftShader renders ~5 fps. The game clamps each step to 0.05s
   (main.js:1908), so one wall-clock second advances the game only ~0.25s.
   Every route leg cost 4x its real duration. The harness timescale
   multiplies the clamped step — but main.js:1511 **caps it at 1.0**: the
   brief's permitted "2x–5x traversal" was impossible all along, and no one
   noticed. Raising the cap to 4 makes traversal real-time (4×0.05 = 0.2s
   of game per 0.2s frame). Above ~4, steps get big enough that a
   sprinting wolf can cross a thin wall in one step — so: **default 3x for
   route legs, 1x for every fight, hazard room (lava slabs, ledges), and
   timing check.** One-line change, ~3x faster routes.

2. **The gate sweep is serial and costs 2h39m.** Per-suite log mtimes:
   reachable ~15m, playthrough ~21m, level2-hub ~15m, gauntlet ~17m,
   l1-doors ~7m — five suites are half the total. Two fixes: run suites
   3-way parallel (4 cores here; each suite is its own browser; expect
   ~1.5–2x net, measure first), and let the traversal-heavy suites opt
   into 3x timescale AFTER a 1x baseline pass (they assert reachability,
   not timing). Target: full sweep under an hour.

3. **The driver renders 73% more pixels than every verify suite** for no
   fidelity gain: wk-drive.mjs:19 uses 960x480; the whole suite uses
   740x360. Pixels are the SwiftShader cost. Match the driver to 740x360
   and recalibrate the flat-frame threshold (45KB was calibrated at
   960x480; expect ~25KB — verify against a known-good frame first).

## Run-3 step 0 — 30 minutes of harness prep before any level work

1. main.js:1511 — dev timescale ceiling 1.0 → 4.0 (dev-gated, ships inert).
2. wk-drive.mjs:19 — viewport 740x360; recalibrate `shot` flat-frame bytes.
3. verify-all.sh — add a parallel mode (3 jobs, boot stays first+serial);
   measure one full sweep to set the new baseline.
4. Confirm the boss-ladder rungs still work (0.5x/0.25x — clamp floor 0.1
   already allows them; only the CEILING changes).

## The per-level loop (target: ≤3h per level, L3–L7)

1. **RECON, 30m, no browser.** Read the level file end to end. Write into
   PROGRESS.md: room chain + door graph, likely vias FROM GEOMETRY (the
   narrows/orbit/switchback waypoints were all readable in buildX() —
   run 2 discovered them by collision instead, ~1h of wall-bumping),
   hazard rooms (these stay 1x), every scripted trigger, and the boss
   class name + its REAL state/action strings from its actual class (the
   38-death Shadowgrip lesson: never fight from a sibling's vocabulary).
2. **ROUTE, ~45m.** State-driven runner at 3x traversal / 1x fights and
   hazard rooms. Perk chooser, narration waits, three-way stuck verdict
   are already in the driver — reuse, don't rewrite.
3. **BOSS, ~60m.** Focused dev-jump fight script from the recon vocabulary.
   Ladder on loss (1x → 0.5x → 0.25x), every loss diagnosed against the
   machine before suspecting game code. The 0.5x rung is what exposed the
   Warden defect — keep the ladder exactly as is.
4. **CLOSE, ~20m.** Spot suites for what changed + canary. Evidence to the
   evidence branch. PROGRESS.md entry. Full sweep is NOT run per level.
5. **SHIP EVENTS, ~1.5h, batched.** Full (parallel) sweep + inertness +
   upgrade-path + canary + push + API confirm. Ship after every ~2 levels,
   or immediately when a real defect fix is waiting on it. A targeted fix
   re-proves FOCUSED (fight script + spot suite), not the whole level —
   the Warden fix did this right.

## Dead-time rules (the 4:1 overhead is mostly these)

1. **No unwatched verdicts.** Every gate/fight/sweep launched in the
   background gets its resume point written in PROGRESS.md BEFORE launch
   (command, log path, what "done" looks like). If the waiter or container
   dies, the next action on wake is READ THE LOG / RE-RUN THE CHECK —
   never wait again. Both 8h and 6h dead blocks were this one mistake.
2. **Fix→proof same block.** A defect fix starts its confirming run
   immediately. A fix without its proof blocks everything else. (The 19h
   gap between the Warden fix and its confirmed kill is the counterexample.)
3. **Ship is re-entrant and atomic-ish.** SHIPPING marker → merge → push →
   API confirm → SHIPPED marker in ONE working block, driven from
   PROGRESS.md state. Any interruption: first action next turn is resuming
   from the marker.
4. **Heartbeat.** A status line in chat at every phase boundary, at
   minimum every ~40 min. Silence is the thing dad actually complained
   about, twice.
5. **Time-box covers HARNESS bugs too.** 45 min or two failed diagnostic
   approaches on a driver/probe bug → stop iterating, instrument instead
   (the wedge saga's answer was one `whyFrozen()` dump: gate booleans +
   visible overlays + player._time delta — build the dump FIRST).
6. **Kill by exact PID only.** `pkill -f` matched its own shell three
   times across two runs. Banned.

## Standing rules that earned their place (keep verbatim in the brief)

- PROGRESS.md is the resume truth and must always be self-sufficient.
- Proof comes from playing, on real input paths. Depth beats coverage.
- Boss ladder with mandatory loss-vs-machine diagnosis.
- Gate-failure triage: prove game-vs-test with a state probe before
  touching game code (the upgrade-path "failure" was my test's two-click
  bug, not the game).
- Brief-item ledger: every brief checklist item lands in PROGRESS.md at
  run start, and ends DONE / DROPPED-because / BLOCKED. (Run 2 silently
  dropped profile-isolation and multi-touch coverage; the ledger is what
  catches that.)
- Honest ship records with caveats. Live github.io is unreachable from
  the sandbox — accepted verification is Pages build SUCCESS via API +
  exact-commit local gates + a phone-check line for dad. Budget zero time
  for an in-sandbox live screenshot.
- Never force-push; never rewrite history; save format is additive-only.
- Environment crashes are not game defects: discard the run, retry once.

## What run 3 inherits

- L3 Wild Woods first; recon step 1 starts it. Then L4–L7.
- Dropped run-2 items, now ledgered: profile-isolation check; two-pointer
  touch driver with ≥1 real-touch leg per level.
- MORNING-REVIEW.md items 1–8 (incl. Warden save.js wound parity — one
  additive line, still deferred under the save-format rule — and the
  transition-wedge recovery surgery).
- Phone-check: live badge reads v3.48.2, music audible.
- L3+ boss-earned-forms re-key remains DESIGN work, not overnight work.

## The one-line summary for the next brief

The testing method is proven — spend the next run's hours playing levels,
not waiting or debugging the harness: timescale 3x on routes, parallel
gates, recon before driving, no unwatched verdicts, heartbeat every 40
minutes.
