# FIX PLAN — audited against the build as it stands (2026-08-07, v3.24.0)

The previous plan could not be located, so this is written fresh against the
code and levels as they actually are. Every item points at something real.

**Method.** Findings come from reading the current source and from the headless
suites (`tools/verify-level1.mjs`, `verify-level2.mjs`, `verify-level2-hub.mjs`,
`verify-level3.mjs`, `verify-sequence.mjs`, `verify-touch.mjs`). Where a number
appears, it was measured, not estimated.

**Headline.** The three rebuilt levels are **structurally sound and completely
unplayable**. Every topology assertion passes — the loop closes, spokes return,
no dead ends, teach sequences in order. But none of the three is reachable
except through the cheat menu, and Level 3 has no gameplay wired at all. The
expansion built the *spaces*; the *game* still runs on the old rooms.

---

# A · BREAKS OR FRUSTRATES A CHILD

## A1 · The rebuilt levels are unreachable in normal play
**✅ DONE (v3.25.0)** — dad chose REPLACE. The den now opens into `la`; beating
each boss opens the way onward (`le → vh`, `vz → t1a`, `tgl → f1`); the retired
rooms are redirected rather than deleted so old saves still load, mapped by
position in the level. Verified by `tools/verify-progression.mjs` — 24 checks,
all green. Original finding below for the record.

Nothing in the game links to `la`, `vh` or `t1a`. Grepping every module outside
`js/level*.js` finds references only in the cheat-menu table
(`js/main.js:303-326`). The shipping game still plays `r1 → r2 → r3`, `e1…`,
`w1…`, `f1…`. Each rebuilt level has a south door *out* to `den`
(`level1.js` `buildLa`, `level2.js` `buildVh`, `level3.js` `buildT1a`) but the
den has no door *in*, and `js/regions.js` REGIONS has no entry for them.

So a child playing normally sees none of this work. Every other item in this
plan is cosmetic until this is fixed.

**Decision needed from dad:** do the rebuilt levels *replace* r1-r3 / e* / w*,
or sit alongside them? Replacement is cleaner but retires rooms the kids know.

## A2 · Level 3 has no gameplay — it is geometry only
**BLOCKER · affects L3 · NEEDS SPLITTING (2-3 sessions)**

Every Level 3 teach marker has zero handlers. Measured by grepping `js/main.js`,
`js/gates.js` and `js/player.js`:

| marker | handlers |
|---|---|
| `teachBramble` (introduce) | **0** |
| `developBrambles`, `logBridge` (develop) | **0** |
| `knotTether`, `knotSnare` (twist) | **0** |
| `thornKnot` (conclude) | **0** |

Nothing anywhere sets the `wild3` WorldState milestones, so **both ring chords
can never open in play** — `tsA` and `tsB` exist but are permanently invisible.
The verified ring is real, but a child would walk the long way round forever.

Splits into: (a) bramble cut/regrow + the log bridge, (b) The Knot's tether and
snare — a genuinely new verb, the lash as a *rope*, (c) the thorn-knot and the
chord-opening state.

## A3 · The spark shrine grants the wrong wolf in Level 3
**HIGH · affects L3 · part of a session · blocked by A2**

