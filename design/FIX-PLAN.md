# FIX PLAN — Stormreach Cliffs and the Sunken Vale (audited 2026-08-09, v3.35.0)

The previous plan (levels 1-3, every item shipped by v3.34.0) is archived at
`design/FIX-PLAN-2026-08-07.md`; BUILDLOG's references to A1-A9, B1-B3 and
C1-C4 mean the items in *that* file. This one starts a fresh ID space and
audits the two regions built after it: **Level 5, Stormreach Cliffs** (20
spaces, Aria, the Storm Wolf) and **Level 6, The Sunken Vale** (20 spaces,
Meri, the Tide Wolf).

**Why now.** Both regions shipped between v3.34.0 and today with **no BUILDLOG
entry and no FIX-PLAN row**. The overnight run of 2026-08-09 went looking for
work, found the previous table closed and the fallback queue in BUILDLOG dating
from v2.2.6, and flagged the gap. This is the pass that closes it.

**Method.** Read against the code as built, then measured: the existing suites
(`verify-boot`, `verify-density`, `verify-level5`, `verify-level6`,
`verify-storm`), a new probe written for this audit
(`tools/probe-door-entries.mjs`), and static traces of the marker/handler and
save/load paths. Where a number appears below it was measured, not estimated.

**Headline.** Stormreach is close to finished and mostly needs its guard rails
extended to it. **The Sunken Vale does not work.** Four of its twenty rooms
throw a ReferenceError on build — including the only door to its boss — and
neither region survives a save: the flag that opens the way onward from Aria's
Crown is never written to disk, so beating Aria and coming back tomorrow closes
the sixth region again.

Performance has gone backwards at the same time, and further than either
region: swept across standing positions, **ten of thirteen sampled rooms are
over METRICS.md's 100-call ceiling and two are over the 125 one the new
verifiers quietly adopted** — the worst is Stormreach's wind bridge at 142.
`vh`, measured at 82 when the archived B1 closed, is 130 today.

Both fatal faults are the same shape as faults this project has already fixed
once:
`node --check` cannot see a ReferenceError (v3.31.1, v3.32.0), and a flag that
gates the world has to be round-tripped by `js/save.js` (A5, archived plan).
The difference this time is that **nothing was watching**: `verify-level6` fails
today, and it is not in any default suite, so its failure has never been seen.

---

## STATUS

| | item | severity | shipped |
|---|---|---|---|
| A1 | four Sunken Vale rooms crash on build (`rimSides`) | **fatal** | |
| A2 | beating Aria or Meri does not survive a save | **fatal** | |
| A3 | the Vale's enemy family does not exist | high | |
| A4 | the Tide Pools puzzle locks nothing, and relights | high | |
| A5 | no pups in either region | high | |
| A6 | ten doors land on the wrong side of the room | medium | |
| A7 | Stormreach's shortcut can never open at the Landing | medium | |
| A8 | no potion is ever placed in either region | medium | |
| A9 | both regions play the Den's music — and so does every rebuilt level | medium | |
| A10 | neither region is on the map screen | medium | |
| B1 | two draw-call ceilings, and the game is over both (worst 142) | high | |
| B2 | the rebuilt levels have regressed 20-48 calls since B1/B3 | high | |
| C1 | `verify-density` stops at Stormreach — 20 rooms unmeasured | high | |
| C2 | `verify-progression` stops at Frostpeak — A2 shipped through the gap | high | |
| C3 | three modules missing from the service worker precache | medium | |
| C4 | `regions.js` still says the Sunken Vale is not built | medium | |
| C5 | three new room modules bypassed the locked module list | low | |
| C6 | spec drift, docs vs implementation | low | |
| C7 | tunables live inline instead of in CONFIG | low | |

---

# A · BREAKS OR FRUSTRATES A CHILD

## A1 · Four Sunken Vale rooms crash on build — `rimSides is not defined`

**The region cannot be finished. Its boss cannot be reached at all.**

`js/level6.js` calls `rimSides(world, halfW, halfD, D, seed)` four times — lines
510, 631, 744, 824 — and **the function is defined nowhere**. Level 5 has the
analogous helper (`stairSides`, `js/level5.js:411`); the Vale's was never
written. Measured, in the browser, through the real loader:

    ✗ dg1 did not build — PAGEERROR: rimSides is not defined

The four rooms are the whole rim, and the rim is the region's spine:

| room | joins | what is lost |
|---|---|---|
| `dg1` The East Rim | `d1b` → `d2a` | the Shallows to the Reedbeds |
| `dg2` The North Rim | `dsh` → `d3a` | **the DEVELOP teach step** (shallow / deep / shallow) |
| `dg3` The West Rim | `dtp` → `d4a` | the Drowned Town to the Salt Flats |
| `dg4` The South Rim | `d4b` → `ddp` | **the only door to Meri's Deep** |

Traced through the real door graph, the damage is worse than four rooms:

- **`ddp` has exactly one door** (`level6.js:877`, south to `dg4`) and `dg4` is
  the only room that opens into it (`level6.js:818`). With `dg4` dead, **Meri
  cannot be fought by any route, with or without the Tide Wolf.** The lagoon
  crossings reach the four shores; none of them reaches the Deep.
- **Before the gift, the region is three rooms long.** `d1a` opens to `d1b`
  (and to the lagoon only once a child can wade); `d1b` opens to `d1p` and to
  `dg1`. With `dg1` dead the reachable set from the region's entrance is
  `{d1a, d1b, d1p}` — and Meri's Spring, which grants the Tide Wolf, is four
  rooms further round a rim that does not exist. **A child cannot reach the
  gift, so they cannot open the lagoon, so they cannot reach anything else.**

Two things make this worse than a one-line omission:

- **It does not recover.** After `dg1` throws, every subsequent room load in the
  same session also fails, with no error of its own (`d2a`, then `d2b`, …). A
  child who walks onto the East Rim does not get a broken room; they get a
  broken game until they reload.
- **`node --check` passes `js/level6.js` cleanly.** This is the third time that
  has cost this project a shipped defect (the fire breath's `effects`
  ReferenceError in v3.31.1, the if/else chain in v3.32.0). The lesson was
  written down both times: *run the room, not the parser.*

**Fix:** write `rimSides` in `js/level6.js`, to the same brief `stairSides`
answers — a rim is a corridor module and dressing its middle blocks the walk,
so the props line both long walls. Then extend the boot check (see C2) so a
builder that throws fails a cheap verifier rather than a slow one nobody runs.

## A2 · Beating Aria or Meri does not survive a save

`js/save.js` writes an explicit flag list (lines 110-128). It carries
`sylvaDefeated` and `borealDefeated`. It does **not** carry `ariaDefeated`,
`meriDefeated`, `ariaHp` or `meriHp`, all four of which the game writes and
reads:

| written | read by | what breaks on reload |
|---|---|---|
| `boss.js:376` `ariaDefeated` | `level5.js:1052` — `scr`'s north gap | **the only door into the Sunken Vale closes again** |
| | `level5.js:1057,1063` | Aria respawns, at full health |
| | `menus.js:210` — the moonstone | the Sunken Vale drops off fast travel |
| `boss.js:382` `meriDefeated` | `level6.js:882` | Meri respawns; the healed Deep, her light and its gold chest never appear |
| `SKINS.aria.saveKey='ariaHp'` | `js/boss.js` | her wounds do not persist — against the v3.18 law every boss since has followed |
| `SKINS.meri.saveKey='meriHp'` | `js/boss.js` | same |

So a child beats the region-5 boss, watches the way north open, turns the tablet
off, and the next morning the sixth region does not exist. Nothing warns them;
nothing in the save is corrupt; the flag was simply never written down.

**Fix:** four fields in `save.js`'s `flags` block and four in `applySave`,
exactly matching the `sylva*`/`boreal*` pairs beside them. Additive-forever
holds — an old profile reads `false`/`0`, which is what it means. Then assert it
(C2): beat the boss, `persist()`, `applySave()`, check the door is still there.

## A3 · The Sunken Vale's enemy family does not exist

`js/level6.js` places 29 enemies across 13 rooms, every one of them asking for a
variant: `tide` (11), `deeptide` (7), `gull` (5), `drowned` (6). **None of those
four names is in `VARIANTS`** (`js/enemies.js:76-213`, which has the Kiln, Wild
Woods, Frostpeak and Stormreach families and stops).

`applyVariant` opens with `const v = VARIANTS[name]; if (!v) return e;` — an
unknown variant is silently the base class. So the Vale is fought entirely with
region-1 creatures wearing no paint:

