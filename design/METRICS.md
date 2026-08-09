# METRICS — LOCKED (2026-08-07)

**These numbers are fixed.** The expanded Level 1 is built by *adding*
grid-aligned space on this grid. **No existing space is rescaled** — every
physics assumption in the game (collision radii, aggro ranges, lunge distance,
boulder step length, telegraph distances, the camera blind strip) is expressed
in these units, and rescaling a room silently invalidates all of them.

Every value below was **measured from the running game**, not read off a
comment. Where a value is derived, the derivation is shown.

---

## Character

| Metric | Value | Source |
|---|---|---|
| **Body radius** | **0.32 u** | `BODY_RADIUS`, js/player.js — the collision circle for Kael and every enemy body |
| Body diameter | 0.64 u | derived |
| Knight walk speed | **4.6 u/s** | `FORM_DEFS.knight.speed` |
| Dark Wolf | 6.7 u/s | fastest form — sets the *upper* bound on how fast a space can be crossed |
| Fire / Earth / Verdant / Frost | 5.2 / 4.9 / 5.4 / 5.0 u/s | |
| Turn rate | 14 rad/s | `CONFIG.TURN_SPEED` |
| Dodge-roll speed | 7.5 u/s | `CONFIG.ROLL_SPEED` |

**One-tile movement distance:** at knight speed, **4.6 tiles per second**. A
1-unit tile is crossed in **0.217 s**.

---

## Grid

| Metric | Value | Notes |
|---|---|---|
| **Grid snap** | **1.0 u** | floor tiles are laid on integer steps (`for tx = 0; tx < w; tx++`) |
| Floor tile | 1 × 1 u | Kenney Nature Kit `floor-tile.glb`, scaled to fill exactly one cell |
| **Room dimensions** | **even integers** | shells are built as `(w, d)` centred on the origin, so an even size keeps the centre line on a grid boundary |
| Floor top (`world.deckY`) | 0 for ground planes · **0.185** for stone tile decks | the HEIGHT LAW: every ground decal offsets from this |

**All new geometry snaps to 1.0 u.** Half-unit offsets are permitted only for
*decoration* (a rock nudged 0.4 u off-grid to break repetition) — never for
walls, doors, plates or anything with a collider.

---

## Doorways and corridors

| Metric | Value | Notes |
|---|---|---|
| **Door width (standard)** | **2.4 u** | shell gap `from: -1.2, to: 1.2` — the size used by every shipped door |
| Door width (wide/boss) | 2.6 u | `from: -1.3, to: 1.3` |
| Door **zone** depth | 1.35 u | the trigger band, e.g. `addDoor(-1.2, 1.2, 5.85, 7.2, …)` |
| Wall band thickness | 1.0–1.4 u | collider from the inner face outward |
| **Absolute minimum corridor** | 0.64 u | 2 × body radius — Kael physically cannot fit through less |
| **Practical minimum corridor** | **2.0 u** | below this a child steers into the walls constantly; the tightest shipped gap (1.4 u, the r1 cubby mouth) is already fiddly and is the floor, not the target |
| **Chokepoint width** | **3.0 u** | wide enough to run through cleanly, narrow enough to read as compression |

---

## Camera — *the constraint that sizes rooms*

| Metric | Value |
|---|---|
| Projection | PerspectiveCamera, **fov 50**, near 1.5, far 100 |
| Pitch | **50°** below horizontal |
| Distance | **11 u** |
| Offset from Kael | (0, **8.43**, **7.07**) |
| Damping | 6 (`CONFIG.CAM_DAMPING`) |
| Fog | linear, **26 → 52 u** |
| `setPixelRatio` | capped at **2** ✅ already compliant |

### Measured ground framing (phone landscape, aspect 2.16)

Projected onto the ground plane with the camera settled, re-measured in v3.34.0.
The width row was previously **mislabelled** — 16.1 u is the width at the NEAR
edge of the screen, not at Kael. The true figure at Kael is 22.2 u:

