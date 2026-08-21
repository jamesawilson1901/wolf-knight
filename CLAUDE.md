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

`sh tools/verify-all.sh` runs every `tools/verify-*.mjs` suite (serial,
~2h40m). `sh tools/verify-all.sh --par` runs them 3-at-a-time — **any `--par`
FAIL must be re-run serially before it's trusted** (CPU contention under
parallel load causes false failures). `sh tools/verify-all.sh --quick` is a
smoke test (boot, density, music). Name a suite directly for just that one:
`sh tools/verify-all.sh verify-level3.mjs`. The static server must be up
first: `node tools/serve.mjs &`.

## IMPORTANT standing rules

- **No code-built creatures.** Every enemy is a shipped asset-pack model,
  reskinned via `VARIANTS` (tint/scale/stat/element deltas) — never a new
  model built in code.
- **Dev branch → main → GitHub Pages.** Work happens on a feature branch;
  shipping means merging to `main`, which deploys to
  https://jamesawilson1901.github.io/wolf-knight/. Never push straight to
  `main` without being asked.
- **Bump `CACHE_NAME` in `sw.js` on every deploy** that changes a cached
  file, or the PWA serves stale assets from its own service worker.
- **Never force-push or rewrite history.**
- Saves are additive-forever — never remove a field a save might still read.
- Verify fixes via real input paths (actual room jumps, real key presses
  through the `?dev=1` harness), not by inference from source alone.