| the design asks for | what spawns | hp at level 16 |
|---|---|---|
| Tide Blob — "a blob of standing water" | plain Cave Slime (green) | 6.5 |
| Deep Tide — "bigger, darker" | **the same plain Cave Slime** | 6.5 |
| Gull — wheels over the lagoon | plain Cave Bat | 4.5 |
| The Drowned — "what is left of the people who lived here" | plain Skeleton Minion | 6.5 |

Against Stormreach one region earlier, at the level a child arrives
(`hp = round((base + 1) × enemyScale() × 2) / 2`, `enemyScale()` 1.96 at level
13 and capped 2.2 at 16):

    Stormreach   Gale Hound   11.0      Storm Hound 15.5   Spark Blob 9.0
    Sunken Vale  Tide Blob     6.5      Deep Tide    6.5   Gull       4.5

**The last region of the game is 41% weaker at its baseline than the one before
it** — the exact shape of the archived A9, from a different cause. And two
further losses:

- **The weakness lesson stops.** `LEVEL-DESIGN-6.md` §5 says the family fears
  **storm**, so the thunder-dash earned one region ago is the answer here. No
  enemy in the game carries `weakness: 'storm'` — the whole registry is 14
  `fire`, 4 `earth`, 3 `moon`. (Worth recording beyond this region: nothing
  fears `verdant`, `frost`, `storm` or `tide` either, so **four of the eight
  forms can never trigger a SUPER!**)
- **The region has no cast of its own to look at.** Every other region since
  v3.19 tints its creatures. The drowned vale is fought against Ember Hollow's
  green slimes.

**Fix:** four entries in `VARIANTS`, following the Stormreach block immediately
above them — the pattern is a label, an hp base, a weakness and a tint function.
Nothing else changes; the spawn markers already name them.

## A4 · The Tide Pools puzzle locks nothing, and relights every visit

`dtp` is the Vale's one puzzle room (dad's law, one per level). Three braziers
burn on three islets; the splash puts them out; the comment says "the way north
opens when all three are dark."

Measured against the code, two separate failures:

1. **The way north was never shut.** `buildDtp`'s north door is a plain
   `sideDoor(world, 'n', …, 'dg3', …)` with no `when()` predicate, and the
   braziers are three 0.8u circle colliders in a 32 × 26 room. There is no
   `when:` anywhere in `js/level6.js` or `js/level5.js`. A child walks straight
   past all three and out the north door. Quenching sets
   `world.markers.puzzleSolved`, `WS.set('vale','poolsQuenched')` and
   `WS.set('vale','quench_' + id)` — **and nothing anywhere reads any of them**
   (grepped across `js/`).
2. **And it forgets.** `poolBrazier()` builds every brazier lit, unconditionally.
   The WorldState flags it writes are never consulted at build time, so a child
   who solves the puzzle, leaves and comes back finds all three burning again.
   That is the archived A5 — cut brambles not surviving a save — reborn in
   region 6, and the machinery to do it right (`WS.get` at build time) is what
   every other gate in the game already uses.

Stormreach's equivalent (`svn`, the Vanes) is sound by comparison: the gale
lanes themselves are the wall, so the puzzle is physically load-bearing.

**Fix:** read `WS.get(REGION, 'quench_' + id)` when the brazier is built and
start it dark; gate the north door on `WS.get(REGION, 'poolsQuenched')` (or wall
the north end so the braziers are the only mouth, per the archived A8's alcove
pattern). Then `verify-level6` should assert both halves — sealed before, open
after, still open on rebuild.

**Also worth measuring, not yet measured:** whether the thunder-dash lets a
child cross Stormreach's vane lanes one at a time and skip `svn`'s puzzle
altogether. `DASH_DIST` is 5.2u and each lane is 5.0u wide, so on the arithmetic
it should be possible. If it is, that is a design call for dad rather than a
defect — multiple solutions are not a bug — but it should be a known one.

## A5 · There are no pups in Stormreach or the Sunken Vale

`spawnPups()` (`js/pip.js:245`) reads `markers.pup1Spot … pup12Spot`. Levels 1-3
use those names (`pup1`, `pup3`, `pup4`, `pup7`, `pup8`). Both new regions
instead set:

    js/level5.js:579   world.markers.pupSpot = { x: 0, z: -3.5, id: 'pup_s1' };
    js/level5.js:851   world.markers.pupSpot = { x: 0, z: -3.5, id: 'pup_s3' };
    js/level6.js:490   world.markers.pupSpot = { x: 4, z: -2,   id: 'pup_d1' };
    js/level6.js:692   world.markers.pupSpot = { x: 0, z: -4,   id: 'pup_d3' };

