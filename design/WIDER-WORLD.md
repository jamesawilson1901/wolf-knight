# WIDER-WORLD.md — the game gets wide, not long

Dad, 2026-09-08:

> "I want to make the game bigger. like proper full sized game bigger."

**Status:** proposed, 8 September 2026, against v3.124.0. Companion to
WORLD-DESIGN.md (the region template), LEVEL-DESIGN-BRANCHES.md (the branch
and road laws) and GAME-CONTRACT.md (the numbers). Where this file and
GAME-CONTRACT.md disagree, the contract wins and this file is wrong; where this
file needs the contract to change, §6 says which version files the amendment
and nothing that needs it ships before that version.

Every hook, file, asset and suite named here exists in the tree today unless
it is written as `new`. Line numbers are as of v3.124.0 and will drift; the
function names will not.

---

## 0. Why wider, not longer

### The corridor problem

The game today is seven regions in a line, six roads between them, a hub at
one end and an ending at the other: about 150 rooms, walked once, south to
north. It is long. A child who reaches the Spire has crossed fifteen places on
the map and every one of them was beautifully dressed the day they crossed it.

What it is not is wide. Once a region's boss falls, one boolean flips —
`WS.set(key, 'restored')` in the six defeat branches of `js/main.js`
(2532-2601) and in `world.onWardenDefeated` for Stoneroot — and the region
rebuilds healed on the next entry: ground patches, calmed wind, cooled lava,
instanced flowers, grazing wolves (`js/restoration.js`). That is the whole of
the second state. Nothing that happens afterwards anywhere in the world can
change that region again. The graph changes in exactly one place when a region
heals (`js/rooms.js:2634`, the living vine between Stoneroot and the Woods).
The pups are a counter. Fast travel lands at the same entrance every time.
`state.flags.gameComplete` is written at `js/boss.js:893` and read by nothing.

So a healed region is a room a child has no reason to walk back into, and the
map is a list of rooms they have no reason to tap. An eighth region would make
the corridor longer. It would not make the world any bigger than it already
feels, and by dad's own law ("build where the players actually are",
LEVEL-DESIGN-BRANCHES.md:9-21) it would be the last content the kids reach.

### What "big" means to a six-year-old

She will never count rooms. To her, big is three things:

1. **How many things are mine, and where they live.** Twenty-four pups that
   vanish on touch and reappear as anonymous circles round a campfire are not
   hers. Pups she can walk to, in the coat of the place she found them, are.
2. **Whether the world remembers what I did.** Not "the boss is dead" — she
   knows that — but "the place I fixed last week is different again this
   week, because of something I did somewhere else."
3. **Whether there is somewhere I can drag my brother to and say look.**

None of those is a room count. All of them are reasons to turn around.

### Terranigma's actual trick

Dad named it when the grazing wolves shipped: *"a real terranigma moment"*
(BUILDLOG.md:5440). WORLD-DESIGN.md §3 already states the witnessed-restoration
law. But the thing Terranigma actually did was not "a town appears when you
win". It was that a town you revived in chapter two is still growing in
chapter four because of things you did in chapter three — and you only find
out by going back to look. Growth is written while you are elsewhere and
witnessed on return. That is what turns a line into a place.

This plan does that in four layers, and it does it in slices: every version
ships one thing, is held by a named suite, gets its contact sheet, and leaves
the game better if nothing after it is ever built. The judges' brief was
"CHILD-FIRST's content on SHIP-IN-PIECES's engineering", and that is the shape
of what follows.

---

## 1. Regions that grow — the staged-growth model

### 1.1 The two precedents already shipped

The Great Vault is *a function of `WS.stage('vault')`* (`js/level2.js:536-560`:
door gaps at stage ≥1 and ≥3, the tint at 67, `route.js:88` picking the guide
door by the same number). The Village square reads `guardiansDown()` 0-6
(`js/levelVillage.js:235`) into a continuous tint blend, a ring of flowers
that grows one guardian at a time, and a ground-style flip at 0.5. The Den
has settlers keyed on `when()` predicates (`js/npcs.js:30-37`: Rook on ember
restored, Bram on stone restored) and six spirit lights keyed on
`WS.get(key,'restored')` (`js/rooms.js:925-944`).

So the machinery for "a room that rebuilds differently on every return" is
proven three times. What is missing is a stage number for the seven healed
regions and a room in each that reads it.

### 1.2 The stage is derived, never stored

`growthStage(key)` is a new function in `js/restoration.js` beside `isHealed`
(76). It counts facts the save already holds, one point each, and the count
is the stage:

| point | fact | where it is already written |
|---|---|---|
| 1 | the region is restored | `WS.get(key,'restored')` — the boss branches, `main.js:2532-2601` |
| 2 | the region's three pups are home | all three ids for that region in `state.flags.pups` |
| 3 | the region's road keepsake is found | the id in `state.inventory.treasures` (`js/treasures.js`) |
| 4 | the region's dungeon is cleared | `WS.get(key,'dungeon')`, written by §2 |
| 5 | Grimm is freed | `state.flags.grimmFreed` |

The points are **counted individually, not in order.** Two of the four plans
used `WS.stage()`'s strict front-to-back count (worldstate.js `stage()` stops
at the first gap), and both admitted the consequence: a child who clears the
dungeon before picking up the road keepsake sits at stage 2 with the dungeon's
payoff invisible. That is an invisible ordering rule a six-year-old cannot
see. Counting individually has no gap trap, and it costs nothing: every fact
is already in the save, so **an old save reads the right stage on first
entry** and `js/save.js` is not edited.

The pup→region table is read off the pup ids, not a guessed numbering. The
ids are mixed (`pup1`/`pup3`/`pup_l3` for Ember, `pup4`/`pup_v2`/`pup_v3` for
Stoneroot, `pup7`/`pup_t3`/`pup8` for the Woods, `pup10`-`pup12` Frostpeak,
`pup_s1`-`3`, `pup_d1`-`3`, `pup_x1`-`3`, `pup_y2`/`pup_y3`/`pup_village`),
assigned by `pupSpotsOf` in `js/pip.js:268-277`. A static `PUP_HOME` table in
`js/pip.js` (id → key) is the one source, and `tools/verify-pups.mjs` gains a
check that every id it finds in the world is in that table.

The keepsake per region is the one on the road **out** of it, which is the
deed a child does after healing it:

| key | hearth room | keepsake (file) | third-point fact |
|---|---|---|---|
| ember | `la` | `wayfarers_key` (`levelNight.js:331`) | Night Road |
| stone | `vh` | `rootstone` (`levelGreen.js:292`) | Greenway |
| wild | `t1a` | `sealed_map` (`levelClimb.js:237`) | Cold Climb |
| frost | `f1` | `frozen_tear` (`levelMarket.js:323`) | Drowned Market |
| storm | `s1a` | `harbour_key` (`levelPlunge.js:217`) | Plunge |
| vale | `d1a` | `moon_coin` (`levelHollow.js:196`) | Hollow Road |
| court | `x1` | — no road out — | all four relics, `WS.get('court','relic_*')` |

`banked_ember` (Ember Deep) is deliberately not a growth fact: it is a branch
inside the region, not a walk away from it.

`defineRestoration(key, [{key:'restored'}, {key:'dungeon'}])` is still
declared for all seven in `js/worldstate.js` beside `'vault'` (128), with
`'restored'` first so `WS.describe` prints the truth and the harness `ws`
getter (`main.js:2011`) can report all seven. `WS.stage(key)` is not what the
builders read; `growthStage(key)` is.

### 1.3 The hearth is the fast-travel landing

