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
**✅ DONE (v3.26.0)** — split into three sessions, all verified.

| | scope | state |
|---|---|---|
| **A2a** | the lash CUTS — introduce, develop, the log bridge | ✅ v3.25.1 |
| **A2b** | THE KNOT — the lash HOLDS: tether a boulder, snare a hound | ✅ v3.26.0 |
| **A2c** | the great thorn-knot, the two chords, Sylva | ✅ v3.26.0 |

The four-step teach is real end to end, and all three world milestones hang off
one verb (`world.cutAt`) through a single `onCut` hook — one implementation,
three consequences. Verified by `tools/verify-l3-lash.mjs`,
`verify-l3-knot.mjs` and `verify-l3-chords.mjs`.

Two things this work turned up that the audit had not seen:

- **Level 3 had grown a second, broken copy of the cut system** — its own
  object shape, no `clear()`, and a `state.flags.cut` that was never declared.
  Its brambles could never have been cut. Fixed by SHARING `registerCuttable()`
  rather than adding the new flag namespace A5 proposed.
- **`cuttables` was the only gate list not created in the `World` constructor**,
  so `world.cutAt` existed in some rooms and not others — which is what the
  `if (world.cutAt && …)` guard in player.js was quietly covering for. `cutAt`
  is now a `World` method beside `burnAt` and `crackAt`.

**Design deviation, flagged:** the docs call the great log "a log you push
over"; it is CUT LOOSE with the lash. Pushing would mean a new verb after the
twist, or the boulder push used on something that is not a boulder. Awaiting
dad's call — if the doc stands, the code should change.

Original finding below.

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
**✅ DONE (v3.25.1)** — the handler reads `grants` off the marker. Verified:
Level 2's shrine gives the Earth Wolf and advances the vault; Level 3's gives
the Verdant Wolf. Original finding below.

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
**✅ DONE (v3.26.1) — but not the job the audit described.**

I probed before building, and the MECHANIC already worked: a stomp stuns every
grounded enemy, and `shieldUp` returns false while stunned, so the Warden's
guard already dropped with no Warden-specific code at all.

    {"guardBefore": true, "stunned": 2.34, "guardAfter": false, "punishLands": true}

"`stompStagger` has 0 handlers" was true but misleading. The behaviour existed;
the TEACHING did not, and a child had no way to discover it. So the fix is
smaller and different: `GUARD BROKEN!` now appears over any guarding enemy a
stomp staggers (with the parry ring and a punch), Pip teaches it only when the
child is facing a RAISED shield while holding the Earth Wolf, and the same rule
is asserted on the shieldlings so the Warden is the exam, not a special case.

**My first probe lied to me.** It reported `blockedFrontal: false` — apparently
a broken shield. The cause was in the test: `takeDamage` reads `this._pp`, the
player position cached during `update()`, and the probe set the position
directly without stepping the world, so the block check never ran. The verifier
now steps `w.update()` first, and asserts the WHOLE chain rather than the one
link the fix touched. Original finding below.

`stompStagger` (`level2.js` `buildVz`) has **0** handlers. The docs' conclude
step — "his tower shield front-blocks everything, but a stomp at his feet
staggers him off his guard" — does not exist, so the Bone Warden is fought with
no use of the gift the level just taught. The marker is placed; only the
behaviour is missing.

## A5 · Cut brambles do not survive a save
**✅ DONE (v3.25.1)** — resolved WITHOUT adding `state.flags.cut`. The real
machinery already existed and persisted through WorldState; Level 3 had
invented an incompatible second one. `registerCuttable()` is now shared, so a
cut bramble is recorded exactly the way every other gate is. Original finding
below.

`js/level3.js:204` reads `state.flags.cut[id]`, but `cut` is **never declared**
in `js/state.js` and **never written** by `js/save.js`. Brambles a child cut
yesterday are back today. `gates.js:60` keeps a local `cut: false` on its own
objects, which is a different thing entirely and is not persisted either.

Contrast `burned`, `cracked`, `plates`, `chests`, `keys`, which are all declared
and round-tripped. This is a one-line-per-file omission with a real
"where did my progress go" consequence.

