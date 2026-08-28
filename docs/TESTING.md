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