Growth lives in one room per region, and that room is the one the moonstone
and Tam drop a child into (`js/menus.js:383-427`, resolved through
`RETIRED_ROOMS`): **`la`, `vh`, `t1a`, `f1`, `s1a`, `d1a`, `x1`.** The Court's
landing is `x1` — live, on the spine (`level7.js:57, 88`) — not `xh`, whose
arrival frame is already four wings and a throne stair. The reason is the
whole point: "open the map, tap Ember" has to land the child inside the thing
that grew, or the map is still a list.

### 1.4 The ladder, room by room

Every hearth reads the same ladder. Stage 1 is what ships today. Each later
stage **adds** to the one before; nothing is removed, so a contact sheet at
any stage is a superset of the last.

| stage | name | what the hearth gains | draw calls (est.) | how it is seen |
|---|---|---|---|---|
| 1 | meadow | ground heals, blooms, grazing pack, mood lift (shipped) | 0 (measured, verify-healing §3) | on next entry |
| 2 | hearth | a stone fireplace with a stool north of spawn; a settler by it who turns to greet Kael; the region's rescued pups play beside the fire in the region coat (capped by measurement, §1.6) | settler ~2, hearth+stool merge into the static; each pup ~5 | grow-in on first entry at this stage, then simply there |
| 3 | hut | a tinted hut beside the fire, washing line, wood stack; BLOOM_MAX and MOOD_LIFT step up | hut ~1 (one material), props merge | same |
| 4 | yard | a cart with a sack that opens Maren's shop at the region's already-unlocked rung; a second settler with a job prop; Tam takes a post at the hearth so fast travel is two-way | cart ~1, jobber ~2, job prop merges, Tam ~3 (body, shard, light) | same |
| 5 | home | the region's spirit light on a plinth in its own colour (the `SPIRIT_HOMES` orb shape); the settlers' gesture becomes `Interact` toward it | orb ~1 + one PointLight | fires for all seven at once on grimmFreed — the only world-wide moment in this plan |

The generic dials become functions of stage in `js/restoration.js` so every
healed room in every region thickens with stage from the day the slice ships,
before a single settler exists: `BLOOM_MAX` 14 → 8/12/16/18 (183),
`HERD_MAX` 4 → 2/3/4/4 (313), `MOOD_LIFT` 0.10 → 0.10 + 0.02·(stage−1)
capped 0.16 (133, so Frostpeak stays cold and the Court darkest), and
`HEALED_PATCH` promoting to `'blossom'` at stage 4 — `js/ground.js:201`
defines the kind and nothing uses it. Bloom is one draw per material, so
stage 4 costs at most two extra calls in a room with no settler.

### 1.5 The settlers

| key | hearth | body | one-material wash | stage-4 job prop (key name) | job |
|---|---|---|---|---|---|
| ember | `la` | `mage.glb` | ember orange | `target` + `manikin` | armourer |
| stone | `vh` | `barbarian.glb` | stone grey | `grinder` + `trough` | miller |
| wild | `t1a` | `ranger.glb` | verdant | `hide` | tanner |
| frost | `f1` | `mage.glb` | rime blue | `firewood` + `laundry` | woodcutter |
| storm | `s1a` | `rogue_hooded.glb` | storm gold | `rod` + `boat` | fisher |
| vale | `d1a` | `barbarian.glb` | tide teal | `rod` + `fish` | fisher |
| court | `x1` | `ranger.glb` | moon violet | `broom` + dungeon `Torch` | lamp keeper |

Four KayKit humanoids on Rig_Medium are already somebody (Wren, Rook, Bram,
Tam, Maren), so each settler is the Tam idiom: clone the one material and
colour-wash it (`js/npcs.js:307-311`). The prop keys are the village pack's
own vocabulary (`js/levelVillage.js:49-51 PROP_KEYS`; every file in
`assets/env/village/` is used by name today: `FirePlace_1_1_A` is `hearth`,
`PracticeTarget_1_A` is `target`, `Manequin_1_A` is `manikin`,
`CutedWood_1_A` is `firewood`). A job with no game yet is still a person
visibly doing something; the gold ring only appears when a game exists for
it (§3.4).

The primitive: `characterNpc` and `npcList` are module-private in
`js/npcs.js` (67, 56) and become exported; a `SETTLER_POSTS` table keyed by
hearth room in the `WAYFARER_POSTS` shape (254) carries
`{id, file, x, z, ry, tint, when: () => growthStage(key) >= n}`; a
`STAGE_CLUTTER[room][stage]` table carries the prop rows in `clutter()`'s
`[key, x, z, s, ry]` shape, with `loadVillageKit` (`levelVillage.js:57`) and
`clutter` lifted into a shared helper so a non-Village room can place by key
name. `spawnSettlers(world)` runs in `setupRoomExtras` (`main.js:1734`)
**before** `bloom()` at 1782 so blooms avoid the hearth's collider — the
lesson verify-healing §6 taught. Solid props (`SOLID_PROPS`,
`levelVillage.js:319`) get colliders; people get a 0.35u circle; animals never
do.

Every post is measured with `tools/probe-freespot.mjs` at r 0.44 in every
state the room can be in, which now means `WK_LATE=<n>` for n = 0..5, never
eyeballed. Posts sit north of spawn, outside the 2.5u blind strip
(`levelkit.js:36`), because a settler the child cannot see on arrival is a
settler who is not there.

### 1.6 Pups come home

At stage 2 the region's three rescued pups play beside the settler's fire —
`graze(world, spots, {scale: 0.16, coat: COAT[key]})` from
`js/restoration.js:322` with a scale option, no collider, `keepLoose`. This is
the strongest single "wider" idea any plan offered: every hearth becomes a
place the child's own things live, and the Den keeps its budget (§3.1). It is
also the most expensive: three skinned pups are ~15 calls. So the rule is
**measured per hearth, dropped first.** `la` is the busiest room in the game
and carries the crack gate and a chest; if the stage-4 yard cannot hold three
pups under 125, it holds one, then none, and the pen at the Den (§3.1) is
where they all are regardless. Pups at a hearth are never rescuable again
(no `pupSpot` marker, no Pip sparkle); they are grazers wearing a small scale.

### 1.7 Witnessed, once

Growth is read at build. Every fact that raises a stage is set somewhere
other than the hearth (pups are in `lb1`/`lb2`/`lc1`, keepsakes on the roads,
the dungeon under the gate, Grimm at the Spire), so by construction the child
is elsewhere when the world changes and sees it on return — the Terranigma
law made mechanical. The first entry at a new stage plays a grow-in:
`hearthLive(world, stage)` copied from `healLive` (`restoration.js:261`,
instance matrices from 0.001 over `LIVE_SECONDS` 9) for the new statics, and
the settler summoned 2.6 s in with `juice.burst` in their tint and the
form-switch chime, the `summonWayfarer` shape (`main.js:1409`). A `seen_N`
key per hearth (`WS.set(key, 'seen_' + n)`) records that it played, so it
plays once per stage per region and never again. One Pip line per stage per
region (`<key>_grow_2..5`, rendered in one Piper batch), short, `repeat:false`.

### 1.8 The three roads that never heal

`WS_KEY` in `js/restoration.js:55-64` maps `night_road`, `greenway` and
`market` to their regions and not `coldclimb`, `plunge` or `hollowroad`
(`state.js` names them), so a child who frees Frostpeak walks back through
six rooms of untouched shadow between two healed places — against the
promise the file's own comment makes at 50-54. Three lines
(`coldclimb: 'wild', plunge: 'storm', hollowroad: 'vale'`) and every effect
follows through `healKeyOf()`. This is slice 1 because it is a bug, it is
visible, and it is the first thing a returning child walks through.

### 1.9 Suites and the proof path

- `tools/shot.mjs` `LATE` becomes `LATE=<n>` (today it is boolean, 19,
  43-49): sets the facts for stage n for every key so a contact sheet can
  show each hearth at each stage.
