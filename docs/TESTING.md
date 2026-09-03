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
- **A long suite left running in the BACKGROUND can be restarted under you**
  (2026-09-03). The log kept replaying from its first line and `ps -o etime`
  on both the wrapper shell and its node child read about a minute while
  wall-clock minutes went by — the run was being relaunched, not running
  slowly, and three "hangs" chased that afternoon were three fresh runs. Two
  responses, both worth having: run a driver in the FOREGROUND under
  `timeout 580`, and keep each suite short enough to fit there. Which is a
  design constraint on the suite, not a workaround — `verify-nightroad` asked
  seven questions with eleven room rebuilds until it was rewritten to ask them
  all in one visit per room, and a rebuild is the most expensive thing this
  harness does.

---

**Sequencing suites from shell: gate on PIDs, never on `pgrep -f` text.**
A wrapper script that waits with `pgrep -f "node tools/verify-x"` matches any
process whose command LINE contains that text — including its own heredoc, a
monitor tailing the log, or a dead watcher's shell — so the gate either never
opens or `pkill` with the same pattern kills the orchestrator, the watchers
and the caller's own shell in one swing (both happened, 2026-08-29, and cost
an hour of phantom wedges). Record `$!` when you start a job and wait on that
PID, or better: run stages sequentially in ONE script with `timeout` guards,
so there is nothing to gate on at all.

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
- **Flood-fill before you trust a wall.** A promise gate only means anything
  if it is the ONLY way in, and reading the builder cannot tell you that: the
  Night Road's thorn nook was walled at the mouth and open along the back of
  the room, so the chest could be taken without burning anything. Flooding the
  real colliders from the real spawn (the fill in `verify-reachable.mjs`,
  copied into a scratch probe with an ASCII map of the room) answers it in one
  run — and printing the map is what shows you the lane you thought you left.
- **A lane a flood-fill calls connected can still be a wall to a child.**
  The same room's east fork measured three units wide between a fallen column
  and a ruin; the driver wedged in it twice while the fill happily called the
  far side reachable. Connectivity is the floor, not the bar.
- **Drive the room in the shape a child will be in.** `verify-nightroad`
  walks the dark road twice — once measuring that the dark is real and the
  Dark Wolf lifts it, once walking the whole thing as the Knight, in the
  black, to prove the level is not gated on knowing the trick.
- **`verify-density` takes room ids** — `node tools/verify-density.mjs n1 n2`
  measures only those, which is a twenty-second loop instead of a twenty-minute
  one while dressing a new room. The completeness check still runs on the whole
  live registry.
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

### 7a · The property classes a "does it work" suite always misses

Dad's replay batch 2 (2026-08-30/31) shipped six real bugs behind a sweep
that was entirely green, and asked directly: how does this stop being
something only he can catch? The honest answer, worked out by looking at
what every one of those bugs had in common: **every suite up to that point
asked "does the feature work", and nothing asked these three questions of
the whole game at once.** They are now permanent, full-registry suites —
`tools/all-rooms.mjs`'s live room list, not a hand-kept sample — so a new
room or a new socket is covered the day it ships, not the day someone
remembers to test it.

1. **Does repeating an action, without moving, ever act again?**
   (`verify-abuse.mjs`.) The shard mint was a socket that retrieved and
   re-placed itself every frame a child stood still on it, paying a bonus
   each time — 3,504 coins from doing nothing. No suite had ever stood
   still anywhere and watched. This one stands on every carry socket in
   the game for three seconds and asserts nothing fires twice. Scope is
   honest in its own header: sockets only, because that is the one
   concrete case this session found — levers and pressure plates are not
   covered and are a named gap, not a blind spot.
2. **Does every rigged enemy's body actually move?** (`verify-motion.mjs`.)
   A skinned mesh gliding in bind pose passes every damage suite and every
   screenshot — nothing had ever measured a bone's rotation changing over
   time. This one wakes every mixer-driven enemy across a spread of rooms
   and asserts a bone actually rotates, translates, or scales within 90
   frames.
3. **Does every prop sit inside its own room, on the floor?**
   (`verify-bounds.mjs`.) A dresser function with a wrong coordinate frame
   put lone campfires at the room's origin (stacking into a "floating rock
   structure") and threw others past the walls into the black — and the
   screenshot audits only ever review the arrival frame, so anything off
   to the side or in a room nobody photographed that session was
   invisible. This one measures every prop's world-space bounds in every
   room and flags anything outside the shell or hovering with nothing
   under it. Getting this one trustworthy took three rounds of its own:
   an early version flagged a correctly-anchored chest (skinned-mesh
   geometry bounds are BIND SPACE, not where skinning actually draws it —
   measure by the animated skeleton's bone positions instead), a
   correctly-flying bat (enemies are gameplay bodies, not dressing —
   excluded outright), and a brazier's unlit flame (`visible = false`
   until ignited, but still had real geometry — skip anything hidden by
   itself or an ancestor). Each is a fact worth knowing before writing the
   next sweep of this shape.

`verify-landings.mjs` gained a fourth invariant the same session, for the
same reason: a static regex scan (fast, but blind to each room's real
half-extents) suggested ~30 doors across Levels 5-7 faced the wall they'd
just walked through. The dynamic version — `resolveCircle` against the
room the game actually built, reusing the sweep verify-landings already
ran for every door in the registry — found the real number: **one** (a
sign-swapped pair in Stormreach, fixed), out of 261 checked. The lesson
generalizes: a hunch from reading code is a lead, never a finding: what
found the previous six bugs, and what should be trusted to say "clean",
is always the thing that actually built the room and measured it.

### 7a(ii) · Four more classes, from dad's twenty-screenshot batch (2026-09-03)

