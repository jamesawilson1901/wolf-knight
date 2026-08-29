# How Wolf Knight is tested and debugged

The working method behind every fix in this repo: what counts as proof, the
tooling that produces it, and the debugging traps this project has already
paid for once so nobody pays for them twice. Written from practice — every
example below actually happened.

---

## 1 · The one rule everything else follows from

**"The code looks right" is never evidence a thing works.**

Every fix is verified through the game's *real input paths* — actual room
jumps, real key presses, real title-screen clicks through the `?dev=1`
harness — never by inference from source. The repo's history is full of
bugs that were invisible in code review and obvious in one probe run: a
"crate" that was a 9 cm stack of planks, a vase modelled a metre off its
own pivot, a boulder puzzle that was geometrically unsolvable because a
collider was 0.24u wider than a lane. Reading the code found none of them.
Measuring the running game found all of them.

The corollary: **fixes are verified before they are committed, and commits
state their evidence.** A commit message here explains the root cause, the
fix, and what run proved it — so the next session can trust the history
instead of re-deriving it.

---

## 2 · The tooling stack

| Piece | What it is |
|---|---|
| `node tools/serve.mjs` | The static server, port **8901**. Must be up before any browser suite. Start it as its **own** command (`nohup node tools/serve.mjs > /tmp/serve.log 2>&1 &`), then `curl` a health check — chaining start+use in one bash line races and fails intermittently. |
| Playwright + headless Chromium | Every suite drives the real game in a real browser (SwiftShader GL). Fresh context per run: no storage, no service worker, no cached build. |
| `?dev=1` harness | The debug surface, **inert without the query param** — the shipped game is byte-for-byte unchanged for the kids. Exposes `window.__wk` (a read-only view: room, pos, form, hearts, gates), `window.__wkJump(room, forms)` (the one allowed mutation), and `window.__game` (the full debug handle: player, world, state, WS, effects…). |
| `tools/verify-*.mjs` | The permanent suites — one per system or region. `tools/verify-all.sh` auto-discovers them, so adding a file adds a gate. |
| `tools/probe-*.mjs` | Disposable investigation scripts. Named `probe-*-tmp.mjs` when they are throwaway, and **deleted after use**. A probe that found a real bug gets promoted into a permanent `verify-*` suite so the bug class can never return silently (this is how `verify-pups`, `verify-smash`, and `verify-l2-lantern` were born). |
| `tools/all-rooms.mjs` | **The room list, asked of the game.** `allRooms(page)` imports the live `ROOMS` registry out of the already-navigated page and returns every played room id. Suites that sweep "every room" MUST use it — nine files once carried their own hand-written copy of the list, and the copies rotted: five game-wide invariant suites had never heard of the Village's ten rooms or the Spire's five, and reported ALL CLEAN about a smaller game than the one that exists (caught 2026-08-29). Its `LEGACY` export names the rooms still deliberately excluded, and why — shrink that list on purpose, never by accident. Call it **after** `page.goto` + the `__game` wait; the registry doesn't exist until the page's modules load. |

Run commands:

```sh
node tools/serve.mjs &                      # first, always
sh tools/verify-all.sh                      # every suite, serial (~2h40m)
sh tools/verify-all.sh --par                # 3-at-a-time (see the trust rule below)
sh tools/verify-all.sh --quick              # smoke: boot, density, music
sh tools/verify-all.sh verify-level3.mjs    # one suite (boot is always prepended)
node tools/probe-modelsize.mjs <file.glb>   # measure any model against its own pivot
```

**The `--par` trust rule:** any FAIL under `--par` must be re-run serially
before it is believed. CPU contention under parallel load causes false
failures. The inverse trap also exists: never run two browser suites at
once by hand for the same reason.

---

## 3 · The lifecycle of a fix

Every change in this repo walks the same path:

1. **Research first.** Read the actual code and cite `file:line` for every
   claim. For anything combat-related, load
   `docs/wolf-knight-combat-context.md` first (its §6 audit structure is
   binding). Never fix from memory of how a system "probably" works.
2. **Root-cause, don't symptom-patch.** The reported symptom is the start,
   not the diagnosis. "The dark wolf is missing" turned out to be the save
   *load* path, not the new-game path — found by testing a fresh profile
   first (it worked), which eliminated half the search space in one run.