## A6 · A junction landmark is invisible approached from the north
**✅ DONE (v3.28.0)** — every junction now says its name twice. A pair of
half-size copies of the junction's OWN landmark stand just inside its north
door, 1.2 u ahead of where a child lands, so the silhouette is at the top of
the frame the instant they arrive; the big one at the centre is still the
payoff when they turn round. All 16 approaches across the four junctions now
show a landmark (`tools/verify-level3.mjs` section 6), dressed and greybox.

Not the floor inlay this entry recommended. The inlay would have made the
verifier pass by weakening what it asks — the check is "is the LANDMARK in
frame", and a coloured floor is not a landmark. Repeating the silhouette
answers the question as asked, and reads as architecture: the ring's north
gates are marked gates.

Two things fell out of it:

- **The verifier was asking a slightly wrong question.** It projected one
  object; a junction may legitimately say its name more than once, and a child
  reads the silhouette, not the instance. It now projects every landmark
  instance and reports which one was seen (`centre` or `gate`).
- **Thornedge's shrine is a character model** (`assets/chars/knight.glb`), and
  a character rig never merges into the static batch. Two more copies took
  `t1a` from 79 draw calls to **119**. The gate markers there are smaller
  stones set at the same lean, in the same grey, on the same base — cheaper,
  and the truer fiction: there was one wolf-knight before Kael, not three.
  `t1a` is now 85 dressed, and the worst room in Level 3 with it.

Original finding below.

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

### Also settled this session

`tsB is shorter than walking round` had been failing against a threshold of
`0.5` that was an unmeasured guess when the verifier was written. Both shortcut
legs measure `0.63` — 81 u against 128 u, a 37% saving — and dad accepted that
as plainly shorter on the walk. The bar is now the accepted figure with a
little room (`0.7`), so it stays an assertion and a future edit that erodes the
saving still trips it.

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
**✅ DONE (v3.27.0) — and the audit had understated it. Twice.**

Wiring the map entries turned up two much worse faults behind them, both now
fixed and both covered by `tools/verify-promises.mjs`, which flood-fills each
room's real colliders from its real spawn and then drives the real verb:

1. **The gates could never be opened.** `promiseGate()` in `js/levelkit.js`
   drew the obstacle, dropped a box collider and registered with **no gate
   system at all** — not `crackables`, not `burnables`, not `cuttables`, not
   `shatterables`. Level 1's cracked wall, Level 1's scorched barricade, Level
   2's thorn tangle and Level 3's ice-sealed spring were permanent walls. A
   child coming back with the exact form the gate advertises found the stomp,
   the slam, the lash and the breath all did nothing. `promiseGate` now takes a
   required `{system, id, region}` and rides the SAME system the shipping rooms
   use, including the "already opened" check on re-entry.
2. **...and it did not matter, because you could walk round them.** All five
   promise obstacles sat loose in the middle of a 32×26 island or a 20×16
   pocket with the reward beside them and open floor on every side. The flood
   fill reached every chest with the gate standing. Each one now has an alcove:
   two wall runs, with the gate as the only mouth. Measured nearest-approach
   with the gate shut is now 3.2–5.2u; after the verb, 0.8u.

Two supporting changes fell out of it: `world.shatterAt` is a World method
rather than something `iceGate()` defined lazily (the same bug class already
fixed once for `cuttables`), and every gate entry may carry a `hitR` so a blow
landing anywhere ALONG a wall catches it — without that, an 8u-deep gate only
answered to a slam within 2.6u of its exact centre point.

One knock-on: Level 1's pup #3 sat inside the scorched alcove, so walling the
alcove properly would have locked a collectible behind a form two levels away.
The pup moved to `(-6, -6)`, outside the gate.

Original finding below.

The shipping rooms register every "come back later" obstacle in the mystery log
(`js/main.js:624, 642, 663, 717, 788, 793` — six `logMystery` calls). The
rebuilt levels place **eight** promise gates between them
(`crackPromise`, `firePromise`, `underwaterPromise`, `bramblePromise`,
`icePromise`, `rootWallPromise`, `logPromise`) and register **none**.

A child who sees the ice-sealed spring in Thornedge gets no map entry and no
Pip line, where the same obstacle in Frostpeak gets both. Inconsistent
signposting across levels built in different sessions — exactly the drift risk.