Twenty screenshots, and the sweep was green through every one of them. The
same question as before — what did no suite ask? — gave four more full-registry
classes. Each is a permanent suite over `tools/all-rooms.mjs`, for the same
reason as the three above.

4. **Can a child actually REACH the reward?** (`verify-chests.mjs`.) Both chest
   systems already had tests, and both tests put the player where the chest
   was — the one thing a child cannot always do. This flood-fills every room
   from its spawn over the real colliders (`resolveCircle`) and asks whether
   each chest is inside the opening radius, twice: once as the room builds, and
   once over a REBUILD with every flag map answering true, every wolf granted,
   and every gate, crack, burn, cut, ice, watcher and water collider cleared.
   Unreachable in the second pass is a bug; unreachable only in the first is the
   design. It found one: Ember's Ketsu vault, sealed by the very block that
   unlocked it, permanently, with the puzzle flag set and the room reporting
   success.
5. **Does the reward arrive where the child is STANDING?** (`verify-onward.mjs`.)
   Three boss arenas hung their onward door at build time behind the defeated
   flag, so the room a child stood in the moment they won was a room whose
   reward had not arrived. Two things it had to learn on the way, both worth
   keeping: **`narration.blocking` is a getter**, so every driver that "quieted"
   narration by assigning `false` to it was writing to a read-only property and
   doing nothing (`narration.skip()` plus captions off is the real dismiss); and
   **winning levels a child up, and the perk card pauses the world**, which is
   exactly what a game-time countdown is for and exactly what a wall-clock one
   would have got wrong.
6. **Do the rooms LOOK like places?** (`verify-looks.mjs`.) Four of the twenty
   screenshots were not bugs in any system — a jar standing inside a column, a
   rectangle of darkness lying in a lit floor, a grey diamond painted round every
   pit, a doorway behind a pillar. Nothing could see any of them: `verify-density`
   counts things and `verify-grounded` catches what hovers, and neither has an
   opinion about how a room reads. This one does, over every room at once.
7. **Is the claim about difficulty measurable?** (`tools/probe-masher.mjs`, run
   inside `verify-bosses.mjs`.) "Beatable by spamming the attack button" is a
   claim about play, and the only honest test of it is to spam the attack button
   — walk at the boss, press J, no reading, no dodging, no shield. It found that
   the first fix did not work (a masher still took the region-one boss down in
   ninety seconds) and that the second one made the fight EASIER (backing off
   when crowded carried the child out of the swipe cone). Neither would have
   been visible from the code.

And the recurring lesson of the whole batch, for the fourth time: **a hand-kept
list rots.** `verify-landings` carried a 130-name array whose own header already
recorded it rotting once — and it had rotted again past the Night Road, the
Greenway and the Drowned Market, so the one check that asks "does this door put
a child down somewhere they can stand" had no opinion at all about six new
rooms. `verify-level3`'s dangling-door check had a two-name neighbour list and
reported a real door as broken when the Greenway shipped next to it. Both read
the live registry now. If a suite names rooms, that is the bug.

### 7b · A suite that lies is worse than no suite (2026-08-31)

Three separate lessons from one night, all the same shape: **a check whose
result depends on something other than the thing it is checking.** Each of
these cost real time, and two of them had been quietly wrong for weeks.

1. **A frozen world measures nothing.** `verify-loot`'s coin probe watched
   four coins for 25 seconds and reported "2 collected" one run and "0
   collected" the next, on identical code. It never cleared
   `narration.blocking` — and js/main.js's loop returns early while a story
   hint plays, so `updateShards` was simply not running. Any probe that
   watches the world evolve must hold narration open every frame, exactly
   the way the hand-written scratchpad probes do. A probe that measures a
   paused game will produce a number, and the number will be a lie.
2. **Never measure during an animation you triggered.** `verify-touch`
   waited a flat 1200ms after revealing buttons that animate to 1.3× scale,
   then measured their geometry. Enough on an idle machine; not enough on a
   loaded one — so it false-failed on "btn-attack overlaps form-badge" (a
   60px badge caught mid-reveal reporting 80px) and passed on the re-run,
   sending me stashing and bisecting a change that had nothing to do with
   it. Wait for the geometry to STOP MOVING (poll until N consecutive
   identical measurements), never for a duration you guessed.
3. **A long-standing failure is a finding, not furniture.** `verify-loot`
   had been failing for weeks and had been written off as pre-existing. It
   was right: coins really were bouncing forever and being deleted without
   paying, on any device slow enough to hit the dt clamp. The known-fail
   manifest exists so a PROVEN pre-existing failure doesn't turn the sweep
   red — it does not exist to let a red check become scenery. If a suite
   has been failing for more than a session, the next step is to find out
   what it is telling you, not to route around it.

And the structural fix that came out of it: **`pageerror` does not catch a
rejected promise.** This codebase does most of its loading fire-and-forget
(`spawnGearDrop`, room builds, every preload), and a rejection in one of
those used to vanish with nothing anywhere recording it — which is exactly
how `giveLoot()` shipped for weeks silently dropping every reward after a
potion. index.html now records both thrown errors and unhandled rejections
on `window.__errors`; `tools/launch.mjs` exports `pageErrors(page)` so any
suite can end with "and nothing threw while we did that". `verify-loot` and
`verify-armoury` assert it today; adding the line to the rest is mechanical
and worth doing as suites are touched.

**What is still not automatable, and why claiming otherwise would be the
same mistake again:** whether a coin's arc *reads* as a coin, whether a
chest looks the right size next to Kael, whether a boss fight *feels*
fair — these are judgment calls a suite can bound (verify-smash asserts an
apex height range) but never fully replace. The honest framing for a
report is "N new invariants now run automatically across the whole game,
and here is the one class of thing that still needs your eyes" — not
"content complete, all green."

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