| | |
|---|---|
| Visible width at the **near edge** (bottom of screen) | 16.1 u |
| **Visible width at Kael's own depth** | **22.2 u** |
| Visible width at the **far edge** | ~39.6 u (it fans out with distance) |
| Visible distance **ahead** of Kael | **12.9 u** |
| Visible distance **behind** Kael | **4.5 u** |

**Width scales with aspect ratio; ahead and behind do not.** At 740 × 360
(aspect 2.06) the width at Kael is 21.1 u, at 2.16 it is 22.2 u, but the ground
is 12.9 u ahead and 4.5 u behind on every device. Anything reasoning about what
a child can see BEHIND them — the blind-strip law, junction landmarks (A6),
whether a flourish reads (C1) — depends only on the two stable numbers.

**None of it changes with room size.** The camera is a fixed world-space offset
with a constant `CAM_DIST`, so a 14 × 10 choke and the 36 × 28 hub frame exactly
the same amount of ground, measured identically to the decimal. A bigger room
does not put more world on screen, and feedback tuned in one room reads the same
in every other.

**This is why the old levels felt small.** A 16 × 12 room fits *entirely inside
one screen* — nothing off-camera to walk toward, so nothing to explore. The
threshold is ~22 u across at the player (not the ~16 u this table used to imply),
which is why the island module is 32 × 26.

### Sizes derived from the camera

| Space type | Size | Why |
|---|---|---|
| **Island / district** | **32 × 26 u** | two camera-widths across — you cannot see it all at once. Crossed in ~7 s at knight speed, which is the minimum that fits approach → encounter → recovery |
| **Chokepoint** | **14 × 10 u** | *smaller* than one screen, on purpose: it must read as compression against the islands |
| **Optional pocket** | **20 × 16 u** | one screen-ish — a pocket should be legible at a glance, it is a reward not a maze |
| **Boss arena** | **26 × 26 u** | the Shadowgrip's charge runs ~8 u; the arena must hold a charge plus dodging room on both sides |
| **Hub** *(added, Level 2)* | **36 × 28 u** | the Great Vault is crossed **six times**. A hub that size holds five doorways with 18 u between the two that share a wall, and leaves a corner far enough from the entrance that lighting it later is a genuine discovery rather than a recolour. Two camera-widths plus a margin |

> **The hub is the only module added since the lock.** Same 1.0 u grid, same
> even-integer rule, same door and corridor widths — it is a new *size*, not a
> new *system*. It is drawn concentric with the 32 × 26 island in the metrics
> zoo, because the only honest way to judge "how much bigger does this feel" is
> to walk the 2 u border between them.

**Fog check:** from one edge of a 32 u island the far edge is 32 u away, giving
a fog factor of (32 − 26) / (52 − 26) = **23 %** — a gentle haze, not a grey
wall. Hero props stay readable across a full island. If islands ever grow past
~40 u, fog `near` must move out with them.

---

## The two laws that constrain placement

- **HEIGHT LAW** — a ground decal below `world.deckY` is drawn *inside* the
  floor and is invisible. Every plate, act-here ring, doorway glow and scar
  offsets from `world.deckY`, never from a hard-coded number.
- **BLIND-STRIP LAW** — the camera looks north over the south wall, hiding a
  **2.5 u** strip of floor in front of it. **No interactive may sit within
  2.5 u of a room's south shell.** Measured from the southernmost box collider,
  *not* from the ground plane (the ground is built 8 u oversized, which made
  this test 4 u too generous until v3.21.1).

---

## Performance budget (target: mid-range Android, 2–3 years old, in-browser)

| Budget | Ceiling |
|---|---|
| **Draw calls** | **< 100 / frame** |
| **Triangles** | **< 500,000** scene-wide |
| Pixel ratio | ≤ 2 |
| three.js | **r185** — `InstancedMesh`, `BatchedMesh` and `BufferGeometryUtils.mergeGeometries` all available |

Techniques, in the order they should be reached for:
1. `InstancedMesh` for every repeated prop and tile *(already the house style —
   `instancePlacements()` in js/assets.js)*