3. **Minimal fix,** in the idiom of the surrounding code.
4. **Disposable probe** through the dev harness proves the fix live — the
   real respawn path, the real `Continue` button, the real `takeDamage`.
5. **Regression battery**: every suite whose system the change touched,
   plus `verify-boot` (free — the runner prepends it).
6. **Commit** with root cause + fix + verification evidence in the message.
7. **Ship gate**: dev branch → suites green → merge to `main` → bump
   `CACHE_NAME` in `sw.js` (or returning phones serve the stale build) →
   push → confirm the Pages workflow actually succeeded via the GitHub API.

Two standing branch rules: work happens on the feature branch and never
lands on `main` unasked; history is never force-pushed or rewritten.

---

## 4 · Writing a probe that tells the truth

The recurring craft is making the *measurement* honest. Ways this repo has
been lied to by its own probes, and the countermeasures now standard:

**Wait on `world.roomId`, never on `state.room`.**
`state.room` flips the instant a jump is *requested*, before the async
rebuild even starts. A probe that reads it can "pass" while the world is
still the previous room. `world.roomId` is stamped by the room's own
builder as the rebuild's last step — the one identity a race cannot forge:

```js
await page.waitForFunction((r) => window.__game.world
  && window.__game.world.roomId === window.__game.resolveRoom(r)
  && window.__game.player.hearts > 1 && !window.__wk.gates.transitioning,
room, { timeout: 45000 });
```

**Step the clock; don't sample the wall.**
Under SwiftShader a frame can take 200ms and `main.js` clamps `dt` to
0.05, so the game runs at a fraction of real time. A wall-clock sample of
the coin-bounce physics caught the coin still on its first rise and
"proved" there was no bounce. The fix: call the real update function
(`updateShards`) directly with a fixed `1/60` dt — same code, a
deterministic clock.