## A9 · Difficulty goes DOWN at Level 3
**✅ DONE (v3.29.0) — and the density was the smaller half of it.**

The audit blamed the head count. The head count was a contributor; the cause was
`applyVariant` in `js/enemies.js`, which set `e.hp = v.hp` — a flat overwrite of
the number the `Enemy` constructor had just computed. That made a varianted
enemy opt out of BOTH difficulty levers the rest of the game runs on: the level
scaling in `enemyScale()` and the Gentle-mode hp relief.

Levels 1 and 2 barely use variants, so it never showed. **Level 3 is made of
nothing else** — every hound is `thorn`/`elderthorn`, every moth is `wisp`:

    player level        1     4     8    12    16
    L2 skeleton       3.0   3.5   4.5   5.5   6.5   (scales)
    plain hound       4.0   5.0   6.0   7.5   9.0   (scales)
    THORN HOUND       3.5   3.5   3.5   3.5   3.5   (did not)

A child reaches the Wild Woods at about level 5-7, so the corrupted, supposedly
tougher forest creature was the **weakest thing in the game**. Variant hp now
feeds the same formula as everything else, which also means Gentle mode reaches
the woods for the first time.

Two knock-ons, both intended: Frostpeak's rime family and Level 1's one Elder
Hound start scaling too, having been frozen the same way.

**`SkeletonShield` was missing from `XP_VALUES`**, so Level 2's four
shield-bearers — the toughest ordinary enemy in the game — awarded nothing.
`die()` guards with `|| 0`, so no save was ever corrupted; it just starved the
level curve and landed a child in the woods under-levelled, which after the fix
above made Level 3 easier still. Added at 12, matching the Rogue.

### The encounter pass

Rewritten against the LEVEL-MAP beat chart rather than against a target number.
**25 placements / 21 rooms = 1.19 per room**, against Level 2's 1.18 — parity,
with the difficulty step-up carried by the hp fix rather than by crowding.

- `t1a` lost its only hound. The chart's first row is "the woods are wrong
  (quiet dread, **no fight**)" and `t1b` next door is labelled "first Thorn
  Hounds" — the placement contradicted both.
- Every rest beat stays empty: `tc1`, `tc3`, `tc4`, both shortcut legs, the
  shrine, and the two teach rooms that are not the twist.
- **The Bramble Blob is back.** `bramble` was written for this region in v3.19
  and every live placement went away when the `w*` rooms retired. Reviving it
  cost zero lines in `enemies.js` and gives Level 3 a third body shape — it had
  two, and three of its four districts threw the same thing at you.
- `t4a` is a pack again: two elders and three of the pack, per the chart's
  intensity-4 "the pack — Elder Thorn Hounds".

### What the measurement changed

`tools/probe-encounters.mjs` and `tools/probe-peak-calls.mjs` were written for
this. The first measures a room with and without its cast; the second kills
everything through the real damage path and reports the WORST frame, because a
room is not busiest when you walk into it.