2. `BatchedMesh` where geometries differ but share a material
3. `mergeGeometries` for static pieces that never move independently
4. Spatial chunking so frustum culling can skip whole sections — **a single
   large mesh partly on screen renders in full**
5. Room-based load/unload with a **real dispose** of geometry, materials *and*
   textures. Undisposed resources are the standard three.js leak; it matters
   here because the kids play for an hour at a time.

---

## The metrics zoo

`design`-approved reference scene, reachable from the cheat menu (🎮 → **📐
Metrics Zoo**). It exhibits, at true scale and on the grid:

- Kael beside a 1 u tile, a 2.4 u doorway, a 3.0 u chokepoint and a 2.0 u corridor
- the practical-minimum (2.0 u) and absolute-minimum (0.64 u) gaps side by side
- a 32 × 26 island footprint marked on the floor, with the 22.2 u camera width
  at Kael's depth drawn inside it (and 16.1 u at the near edge, for the fan)
- the 2.5 u blind strip painted along a south wall
- one of every wall/floor module at deck height 0 and 0.185
- a draw-call/triangle readout for the zoo itself

Walk it before trusting any of the numbers above.

---

## Touch targets (re-measured 2026-08-08 — the 2 cm law is repealed)

A control's size is a **physical** measurement and a browser only knows CSS
pixels, so the conversion is pinned to a stated device rather than guessed:

| | |
|---|---|
| Target device | 6.4" Android, 1080 × 2340, ~403 ppi, devicePixelRatio 3 *(Galaxy A54 / Pixel 7a class)* |
| Landscape physical width | 2340 px ÷ 403 ppi = 5.81 in = **14.75 cm** |
| Landscape CSS viewport | 2340 ÷ 3 = **780 × 360 CSS px** |
| **1 CSS px** | **0.01891 cm** |

**The 2 cm law is gone.** From v3.22 to v3.34 every control was built at
108 CSS px so it would clear a 2.00 cm minimum. That number came from a
touch-accessibility guideline written for forms, where a mis-tap costs money and
there is nothing behind the button. Here *everything* is behind the button. Dad
played v3.34 on a phone and the verdict was that the buttons take up too much of
the screen. Measured, they took **45.7 %** of it.

The law it is replaced by is not a size, it is a **budget**:

| | |
|---|---|
| Hard floor per control | **44 CSS px** (0.83 cm) — below this a thumb genuinely misses |
| Screen budget | **the controls may cover at most 22 %** of the view, joystick excluded |
| Measured now | **18.7 %** |

Sizes are chosen by eye within that budget and tested on the actual children,
which is the only test that was ever going to settle it:

| control | size | why |
|---|---|---|
| attack, special | **92 px** (1.74 cm) | pressed constantly, and pressed in a panic |
| ranged, defend, jump | **68 px** (1.29 cm) | deliberate presses, stacked in a second row |
| form badge | **60 px** (1.13 cm) | a tap-to-cycle, and mostly a *readout* |
| pause, inventory, potions | **60 px** (1.13 cm) | pressed between fights, not during |
| joystick base | 104 px | excluded from the budget — it draws where the left thumb already is |

The joystick knob and hint are `pointer-events: none` — feedback, not targets.

**Contextual, too.** Buttons that cannot do anything are not drawn. The throw
button belongs to the *form*, so `player.onFormChanged` now re-runs
`refreshControlReveal()` and it appears and disappears with the wolf rather than
only at load. Defend stays visible for every form because for a wolf it is the
dodge roll, not the shield.

**Thumb occlusion.** Held in landscape, a child's thumbs cover roughly the
bottom 45 % of the outer 22 % on each side. Buttons live there on purpose;
nothing that must be *read* may. The level badge and XP bar used to sit at
`top: 194px`, inside the left thumb zone, and moved to the top band.

Checked by `verify-touch.mjs`, which measures `getBoundingClientRect()` on a
real 780 × 360 landscape context with every progressively-unlocked control
forced visible — the most crowded the HUD ever gets. It asserts the floor, the
22 % budget, no overlap, and no readable HUD under a thumb. It no longer asserts
a size, because a size was the wrong thing to assert.
