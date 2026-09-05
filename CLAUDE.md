# Wolf Knight

A gentle, low-poly 3/4 top-down 3D action-adventure for young children (~5-9,
non-readers), built by a dad with his kids. Static PWA, vendored three.js
(`vendor/`), **no bundler, no build step, no package.json.**

## Start here

- **`SYSTEMS.md`** — plain-English index of every runtime system, first stop
  for any session.
- **`design/GAME-CONTRACT.md`** — binding numbers and rules. Drift here is a
  bug in whatever doc disagrees with it, not the other way round.
- **`design/COMBAT-SPEC.md`** — combat behaviors.
- **`docs/wolf-knight-combat-context.md`** — for ANY combat/enemy-system
  work, load this first and follow its §6 four-pass audit structure
  (static → difficulty → encounter → readability). It's the cached,
  citation-backed extraction of GAME-CONTRACT/COMBAT-SPEC for combat, plus
  the literature basis for each law. Re-cache it per its own §8 when a new
  family/variant/boss/form ships or a law's numbers change.
- `BUILDLOG.md` — project history and queued work.

## Running checks

`sh tools/lint.sh` — one second, no browser, no server. Two rules only
(`no-undef`, `no-unused-vars`); see `tools/eslint.config.mjs` for why those
two and no others. Run it before anything slower.

`sh tools/verify-all.sh` runs every `tools/verify-*.mjs` suite (serial,
~2h40m). `sh tools/verify-all.sh --par` runs them 3-at-a-time — **any `--par`
FAIL must be re-run serially before it's trusted** (CPU contention under
parallel load causes false failures). `sh tools/verify-all.sh --quick` is the
~3-minute push gate: boot, callable, graphs, story-beats, variant-names,
formlock, hud, completion, progression, roomid. Name a suite directly for just
that one: `sh tools/verify-all.sh verify-level3.mjs`. The static server must
be up first: `node tools/serve.mjs &`.

Every mode now takes its suite list from the `tools/verify-*.mjs` glob, so a
new suite is covered the day the file exists and there is no list to keep.

## IMPORTANT standing rules

- **No code-built creatures.** Every enemy is a shipped asset-pack model,
  reskinned via `VARIANTS` (tint/scale/stat/element deltas) — never a new
  model built in code. The point of this rule is visual consistency with the
  low-poly Quaternius/Kenney-style asset packs already in the game, not the
  sourcing method: a model added via a rigging/animation pipeline (2026-08-23
  amendment) is allowed if it (a) is a real mesh asset, not geometry
  constructed inline in JS, (b) matches the existing low-poly style —
  proportions, material approach, scale — closely enough to sit unremarked
  next to `wolf.gltf`/`Slime.glb`/etc., and (c) is properly rigged with the
  same clip vocabulary existing character models use (idle/walk/attack/death
  equivalents) so it animates to the same standard, not a static prop wearing
  a monster's shape. Procedurally generated creature geometry is still
  banned outright — this amendment covers rigging/animating *real* assets,
  not building creatures out of code.
- **Dev branch → main → GitHub Pages.** Work happens on a feature branch;
  shipping means merging to `main`, which deploys to
  https://jamesawilson1901.github.io/wolf-knight/. Never push straight to
  `main` without being asked.
- **Bump `CACHE_NAME` in `sw.js` on every deploy** that changes a cached
  file, or the PWA serves stale assets from its own service worker. Then run
  **`node tools/sync-cache.mjs --write`**, which carries the version into the
  `#badge` in `index.html` and regenerates the precache module list from what
  the game actually imports. Both used to be kept by hand and both had
  drifted: the badge cost half an hour chasing a phantom cache bug
  (2026-08-29), and on 2026-09-05 the precache was missing five live modules,
  three of them imported by every level file, which breaks an offline launch
  right after an update. `verify-boot` fails if either drifts again.
- **Never force-push or rewrite history.**
- Saves are additive-forever — never remove a field a save might still read.
- Verify fixes via real input paths (actual room jumps, real key presses
  through the `?dev=1` harness), not by inference from source alone.
- **Nothing merges to `main` on a red nightly.** The gate is only a gate if
  its answer is allowed to stop something. If the nightly is red, either fix
  it or prove the failure pre-existing and put it in `tools/known-fail.txt`
  with the date it was proven — never merge past it and never widen the
  manifest to make a new failure quiet.
- **Every report leads with the CI verdict**: the run link and its colour,
  before any prose about what was built. A cancelled or missing run is not a
  pass and must be said out loud. Thirty-eight consecutive cancelled runs and
  seven red nightlies went unremarked through 2026-09 because reports opened
  with the work instead of the gate.
- **A human looks at the rooms before a merge.** Any change that touches a
  room's contents or dressing gets an arrival-frame contact sheet of every
  room it touched, reviewed by eye. Most of what play-testing actually finds
  is visual and positional — a prop in the air, a wall filling the view, a
  body inside a rock — and that class is bounded by suites but never replaced
  by them (docs/TESTING.md §7b).
