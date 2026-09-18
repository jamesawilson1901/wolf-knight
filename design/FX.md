# FX

Dad sent two packs for this. The first (`HitFXFree.zip`, "BinbunVFX_Vol2 —
Stylized Hit FX") turned out to be a Godot Engine asset pack — scene files,
GDScript, custom shader code, no textures or 3D models of any kind, wholly
incompatible with this project's static three.js stack. Reported back;
dad's own words: "Skip it for now. I'll track down a pack that works."

The second (`Particle_Pack.zip`, Kenney's own "Particle Pack 1.1", CC0)
is the real thing: 193 individual transparent PNG sprites — fire, smoke,
spark, magic, slash, star, muzzle-flash, scorch, trace, symbol, light,
twirl, window — no engine lock-in, just flat image files. Dad's own idea
for how to use them: "2d effects can be used by billboarding," which is
exactly right — a `THREE.Sprite` always faces the camera on its own, no
extra code needed to keep a flat image looking correct from a top-down
3/4 camera as it turns.

## v3.174 — real textures on the existing hit-feedback (SHIPPED)

The smallest true slice: `js/juice.js` already had a complete pooled
hit-particle system (`Juice.burst()`, `THREE.Points`, up to 256 live
particles, one shared material) — it just drew flat coloured squares,
because nothing textured had ever been vendored for it. Three sprites now
stand in for that:

| file | source sprite | use |
|---|---|---|
| `assets/fx/spark.png` | `circle_04.png` | the pooled burst's own dot (every hit, every hurt) |
| `assets/fx/flare.png` | `star_04.png` | one-off: a weakness hit's own "SUPER!" moment |
| `assets/fx/flash.png` | `light_01.png` | one-off: a heavy hit's extra glow |

Resized from the pack's own 512×512 source down to 128×128 — plenty for a
particle a handful of pixels across on screen, a fraction of the precache
weight for a fully-offline PWA. Licensed clean (Kenney's own CC0, verified
against the `License.txt` shipped inside the download —
`assets/LICENSES/kenney-particle-pack.txt`), no private-family-use
exception needed the way some earlier packs required.

**The pooled burst** (`Juice._points`) just gained a `map`/`alphaTest` on
its existing `PointsMaterial` — every hit/hurt in the game reads better
with zero new call sites, since `burst()` itself didn't change.

**Two new one-off flourishes**, `Juice.flare()`/`Juice.flash()`: a real
`THREE.Sprite` with its own object and lifecycle (grows, fades, disposes
over ~0.2-0.35s) rather than pooled — rare enough events (a weakness hit,
a heavy blow) to afford their own object, the same reasoning
`js/loot.js`'s drop pickups already use for a similarly-rare event. `flare`
fires from `js/enemies.js`'s own weakness-hit branch (the comment there
already said "gold flare" — it just wasn't a real one until now); `flash`
fires from `Juice.onHit('heavy', ...)` only, so the biggest blows read
biggest without every ordinary hit gaining a flourish it doesn't need.

Verified: `tools/verify-fx.mjs` (new) — the pooled burst material carries a
real texture, `flare()`/`flash()` each add a real `THREE.Sprite` to the live
scene, a flare visibly grows and fades partway through its life then is
removed from BOTH the tracking array and the scene once spent (disposed,
not leaked), a heavy hit pops a flash while a light hit does not, and a
REAL weakness-element hit in live combat (not a direct function call) fires
the flare through the actual `js/enemies.js` code path. Lint, verify-boot
and the `--quick` gate all green.

## Still to design

Loose notes for whoever extends this next:

- **More of the pack's 190 remaining sprites are sitting unused** — `flame`/
  `fire` for an elemental weapon's own trail, `smoke` as a possible upgrade
  to the existing `smokePuff()` enemy-death effect, `trace`/`twirl` for a
  dash/dodge streak, `muzzle` for a ranged mook's own shot. None of these
  are built; picked deliberately narrow for this first pass (the existing
  hit-feedback pipeline, not a redesign of every visual moment in the game).
- **Element-coloured flares**: `flare()`/`flash()` both take a `color` tint
  already (the sprite art is white/grey, tinted at the material level, the
  same trick every other reskin in this game uses) — a weapon's own
  `element` field (`js/items.js`) could tint the flare to match (a fire
  sword's weakness-flare burning orange, a moon staff's reading violet)
  rather than the current flat gold for every element.