`pupSpot` is read by nothing. **Four pups are placed and zero spawn.** The
region checklist asks for three per region and pays a heart for the set; both
regions ship two placements each and neither pays anything. The pocket rooms
they sit in (`s1p`, `s3p`, `d1p`, `d3p`) are labelled "optional · pup" in the
room tables and contain nothing at all.

**Fix:** rename to the numbered scheme — `pup9`/`pup10` for Stormreach,
`pup11`/`pup12` for the Vale, which is exactly the range `spawnPups` already
reserves — and add the third of each set. The HUD counter and the all-pups
reward then work with no other change.

## A6 · Ten doors put the child down on the wrong side of the room

`sideDoor(world, side, halfW, halfD, to, entry)` carries the arrival point in
the DESTINATION room's coordinates, and **nothing has ever checked it**. Every
topology verifier in `tools/` compares `door.to` against a room list; not one
looks at `door.entry`. `tools/probe-door-entries.mjs` was written for this
audit: it builds each room, flood-fills the real colliders from the real spawn,
and measures each arrival point against the destination's own door back the way
the child came.

**36 rooms, 80 doors. Nothing lands inside a wall** — which is the good news and
the reason this is A6 and not A1. Ten land somewhere other than the doorway:

    from → to        entry            distance to the return door
    d2a → dlg       (0, 13)          27.85   ← the far side of the lagoon
    ssA → s4a       (-9, 0)          24.85
    d1a → scr       (0, 8)           20.85
    s4a → ssA       (-9, 0)          20.85
    d3a → dlg       (0, -13)         20.57
    dlg → d2a       (0, -13)         19.76
    d1p → d1b       (7.5, 0)          8.35
    d4p → d4a       (7.5, 0)          8.35
    sc3 → svn       (9, 0)            6.85
    sc4 → s4b       (-9, 0)           6.85

The bottom four are the same side of the room, just deep — the child walks out
of the arch already 7-8u into the space. Untidy, arguably fine.

**The top six are the opposite side of the room.** Three of them are the
lagoon's own mouths, which is region 6's whole idea: swim north across the water
from the Reedbeds and you surface 27.85u away at the southern shore's doorway.
One is the way home from the Vale into Aria's Crown — walk south out of `d1a`
and you appear at the far end of the crown by the door to `sc4`, having crossed
the arena you just walked into. And two are the wind bridge, both ends: **step
east off `s4a` onto the bridge and you are put down at the far end of it**, so
the seven stone spans and the gale running down them are never walked.