**Use the right oracle.**
The first pup-placement sweep used `world.blocked()` and flagged all 24
pups — including long-shipped, definitely-collectable ones. `blocked()` is
the *prop keep-out register* and matches `pup*Spot` deliberately (it
reserves the pup's standing room), so it answers "true" at every correct
placement. Walkability is `world.resolveCircle()` (does solid geometry
push a body out?) plus `world.hazardAt()`. Know what a function is *for*
before trusting its answer.

**Ask why a zero is a zero.**
When the first bolt-shape probe reported no projectiles for any form, the
bug was the probe: Playwright's `Tab` keypress never cycled forms because
the probe's earlier form-jump had granted only one form. A zero result
must be distinguished from a broken measurement — the fix was reading the
input pipeline (`input.js`) to learn how the real path worked, then
driving `setForm(..., { silent: true })` and documenting why the direct
call was legitimate there.

**Screenshots can lie by being blank.**
A frame captured mid-transition is a black overlay, not a render failure.
The overnight driver enforces a flat-frame rule: a real 740×360 frame
compresses to ~200KB; a single-colour frame compresses far below it, and a
flat frame **throws** — it is never accepted as evidence.

**Assert intent, not coordinates.**
A suite once walked to a hardcoded `(0,-3)` to test a shrine. The shrine
moved (for good reason) and the suite went red against a working game.
Suites read `world.markers.*` now. A test pinned to a coordinate fails the
day the level improves and says nothing true either way.

**Don't let a test pass vacuously.**
When the L2 crypt moved from `handDown` to `deepLantern` (with a legacy
alias so old saves stay whole), the lantern test clears **both** flags
first — otherwise it would "pass" on a stale flag without the fire slam
ever lighting anything.

---

## 5 · Debugging the environment, not just the game

Some failures are the sandbox's, and chasing them as game bugs wastes
hours. Symptoms already diagnosed here:

- **Headless Chromium dies mid-run at a *different* point each retry**,
  with every completed room reporting clean geometry. That inconsistency is
  the tell: environmental, not a regression. Response: check `free -h` and
  `dmesg`, then verify the same ground via smaller targeted sub-suites
  rather than rerunning the giant one forever.
- **`ERR_CONNECTION_REFUSED`** mid-suite: the static server died. Restart
  it as its own command with a `curl` health check; do not chain.
- **A watcher loop that never ends**: `until ! pgrep -f "verify-density"`
  matches *its own command line* forever. Name the pattern so it cannot
  match itself, or poll the artifact (the log file) instead of the process.
- **Anonymous GitHub API calls return nothing** through the proxy — use the
  authenticated MCP tools for CI status instead of `curl`.

---

## 6 · Techniques for level/content work

- **Measure models before placing them.** `tools/probe-modelsize.mjs`
  prints a GLB's true size and where its origin sits inside it. The town
  rebuild started by measuring: the "house" was 1.35u tall against a 1.7u
  child — the entire bug in one number.
- **Compute colliders from the thing they box.** Hand-typed boxes are how
  waist-high houses kept knee-high colliders through every resize. The
  `townhouse()` helper derives the box from the model's own rotated
  footprint, in both greybox and dressed costume, so the layout that is
  walked in grey is provably the layout that ships.
- **Prove a failure is pre-existing before ignoring it.** When
  `verify-density` failed on two rooms, a `git worktree` of the *live
  `main`* ran the same suite and failed identically — the failure predated
  the change, documented, not silently shipped past.
- **Budgets are measured, not estimated.** Draw calls per room come from
  `renderer.info.render.calls` in a live probe (ceiling: 125, target <100
  per `design/METRICS.md`). The town's streets were measured at 42–53
  before shipping, not assumed to fit.
- **Look at the screenshot.** After the numbers pass, a human-eye check of
  a real frame catches what no assertion does — the corrupted-tint town
  read as "black slabs" until a warm-state screenshot confirmed the houses
  stood correctly and the darkness was the *intended* pre-restoration look.

---

## 7 · What "done" means

A change is done when:

1. its own new suite (if the bug class deserved one) passes,
2. the regression battery for every touched system passes serially,
3. the fix was exercised through a **real input path** at least once,
4. the commit message records cause, fix, and evidence, and
5. anything *not* verified is stated plainly — "Pages deploy unverifiable
   from this environment" or "one leg unwalkable by the harness, listed by
   name" are honest results; a suite that reports a clean run it did not
   have is how bad nights start.

Suites green is necessary, never sufficient. The final gate for anything
player-facing is a person playing it — the measured game and the felt game
are different instruments, and this project's best bug reports have all
come from the second one.

---

## 8 · The full sweep runs in CI, sharded

The repo is public, so GitHub Actions is free — and public-repo workflows
run on 4-vCPU / 16 GB runners. The full fleet, split across an 8-way shard
matrix (`.github/workflows/verify.yml`), finishes the sweep in under an
hour wall-clock instead of the serial ~2h40m (real first-run numbers in
§10).

**The `--par` failure class cannot occur here, by construction.** Each shard
is its own virtual machine running its suites *serially*
(`verify-all.sh --shard K/8`). There is no shared CPU to contend for, so
there is no parallel-load false failure and no trust rule to remember for
the sweep. Parallelism between machines, serial within each — that is the
shape parallel verification should always have had.

The workflow:

- **`quick`** — runs `verify-all.sh --quick` on every push, any branch. This
  is also how a branch proves the workflow itself works before merge,
  because…
- **`sweep`** — the full sharded fleet — runs nightly (cron `0 14 * * *`,
  UTC ≈ midnight Brisbane) and on manual `workflow_dispatch`. Both of those
  triggers only fire from `main`, so the sweep cannot be exercised on a
  branch: the branch's green `quick` job is the evidence that earns the
  merge.
- Sharding lives in `verify-all.sh --shard K/N` (every `verify-*.mjs` file,
  sorted alphabetically, assigned round-robin), not in the workflow, so
  local and CI run the exact same code and cannot drift. `K` is 1-indexed.
- The static server is started as its **own step** with a `curl` health
  check — §2's rule, unchanged in CI.
- **Every failure gets one automatic serial re-run — everywhere, not just
  under `--par`.** This lives inside `verify-all.sh`'s `run()` itself now,
  so `--shard`, the plain serial default, and a named suite all get it for
  free, not just `--par`'s parallel-then-serial path. Only the LAST
  attempt's verdict counts toward the exit code; every attempt is logged
  to the timing table. This ports §2's trust rule into the runner and
  absorbs environmental flake (OOM, a slow first asset fetch) without
  hiding a real failure — a suite that is actually broken fails the
  re-run too. A suite listed in `tools/known-fail.txt` is never retried
  at all (retrying a documented, expected failure just burns CI minutes
  nightly).
- Screenshots, the serve log, and per-suite logs upload as artifacts on
  every run (`actions/upload-artifact`, 5-day retention). The job summary
  prints the per-suite timing table for that shard (see §10 — the
  slowest suites are first in line for clock conversion).

**The known-fail manifest** (`tools/known-fail.txt`). A nightly sweep that
is permanently red teaches everyone to ignore it — that is how two regions
played the wrong music for weeks. A failure that has been *proven
pre-existing* (§6's `git worktree` rule) goes in the manifest with the
suite name, the reason, and the date it was proven. The runner reports it
as an expected `KNOWN-FAIL`, not a red `FAIL`, and it counts toward
`passed`. An entry that unexpectedly *passes* prints a "stale known-fail"
warning (visible, not red) so the list cannot rot. Red must always mean
new information.

Seeded with one entry: `verify-density.mjs`'s "island shows at least 32
things on arrival" check fails on rooms `va1`/`vc1`. Re-proven 2026-08-28
via `git worktree` against a clean `origin/main` checkout — no change in
flight causes it.

**Sharding balances by suite COUNT, not by known weight — this showed up
on the very first real sweep.** Round-robin over an alphabetically sorted
list put `verify-density.mjs` (the slowest single suite the sandbox has
ever measured, ~7-8 minutes) in the same shard as several other
non-trivial suites (`verify-l2-warden`, `verify-level2-progress`,
`verify-route`, `verify-timing`), and that shard ran 58 minutes against a
15-33 minute range for the rest. Nothing was wrong — every suite in it
passed — the shard was just unlucky. A future improvement: sort suites by
their own most recent timing-table entry before assigning them round-robin,
so shards balance by wall-clock weight instead of headcount.

---

## 9 · Launch flags that keep the harness alive

Two flags are now mandatory on every Chromium launch, and they live in
exactly one place — `tools/launch.mjs`, which every `verify-*.mjs` suite
(and the small set of permanent dev-tool scripts, and `wk-drive.mjs`'s own
shared `launch()`) imports `launchBrowser()` from instead of calling
`chromium.launch()` with its own copy of the args. Flags scattered
per-suite are how one file silently drifts — before this pass,
`verify-pups.mjs` and two dev-tool scripts were quietly missing
`--autoplay-policy`, and nobody had noticed.

- **`--disable-dev-shm-usage`.** Chromium puts shared memory in `/dev/shm`,
  which is tiny (typically 64 MB) in containers; when it runs out, a
  renderer process is OOM-killed. That is the §5 symptom — headless
  Chromium dying mid-run *at a different point each retry* — diagnosed,
  not just worked around: the flag routes shared memory to `/tmp`, which
  has the machine's real memory behind it.
- **`--enable-unsafe-swiftshader`.** Chromium is removing automatic
  software-WebGL fallback; headless/no-GPU use is opt-in only. Without the
  flag, a future Playwright/Chromium bump fails every suite with
  context-creation errors that cosplay as N simultaneous game bugs. The
  flag is harmless on versions that don't need it yet.

**The renderer assertion.** `tools/launch.mjs` exports `assertWebGL(page)`;
`verify-boot` calls it right after the page loads and prints the active
WebGL renderer string on every run, failing loudly, naming the cause, if
context creation failed. When the browser changes underneath us, the first
line of the first suite says so — nothing downstream gets to fail
mysteriously first. Verified live: with the static server deliberately
stopped, `node tools/verify-boot.mjs` throws immediately with
`net::ERR_CONNECTION_REFUSED` and the exact file:line — loud and named,
never a silent hang.

**Portability.** `tools/launch.mjs`'s `EXECUTABLE_PATH` only points at this
sandbox's pre-installed Chromium (`/opt/pw-browsers/chromium`) when that
path actually exists; otherwise it's omitted and Playwright resolves
whatever `npx playwright install chromium` set up (CI, or any other
machine). A `PLAYWRIGHT_CHROMIUM_PATH` env var overrides either default.
This was found live: the launcher as first written hardcoded the sandbox
path unconditionally, which would have failed every suite on a GitHub
Actions runner before a single line of game code was ever exercised.

**Browser recycling on long drivers.** Checked for a persistent
overnight/long-run driver script in `tools/` — found none. `wk-drive.mjs`
is a shared `launch()`/helper library that `run-l1.mjs`…`run-l7.mjs` and
the `fight-*.mjs` scripts each import once per bounded, single-region
invocation; none of them loop for dozens of legs inside one long-lived
process. `verify-playthrough.mjs` is the closest thing (many "legs" — real
walked room-to-room transitions — inside one continuous browser session)
but it is a bounded suite (the long pole in shard 7's first real run — see
§8), not an unbounded/overnight run, and its whole point is a *continuous*
simulated walk — recycling the browser mid-playthrough would break the
exact continuity the suite exists to test, for no benefit at that runtime.
If a genuine overnight multi-hour driver is built later, it should close
and relaunch the browser roughly every 10 legs and log `free -h` at each
recycle, same as this section originally specified.

**Playwright is pinned exact** (`tools/package.json`, `1.56.1`; a
`tools/package-lock.json` locks the rest of the tree — the pin lives with
the tooling in `tools/`, not a root `package.json`, so the shipped
no-build PWA stays exactly that, per CLAUDE.md). Reason on record:
Playwright 1.57 switched its default browser to Chrome for Testing, with a
dramatic memory-usage regression that crashes parallel runs. Upgrades are
deliberate: bump on a branch, run one shard green, then the fleet.

---

## 10 · First real sweep (2026-08-28) and what's still adopted-not-built

The first full sharded sweep (`workflow_dispatch`, run
[33217236982](https://github.com/jamesawilson1901/wolf-knight/actions/runs/33217236982))
ran all 8 shards plus `quick` green on the first attempt. Wall-clock from
dispatch to the last shard finishing: **~59 minutes** (22:33 → 23:32 UTC) —
well under the serial ~2h40m, though short of "tens of minutes" until
sharding is weight-balanced (§8). Per-shard wall-clock (setup + suites):

| Shard | Wall-clock | Notes |
|---|---|---|
| 6/8 | 3m44s | |
| 1/8 | 5m28s | |
| 3/8 | 8m03s | |
| 8/8 | 23m17s | |
| 5/8 | 25m08s | |
| 2/8 | 32m45s | |
| 4/8 | 33m29s | |
| 7/8 | **58m25s** | contains `verify-density.mjs` (~7-8min alone) + several other non-trivial suites — see §8 |
| `quick` | 11m17s | includes `verify-density.mjs` |

**Adopted, awaiting build.** Direction locked; each item moves up into
practice when it lands. None of these shipped in the test-infra hardening
pass (§8-9 above) — that pass was launcher/CI/manifest work only,
deliberately scoped away from suite internals.

- **Deterministic clock stepping (`page.clock`).** Playwright's fake clock
  overrides `Date`, timers, `requestAnimationFrame`, and `performance` —
  the loop's whole timing surface. Suites install it and drive the *real*
  loop with `clock.runFor()`: real input paths, a deterministic 1/60
  clock, no wall-clock waits on telegraphs or ceremonies. Two traps
  pre-recorded: use `runFor`, never `fastForward` (which fires due timers
  at most once — wrong for a game loop); and `waitForFunction` polls real
  time while fake time stands still, so waits become advance-then-assert
  loops. This also closes a validity gap: under SwiftShader every suite
  currently runs at the clamped `dt = 0.05` — a frame rate no child's
  device has. Stepped runs test true 60 fps timing.
- **On-device perf recorder.** A `?dev=1` ring buffer of rAF deltas →
  p50/p95/p99, longest frame, and `renderer.info.render.calls` per room,
  as an overlay plus an export button. Budgets are measured, not
  estimated — and the iPad 6 / Moto G04 jank gets numbers instead of
  vibes.
- **Global `?seed=`.** `Math.random` patched to seeded mulberry32 under
  dev (the spawn director already works this way). With the stepped clock
  this makes runs fully reproducible; a failing run's seed belongs in the
  commit's evidence line.

Per-suite timings from the sweep's job-summary tables decide the order
clock conversion happens in: slowest first — `verify-density.mjs` and
`verify-playthrough.mjs` are the clearest candidates from this first run.