`js/main.js:760` hardcodes the reward:

    if (m.sparkSpot && nearSpot(m.sparkSpot, 2.4) && !state.formsUnlocked.includes('earth_wolf')) {
      state.formsUnlocked.push('earth_wolf');
      if (WS.complete('vault', 'spark')) ...

But the markers carry their own intent:

    level2.js:581  sparkSpot = { spirit: 'petra', grants: 'earth_wolf' }
    level3.js:523  sparkSpot = { spirit: 'sylva', grants: 'verdant_wolf' }

Walking into Sylva's shrine in Level 3 therefore grants the **Earth** Wolf and
advances the **vault** (Level 2) state. The handler should read `grants` and the
room's region from the marker instead of hardcoding one level's answer.

## A4 · Level 2's fourth teach step is not implemented
**HIGH · affects L2 · part of a session**

`stompStagger` (`level2.js` `buildVz`) has **0** handlers. The docs' conclude
step — "his tower shield front-blocks everything, but a stomp at his feet
staggers him off his guard" — does not exist, so the Bone Warden is fought with
no use of the gift the level just taught. The marker is placed; only the
behaviour is missing.

## A5 · Cut brambles do not survive a save
**HIGH · affects L3 · part of a session · blocked by A2**

`js/level3.js:204` reads `state.flags.cut[id]`, but `cut` is **never declared**
in `js/state.js` and **never written** by `js/save.js`. Brambles a child cut
yesterday are back today. `gates.js:60` keeps a local `cut: false` on its own
objects, which is a different thing entirely and is not persisted either.

Contrast `burned`, `cracked`, `plates`, `chests`, `keys`, which are all declared
and round-tripped. This is a one-line-per-file omission with a real
"where did my progress go" consequence.

## A6 · A junction landmark is invisible approached from the north
**HIGH · affects L3 · one session · independent**

Measured identically at all four ring junctions
(`tools/verify-level3.mjs` section 6):

    t1a from tgl  → IN FRAME      ndc(-0.62,  0.84)
    t1a from tsA  → IN FRAME      ndc(-0.98, -0.03)
    t1a from t1b  → NOT VISIBLE   ndc( 0.00, -4.06)

Structural, not a placement slip. `js/main.js:1100` —
`camGoal.copy(player.root.position).add(CAM_OFFSET)` — the camera is a **fixed
world-space offset that never rotates with facing**. "12.8 u ahead" always means
north; only **4.6 u** of the world south of the player is ever on screen. A
landmark at room centre works from the south, east and west doors and sits 10 u
behind you entering from the north. **No single position satisfies both**, so
moving the prop only swaps which approach fails.

Options: a second smaller landmark at each junction's north end; a district
floor-inlay under the prop extending north (the floor fills the frame from every
approach — cheapest, free once merged); or accept ~5 u of walking before
recognition. **Recommended: the floor inlay.**

## A7 · Greybox is the shipping default
**✅ DONE (v3.25.0)** — default flipped to `false`, and `applySave` now STRIPS a
persisted `greybox` value so an old profile saved during dev cannot restore a
child into a checkerboard while keeping their real settings. Original finding
below.

`js/state.js:37` sets `greybox: true`. Any child who reached a rebuilt level
without going through the cheat menu's "dressed" entry would be playing a
checkerboard. Fine while these are dev-only; a hazard the moment A1 lands.
Should flip to `false` with the cheat menu keeping an explicit greybox toggle.

## A8 · Promise gates in the rebuilt levels are absent from the map
**MEDIUM · affects L1, L2, L3 · part of a session**

The shipping rooms register every "come back later" obstacle in the mystery log
(`js/main.js:624, 642, 663, 717, 788, 793` — six `logMystery` calls). The
rebuilt levels place **eight** promise gates between them
(`crackPromise`, `firePromise`, `underwaterPromise`, `bramblePromise`,
`icePromise`, `rootWallPromise`, `logPromise`) and register **none**.

A child who sees the ice-sealed spring in Thornedge gets no map entry and no
Pip line, where the same obstacle in Frostpeak gets both. Inconsistent
signposting across levels built in different sessions — exactly the drift risk.

## A9 · Difficulty goes DOWN at Level 3
**MEDIUM · affects L3 · part of a session**

Enemy placements per room, counted from the level modules:

| | placements | rooms | per room |
|---|---|---|---|
| Level 1 | 13 | 15 | 0.87 |
| Level 2 | 20 | 17 | **1.18** |
| Level 3 | 13 | 21 | **0.62** |

Level 3 is the largest level with the fewest enemies per space — roughly half
Level 2's density. The beat chart in LEVEL-MAP.md calls for intensity 4 through
the Bloomfall pack and 5 at Sylva. As built, Level 3 is the *emptiest* of the
three. Needs an encounter pass, not a redesign.

---

# B · PERFORMANCE

## B1 · Two Level 2 rooms are over the draw-call ceiling
**MEDIUM · affects L2 · one session · independent**

Dressed, measured: `vc1` **112**, `vc2` **106**, against a ceiling of 100.
Everything else fits (hub 82, worst Level 3 room 83).

The cause is characters, not geometry. Breakdown of `vc1`'s original 106:

    persistent 40  +  room geometry 23  +  three characters 43

A `SkeletonShield` is ~16 draw calls alone — body, shield and blade, each
redrawn for the shadow map. Cutting a third enemy from the room saved **zero**
calls, which disproves the obvious fix.

The real lever is shadow-casting on skinned characters, which is a whole-game
visual trade-off rather than a Level 2 decision — hence flagged, not taken.
A cheaper partial: drop `castShadow` on held items (shield, blade) only.

## B2 · No LOD anywhere
**LOW · affects all · one session**

The performance brief asks for "LOD plus fog to hide pop-in". Fog exists
(`26 → 52 u`, METRICS.md). There is no `THREE.LOD` in the codebase. Not currently
hurting — triangles peak at 50k of a 500,000 budget — but it is an unimplemented
requirement and should be recorded as such rather than assumed done.

**Not a problem, for the record:** memory is clean. A full 1 → 2 → 3 lap
accumulates **0 geometries, 0 textures**; 20 hub entries accumulate 0.

---

# C · POLISH

## C1 · The juice layer is tuned for corridors, not islands — RETUNE
**MEDIUM · affects all · one session · independent**

Asked directly: **yes, it needs retuning.** The effects were built against
16 × 12 rooms; the rebuilt spaces are 32 × 26 and the hub is 36 × 28.

- `js/effects.js:74` — the ground-slam ring is `RingGeometry(0.5, 0.95, 36)`, a
  **fixed ~1 u** flourish. In a 16 u-wide room that read as a real shockwave; on
  a 32 u island it is a dot. It does not scale with the space or with the
  ability's actual radius.
- `js/juice.js:59` — `effects.shake(0.12, 0.18)`, a fixed magnitude. Screen
  shake reads as proportionally *weaker* the more world is on screen.
- Nothing in `juice.js` or `effects.js` references room size, camera distance or
  a scale factor, so nothing adapts.

The honest summary: hit feedback still *fires* correctly everywhere — it has not
broken — but it has quietly become less legible as the spaces grew. Worth one
focused pass sizing the ring to the ability radius and scaling shake with
visible-area rather than leaving both constant.

## C2 · The second ring chord is barely a shortcut
**LOW · affects L3 · part of a session · design call, not a bug**

Measured: `tsA` (fallen log) saves **75 %** — 81 u against 319 u, a real relief
after the long lap. `tsB` (cut root-wall) is 81 u against 128 u, a **37 %**
saving, because `t3a` and `t2a` are only five ring-hops apart.

It is shorter, so it is not broken, but it is a convenience rather than a
shortcut. Its genuine value is skipping the *dark* Gloomwood stretch, not the
distance. Keep, cut, or move its far end further round the ring.

## C3 · Spec drift — docs vs implementation
**LOW · affects docs · part of a session**

| Doc claim | Reality | Which is wrong |
|---|---|---|
| LEVEL-MAP: Level 2 is "17 spaces" | 17 built | agree |
| LEVEL-MAP: Level 3 is "**18** spaces" | **21** built; the doc's own component list (4 districts × 2 + glade + shrine + puzzle + 4 chokes + 4 pockets + 2 shortcut legs) adds to 21 | **doc** — arithmetic error |
| LEVEL-MAP: The Rattle is an *optional* pocket | built **on Spoke B's spine** | **doc** — already annotated with the reason (a skippable twist teaches three quarters of an ability) |
| LEVEL-MAP: Cinder Bridges hero is "THE GREAT CHAIN" | built as **THE BROKEN SPAN** | **doc** — already annotated; no chain model exists in any GREEN pack |
| LEVEL-MAP: L2 develop step on "Spoke A's return leg" | built in `vb1` | **doc** — the shrine's shortcut home would let a child skip Spoke A's return entirely |
| ASSETS.md: blanket "CC0" on the pack table | four packs unproven | **doc** — already carries a caveat note |
| COMBAT-SPEC: Bone Warden "punish by flanking, jumping behind, or parry-stunning" | implemented; the *stomp* stagger (A4) is not | **implementation** |

Most drift is already annotated in-place. The Level 3 space count is a plain
arithmetic error worth correcting.

---

# TOO LARGE FOR ONE SESSION

- **A2 (Level 3 gameplay)** — three separate mechanics plus state wiring.
  Split as noted.
- **A1 (connecting the levels)** carries a design decision (replace vs
  coexist) that should be settled before any code is written. The wiring itself
  is one session once decided.

# DEPENDENCY ORDER

    A1 ─────────────────────────────► everything else is invisible until this lands
    A2 ──► A3, A5                      (L3 gameplay before its shrine and its save flags)
    A7 ──► must land with A1           (never ship a child a checkerboard)
    A4, A6, A8, A9, B1, B2, C1, C2, C3 are independent

Suggested first session: **A1 + A7** together — that is the smallest change that
turns this from a demo into a game.

> **A1 + A7 shipped in v3.25.0.** Next by severity: **A2** (Level 3 gameplay —
> needs splitting), then **A3/A5** which depend on it, then **A4** (Level 2's
> conclude step), then **A6** (junction landmarks) and **A8/A9**.