**Is this new, or does the whole game do it?** The same probe over Level 3 as a
control — 21 rooms, 43 doors — finds **two** wrong-side landings, both mild
(8.3u and 9.75u, the boss room's pair), so the far-side landings really are a
new-regions problem rather than how this game has always worked.

The control did turn up one thing worth its own row when Level 3 is next
touched, and it is the worse kind: `t3a → tc2` lands at `(0, -7)` in a choke
whose north wall is at -5. **STRANDED** — outside the room, unreachable from its
own spawn. Out of scope for this plan; recorded here because the probe found it
and nothing else would have.

**Fix:** the entries. Each is a two-number edit and the probe names them. Then
keep the probe: an entry point is exactly the kind of number that is right the
day it is written and wrong the day a room's size changes.

## A7 · Stormreach's shortcut can never open at the Landing end

`s1a` builds its west gap and its door to the wind bridge only if
`WS.get('storm', 'windBridge')` (`js/level5.js:483,485,495`). **Nothing in the
codebase ever calls `WS.set('storm', 'windBridge')`** — grepped across `js/`;
the only other mention is the level's own spec table, which declares
`opensWith: 'windBridge'`.

`ssA`'s own doors are unconditional, so the bridge works one way: from the Open
Sky down to the Landing. From the Landing the far mouth is a blank wall
forever — and a child who takes the bridge down cannot take it back up.

`verify-level5` §8 is headed *"the shortcut runs both ways"* and passes, because
what it actually asserts is that `ssA` has doors to `s4a` and `s1a`. It never
looks at `s1a`.

**Fix (decide first):** either the bridge is a one-way descent, in which case
delete the dead `windBridge` branch and rename the verifier's heading to what it
checks; or it is a two-way shortcut like Level 3's chords, in which case
something has to set the flag — reaching `ssA`, or `s4a`'s bridge head, is the
natural trigger. **Smallest reversible option: set the flag when a child first
stands on the bridge**, which is how they learn it exists. Logged for dad.

## A8 · No potion is ever placed in either region

`world.markers.potionSpot` is set six times across the two regions — including
`sc4` and `dg4`, the rooms immediately before each boss — and **nothing reads
it**. Potions come from `world.potionSpots`, an array pushed by a helper in
`js/rooms.js:457`; the marker is only ever swept as a keep-clear hint
(`js/world.js:151`).

The region checklist says "campfire + potion pre-boss". Both regions have the
marker and neither has the potion. (The same dead marker sits in `js/level1.js`
and `js/level3.js`, so this is a whole-game gap that the new regions inherited
rather than invented — but the pre-boss rooms are where it bites.)

## A9 · Both regions play the Den's music — and so does every rebuilt level

`updateMusic()` (`js/main.js:970-982`) picks the track by room id prefix: `f` →
`stone-deep`, `w` → `causeway`, `k` → `kiln`, `e3`/`e` → the Stoneroot tracks,
**else** `bossDefeated` → `ember-calm`, else `region-ember`.

Those prefixes are the RETIRED room ids. The archived A1 replaced `r*` and `e*`
with `la…`, `vh…`, `t1a…` and left the old ids as redirects — and nobody
revisited this table. So every id the game actually plays in falls through to the
`bossDefeated` branch, and `ember-calm` is an alias for `den.ogg`:

| region | rooms | track played |
|---|---|---|
| 1 Ember Hollow (rebuilt) | `la…` | `den.ogg` |
| 2 Stoneroot (rebuilt) | `vh…` | `den.ogg` |
| 3 Wild Woods (rebuilt) | `t1a…` | `den.ogg` |
| 4 Frostpeak (hand-built, `f*`) | `f1…` | `stone-deep` ✓ |
| **5 Stormreach** | `s1a…` | **`den.ogg`** |
| **6 Sunken Vale** | `d1a…` | **`den.ogg`** |

And the boss branch names only `r3`, `w5` and `f5` — three room ids, two of them
retired — so **Aria and Meri fight to the cosy village theme too**, as do the
Shadowgrip, the Bone Warden and Sylva in their rebuilt arenas.

`LEVEL-DESIGN-5.md` §8 says "no music of its own … Stormreach plays the shared
region music", which is the intent. What it plays is the safest, most domestic
track in the game, over a storm-lashed cliff and a drowned town.

**Fix:** address the table to the ids that exist — a prefix case per region and
a boss-room list that names `le`, `vz`, `tgl`, `f5`, `scr`, `ddp`. Point the two
new regions at existing tracks until dad picks new ones (`causeway` for the
cliffs, `stone-deep` for the Vale's depths are both closer than the den).
Choosing the real tracks is a listening decision and stays dad's.

## A10 · Neither region is on the map screen

`Menus.showMap()` hardcodes two regions: Ember Hollow (`r1`, `r1b`, `r2`, `r2b`,
`k1`, `r3`) and Stoneroot (`e1`, `e2`, `e3`), gated on `state.spoken`. Wild
Woods, Frostpeak, Stormreach and the Sunken Vale have no cards at all, and the
footer says "More regions will appear as Kael frees them…" — which they never
do.

Worse, **every playable room it lists is a retired one**. The archived A1
replaced `r*`/`e*` with `la`/`vh`-and-onward and left the old ids as redirects,
so `state.room` never equals any room id on the map. The "⭐ You are here"
marker can now only ever appear on one card in the game: the Den.

The mystery log below it still works — that part of the archived A8 is intact —
so a Stormreach child sees their ??? cards under a map of two regions they have
never been to.

**Fix:** drive the region list off `js/regions.js` REGIONS (which already
carries `name`, `rooms` and `built` for every region) instead of a hardcoded
list, so a new region appears on the map by existing. That also fixes C4's
consequence in the same stroke.

---

# B · PERFORMANCE

## B1 · There are two draw-call ceilings, and the game is over both of them

`design/METRICS.md:143` is the law: **draw calls < 100 / frame**. The whole
archived B programme — B1 (one shadow caster per character), B3 (batching the
Den), B2 closed on the grounds that "every room in the game is under the
ceiling" — was worked to that number.

The two new regions are held to a different one, and nothing records who raised
it or on what measurement:

    js/water.js:70            "a rounding error against a 125 draw-call ceiling"
    design/ROOM-STANDARD.md   "111 (dressed) against a 125 ceiling"
    tools/verify-level5.mjs   check('worst room under 125 draw calls') → ssA 118 PASS
    tools/verify-level6.mjs   check('worst room under 125 draw calls')

**And the 125 check passes by measuring the wrong thing.** It reads the room's
draw calls at the spawn point. `tools/probe-worst-calls.mjs` exists because the
frustum decides what is submitted, so the worst frame is somewhere else in the
room — its own header says it produces "the number METRICS.md's '< 100 draw
calls' should be checked against". Swept across standing positions, 2026-08-09:

| room | region | at spawn | **swept worst** | standing at |
|---|---|---|---|---|
| `ssA` | 5 the wind bridge | 118 | **142** | (0, 8) |
| `s2b` | 5 the Gale Stair | 96 | **139** | (5, 8) |
| `vh` | 2 the Great Vault hub | 109 | **130** | (0, 8) |
| `sc2` | 5 the second stair | 100 | **129** | (0, 8) |
| `d1a` | 6 the Shallows | — | **118** | (0, 8) |
| `la` | 1 the Hollow | 111 | **115** | (0, 8) |
| `ld` | 1 | 107 | **109** | (0, 8) |
| `t3a` | 3 the Thunderhead junction | 93 | **108** | (0, 8) |
| `vc2` | 2 | 95 | **103** | (-5, 8) |
| `dtp` | 6 the Tide Pools | — | **101** | (0, 8) |
| `lb` | 1 | 104 | 99 | (0, 8) |
| `s1a` | 5 the Landing | 93 | 95 | (0, 8) |
| `dlg` | 6 the lagoon | — | 89 | (0, 13) |

**Ten of thirteen sampled rooms are over 100. Two are over 125.** The worst room
in the game is `ssA` at 142 — the wind bridge, a 24 × 12 corridor with seven
stone spans in it — and `verify-level5` calls it clean.

This is one decision and two fixes. The decision is dad's: **is the ceiling 100
or 125?** The fixes are not optional either way — at 142 and 139 the two worst
rooms breach both numbers — and the verifiers must sweep rather than sample, or
the ceiling they assert is decorative.

## B2 · The rebuilt levels have regressed 20-48 calls since B1/B3 closed

The sweep above is not only a Level 5/6 story. Against the swept worst-case
numbers recorded when the archived B items closed at v3.30-v3.34:

| room | at B1/B3 close | today | change |
|---|---|---|---|
| `vh` | 82 | **130** | **+48** |
| `t3a` | 90 | 108 | +18 |
| `vc2` | 83 | 103 | +20 |
| `la` | — | 115 | (never recorded) |

`vh` was measured at 82 in the B1 table and is 130 now. Nothing in the archived
plan predicts that; the levels 5/6 branch is what landed in between, and it
brought three new modules the rebuilt levels all use (`js/dressing.js`,
`js/ground.js`, `js/districts.js`). The likeliest reading is that levels 1-3
were re-dressed and never re-measured — which is also exactly what C1 says about
the density check's blind spot, one measurement over.

**Fix:** sweep every room, not thirteen, and put the table in METRICS.md beside
the ceiling it is measured against. `probe-worst-calls` takes a comma-separated
room list and does the rest.

---

# C · GUARD RAILS AND DOCS

## C1 · `verify-density` stops at Stormreach — twenty rooms are unmeasured

`tools/verify-density.mjs`'s `ROOMS` table lists Ember, Stoneroot, the Wild
Woods and Stormreach: 72 rooms, ending at `ssA`. **Not one of the Sunken Vale's
twenty spaces is in it**, and the check passes (exit 0) while ignoring them.

This is the check whose own comment says it exists because "every topology
assertion in this suite was green while the rooms were empty boxes, which is
exactly how 'big but bare' reached a playtest". It cannot catch that in the
newest region because the newest region is not on its list.

**Fix:** add the twenty rooms with their module kinds, and treat the `rim` and
`lagoon` modules the way the table already treats the `stair` (measured as a
choke, with the reason written beside it). Then re-measure — the Vale's rooms
have never been held to the arrival-frame bar at all.

## C2 · `verify-progression` stops at Frostpeak — A2 shipped through the gap

`tools/verify-progression.mjs` checks the den → `la`, `le` → `vh`, `vz` →
`t1a`, `tgl` → `f1` and the old-room redirects: 24 checks, all green, and the
newest two handoffs — `f5` → `s1a` and `scr` → `d1a` — are not among them.
Neither is any check that a region unlock **survives a save**, which is
precisely how A2 shipped.

`verify-level6` would have caught A1, and it is not in `verify-all.sh`'s default
run (which is `verify-boot` + `verify-density` plus whatever is named on the
command line). Its last run failed and timed out, and nobody saw.

**Fix, in the order that pays:**

1. Extend `verify-boot`'s static pass to **load every room module and call every
   builder**, or add the room list to a cheap headless "every room builds"
   check. A1 is a twenty-second failure that took a twelve-minute verifier to
   find, and only because it was run by hand.
2. Extend `verify-progression` through `f5 → s1a → scr → d1a → ddp`, and make
   each unlock assertion round-trip through `persist()` + `applySave()`.
3. Put `verify-level5` and `verify-level6` in `verify-all.sh`'s default list.
4. Keep `tools/probe-door-entries.mjs` (new, this audit) and promote it to a
   verifier once A6's ten entries are fixed, so the assertion is "no door lands
   away from the door it opens into" rather than a table someone reads.

**And one lesson about the probes themselves.** The first run of the new door
probe reported *"✓ every door lands inside the room it opens into"* while
measuring **nothing**: `page.evaluate` was handed the read function as a
template string, returned `undefined` for every room, and the loop's own
`if (!info[id]) continue;` guard skipped them all in silence. It now prints
`read N of M rooms, K doors` on every run, unconditionally. A verifier that
measures nothing and a verifier that finds nothing print the same tick, and this
project has been bitten by that before — the archived A6's landmark check and
the C1 pose check both had to be re-read for the same reason.

## C3 · Three modules are missing from the service worker precache

`js/districts.js`, `js/dressing.js` and `js/ground.js` are not in `sw.js`'s
PRECACHE list. Every other module in `js/` is, and all 46 asset paths the two
new levels reference are too — checked exhaustively, these three are the only
gaps.

`sw.js` caches at runtime on a successful fetch, so a child who has played
online once is fine. A child who installs the game and goes offline before
entering a dressed room is not: the fetch fails and `js/ground.js` is imported
by every level module. The engineering law is "add every new file to PRECACHE".

**Fix:** three lines. Do not bump `CACHE_NAME` — that belongs to a deploy.

## C4 · `regions.js` still says the Sunken Vale is not built

    sunkenvale: { name: 'Sunken Vale', built: false, spirit: 'Meri',
                  grants: 'tide_wolf', gates: [] },

Twenty rooms, a boss, a form and four gates exist. The manifest has no `rooms`,
no `beats`, no `threshold`, no `restoration` and no gate declarations, which
means `validateRegions()` — the machine check for lock-before-key — has nothing
to check for region 6, and anything driven off REGIONS (see A10) cannot see it.
Stormreach's entry, by contrast, is complete.

Two smaller faults in the same file:

- `GRANTED_IN` declares `storm_wolf: 'stormreach'` **twice** (lines 22-23). The
  duplicate key is harmless — the second wins and every ability is still
  mapped — but it is the kind of copy-paste that hides a missing line.
- Stormreach's gate list still calls the wind gate `s_sail`, "the great
  sail-gate at s4b", after `LEVEL-DESIGN-5.md` recorded the rename to THE WIND
  GATE and the reason (no sail model exists in any vendored pack).

## C5 · Three new room modules bypassed the locked module list

`js/levelkit.js:39` MODULES is the locked list, with dad's rule written beside
it: *"A level picks from this list; if a space seems to want a size that is not
here, the module gets redesigned rather than the grid getting bent."* The hub
was added to it properly in Level 2, with a note in METRICS.md.

The STAIR (24 × 12), the RIM (22 × 14) and the LAGOON (34 × 30) are local
`const`s inside `js/level5.js` and `js/level6.js`. None is in MODULES; none is
in METRICS.md's zoo, which claims to exhibit "one of every wall/floor module".
Both design docs promised the opposite — "straight into the metrics zoo before
it is used at scale, same rule as the hub".

Nothing is broken by this today. It matters because the zoo is where a size gets
judged before twenty rooms are built at it, and three sizes have now skipped it.

## C6 · Spec drift, docs vs implementation

| doc claim | reality | which is wrong |
|---|---|---|
| LEVEL-DESIGN-5 §6: Aria has **24 hp**, "one step above Boreal's 22" | `boss.js:56` `maxHp: 26` | doc — and LEVEL-DESIGN-6 already quotes 26 |
| LEVEL-DESIGN-6 §3: the bubble is a **4s duration** special the HUD must show | `player.js` `trySplash` is instant; deep water is gated by `canWade()` at build time | doc — the build-time gate is the same doc's §3, but the bubble's duration was never built |
| METRICS.md: draw calls < 100 | ROOM-STANDARD.md and both new verifiers say 125 | see B1 — undecided |
| `tools/verify-level6.mjs` header: "VALEREACH CLIFFS … design/LEVEL-DESIGN-5.md" | it verifies the Sunken Vale against LEVEL-DESIGN-6 | the header, copy-pasted |
| Region checklist: a heart-piece set (4) per region | Stormreach 2, the Vale 2 | implementation — and levels 1 and 3 ship 1 each, so this is game-wide |
| Region checklist: a shop tier per region | Maren's stock tiers at Stoneroot and never again (v3.35.0) | implementation — see the v3.35.0 BUILDLOG entry's AWAITING note |

## C7 · Tunables live inline instead of in CONFIG

The tunables rule (SYSTEMS.md): game-feel numbers live in `CONFIG`. Every
earlier form's feel numbers do — `CONFIG.FORMS` carries the Dark Wolf's speed,
turn, hurt multiplier, lunge distance, duration and cooldown.

The two newest forms' do not:

    js/player.js:38-49   DASH_COOLDOWN 5 · DASH_DIST 5.2 · DASH_DUR 0.26
                         SPLASH_COOLDOWN 6 · SPLASH_RADIUS 3.4
    js/wind.js:28        WIND breeze 1.6 · gust 4.2 · gale 7.2
    js/water.js:39-42    WATER shallow.slow 0.72 · deep.slow 0.88

These are exactly the numbers a playtest changes. Cooldowns and push strengths
belong in `CONFIG` beside `FORMS`; the visual constants (tints, alphas) can stay
at the top of their owning file, which is what the rule allows.

---

# DEPENDENCY ORDER

    A1 ──────────────────────► nothing else in the Vale can be verified until
                               its rooms build. Do this first, alone.
    A2 ──────────────────────► second: without it, no test of region 6 that
                               involves reloading means anything.
    C2 ──► goes with A1/A2     the guard rails that would have caught both
    A3, A4 ──► after A1        (they need the rooms to build to be verified)
    C1 ──► after A1            (the density table needs rooms that build)
    A5, A6, A7, A8, A9, A10, C3, C4, C5, C6, C7 are independent
    B1 ──► needs dad's ceiling (100 or 125) before the work is scoped, but the
           two worst rooms breach both, so ssA and s2b can be cut either way
    B2 ──► sweep every room first; the decision above wants the whole table

**Suggested first session: A1 alone**, with the "every room builds" check from
C2 written first so the fix is verified by something that will keep catching it.
**Second: A2 + the save round-trip assertion.** Those two are the difference
between "the sixth region has bugs" and "the sixth region cannot be played".

# NOT IN THIS PLAN

- **Anything that needs the kids.** The economy/XP balance pass still queued in
  BUILDLOG, whether Stormreach's climb is too long, whether Meri's hop is
  readable — those need a playtest, not a measurement.
- **The Shadow Court (region 7).** Not built; `regions.js` carries the stub.
- **Level 4 (Frostpeak).** Hand-built in `js/rooms.js`, never audited to this
  standard, and its three worst rooms (`f2` 99, `f4` 97, `f3` 96 as last
  measured) still never call `flattenStatic()` — noted in the archived B2 and
  still true. Given B2, those numbers are probably stale too.
- **`t3a → tc2`**, the one stranded door landing the control run found in Level
  3 (A6). It belongs to a Level 3 pass, not this one.

# WHAT THIS AUDIT ADDED TO `tools/`

- **`probe-door-entries.mjs`** — builds each room, flood-fills its real
  colliders from its real spawn, and measures every door's arrival point: is it
  somewhere a child can stand, and is it beside the door they came through.
  Takes level keys (`s`, `d`, `t`, `v`, `l`) or bare room ids, so a region with
  a room that crashes on build can still be measured around it. Found A6, and
  the Level 3 landing above.

Nothing else was changed. This pass measured; it did not fix.
