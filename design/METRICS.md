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

### Measured ground framing (phone landscape, 740 × 360, aspect 2.16)

Raycast through the four viewport corners onto the ground plane, camera settled:

| | |
|---|---|
| **Visible width at Kael's own depth** | **16.1 u** |
| Visible distance **ahead** of Kael | **12.8 u** |
| Visible distance **behind** Kael | **4.6 u** |
| Width at the far edge of the frustum | ~39.6 u (it fans out with distance) |

**This is why the current levels feel small.** A 16 × 12 room fits *entirely
inside one screen* — there is nothing off-camera to walk toward, so there is
nothing to explore. The moment a space exceeds ~16 u across, the far side is
off-screen and the child has a reason to move.

### Sizes derived from the camera

| Space type | Size | Why |
|---|---|---|
| **Island / district** | **32 × 26 u** | two camera-widths across — you cannot see it all at once. Crossed in ~7 s at knight speed, which is the minimum that fits approach → encounter → recovery |
| **Chokepoint** | **14 × 10 u** | *smaller* than one screen, on purpose: it must read as compression against the islands |
| **Optional pocket** | **20 × 16 u** | one screen-ish — a pocket should be legible at a glance, it is a reward not a maze |
| **Boss arena** | **26 × 26 u** | the Shadowgrip's charge runs ~8 u; the arena must hold a charge plus dodging room on both sides |

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
- a 32 × 26 island footprint marked on the floor, with the 16.1 u camera width
  drawn inside it
- the 2.5 u blind strip painted along a south wall
- one of every wall/floor module at deck height 0 and 0.185
- a draw-call/triangle readout for the zoo itself

Walk it before trusting any of the numbers above.