- `main.js` `get ws()` (2011) reports all seven `growthStage`s.
- `new tools/verify-growth.mjs` §1-2, static, sub-second, joins `--quick`
  (`verify-all.sh:185-193`): the derivation is a sum; adding any fact never
  lowers the stage; a save holding only `restored` reads 1; a save with pups
  removed does not regress below what its other facts give (additive law);
  every id in `verify-pups` `ROOMS` is in `PUP_HOME`.
- `verify-growth` §3 (browser): each hearth at `LATE=0..5` — calls ≤125,
  verify-density island floors (32 in-frame / 14 models) hold, every placed
  prop clears `freeAt` r 0.8, every settler moves across frames after
  `flattenStatic` (the `verify-den` sampler, `tools/verify-den.mjs:60-95`),
  blooms avoid the hut; §4: `hearthLive` plays once and sets `seen_N`.
- `tools/verify-healing.mjs` §1 gains the three road names; §3 `SAMPLE`
  gains `c1`, `p2`, `h1` (foes→0, grazers>0, blooms>0, calls ≤125).
- `tools/verify-wayfarer.mjs` gains the seven hearth posts (Tam never at
  stage <4).
- Contact sheet of every hearth at `LATE=1..5` before merge, and of the six
  road rooms at `LATE=1`.

---

## 2. The backtracking layer — dungeons behind the promises

### 2.1 What a promise gate is today

`promiseGate()` (`js/levelkit.js:552`) builds a tinted obstacle with a glow
ring in the future wolf's colour, returns `null` with no geometry and no
collider once its flag is set (559-562: `state.flags.cracked[id]`,
`state.flags.burned[id]`, `alreadyCut(region,id)` at `gates.js:97`, or
`WS.get(region,'ice_'+id)`), and hides one chest. Every gate in the game opens
onto one chest in the same room. `sideDoor(..., {when})` (`levelkit.js:456-460`
→ `world.addDoor` with a predicate, `world.js:552`) is shipping code used for
plate, knot, crown and village flags — and never for a promise. No new
primitive is needed: **a dungeon door is a promise gate laid across a doorway
mouth, over a `sideDoor` whose `when` is that gate's flag.**

The rules a dungeon door obeys:

- **A lock must actually lock** (GAME-CONTRACT.md:130-136): the gate's box
  collider covers the whole gap (`DOOR_HALF` 1.2 → gate `w` ≥ 2.6), proven by
  a new `verify-promises` §3 — flood-fill from spawn over real colliders
  cannot reach the door before the verb, can after. `tools/verify-promises.mjs`
  already walks `world.promiseGates`, so the gate is driven the day it exists.
