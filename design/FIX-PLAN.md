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

## STATUS — every item closed (v3.34.0, 2026-08-08)

| | item | shipped |
|---|---|---|
| A1 | rebuilt levels unreachable | v3.25.0 |
| A2 | Level 3 has no gameplay | v3.26.0 |
| A3 | spark shrine grants the wrong wolf | v3.25.1 |
| A4 | Level 2's fourth teach step | v3.26.1 |
| A5 | cut brambles do not survive a save | v3.25.1 |
| A6 | junction landmark invisible from the north | v3.28.0 |
| A7 | greybox is the shipping default | v3.25.0 |
| A8 | promise gates absent from the map | v3.27.0 |
| A9 | difficulty goes DOWN at Level 3 | v3.29.0 |
| B1 | two Level 2 rooms over the draw-call ceiling | v3.30.0 |
| B2 | no LOD anywhere | closed — not needed, on measurement |
| B3 | the Den is the last room over the ceiling | v3.33.0 |
| C1 | juice tuned for corridors, not islands | v3.31.0 / v3.31.1 |
| C2 | the second ring chord is barely a shortcut | closed — dad's call, keep |
| C3 | spec drift, docs vs implementation | v3.34.0 |
| C4 | the pose lies about TIME (i-frames, windows) | v3.32.0 |

### Beyond the table — items taken from BUILDLOG's QUEUED NEXT list

With every row above closed, work comes from the newest `QUEUED NEXT` list in
BUILDLOG.md instead. Recorded here so the next session can see what has gone.

| | item | shipped |
|---|---|---|
| Q1 | economy/XP balance pass (shard income vs shop ladder, perk tiers past 12) | SKIPPED — a difficulty change; needs the kids |
| Q2 | Maren tier-2 stock after Stoneroot | v3.42.0 |
| Q3 | hard landscape lock | closed — already shipped (manifest `orientation`, the `#rotate` overlay, `screen.orientation.lock` on the first tap) |
| Q4 | S3 Wild Woods | v3.19 |

**Four of them were not the thing the audit described**, which is the most useful
record this file holds:

- **A8** was scoped as missing map entries. Underneath, four promise gates could
  never be opened at all, and every one could be walked around.
- **A9** was scoped as enemy density. The cause was `applyVariant` overwriting
  the difficulty-scaled hp, which pinned every Level 3 enemy at its level-1
  value — the corrupted forest creature was the weakest thing in the game.
- **B1** was flagged as a whole-game visual trade-off. It was one line
  (`prepareCharacter` casting shadows from every mesh of every character) and
  cost nothing to look at: measured inside the pixel-noise floor.
- **C1** was premised on rooms having got bigger. Measured, the camera frames
  identical ground in a 14 × 10 choke and the 36 × 28 hub. What was actually
  wrong is that every flourish lied about its ability's reach and shape — and
  two boss telegraphs pointed the wrong way, one by up to 162 degrees.

The habit that found all four: measure the thing before fixing the thing the
plan named.

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
**✅ DONE (v3.33.0)** — 113 → **95** worst-case, and the room is still alive.

`flattenStatic(world)` at the end of `buildDen`. The whole fix was that the
hand-built shipping rooms never called it while all three rebuilt levels do from
`finish()`.

Batching is precisely the change that can silently freeze a room — anything
merged keeps its build-time transform forever — so the safety was checked rather
than assumed. Skinned meshes are skipped outright (the villagers, Biscuit, the
shopkeeper, the wolf pup), the checkpoint flame rides a protected gameplay list,
`world.npcs` went into the protected keys during B1, and the three animated props
— Petra's heart, Cinder's ember, the moonstone orb — are marked `keepLoose`
where they are built. `tools/verify-den.mjs` samples every animated object over
90 frames and asserts it actually moved, then sweeps standing positions for the
worst frame.

Original finding below.

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
**✅ CLOSED (v3.34.0) — not needed, on measurement.**

LOD exists to buy back draw calls and triangles. After B1 (one shadow caster per
character) and B3 (the Den batched), **every room in the game is under the
ceiling**, swept across standing positions rather than sampled at the spawn:

| | worst room | calls |
|---|---|---|
| Level 1 (14 rooms) | `lb2` | 96 |
| Level 2 (17 rooms) | `vb2` | 92 |
| Level 3 (21 rooms) | `t3a` | 92 |
| Frostpeak (7 rooms) | `f2` | 99 |
| the Den | — | 95–99 |