That caught a real overrun: **`t3b` arrived at 86 calls and peaked at 102.** A
Bramble Blob costs ~17 draw calls at its peak, not 5 — it splits into two minis
on death and their drops land on top of the room's existing drops. Ordinary
drops are nearly free (`t4a`'s peak equals its arrival); splitting is not. The
blob moved to `t2p`, which arrives at 54. Worst frame anywhere in Level 3 is now
94, through the fight and not merely on arrival.

Also worth recording: **`CONFIG.ENGAGE` caps simultaneous attackers at 2** (1 on
Gentle, 3 on Brave) no matter how many bodies a room holds — the rest prowl a
waiting ring. That is what makes a density lever safe for a five-year-old, and
it is why `t4a` can hold five hounds without becoming a pile-on.

### The audit's own numbers were wrong

Recounted from source and confirmed against a live probe:

| | audit said | actually | rooms | per room |
|---|---|---|---|---|
| Level 1 | 13 | **8** | 14 | 0.57 |
| Level 2 | 20 | **20** | 17 | 1.18 |
| Level 3 | 13 | **16** | 21 | 0.76 |

Only the Level 2 row was right. The finding held regardless.

Original finding below.

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
**✅ DONE (v3.30.0) — and it was never really a Level 2 problem.**

The audit was right that the cause is characters rather than geometry, and right
that the lever is shadow-casting. It was wrong that this is a whole-game visual
trade-off: there is a version that costs nothing to look at.

`prepareCharacter()` in `js/assets.js` set `castShadow = true` on **every mesh of
every character**. A cast mesh is submitted twice — once to the shadow depth
pass, once to the beauty pass — and a character is not one mesh. The knight is
nine skinned parts plus a sword and a shield; every skeleton is nine more. Skinned
meshes are also the one thing `js/batch.js` can never merge, so the cost is
permanent and it is paid in every room, by the player, whether or not any enemy
is present.

Measured in `vc1`, then the worst room in the game: **32 of 112 draw calls were
characters entering the shadow map.**

**One character now casts one shadow** — from its largest skinned mesh, which is
the body, which is what the silhouette is made of. Held items (sword, shield,
blade) arrive through the same function as their own root with no skinned mesh,
so they stop casting too; that alone was the partial the audit suggested, worth 4
of the 29.

It is invisible. Screenshots of the Bloomfall with five hounds, animation frozen
so the shadow policy is the *only* difference, diffed against a control pair of
identical renders:

| | pixels differing >8/255 | >32/255 |
|---|---|---|
| control (same policy, two shots) | 2.40% | 1.62% |
| **body-only casting** | **2.49%** | **1.64%** |
| no character shadows at all | 3.26% | 2.22% |

Body-only sits inside the noise floor. Switching character shadows off entirely
saves only 5 more calls and *is* visible, so it was not taken.

### What it did to the whole game

Worst-case draw calls, sweeping a grid of standing positions per room (the
frustum decides what is submitted, so a single sample at the spawn understates
it — `tools/probe-drawcall-attrib.mjs` and the sweep in the same family):

| room | before | after |
|---|---|---|
| `vc1` | 110 | **82** |
| `vc2` | 105 | **83** |
| `vh` | 88 | 82 |
| `vb2` / `vb3` | 90 | 58 / 60 |
| Level 3 worst frame *through a fight* | 94 | **77** |

Level 2 verifies ALL CLEAN. Triangle counts fell with the calls, since
shadow-pass triangles count too.

**All 52 rebuilt-level rooms swept, worst standing position each** — this is the
honest number, and it is higher than a spawn-point sample suggests. Two of the
three design agents run for A9 independently flagged that sweeping the camera
finds up to +19 calls in the same room, and measured `t1b` 105, `t2a` 107 and
`t3a` 106 *before* this fix. After it:

| | worst room | calls |
|---|---|---|
| Level 1 (14 rooms) | `lb2` | 96 |
| Level 2 (17 rooms) | `vb2` | 97 |
| Level 3 (21 rooms) | `t3a` | 90 |

Every one is under the ceiling; the three rooms the agents flagged came down to
87, 83 and 90. Nothing in the three rebuilt levels is over 100 from any standing
position.

Original finding below.

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

## B3 · The Den is the last room over the ceiling
**MEDIUM · affects the hub · part of a session · independent**
**Found while doing B1 (v3.30.0).**

With B1 in, the Den is the only room in the game over 100 draw calls:
**113 worst-case**, standing at (-5, 8). It was far worse before B1 — it holds
more characters than any other room — but characters are no longer its problem.

Attribution (`tools/probe-drawcall-attrib.mjs den`): turning off static-mesh
shadow casting saves **18**, character shadows now save only 5. The Den's cost
is its own static geometry, and the reason is simple: it is hand-built in
`js/rooms.js`, and **the shipping rooms never call `flattenStatic()`**. Only the
three rebuilt levels do, from `finish()`.

The fix is to batch it like a rebuilt level. One prerequisite is already in
place: `world.npcs` has been added to `flattenStatic`'s protected-key list
(`js/batch.js`), because without it the villagers would be merged into the
scenery and stop moving — the exact failure the function's own comment warns
about. It changes nothing today, since no room with NPCs calls it yet.

Worth checking the other hand-built shipping rooms in the same pass; they are
all unbatched, and only the Den has been measured.

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