- The scar stays a scar. The dungeon goes under or behind it; the ash patch,
  the crack, the bare trees stay broken (WORLD-DESIGN.md §3 "one thing stays
  broken"; `js/regions.js:57, 87, 118`). Note those manifest rows name retired
  ids: `r1`, `e2`, `w4` resolve to `la`, `vb1`, `t4a` through `RETIRED_ROOMS`
  (`state.js:75-84`) and `markers.scarSpot` is set only in the retired builders
  (`rooms.js:562, 2568`). The manifest is re-pointed in slice 5.

### 2.2 The rules a pocket dungeon must obey

| rule | source | what it means here |
|---|---|---|
| existing prefix only | CLAUDE.md four-places | rooms hang off `l`, `t`, `v` on the Ember Deep pattern (`level1.js:124-128`), so `buildRoom`, `regionOf`, `updateMusic` need nothing; only `route.js ONWARD` rows, the level spec table, `verify-density` `ROOMS` rows and `contact-sheet.mjs SECTIONS` |
| module sizes | `levelkit.js:40-46` | pocket 20x16 → island 32x26 → pocket 20x16; no new module |
| density floors | `verify-density.mjs:214-218` | pocket 20/10, island 32/14 in the arrival frame |
| draw calls | every shipping suite | <125; Level 2 and Level 3 suites hold <100, so a Stoneroot or Woods dungeon dresses tighter |
| blind strip | GAME-CONTRACT.md:114-129 | no interactive within 2.5u of the south shell |
| no pups | BRANCHES.md:114-120 | pays in heart piece, gear, shards; a rescued **grown** wolf is not a pup |
| no puzzle | GAME-CONTRACT.md:103 | ONE PUZZLE ROOM PER LEVEL is **not amended**; no dungeon in this plan holds a puzzle, by design — a puzzle she cannot solve is a locked door with her animal behind it |
| no keepsake | `treasures.js` rule 4 | one per level stays; no amendment |
| one guardian, after amendment | BRANCHES.md:84-88 | "a branch ends in a reward, not a duel" is amended in writing (§6, v3.133) before the first guardian ships; the first dungeon has none |
| enemies in a healed region | `enemies.js:3771` | dungeon rooms set `world.markers.shadowed = true`; the strip becomes `isHealed(...) && !markers.bossSpot && !markers.shadowed`, and `bloom()`/`graze()` honour the same marker — "a piece of the shadow that did not come home", on canon (SYSTEMS.md 'Bosses': the Shadowgrip was a piece of him) |
| music | audio is 59% of the download | each dungeon aliases its region's deep or road loop in `MUSIC_FILES` (`audio.js:69`); no new track |
| not a boss room | `main.js:1849 BOSS_ROOMS` | dungeon arenas stay out of the set: region music, no 300 ms seam, no Tam post inside |
| nothing missable | WORLD-DESIGN.md §4 | the gate's existing chest keeps its id and moves inside the first room, so a save that opened it stays valid |

### 2.3 The dungeons, per region

Built in dad's order. The first three are designed in full; the rest are
queued behind the same template and are not built until the kids are past
region 3.

| key | gate (room, id, verb) | form needed, from | rooms (id, kind) | fight | guardian | treasure | grows |
|---|---|---|---|---|---|---|---|
| ember | `la`, `l1_crack_gate`, crack (`level1.js:668`) | Earth Wolf, Stoneroot | `lv1` pocket loopsTo `la` · `lv2` island · `lv3` pocket loopsTo `lv2` | `lv2`: 2 ember-wretch + 1 molten-marauder by markers (`KAYKIT_ROSTER` ids) | none | `lv3` gold: heart piece + shards + a tinted KayKit blade found only here; `lv1`: the moved `l1_crack_promise` wood chest; a lost grown wolf (§2.5) | `la` to stage 4 |
| wild | `t1b`, `l3_spring_ice`, shatter (`level3.js:868`) | Frost Wolf, Frostpeak | `tf1` pocket loopsTo `t1b` · `tf2` island · `tf3` pocket, north door → `f1b` | `tf2`: rime-minion + frost-dragonling | none | `tf3` gold: heart piece + shards + tinted spear; a lost wolf in `tf1` | `t1a` to stage 4; **closes the Woods–Climb–Frostpeak loop** |
| stone | `vc2`, `l2_bramble_gate`, cut (`level2.js:1404`) | Verdant Wolf, Wild Woods | `vr1` pocket loopsTo `vc2` · `vr2` island · `vr3` pocket | `vr2`: stone-colossus + 2 cinder-imp (existing bodies) | **Rootbound Wight**: `MINI_ROSTER` on `tower-wight.glb`, moss tint, weakness verdant | `vr3` gold behind an `onwardPlug`: heart piece + tinted hammer; lost wolf in `vr1` | `vh` to stage 4 |
| frost | `f1b`, `f_cairn`, iceGate (`level4.js`) | Fire Wolf (melts) — retroUse | queued | | Rime Warden on `glacier-warden.glb`, weakness fire | | `f1` |
| storm | `s1a`, `s1a_seacave`, `none` (`level5.js:548`) | Tide Wolf, Vale | queued | | Ash Warden on `molten-marauder.glb`, resist fire | | `s1a` |
| vale | `d3b`, `d3b_ghost`, shatter (`level6.js:937`) | Frost Wolf | queued | | Bone Sage: `Skeleton_Mage.glb` + `wand_A` through `RangedBolter` (the only unused humanoid enemy body) | | `d1a` |
| court | `h2`, `h2_veil`, shatter (`levelHollow.js:259`) | Frost Wolf | queued | | | | `x1` |

The lock-before-key check in `regions.js validateRegions` is already true for
the first three (crack shown in region 1, granted in 2; cut shown 2, granted
3; shatter shown 3, granted 4).

### 2.4 The Ash Vault in full — the template

`la`'s cracked wall (`level1.js:668`) is the first promise in the game and
the one every child walks past on every trip home, so it is the first door.
Once Ember is healed, a cracked slab beside the ash patch glows earth-brown.
With the Earth Wolf the child stomps it and the wall run behind it is a
doorway (`sideDoor(world, 'w', ..., 'lv1', ..., {when: () =>
!!state.flags.cracked.l1_crack_gate})`).

- **`lv1` — the Understair Cellar** (pocket, `loopsTo: 'la'`). A cooled-lava
  cellar: the wood chest that used to sit behind the wall, pots for the
  refill a returning child expects (`potSpots`), the Quaternius crypt pieces
  the regions barely use (`Cobweb`, `Skull`, `Coin_Pile`, `Pedestal`,
  `Arch_bars`, `Trap_spikes` — precached, placed nowhere), and a grown grey
  wolf curled against the far wall. No fight.
- **`lv2` — the Charred Gallery** (island). The fight: two ember-wretch and
  a molten-marauder, `markers.shadowed`, region music. All dead → the
  villageUnshadowLive poll pattern (`levelVillage.js:797-804`) calls
  `WS.complete('ember','dungeon')` (true once, the fanfare is free) and pops
  the `onwardPlug` to `lv3` where the child stands.
- **`lv3` — the Banked Vault** (pocket, `loopsTo: 'lv2'`). A gold chest
  (`visibleReward`, never a raw `chestDefs` write — the vc2 bug class) with
  a heart piece, shards, and one of the nine unused KayKit weapon bits from
  `assets/gear` tinted as a dungeon-only find, the sanctioned trick
  (`items.js:160-170`).

Back out through `lv1` to `la`, which now grows its yard.

Wiring: three spec rows in `LEVEL1_ROOMS` with `spine: false`; `ONWARD`
rows `lv1→la`, `lv2→lv3`, `lv3→lv2`; the `PROMISES` row for `l1_crack`
(`main.js:52-54`) keeps its marker and its `done()` becomes
`WS.get('ember','dungeon')` so the ??? card resolves when the dungeon is
cleared, not when the gate breaks; `districts.js META` gains a `dungeon: true`
spec flag so `showMap` can draw the branch as an offshoot card once the gate
is open (§5.3); `verify-density` rows `lv1` pocket / `lv2` island / `lv3`
pocket; `contact-sheet.mjs SECTIONS` three captions.

Suite: `new tools/verify-ashvault.mjs` from `tools/verify-emberdeep.mjs` —
door sealed before the crack, open after, still open on rebuild; enemies
present in `lv2` with ember restored; `WS` dungeon set on clear; plug opens;
gold chest reachable; the moved chest's opened flag honoured; calls <125 in
all three; `verify-reachable`/`openholes`/`landings`/`grounded` pick the rooms
up through `all-rooms.mjs`. Contact sheets of `la` (`LATE=1` and `4`), `lv1`,
`lv2`, `lv3`.

### 2.5 The lost wolf — the child's own prize

From CHILD-FIRST, kept because it is the room-one prize that is hers and
needs no fight: in each dungeon's first room a grown wolf lies curled
(`wolf.gltf`, `Idle_2_HeadLow`, the region coat, no collider). Walk up and it
stands, the pup-chime plays, Pip says one line, and
`state.flags.rescued[id] = true` is written — the map `rescueCount()` has read
since DEN-MINIGAMES §5.1 and nothing has ever written
(`worldstate.js:178-190`). It is **the one new top-level flag in this plan**
and needs a line in both `persist()` and `applySave()` (`js/save.js`); the
free-form maps take new ids with no edit. The wolf does not follow — a
companion re-created per room is the riskiest piece in any of the four plans
and one skinned body pushes the Vale's 122-call hub over 125. On the next
build it is simply in the hearth's grazing pack and in the pen at the Den.
It pays no heart (the pup ladder is untouched) and `unlockTier()` finally
moves past what pups give.

### 2.6 `MINI_ROSTER` — the Bone Warden with a body parameter

`BoneWarden`'s constructor already takes `(world, x, z, gltf, anims, axeGltf,
shieldGltf)` (`enemies.js:2032`); the loader at 3852-3856 hard-codes
`Skeleton_Warrior.glb`, and its wound, defeat flag and door line are
singletons (`flags.wardenHp`, `flags.wardenDefeated`, `world.onWardenDefeated`,
`main.js:1745`). A second warden anywhere would share and corrupt them.

`MINI_ROSTER[id] = {cls: BoneWarden, body, scale: 1.3, hp: 14, mounts:
{r:'axe', l:'shield'}, tint, weakness, resist, region, key}` read via
`world.markers.miniSpot = {id, x, z}` beside `wardenSpot`; the ctor gains
opts `{hpGet, hpSet, onDefeated}` so wounds persist in
`WS.set(region, 'mini_'+id+'_hp', n)` (`WS.set` takes any value) and defeat
writes `WS.complete(region, 'mini_'+id)` + `WS.complete(region,'dungeon')`
then `world.openOnward()`. `'warden'` stays the alias id for the crypt so no
save regresses. `ATTACK` rows `warden_chop`/`warden_spin` are reused (floors
already proven by `verify-combat-laws`); `XP_VALUES` keys on
`constructor.name`, so BoneWarden's 60 already pays. A wrong-form masher sees
RESIST through the existing `SUPER!`/`RESIST` grammar, which is text-free
gating. This is the one slice that touches combat classes: load
`docs/wolf-knight-combat-context.md` §6 and run the four-pass audit first.

Bodies: `tower-wight.glb`, `glacier-warden.glb`, `molten-marauder.glb`
(`assets/generated/enemies`, Rig_Medium, bind the rig library like
`Skeleton_Warrior`), plus `Skeleton_Mage.glb`. Two mounts and two rings cost
~10-16 calls; the island dresses to ~100 before the fight and is measured
with `tools/probe-encounters.mjs`. Suite: `new tools/fight-mini.mjs` from
`tools/fight-warden.mjs` (winnable with the intended form, telegraph ≥0.9 s,
wound persists across a death, nothing spawns after clear);
`tools/check-roster.mjs` gains "every `MINI_ROSTER` body exists and binds the
rig" and "every `variant:` string in `js/level*.js` exists in `VARIANTS`" —
which also catches `levelClimb.js:311`'s `variant: 'frost'`, a silent no-op
today.

---

## 3. Collect and care

Non-combat reasons to open the map, riding rails that already persist
(`state.flags.pups`, `state.counters`, `state.stickers`, `state.minigames`,
`state.flags.world`). Rewards are cosmetic or stickers, never a gate
(DEN-MINIGAMES.md §2), and never shards past what ships (dad: "keep economy
and xp balance how it is for now", BUILDLOG.md:5548).

### 3.1 The pup pen at the Den

Today every rescued pup is a skinned `wolf.gltf` orbiting a fixed grid on the
Den grass (`rooms.js:1101-1118`), one draw plus shadow each. A save with 24
pups would cost ~120 calls in a room whose ceiling is 135 (measured 128,
`verify-den.mjs:114-118`). The pen must **net the Den down** before anything
else is added there, which is why it is slice 3.

What replaces the loop, north of spawn at (0, 7.4) so it is seen on arrival:

- **Six awake pups**, chosen by rotating ids per entry so every pup takes
  turns, through `graze(world, PEN_SPOTS, {max: 6, scale: 0.16, coat:
  COAT[PUP_HOME[id]]})` — Eating, Idle, `Idle_2_HeadLow`, Walk, no collider,
  `keepLoose`. Walk into one and it plays `Gallop_Jump` → `Jump_ToIdle` with
  the pup-chime: the first pet verb, no state.
- **Bedding rows**: 24 bed spots in eight rows, each row tinted its region's
  coat (`Bag_1_A` as the bed, a ring of instanced flowers, one
  `instancePlacements` call per tint through the Den's `instAt` at
  `rooms.js:1043`). A pup that is home sleeps or plays near its row; an
  empty spot in the orange row tells a non-reader a pup is still lost in
  Ember, with no number anywhere. The field is the counter. Pip says one line
  the first time a row fills (`pups_home_<key>`).
- A trough (`Trough_1_A`) with a gold ring: stand in it and every awake pup
  gallops over and eats. Fence from `assets/env/town/walls-pack.glb`
  (vendored, unused, two materials) tinted to the Den palette; pups are not
  blocked, people are. `Bucket_1_A`, `Rope_1_A` beside it.
- The past-12 shard payout in `onPupCollected` (`main.js:1723-1727`) is
  untouched (economy freeze). The pen furniture grows at 3/6/12/24 pups as
  an addition: a second bed, a laundry line, a banner (`Banner_wall`), a
  gate.

Rescued grown wolves (§2.5) sleep in a ninth row. Biscuit's `DOG_STOPS`
(`npcs.js:44-47`) must not cross the fence; Wren, Rook, Bram, Maren and Tam
stay on clear ground at r 0.44.

Suite: `verify-den` §pen — calls <135 at 0/3/12/24 pups, exactly `min(n,6)`
bodies present, each moves ≥0.05u in 9 s, none inside the fence, bed count
== pups found, tints match `COAT`. `verify-pups` and `verify-completion`
(`data-pup-total`) unchanged. Contact sheet of the Den at 0/3/12/24.

### 3.2 The garden bed — it grew while she was at school

Two planters (`Trough_2_A`, `Basin_A`) by the Den's third tent with a gold
ring. Stand in it and Kael plants; Pip says "come back tomorrow". Planting
writes `WS.set('den', 'gardenPlanted', Date.now())` (`WS.set` takes any value,
read back from `state.flags.world.den.gardenPlanted`); the bed's stage at
build is `min(3, floor((Date.now() − planted) / 86400000))`, sprouts → flowers
→ full bloom, and the max stage reached is stored so a tablet with a wrong
clock never goes backwards. Full bloom turns the ring into a harvest: the
flowers burst, a sticker pops, the bed is empty to plant again. Harvest pays
a pot's worth of shards (12) and nothing more, and the doc says so to dad
because it is the one number this plan adds to spending.

Each seed is the region's own flora: the dungeon gold chests carry `L.seed`
(a new branch beside `L.heartPiece` in `giveLoot`, `main.js:1573`) writing
`WS.set('den','seed_'+key)`, and the stage-3 settler gives the same seed
repeatably on talk if the chest was opened before the feature shipped —
nothing missable. The bed grows `FLORA[key]` through `plant()` and
`instancePlacements` (`restoration.js:206`), so the garden is a map of what
she has healed at two draw calls. Stickers at 1 and 5 harvests.

Suite: `verify-den` §garden — plant → stage-0 flora count; set `gardenPlanted`
to now−3d through `window.__game.WS` → rebuild → stage-3 count and the
harvest ring; harvest → shards, planted reset; flora clear of colliders at
r 0.44; a seed for one region grows that region's flora and no other.

### 3.3 The sticker book as pictures

Seventeen emoji tiles a non-reader cannot decode (`js/progress.js:70`) become
rendered model thumbnails through the path the treasure shelf already uses
(`itemThumb`, `menus.js:634`): a wolf for pups, a coin for rich, `chest-kit`
gold for treasure finder, `heart-piece.glb` beside a 0-4 filled-hearts
readout (no text), `flower-a` for the garden, `Trough_1_A` for feeding,
`FirePlace_1_1_A` for hearths grown. Unearned tiles are grey silhouettes of
the same picture, so she can see what is still to do. New rows: pups petted,
feeds, harvests, hearths grown, dungeons cleared, wolves rescued, roads
walked back — each one `bumpCounter` (`progress.js:90`) at the site that
already knows. Thumbs are cached per session as the Armoury does. BUILDLOG
3949-3958 kept the emoji as "dad's call"; this retires that exception, and
§8 asks.

Suite: `new tools/verify-stickers.mjs` — every row names a model that exists
and is in `sw.js PRECACHE` (the `verify-gear.mjs:197-209` pattern); every
counter a row reads is bumped somewhere in `js/`; `verify-map`'s no-emoji
rule extended to the sticker grid.

### 3.4 Fishing — designed, sized, blocked on one asset

Fishing belongs on the harness (`makeHarness`, `minigame.js:118`) as
`js/mg-fish.js`, a `{id:'fish', icon, seconds: 40, rewards: [species],
make(ctx)}` copied from `mg-fetch.js`: tap to cast, a gold ring closes on the
float, tap in the window to hook — and the window **is** `PARRY_WINDOW`
(`mg-fetch.js:26`), so fishing teaches the parry the way Fetch teaches the
catch. Hosts are `makeFetchHost` clones (`minigames.js:510`) placed at a water
edge with `world.nearWater()` so nothing stands in paint: the stage-4 fisher
at `s1a` and `d1a`, and a rod on a rock at `q1` (region 4, the earliest
water) ungated so children in region 4 see it first. Catches persist in
`state.minigames.fish.won` (already saved) and hang on the fisher's rack as
one more `DriedFish_1_A` per species.

It does not ship until dad vendors one small low-poly fish. Nothing on disk
is a fish (`DriedFish_1_A` is a rack), and a tinted gem standing in for one is
fake fiction. Two plans proposed the gem; CHILD-FIRST refused it; the refusal
is right.

### 3.5 Pip points at everything worth a detour

Pip's sparkle (`pip.js:155-176`) knows pups and gear chests. It widens to
keepsake and heart-piece chests, fishing rings, and any `world.promiseGates`
entry whose verb form is in `state.formsUnlocked` and whose `PROMISES done()`
is false — with the mandatory guard that a gate the child cannot open yet
never sparkles (that is `GATE_HINTS`' job, `main.js:639`, or it reads as a
nag). One predicate; `verify-pip`-style cases through `__wkJump`.

---

## 4. Act Two — after Grimm

### 4.1 What the bible supports

The addendum is canon (STORY-BIBLE.md:118-142): Grimm was the first guardian,
every wolf form is his stolen strength finding a kinder bearer, the pups are
his descendants, the final fight frees him, seven lights total and the seventh
is Luna's. The ending's own lines are the instruction: end_3 Grimm, "Keep
them. Every one."; end_4 Kael, "Come home with us."; end_5 Pip, "The Den is
FULL, Kael. Everyone we found. Everyone."; end_6 Luna, "Go and play — the world
is yours again." (`narration.js:281-286`). None of those is shown. The Den
never gains Grimm, and `SPIRIT_HOMES` has six rows where `regions.js:253`
promises Luna's moonlight comes home.

### 4.2 What Act Two is, and is not

**Act Two is tending.** It is not a new villain, not seven regions
re-shadowed, not boss rematches (`verify-bosses`' unique-body rule would fail),
not the Village or Spire re-locked (LEVEL-DESIGN-VILLAGE.md §1). Darkening the
world she healed undoes the one thing she is proud of, and "opens across all
seven regions at once after Grimm" is exactly the post-game shape dad's law
forbids. The judges agreed on this from three directions.

So the per-region content of this plan opens region by region on its own
facts (§1, §2, §3), and a child in Stoneroot already has reasons to turn
around in Ember. Only two small things wait for `grimmFreed`, and they are the
cheapest slices in the plan, last on purpose so nothing earlier waits on them:

1. **Everyone home.** A `VILLAGERS`-style row gated on `grimmFreed`: a great
   grey wolf lying by the Den's north gate, `wolf.gltf` at boss scale in
   `Idle_2_HeadLow`, old and tired and himself, no collider, pups drifting
   near him; walk up and `grimm_den` plays once, then a throttled repeatable
   in the end_1 register. A seventh `SPIRIT_HOMES` row keyed `'court'`,
   marker `lunaHome`, colour 0xd8cfff, with `luna_den`. ~5 draws for Grimm,
   which the pen bought. Pip: "The Den is FULL" — end_5 finally true on
   screen.
2. **Stage 5 everywhere, and the Village gets its people.** `growthStage`'s
   fifth point fires for all seven at once, so wherever the child next goes
   the spirit light stands at the hearth and the settlers face it — the one
   world-wide moment. `WS.set('village','restored')` (`main.js:961`) is
   written and read by nothing; `SETTLER_POSTS` rows for `ysq`, `yhs`, `ylw`
   read it, so the cleared town finally has anyone in it.

STORY-BIBLE.md gets a second addendum: "Act Two is tending"; Grimm and Luna
in the Den, repeatable and throttled; and "each spirit speaks exactly twice"
(174-177) amended to allow a third line on return, since it is already three
for Petra, Aria and Meri. `new tools/verify-homecoming.mjs`: with `grimmFreed`
set, Grimm and `lunaHome` exist and every hearth reads stage 5; without it,
none do. `verify-story-beats` is not widened.

Sized honestly: two S slices, ~10 spoken lines (~320 kB of Piper clips), and
they are the last thing built.

---

## 5. World structure — the line becomes a loop

Every cross-link is a door the child walks through, advertised by the
destination district's tint spilled on the floor (`thresholdGlow` in
`sideDoor`), never a teleport and never text. Nothing here adds a prefix.

### 5.1 The loops

| link | gate | why this gate | rooms touched | wiring |
|---|---|---|---|---|
| Den → `vh` | `WS.stage('vault') >= 1` | `vh` already walks into the Den one-way (`level2.js:567`) and the Den has no door back; stage ≥1 means the child has stood in the Vault and relit its lantern, so it is a return loop and never a skip of the Night Road; no new flag | `den` (east gap in the instanced cliff at `rooms.js:819` and its box colliders at 827-832) | `addDoor` beside 833; a `'den'` `HUBS` entry in `route.js` |
| `ddp` ↔ `dlg` | `meriDefeated` | the Vale's arena is one room from its lagoon hub and does not open onto it; gating on the boss flag keeps Tam's law that no door offers a way out of a fight | `ddp` (west door beside the `dg4` door, `level6.js:1207`), `dlg` (an east door in the pattern of its four at 587/714/903/1045) | `verify-onward` ARENAS unchanged (`ddp`'s way on is still `h1`, `route.js:50`) |
| `tf3` ↔ `f1b` | `borealDefeated` | the Frozen Spring dungeon comes out in the Frozen Cairn pocket (`level4.js:77`, loopsTo `f1`), so Woods → Cold Climb → Frostpeak is a walked loop and the cairn chest `c_f1b_ice` (579) is reached from below; the Frost Wolf implies the flag, and the flag keeps the door shut mid-fight | `f1b` (a south door that only exists when the flag is set, the `windBridge` idiom `level5.js:1140`) | `t` rooms carry their own kit list naming the Kenney snow pieces from `assets/env/snow` (there is no `assets/env/holiday`); a 260 ms cross-region seam already exists (`main.js:1852`) |
| `lb2` → `q2` | `canWade()` | Ember's oldest promise (`r2b_water`, tide, shown in region 1) becomes a two-room flooded passage to the Market's deep channel (`levelMarket.js:289-296`), the `s1a` `'none'` idiom around a `sideDoor when: canWade`; eight places become one loop from the Den | `lb2`, `lw1`, `lw2` new (`l`), `q2` | queued: Tide is region 6, so by dad's law it is late |

The Den also gets a real place in the data: a `'den'` `HUBS` entry that
points the guide at the lowest-stage hearth whose next fact is reachable, or
at the next unhealed entrance — so Pip's arrow itself says "go back and look".

### 5.2 The guide points back

`route.js HUBS` (88-118) already answers as a function of state for `vh`,
`ysq`, `yhs`, `ylw`, `m2`, `xh`. Six more entries for the arenas (`le`, `vz`,
`tgl`, `f5`, `scr`, `ddp`): once the boss flag is set, answer with the
region's nearest unfinished thing — a promise gate whose form is now in
`state.formsUnlocked` and whose `done()` is false, or a hearth with a pending
grow-in — before falling back to the road onward (the `xh` relic-scan shape).
`onwardSpot` walks Pip toward it with no code in `main.js`. The form check is
mandatory: the guide never points into a dungeon the child cannot open.
`verify-onward`'s ARENAS table accepts a function answer.

Wren's rumour (`wren_rumour`, one fixed line pointing at the Woods forever,
`main.js:854`) becomes a small table chosen at say-time by the nearest
unfinished thing — first unhealed region, first openable dungeon mouth, a
hearth below stage 2 — through the same `sayThrottled`. The non-reader's
quest log, with no UI.

### 5.3 The map shows what she found, and can be tapped

Map cards already carry `dataset.room` (`menus.js:537`). Cards in regions whose
`done()` is true get `pointerdown → this.onTravel(resolveRoom(room))` — about
ten lines, reusing the `regionCleared` gates; the travel view's emoji icons
and retired ids (`r1`/`e1`/`w1`, 396-417) retire with it. Dungeon rooms carry
`dungeon: true` in `districts.js META` and draw as a small offshoot card once
the gate's flag is set, never before (a five-year-old must not see a row she
cannot go to). `verify-map`: a fresh save can tap only the Den and Ember;
after `bossDefeated` tapping Ember lands at `la` (`world.roomId`); no emoji in
`#map-menu` including the travel view; `verify-touch` covers the cards at
≥44 CSS px.