Worst triangle count anywhere is ~50k against a 500,000 budget — two orders of
magnitude of headroom, because this is a low-poly kit game. LOD would add a
system, a per-model authoring step and a pop-in artefact to solve a problem the
measurements say does not exist.

**What IS worth doing instead**, if more headroom is ever wanted: the remaining
hand-built shipping rooms (Frostpeak's `f2` 99, `f4` 97, `f3` 96) still never
call `flattenStatic()`, exactly as the Den did not before B3. That is a one-line
change per room plus the same keepLoose audit `tools/verify-den.mjs` was written
for, and it is worth roughly 15-18 calls each — far more than LOD would buy, for
far less machinery. Logged here rather than opened as its own item because
nothing is over budget today.

Original finding below.

The performance brief asks for "LOD plus fog to hide pop-in". Fog exists
(`26 → 52 u`, METRICS.md). There is no `THREE.LOD` in the codebase. Not currently
hurting — triangles peak at 50k of a 500,000 budget — but it is an unimplemented
requirement and should be recorded as such rather than assumed done.

**Not a problem, for the record:** memory is clean. A full 1 → 2 → 3 lap
accumulates **0 geometries, 0 textures**; 20 hub entries accumulate 0.

---

# C · POLISH

## C1 · The juice layer is tuned for corridors, not islands — RETUNE
**✅ DONE (v3.31.0) — but the premise was wrong, and what was underneath is worse.**

**The room-scale premise is false, measured.** The camera is a fixed world-space
offset with a constant CAM_DIST, so the visible ground is **21.2u wide, 12.9u
ahead and 4.5u behind in every room** — identical in a 14x10 choke and the 36x28
hub, to the decimal. Bigger rooms do not put more world on screen, so screen
shake does not read weaker in them and nothing needed scaling with room size. The
shake magnitudes are unchanged; the only edit there was moving juice.js's two
hardcoded numbers into `CONFIG.JUICE` where the rest live.

**What was actually wrong is that the flourishes lied about reach and shape.**
`effects.groundSlam()` took no radius, so every caller drew the same ~4u circle:

| flourish | drew | ability truly is |
|---|---|---|
| knight spin | 4.0u | **2.3u** (its own comment said the ring "sweeps out to the spin's reach") |
| fire slam | 4.0u | 3.0u |
| stone stomp | 4.0u | 3.2u |
| vine lash | 4.0u circle | a 3.8 x 0.9 **corridor** |
| frost breath | 4.0u circle | a 40-degree **cone** |
| Blood Moon crash | 4.0u | 2.6u |

`groundSlam` now takes the ability's real reach, and an optional cone `{deg, fx,
fz}` that draws a wedge from the same primitive (RingGeometry has thetaStart /
thetaLength, so a cone costs no extra draw call). The growth eases out so the
ring arrives at its true extent and lingers while it fades, instead of still
expanding as it disappears — that is what makes an honest radius legible.
Ceremony (transformations, boss deaths) keeps the full 4u, having no hitbox to be
honest about; those are now visibly the biggest rings in the game, which reads
right.

**One ability, one number.** Two secondary radii disagreed with their own rings:
the stone stomp cracked rock at `SLAM_BURN_RADIUS` — the *fire* wolf's constant,
leaked into the earth wolf's move — 2.6u against a 3.2u ring, and the fire slam
burned at 2.6u against a 3.0u ring. Both now use their own ability's radius, so
a brazier inside the orange ring lights and a cracked rock inside the brown ring
breaks. `SLAM_BURN_RADIUS` is deleted; it had no other users.

`tools/verify-pose.mjs` fires each ability through the real input path, finds the
ring in the scene and measures its world radius and wedge angle: all five match
to within 0.02u.

### And then the boss telegraphs, which is where it actually mattered

An audit of every flourish against its hitbox turned up two direction bugs of the
same shape, both verified by measurement, both **high severity because a child
dodges by these**:

- **The Bone Warden's chop arc pointed the wrong way.** `rotation.z =
  -rotation.y + ...` on a mesh laid flat by `rotation.x = -PI/2` MIRRORS the
  heading instead of rotating it. Measured across seven facings, the red "the axe
  lands here" arc was correct at **exactly one** (171 degrees) and **up to 162
  degrees wrong** elsewhere — pointing almost directly away from the swing. Now
  0 degrees of error at every facing.
- **Boreal's dive lane had the same sign error**, lying perpendicular to the dive
  at diagonals — and worse, she **re-aimed at the child the instant the dive
  began**, discarding the direction she had just spent 0.9s advertising. The one
  floor decal a boss charge is allowed to draw was decoration. She now dives
  where the lane said.

Three more of the same family, all fixed: the Warden's chop arc stopped 0.9u
short of the axe (2.0u drawn, 2.9u hit); his spin — the attack you cannot step
out of sideways — was signposted with a 162-degree wedge that implied a safe
side, and is now a full ring; and both marks faded out *before* the damage frame.
Boreal's lane was 1.3u wide against a 3.2u-wide hit.

`tools/verify-telegraphs.mjs` measures the arc's world bearing against the
warden's forward at seven facings.

### One more, caught by the verification pass after the fact (v3.31.1)

The **fire breath** is the frost breath's twin — both a 38-40 degree cone — and
the first C1 pass gave the frost one an honest wedge while leaving fire as **the
only ability in the game with no ground mark at all**. Its three flame puffs were
drawn at ±0.3/±0.6/±0.9 against a real half-width of ±2.19u at the far step:
**2.4x too narrow and 0.96u short**. And its `meltAt` probes used a flat 1.6u
radius from 1.13u out, so the breath could melt a frozen brazier **0.47u BEHIND
Kael** — the Frostpeak gate verb, firing backwards.

It now draws the same cone from the same constants the hit test uses, the puffs
spread to the cone's true half-width at each step, and the probe radius is
clamped to its own reach so nothing behind can be melted. Verified at runtime:
76 degrees drawn, 3.4u reach, no page errors.

Worth recording how it was nearly shipped broken: the first version called
`effects.groundSlam(...)`, but `tryRanged(world)` takes no `effects` parameter.
`node --check` passes that happily — it is a ReferenceError at runtime, on the
first breath a child ever fires. It uses `juice.effects` now, the same handle
`js/boss.js` reaches for.

Original finding below.

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

## C4 · The pose lies about TIME, not distance — i-frames and windows
**✅ DONE (v3.32.0)** — all four, verified by `tools/verify-timing.mjs`.

- **The jump.** `airborne` now returns true for the whole visible arc when the
  arc is a JUMP (`jumpsUsed > 0`), and keeps the 0.35u threshold for hops — the
  roll's 0.28u and the lunge's 0.18u are not jumps, carry their own i-frames,
  and must not become free dodges of every ground attack. Measured: 0.658s
  visible, 0.658s dodging, 0 lies.
- **The lunge.** `LUNGE_IFRAMES` is deleted; the dodge reads `LUNGE_DUR`, so the
  invulnerable window IS the visible dash and the two cannot drift apart again.
  0.15 → 0.26.
- **The parry.** The shield now glints pale blue for exactly the window, snapping
  on the frame `defendStart` is stamped (not when the crossfade lands, which is
  what wasted 40% of it) and easing off when it closes. Its materials are cloned
  on mount — tinting the loader cache would have lit up every shield in the
  game, including the skeletons'.
- **The weapon arc.** A weapon narrower than 50 degrees now plays the STAB clip
  instead of the wide diagonal slice. Already-loaded animation, no new asset;
  the Long Spear (36 degrees) finally looks like what it hits.

Two things worth keeping from how it went:

**`node --check` is not a syntax check for this codebase.** It exits 0 on
`js/player.js` with a broken if/else chain, because a `.js` file parses as
CommonJS, hits the `import` on line 5 and never reads the body. It gave a false
pass twice in one session — once on a ReferenceError in the fire breath, once on
a genuine syntax error that stopped the game booting at all.
`tools/verify-boot.mjs` is the cheap real check: load the page, start a game,
report any page error. Run it first, always.

**A decaying counter must be sampled in the tick it is set.** The i-frame
assertion failed at 0.204 against 0.26 — the game was right and the test had
waited two frames, which under SwiftShader is long enough to eat 20% of the
window.

Original finding below.

C1 fixed every flourish that lied about *where* an ability reaches. An
adversarial verification pass over the same audit confirmed three that lie about
*when* — the visual and the rule disagree in time rather than in space. These are
combat-feel changes rather than feedback fixes, so they want their own session
and a playtest: each one alters what a child can survive.

- **The jump.** `JUMP_V 6.8 / GRAVITY 21` puts Kael visibly airborne for 0.648s
  and 1.10u up, but `get airborne()` is `airY > AIRBORNE_DODGE_Y` with
  AIRBORNE_DODGE_Y 0.35. Solving the arc, the dodge is live only from t=0.056 to
  t=0.591 — **17.4% of the jump, at each end, reads as airborne and takes the
  hit**, up to a third of the character's height off the floor. Worse than a rare
  mistime: `contact()` in `js/enemies.js` defaults to `{ground: true}` and
  re-tests every frame of overlap, so the landing window is sampled continuously.
  The fix has to be the `airY > 0 || airV > 0` variant rather than just lowering
  the constant — 0.35 is also what stops the roll's 0.28u hop and the lunge's
  0.18u hop from being free dodges.
- **The Dark Wolf lunge.** `LUNGE_DUR` 0.26 against `LUNGE_IFRAMES` 0.15: **42%
  of the dash has no i-frames and looks identical to the half that does**, and
  the 0.18u hop is below AIRBORNE_DODGE_Y so it dodges nothing either. The code
  calls the lunge "an attack AND an escape"; the form that most needs the dodge
  to be legible is also the one taking +30% damage (`DARK_HURT_MULT` 1.3).
- **The knight parry.** One `block` pose, crossfaded over 0.12s, pixel-identical
  during the 0.3s parry window and for the whole hold afterwards. `defendStart`
  is stamped when the button registers, so **40% of the window elapses while the
  shield is still crossfading up**, and when it closes the same pose silently
  downgrades to a 0.5-heart blunt block. Nothing marks the difference.

Also live and cheap, same family: `js/items.js` gives weapons an `arc` from 36 to
82 degrees — a **2.3x** difference in swing width — while every knight weapon
plays the same `Melee_1H_Attack_Slice_Diagonal` clip. The pose is identical; the
hitbox is not.

## C2 · The second ring chord is barely a shortcut
**✅ CLOSED (v3.34.0) — dad's call: 37% is fine, keep it.**

Asked directly and answered: "37% is fine. I'll let you know if it isn't after
first playthrough." Nothing to build. `tools/verify-level3.mjs` still asserts the
saving, against a bar set to the accepted figure with a little room (0.7) rather
than the unmeasured 0.5 guess it was written with — so an edit that erodes it
still trips.

Its real value was always the one the finding names: skipping the *dark*
Gloomwood stretch, not the distance.

Original finding below.

Measured: `tsA` (fallen log) saves **75 %** — 81 u against 319 u, a real relief
after the long lap. `tsB` (cut root-wall) is 81 u against 128 u, a **37 %**
saving, because `t3a` and `t2a` are only five ring-hops apart.

It is shorter, so it is not broken, but it is a convenience rather than a
shortcut. Its genuine value is skipping the *dark* Gloomwood stretch, not the
distance. Keep, cut, or move its far end further round the ring.

## C3 · Spec drift — docs vs implementation
**✅ DONE (v3.34.0) — and it found a load-bearing measurement error.**

The listed drift was mostly annotated-in-place already. Two real corrections, and
one that mattered more than "LOW" suggested:

**METRICS.md's camera framing table had the width row mislabelled**, and level
sizing has been reasoned from it ever since. It read "Visible width at Kael's own
depth: 16.1 u". Re-measured at the documented aspect: 16.1 u is the width at the
**near edge** of the screen — the bottom, 4.5 u behind Kael, closest to the
camera and therefore narrowest. The width at Kael is **22.2 u**. The doc's own
"~39.6 u at the far edge" is right and matches, which is what gives it away:
16.1 / 22.2 / 39.6 are the near, middle and far widths of one fan, and the table
had labelled the near one as the middle.

Corrected, with two things the table never said and every later session had to
re-derive: **width scales with aspect ratio (21.1 u at 2.06, 22.2 u at 2.16) but
ahead and behind do not** — 12.9 u and 4.5 u on every device — and **none of it
changes with room size**, because the camera is a fixed offset. A 14 × 10 choke
and the 36 × 28 hub frame identical ground, to the decimal. That last fact is the
one C1 was written against, and it is now recorded where the next session will
find it instead of measuring it again.

**LEVEL-MAP's Level 3 space count** said 18; 21 are built, and the doc's own
component list adds to 21. Corrected.

The COMBAT-SPEC row ("the stomp stagger is not implemented") is stale — A4
shipped it in v3.26.1.

Original finding below.

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