### 5.4 Tam's posts

`WAYFARER_POSTS` (`npcs.js:254`) gains the seven hearths with
`when: () => growthStage(key) >= 4`, so fast travel is two-way from a grown
hearth, and each cleared dungeon mouth with `when: () => WS.get(key,'dungeon')`.
Tam is unchanged in behaviour; he gains posts. He never stands in a dungeon
arena and never at a hearth below stage 4 (`verify-wayfarer`).

### 5.5 The graph gets a source of truth

The world graph exists only as `sideDoor` calls inside builders, so "is the
world a loop" cannot be asked without building every room. `new
tools/verify-loops.mjs` ships with the first door: from every region entrance
and every arena, BFS over the live `world.doors` built through `__wkJump` the
way `verify-reachable` does, treating rooms with enemy spot markers as
blocked; assert the Den is reachable combat-free (WORLD-DESIGN.md §4, never
asserted today); assert each shipped cross-link (`le→la`, `vh↔den`,
`tgl↔t1a`, `tsA`/`tsB`/`ssA`, `dlg`'s doors, `ddp↔dlg`, `tf3↔f1b`) works
both ways when its predicate is true and is shut when false. Joins the
nightly HEAVY list.

`new tools/verify-prefixes.mjs`, static, ~0 s, joins `--quick`: every first
letter across `Object.keys(ROOMS)` is named in `state.js regionOf`,
`rooms.js buildRoom`'s chain, `main.js updateMusic`, `route.js ONWARD/HUBS`,
`verify-density`'s `ROOMS` table and `contact-sheet.mjs SECTIONS`. The
four-places rule becomes a gate before a single new room lands.

### 5.6 What each new room costs in wiring

Because every new room reuses `l`, `t` or `v`: one spec row (auto-registers
for the map and doorway glow through `registerDistrictTints`), one builder,
one or two `ONWARD` rows, one `verify-density` row with a kind, one
`contact-sheet` caption, and `verify-prefixes` proves nothing was missed. No
`regionOf`, `buildRoom`, `updateMusic`, `WS_KEY`, `AREAS` or `MUSIC_FILES`
line. That is the whole argument for no new prefix.

### 5.7 Doc drift fixed alongside

ROOM-STANDARD.md's seam table (176-178) gains the 260 ms between-regions tier
`main.js:1852` already uses. LEVEL-DESIGN-BRANCHES.md's road table (143-150)
marks gaps 2/3/5/6 built. `regions.js` scar rooms re-point from `r1`/`e2`/`w4`
to `la`/`vb1`/`t4a`. BUILDLOG.md's QUEUED NEXT board is re-cut and
v3.121.1-v3.124.0 get their entries, so this plan starts on a board that
reflects reality.

---

## 6. Sequencing — the ordered slices

Each slice ships alone, is held by a named suite, gets its contact sheet, and
bumps `CACHE_NAME` + `node tools/sync-cache.mjs --write`. Every report leads
with the CI verdict. Nothing merges on a red nightly.

### v3.125 — The last three roads heal (S)

**Ships:** `WS_KEY` + `coldclimb: 'wild', plunge: 'storm', hollowroad: 'vale'`.
**Not:** anything else. **Suite:** `verify-healing` §1 three road names, §3
rows `c1`/`p2`/`h1`. **Sheet:** `c1 c2 p1 p2 h1 h2` at `LATE=1`. A road room
at 120 calls unhealed can cross 125 with four wolves and blooms; if one does,
lower `BLOOM_MAX` for that room by salt, never widen the ceiling. The healed
world is finally whole, and the first version dad ships is a win a child
walks through on the way home.

### v3.126 — Precache the runtime bodies; the prefix rule becomes a gate (S)

**Ships:** a third generated block in `tools/sync-cache.mjs` between new
sentinels in `sw.js` (the module and VO blocks are at 37-50) listing
`assets/generated/enemies/*.glb` (the 23 live KayKit ids loaded at
`enemies.js:3875`; the 9 dead Quaternius-family bakes deleted first so they
are not swept in) and every `'./assets/...'` literal in `js/*.js` — which
brings in `assets/env/village/*` + `props_atlas.png`, absent from `sw.js`
today though the Den and every Village room load it; the byte total printed
in the ALL CLEAN line. `new tools/verify-prefixes.mjs` into `--quick`.
**Not:** any visible change. **Suite:** `verify-boot` (already runs
`sync-cache` as a check, 138-143), `verify-prefixes`. **Sheet:** none. Adds
~8.7 MB to a 73 MB precache; the number is printed so every later slice sees
its cost. Keep the generated block in REST, not CORE, so a missing file never
rejects `addAll`.

### v3.127 — A settler by the fire: Ember, stages 2-3 (M)

**Ships:** `growthStage()`, `PUP_HOME`, `defineRestoration` for seven keys,
stage-scaled `BLOOM_MAX`/`HERD_MAX`/`MOOD_LIFT`/`'blossom'`, `characterNpc`
exported, `SETTLER_POSTS['la']` + `STAGE_CLUTTER['la'][2..3]`, the shared
clutter helper, `hearthLive` + `seen_N`, `summonSettler`, `LATE=<n>`, the
`ws` getter, `ember_grow_2`/`_3` rendered. **Not:** pups at the hearth (they
wait for the pen), stage 4, any other region. **Suite:** `verify-growth` §1-4
(§1-2 in `--quick`), `verify-healing` unchanged, `verify-narration`.
**Sheet:** `la` at `LATE=0..3`, plus `lc`/`vb1`/`t2a` at `LATE=1..3` for the
dials. First thing the kids see: come back to Ember after finding its pups
and there is a fire and someone by it.

### v3.128 — The pup pen (M)

**Ships:** the orbit loop replaced by the fenced `graze()` pen capped at six,
bedding rows, the trough ring, the pet verb, furniture at 3/6/12/24.
**Not:** the garden, Grimm, any hearth pups. **Suite:** `verify-den` §pen at
0/3/12/24. **Sheet:** the Den at 0/3/12/24. Nets the Den's draw calls down
before anything else is added there.

### v3.129 — Two doors and the suite that proves loops (S doors, M suite)

**Ships:** `den→vh` on `WS.stage('vault')>=1`, `ddp↔dlg` on `meriDefeated`,
the `'den'` `HUBS` entry, `new tools/verify-loops.mjs`. **Not:** the tappable
map, arena back-pointers. **Suite:** `verify-loops` (HEAVY), `verify-landings`,
`verify-openholes`, `verify-den`, `verify-level6`. **Sheet:** `den` (the east
wall changes), `ddp`, `dlg`. The first time "is the world a loop" can be
asked without a human building rooms.

### v3.130 — The Ash Vault (L)

**Ships:** `lv1`/`lv2`/`lv3` off `la`'s cracked wall, `markers.shadowed`
exemption, the lost wolf and `state.flags.rescued` in `persist`/`applySave`,
`WS.complete('ember','dungeon')`, the moved chest, `l1_crack` `done()`,
`districts` `dungeon` flag. **Not:** a puzzle, a guardian, a keepsake, Tam at
the mouth, the map offshoot card. **Suite:** `new verify-ashvault.mjs`,
`verify-density` rows, `verify-promises` §3, `verify-profiles` §3 (round-trips
`rescued`). **Sheet:** `la` at `LATE=1` and `4`, `lv1`, `lv2`, `lv3`, locked
and open. Amends nothing. This is the template every later dungeon copies.

The rest, sized:

| version | slice | size | suite | sheet |
|---|---|---|---|---|
| v3.131 | Ember stage 4 yard: cart → Maren's shop at the unlocked rung, armourer + `target`/`manikin`, Tam post at `la`; `WAYFARER_POSTS` hearth rows | M | `verify-growth` §3 stage 4, `verify-wayfarer`, `verify-shop` from `la` via `__wkJump` | `la` `LATE=4` |
| v3.132 | Stickers as pictures, grey silhouettes, non-combat rows, heart-piece readout; Pip's sparkle widened | S | `new verify-stickers.mjs`, `verify-hud`, pip cases | none |
| v3.133 | **Doc-only:** BRANCHES.md guardian amendment ("no region boss; a `MINI_ROSTER` guardian may hold an optional dungeon's last room"); ROOM-STANDARD 260 ms tier; BRANCHES road table; `regions.js` scars re-pointed; STORY-BIBLE second addendum; BUILDLOG board re-cut | S | `--quick` | none |
| v3.134 | The Frozen Spring: `tf1`-`tf3` from `t1b`, `tf3↔f1b`, lost wolf, `WS wild dungeon` | L | `new verify-frozenspring.mjs`, `verify-loops` asserts the loop, `verify-level3` <100 | `t1b`, `tf1`-`3`, `f1b`, `t1a` `LATE=4` |
| v3.135 | Stoneroot + Woods hearths stages 2-4 (`vh` reads `growthStage('stone')` beside `WS.stage('vault')`; `t1a`); pups home to all three hearths, measured | M | `verify-growth` §3 for `vh`/`t1a`, `verify-level2` <100 | `vh`, `t1a` at `LATE=1..4` |
| v3.136 | `MINI_ROSTER` + the Root Cellar (`vr1`-`vr3`, Rootbound Wight) — four-pass combat audit first | L | `new fight-mini.mjs`, `new verify-rootcellar.mjs`, `check-roster` extended, `verify-combat-laws` | `vc2`, `vr1`-`3` |
| v3.137 | Tappable map + dungeon offshoot cards + Tam at cleared mouths; arena `HUBS` back-pointers; Wren's rumour table | M | `verify-map` extended, `verify-onward`, `verify-touch`, `verify-narration` | none |
| v3.138 | The garden bed + `L.seed` | M | `verify-den` §garden, `verify-chests` | `den` |
| v3.139-141 | Frost / Storm / Vale / Court hearths stages 2-4, one or two per version; Village settlers on `WS village restored` | M each | `verify-growth` §3 per key, `verify-level-village` | each hearth `LATE=1..4`, `ysq`/`yhs`/`ylw` |
| v3.142 | Everyone home: Grimm and Luna at the Den; stage 5 for all seven | S | `new verify-homecoming.mjs`, `verify-den` with `grimmFreed` | `den`, every hearth `LATE=5` |
| unscheduled | Fishing (`mg-fish.js`) — the week a fish mesh is vendored and vetted with `probe-newassets`/`probe-assetshots` | M | `verify-minigame` ×10 residue | `q1`, `s1a`, `d1a` |
| unscheduled | Dungeons 4-7 (`f1b` cairn, `s1a` sea-cave, `d3b` house, `h2` veil) and the Tide passage — only once the kids are in those regions, never before a human has played the first three | L each | `verify-dungeons` table rows | per room |

---

## 7. What this plan does not do, and why

- **Region eight, or any new room-id prefix.** Every new room hangs off `l`,
  `t` or `v` on the Ember Deep pattern, so the four-places rule is never
  exercised. CHILD-FIRST's Den-side `b` prefix for a Meadow is not taken; the
  pen goes in the Den north of spawn, and if the Den cannot hold it the
  Meadow is a Den pocket under an existing letter.
- **A separate Act Two.** No new villain, no re-shadowing, no boss rematches,
  no re-locking the Village or Spire, no `act2` switch. Post-game under dad's
  law and off-canon (seven lights, Grimm freed). The homecoming is two S
  slices, last.
- **New creatures.** Settlers are the four unused-as-enemy KayKit humanoids
  colour-washed; guardians are BoneWarden on baked Rig_Medium bodies; pen
  animals are `wolf.gltf`. No baked static wolf heap (a prop wearing a
  creature's shape, the class the 2026-08-23 amendment bans); the rest of the
  pen is bedding spots. No code-built fish, and no gem standing in for one.
- **Economy or XP changes.** Deferred by dad in his own words. The region cart
  opens Maren's shop at the rung already unlocked — no per-region shelf, no
  repricing, no perk tier; past-12 pups keep their shards; the harness pays
  score and stickers; the garden pays a pot's worth and the doc says so.
- **New wolf forms or world verbs.** The ladder is finished at ten. Every
  dungeon opens on crack/cut/shatter/none as `promiseGate` ships them; no
  tide/storm/ghost gate system is added (the Court's ghost wing keeps its
  marker lock).
- **Pups anywhere off the seven regions, or a pen that adds pups.** The heart
  ladder is a global count. Dungeon rescues are grown wolves that pay no
  heart.
- **Puzzles in dungeons.** ONE PUZZLE ROOM PER LEVEL is not amended. Three-room
  puzzle dungeons need patience and precision the audience lacks; a burrow
  has a door, a wolf, a fight, a chest.
- **Healing the six scars, the Village or the Spire through `restoration.js`.**
  Scars stay broken; the Village gets people through settler posts on its own
  flag.
- **A follower companion across rooms.** Deferred until the top five rooms
  are re-measured; the rescued wolf joins the hub pack and the pen.
- **Memory, rhythm and sequence mini-games** (Howl Echo, Anvil Rhythm,
  Lantern Run) and migrating Rook/Wren/Paw onto the harness. Precision
  content, and dad left the three alone on purpose.
- **New music tracks.** Dungeons alias their region's loop; audio is already
  59% of the download.
- **Live geometry changes.** Every stage is read at build; the only live
  payoff is the additive grow-in `healLive` already permits.
- **Widening any ceiling** (125/135, Level 2/3's 100) or the known-fail
  manifest to make a slice fit.
- **Anything dad has closed:** text gates, riddles, number puzzles,
  teach-gated buttons, invisible buffs, floor decals under mooks, teleports,
  dark spots half in a room, lamps that do nothing when lit.

---

## 8. Open questions for dad and the kids

Only the ones whose answer changes the plan.

1. **Which region are the kids in today?** The order (Ember hearth → pen →
   Ash Vault → Frozen Spring → Root Cellar) assumes region 1-3. If they are
   past the Woods, the Frost hearth and the Market rod-on-a-rock move up; the
   Ash Vault still ships first because Ember is walked on every trip home.
2. **Hearth = fast-travel landing** (`la`, `vh`, `t1a`, `f1`, `s1a`, `d1a`,
   `x1`)? The alternative is the first island past the entrance, which the
   kids walk more but Tam does not land on. The plan wants growth exactly
   where a returning child arrives.
3. **The guardian amendment.** BRANCHES.md "a branch ends in a reward, not a
   duel" blocks the Root Cellar's Wight as written. Yes or no before v3.133;
   if no, the Root Cellar is a second roster-elite fight and `MINI_ROSTER` is
   never built — the plan loses one slice, not its shape.
4. **Stage triggers.** Stage 2 is the region's own pups (a deed done there),
   stage 3 the road keepsake (a deed done on the way out). Terranigma-faithful
   would push more of it elsewhere — would you rather Ember only grow once the
   kids are in Stoneroot, or keep one in-region trigger so a child sees growth
   before they leave?
5. **Fish.** Will you vendor one small CC0 low-poly fish (Quaternius or
   Kenney; no rig needed, it is a catch not a creature)? That single asset
   unblocks fishing. Until then it is designed and unscheduled.
6. **Settler faces.** Four KayKit bodies colour-washed, reusing the Den's
   faces. Contact sheet first: if a barbarian in orange beside Bram reads as
   the same man to the kids, do you want to vendor one or two more Rig_Medium
   KayKit adventurers so settlers are new faces?
7. **Sticker icons.** The emoji tiles were kept as your call (BUILDLOG
   3949-3958). Rendered thumbnails replace them, or sit beside them?
8. **The Den's budget order.** The pen must net the Den down enough for Grimm,
   the garden and Luna's light under 135. If the measured pen does not save
   enough, which goes first — the practice target (already named first to
   drop, `rooms.js:1076-1080`), the third tent, or the six-visible cap
   becoming four?
9. **Do the kids want to see the moment of growth** (a grow-in when they walk
   in, as planned) or find it already there (pure Terranigma)? Either is one
   flag.
10. **Pups at the hearth.** Three per region beside the settler's fire in
    addition to the pen, measured and dropped first if the room cannot hold
    them — or all of them at the Den only, which is cheaper and less wide?
11. **Piper.** Is `asset-raw/piper` on the machine that will render the ~30
    new lines (`tts-narration.py:46`)? Every settler, stage and Den line
    depends on it; they are batched one render per slice.
