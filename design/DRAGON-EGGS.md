# Dragon Eggs & the Grand Elemental Shrines

Dad's ask (verbatim, this session, following crafting/FX/mining-woodcutting/
the Den rebuild): "A hidden side quest: 3 dragon eggs hidden somewhere in the
world (chests, breakables, or similar — your call on exactly where, following
the existing hidden/rare drop precedent), each thrown into its own grand
elemental shrine to hatch into a different companion dragon. Three shrines:
fire, water, and a third element of your own choosing. Pip gives a hint near
each shrine. Approaching a shrine while holding the matching egg pauses and
has Pip read a confirm-before-throw line aloud — this game has no reading
requirement for young children, so a non-reading child must be able to act on
this through a clear visual/button prompt, not text they have to parse. Only
one dragon can be equipped at a time, chosen from the backpack. The equipped
dragon runs alongside the player and auto-attacks nearby enemies. Deliberately
a quiet, unflagged secret — no quest marker, no map pin, no counter."

## Researched precedents (before any code)

- **`js/pip.js`'s `Pip.update(dt, t, player, world)`** — the direct template
  for a companion's own follow-the-player movement: stay ~`FOLLOW_DIST`
  behind, trot or sprint to catch up, idle otherwise. The companion dragon
  reuses this shape exactly (js/companionDragon.js), just at a different
  scale and speed. `spawnLostWolf()` in the same file was read as the
  template for a world-placed rescue object with its own tiny state machine,
  but the shrine's own needs (an edge-triggered event, an armed/disarmed
  confirm, no per-instance mixer of its own) ended up closer to
  `js/nodes.js`'s `ResourceNode` than to a Pup/LostWolf, so that is the
  shape `DragonShrine` actually took.
- **`js/enemies.js`'s `Dragonling` class** (Ember/Frost/Shadow dragonlings,
  reused by the `MONSTER_ROSTER`/`mk[rosterKey(id)]` spawn pipeline) — the
  asset/animation handling (Dragon.glb, its `DragonArmature|Dragon_Flying`/
  `..._Attack` clips, the separate `EyeArmature` eye-rig sync fix, the
  `fitHeight` scaling idiom) is extracted into a new shared function,
  **`buildDragonBody(gltf, opts)`**, exported from `js/enemies.js` and called
  by BOTH `Dragonling` (unchanged behaviour — this is a pure refactor,
  verified by the whole quick gate staying green) and the new
  `CompanionDragon` (`js/companionDragon.js`). Dragonling's own combat state
  machine (hover/telegraph/dive/floored, all built around being hostile to
  Kael) was NOT reused — the companion's state machine is new, and much
  smaller: follow, or hunt-and-bite.
- **`js/menus.js`'s tab strip** (`this._armTab`, `_paintRight()`,
  `_paintCraftTab()` added for crafting this session) — the template for
  adding equip-a-dragon UI. Shipped as a THIRD tab (`'dragons'`) rather than
  a Gear-tab section, because a dragon is not gear in the
  weapon/shield/armour sense (`_paintSlots()`/`_equip()` are keyed to those
  three slots specifically) and forcing it into that shape would have meant
  teaching `_equip()` a fourth kind it does not otherwise need.
- **`js/loot.js`'s `Breakable`/goldchest system, `js/crafting.js`'s
  `discoverRandomHiddenRecipe()`, `js/treasures.js`'s keepsakes.** Read all
  three before deciding. `discoverRandomHiddenRecipe()`'s "20% goldchest
  roll, whichever hidden recipe you haven't found yet" is the right shape
  for a recipe (there are several, any one will do, and WHICH one you find
  first is meant to feel random). Three dragon eggs, one per NAMED element,
  is a different shape: dad wants exactly a fire egg, exactly a water egg,
  exactly a storm egg to exist, each answering to its own named shrine — a
  random roll could theoretically hand a child three fire eggs and zero tide
  eggs. That is `js/treasures.js`'s own shape instead (`TREASURES`, one
  fixed id per keepsake, `visibleReward(..., { treasure: 'id' }, 'gold')`,
  `addTreasure()` idempotent) — so an egg is a **fixed, hand-placed gold
  chest**, one per element, never a random roll. `js/treasures.js` itself
  was checked for a shrine/marker precedent and has none — it is purely an
  inventory line with a model and a blurb, nothing spatial.
- **Elemental shrines.** Grepped `shrine` across the codebase first, per the
  brief's own instruction. No generic "shrine" system existed, but
  `js/levelkit.js`'s **`spiritShrine(world, x, z, colour, top)`** already IS
  exactly a "grand elemental shrine" in every way that matters: a floating
  heart of light, a halo, a light column visible across a cavern, a floor
  ring, rising motes, all drawn from primitives on purpose (its own header:
  "this is LIGHT, not a creature, and the no-code-built-creatures law is
  about creatures") and already reused at every region's own spirit-grant
  moment (Ember, the Vault, the Woods, the Spire) AND at two of the three
  post-boss memorials this quest sits beside (`js/level5.js` buildScr's
  Aria memorial, `js/level6.js` buildDdp's Meri memorial). Reusing it
  directly, at a distinct colour per element, is both the lowest-risk
  option and the most consistent with how every other "important light in
  the world" already reads.
- **The contextual action button.** No literal `<button>`-with-text prompt
  exists anywhere in this game (grepped `prompt`/`hint marker` broadly and
  found none) — but `#btn-ranged`/`#btn-defend`/`#btn-jump` in `index.html`
  ARE exactly this idiom already, just under a different name: hidden by
  default (`display:none`), a `.revealed` class toggled per-frame or
  per-milestone by `js/main.js` (`refreshControlReveal()`,
  `document.getElementById('btn-ranged').classList.toggle('revealed', ...)`),
  a `reveal-pop` animation on appearance, `#special-btn.ready`'s gold glow
  for "this is actionable right now." The confirm-before-throw prompt
  (`#btn-dragon`) is a new button built on exactly this idiom — hidden
  unless `world.dragonPromptElement` is set, revealed with the same
  animation, glowing gold border on top of it. Tapping it is the entire
  "confirm" gesture; nothing about it requires reading a word.

## What element weakness/enemy vocabulary already exists

`js/enemies.js`'s `Enemy#takeDamage(n, element, kind)` already recognises
`'steel' | 'spark' | 'moon' | 'fire' | 'earth' | 'verdant' | 'frost' |
'storm' | 'tide'`. Fire and tide (water) are dad's own first two; the third
element is **storm** (lightning) — already fully established (Storm Wolf,
`shard_storm`, Aria's region, Storm Wolf's own periwinkle `WOLF_TINTS` entry)
and reads as a natural third alongside fire/water without inventing a new
vocabulary word the rest of the game does not otherwise use. Frost, earth
and verdant were the other candidates; storm was picked because it is the
one of the remaining five with no dragon-family reuse yet in
`MONSTER_ROSTER` (frost-dragonling already exists) and pairs well
visually — a fire/water/lightning trio reads as a classic elemental triad a
five-year-old already has intuitions about.

## v3.177 — SHIPPED

**Files touched:** `js/dragonEggs.js` (new), `js/companionDragon.js` (new),
`js/enemies.js` (Dragonling's body-building code extracted into the new
exported `buildDragonBody()`, used by both classes — no behaviour change),
`js/state.js` (three new `state.inventory` fields), `js/save.js` (additive
backfill for the same three fields), `js/narration.js` (nine new lines: a
repeating hint + a one-shot confirm + a one-shot hatch line per element),
`js/menus.js` (the Dragons tab), `js/main.js` (wiring: per-room shrine
spawn, per-frame shrine/companion update, the `#btn-dragon` button and its
click handler, `giveLoot()`'s new `L.dragonEgg` case), `index.html`
(`#btn-dragon` markup + CSS), `js/level1.js` / `js/level5.js` / `js/level6.js`
(one shrine + one egg chest each), `tools/verify-dragoneggs.mjs` (new).
**Not bumped, per this session's own explicit instruction**: `sw.js`'s
`CACHE_NAME`/the `#badge` version — `node tools/sync-cache.mjs --write` was
run to resync the precache module list for the two new files (a required,
separate step from the version bump itself), which does not change
`CACHE_NAME`.

### Egg placement — three fixed gold chests, one per element

Following the `js/treasures.js` precedent above, not a random roll:

| element | egg name | chest id | room | element's own region |
|---|---|---|---|---|
| fire | Ember Dragon Egg | `le_dragon_egg` | `le` — Heart of the Hollow (Ember's boss arena) | Ember Hollow |
| tide (water) | Tide Dragon Egg | `ddp_dragon_egg` | `ddp` — Meri's hall (Sunken Vale's boss arena) | Sunken Vale |
| storm | Storm Dragon Egg | `scr_dragon_egg` | `scr` — Aria's Crown (Stormreach's boss arena) | Stormreach |

Each is a **gold-tier chest** (`world.markers.chestDefs`, the same tier a
keepsake ships at), holding `{ dragonEgg: '<element>' }` instead of
`{ treasure: 'id' }`. `js/main.js`'s `giveLoot()` grew one new case,
directly mirroring the existing `L.treasure` case: idempotent
(`addEgg()` returns false on a re-open), pops a real vendored asset — a
tinted `gem-diamond.glb` (this game's own existing treasure-pop shape,
already reused for jewel-shaped finds like armour rewards) rather than a
hand-built egg primitive, and announces the find by name in the reward
toast.

**Why each egg sits in that particular room, and why they are gated on the
region's own boss flag.** All three chests were placed inside their
element's own boss arena, alongside that arena's ALREADY-EXISTING post-boss
memorial (`spiritShrine`) and gold chest — `js/level5.js` buildScr and
`js/level6.js` buildDdp already dress themselves this way the instant
`ariaDefeated`/`meriDefeated` flips, and `js/level1.js` buildLe's own
"heart of the hollow" reads the same `bossDefeated` flag for its own
onward-door logic. Riding the SAME gate rather than adding a new one keeps
the egg (and its shrine, below) appearing exactly when the room already
changes for another reason, and — more importantly — kept this increment to
editing rooms whose FULL layout was already read and whose free floor space
was already known, rather than guessing at coordinates inside a busy,
earlier-game room. The real tradeoff: an egg is not found until its
region's own boss falls, so this quest interleaves with, rather than runs
fully alongside, the main story. Documented here as the explicit call this
session made rather than left implicit.

### The Grand Elemental Shrines — `spiritShrine()`, reused and retinted (v1 — SUPERSEDED, see v2 below)

> **Superseded in v2** (below): dad's own review of these screenshots —
> "you can't reuse those assets as the shrines, it will confuse the
> player" — replaced `spiritShrine()` with a real portal model. Left as
> written for the historical record of why `spiritShrine()` looked like a
> reasonable v1 choice at the time; nothing in this subsection reflects
> what actually ships.

Three calls to the existing `js/levelkit.js` `spiritShrine(world, x, z,
colour, top)`, one per boss-arena room, at a colour matching each element's
own established `WOLF_TINTS` hue (fire `0xff5a2b`, tide `0x3fb0c4`, storm
`0xc9d4ff`). Coordinates were chosen from a full read of each room's
existing decor (every fallenColumn/rubbleField/chest/scatter call already
in the function), then confirmed clear by a real Playwright arrival
screenshot from the room's own spawn point before shipping — the same
"read the room, then verify by eye, not by inference" law CLAUDE.md holds
every room-contents change to.

- **Fire** — `le` (Heart of the Hollow), shrine at `(6, 9)`, egg chest at
  `(-6, 9)` — the arena's far north corner, well clear of the cage, its four
  braziers, the existing `le_cage_reward` chest and every perimeter prop.
- **Tide** — `ddp` (Meri's hall), shrine at `(8.5, -2)`, egg chest at
  `(-8.5, -2)` — either side of the hall's own shallow water zone, clear of
  the memorial, its chest, and the fallenColumn/rubbleField dressing.
- **Storm** — `scr` (Aria's Crown), shrine at `(9, 9)`, egg chest at
  `(-9, 9)` — the arena's own far corners, clear of the crownstones, the
  memorial and the gravel patch.

`world.reserve(x, z, r, 'dragonShrine')` is called for every shrine (a
shrine draws no collider of its own — it is pure light — but the reserved
zone keeps this room's own `scatter()` calls from later dropping a rock
inside the ring).

### The confirm-before-throw prompt — a visual button, not text

`js/dragonEggs.js`'s `DragonShrine` class is a small state machine, ticked
every frame by `world.updateDragonShrines(dt, t, player)` (wired into the
same shared per-room pipeline as `spawnResourceNodes`/`spawnBreakables`,
`js/main.js`). It reports an **edge-triggered event** — fires only the
frame "near" flips from false to true, never on a loop:

- **No matching egg held** (whether none at all, or the wrong element's) →
  `{ type: 'hint' }`. `js/main.js` turns this into the shrine's own
  repeating Pip line (`dragon_hint_fire`/`_tide`/`_storm`) — "a fire
  shrine… I can feel it waiting for something," etc.
- **The matching egg IS held, and it is not yet hatched** → `{ type:
  'confirm' }`, turned into a ONE-SHOT Pip line (`dragon_confirm_fire`/
  `_tide`/`_storm`). Because this line is not marked `repeat: true`,
  `js/narration.js`'s own `blocking` getter freezes the game while it
  plays — this is the "pauses" the brief asked for, reusing a mechanism
  the game already had rather than building a new one.
- Simultaneously, `world.dragonPromptElement` is set to the armed
  element, and `js/main.js`'s per-frame loop toggles `#btn-dragon`'s
  `.revealed` class off it — the same contextual-button idiom
  `#btn-ranged`/`#btn-defend`/`#btn-jump` already use. **The egg is never
  auto-thrown.** Standing at the shrine for any length of time does
  nothing further; only a real tap on the revealed button calls
  `world.confirmDragonThrow()`. `tools/verify-dragoneggs.mjs` proves this
  directly — 30 synchronous ticks standing at an armed shrine, still not
  hatched.

`confirmDragonThrow()` (`js/dragonEggs.js`) hatches the dragon
(`hatchEgg()`, which flips `state.inventory.dragonsHatched[el] = true` and
can never succeed twice — no wasting a second throw, no picking the egg
back up), auto-equips it if nothing is currently equipped (the FIRST dragon
you ever hatch joins you immediately; a second or third hatch leaves your
equip choice alone, so it does not silently swap out a dragon you already
had running), and fires a juice burst + a one-shot Pip hatch line
(`dragon_hatch_fire`/`_tide`/`_storm`).

### The companion dragon — `js/companionDragon.js`

A new, small class — NOT `Dragonling` instantiated unmodified, per the
brief's own instruction, since Dragonling's entire state machine (hover,
telegraph, dive-at-the-player, floored/stunned) assumes hostility toward
Kael. What IS reused, via the new `buildDragonBody()` extracted from
`Dragonling`'s constructor: the model load/clone, `fitHeight` scaling, the
per-material tint pass, the clip lookup by name, and the separate
`EyeArmature` eye-rig sync fix (Dragon.glb's eyes are a second skinned rig
untouched by any of its 5 clips — without this fix they float in place
while the head bends).

**Tints** — `{Main, Belly, Claws, Wings, Eyes}`, the real material names on
Dragon.glb (confirmed against `MONSTER_ROSTER`'s own frost-dragonling/
shadow-dragonling tint maps). `Main`/`Eyes` are lifted verbatim from
`js/player.js`'s `WOLF_TINTS[el + '_wolf']` so a companion dragon matches
its element's own wolf form exactly; `Belly`/`Claws`/`Wings` are a lighter/
darker share of the same base colour (a dragon's proportions do not map
onto a wolf's own belly/claw regions, so those three were derived rather
than borrowed).

**Follow AI** (mirrors `js/pip.js`'s own `update(dt, t, player, world)`):
stays `FOLLOW_DIST = 2.2` behind Kael, `FOLLOW_SPEED_FAR = 6.4`u/s beyond 5u
out, `FOLLOW_SPEED_NEAR = 3.6`u/s closing in, idle bob otherwise.

**Attack AI** (entirely new — Dragonling's own state machine was not
reused here): scans `world.enemies` (the SAME live list
`js/enemies.js`'s own `updateEnemies` drives and the player's own melee/
bolt/aoe attacks already resolve damage against) for the nearest live foe
within `HUNT_RANGE = 6.5`u of the PLAYER's position (not the dragon's own —
so it only breaks off to hunt something Kael is actually near, not
something the dragon happened to wander past). Closes at `CHASE_SPEED =
6.0`u/s; once within `BITE_RANGE = 1.2`u, bites every `BITE_COOLDOWN =
0.9`s for `BITE_DMG = 1.5` (a modest support number — roughly a third of a
heart per bite on the game's own damage scale — a companion, not a second
player), through the exact same `Enemy#takeDamage(n, element, kind)` path
every other source of damage in the game already uses, with the dragon's
own element as the `element` argument (so a fire dragon biting something
weak to fire triggers the same SUPER!/gold-flare callout a player's own
fire attack would). Gives up the chase if the target dies or drifts beyond
`GIVE_UP_RANGE = 9.5`u from the player (hysteresis against the target
darting in and out of `HUNT_RANGE` every frame), and returns to following.

**Equip / swap**: exactly one dragon at a time
(`state.inventory.dragonEquipped`), chosen from the backpack's new Dragons
tab (`js/menus.js`). **Swapping RETINTS the same body rather than
despawning and reloading a second Dragon.glb** — `CompanionDragon#
setElement()` re-runs the material tint pass in place. This was the
explicit "your call, document it" the brief allowed: one fewer skinned-mesh
rebuild per swap, and no pop of the model vanishing and reappearing
mid-session. `js/main.js` owns exactly one `CompanionDragon` instance,
created LAZILY (`ensureDragon()`) the first frame something is actually
equipped — most saves will never find an egg at all, and Dragon.glb is not
free to fetch — added straight to the persistent `scene` (never to
`world.root`), the same reason `pip.root` survives every room change
untouched by `world.dispose()`.

### The Dragons tab (`js/menus.js`)

A THIRD tab beside Gear/Craft, **invisible until at least one dragon has
hatched** — the Crafting tab teases itself on purpose (a greyed "???" row,
one tutorial line) because dad wanted the hidden-recipe ladder discovered
through the backpack; dragons are meant to stay quieter than that, so
nothing in the menu hints "there is a third tab" to a save that has never
found an egg. Once it exists, it lists ONLY the dragons actually hatched —
never a locked row for the ones not yet found, and never a total — plus a
"None" row to send the dragon home. Tapping a row calls
`setEquippedDragon()` and persists immediately, the same pattern
`_equip()` already uses for gear.

### Save/load

Three new `state.inventory` fields — `dragonEggs`, `dragonsHatched` (both
`element -> true` flag bags) and `dragonEquipped` (`element | null`) —
added to `js/state.js`'s defaults and backfilled in `js/save.js`'s
`applySave()` exactly the way `materials`/`crafted`/`recipesKnown` were
backfilled this session: `if (!state.inventory.dragonEggs)
state.inventory.dragonEggs = {};` etc. Because `persist()` already
JSON-clones the WHOLE `state.inventory` object rather than naming each
field, no change to `persist()` itself was needed — the three new fields
ride along for free the moment they exist on `state.inventory`.
`tools/verify-dragoneggs.mjs` proves both directions: a real
`persist()` → `loadSave()` → `applySave()` round trip carries found eggs/
hatched dragons/the equipped choice through, AND a save manufactured to
look like it predates this system (all three fields deleted outright)
loads without throwing and backfills to the untouched-game defaults.

### Verified

`tools/verify-dragoneggs.mjs` (new, 25 checks): a shrine seeds correctly
from `world.markers.dragonShrineSpots`; approaching with no egg fires only
the generic hint and never arms the confirm (and a tap on it does nothing);
holding a DIFFERENT element's egg at a shrine is indistinguishable from
holding none; holding the MATCHING egg arms the confirm button but does
NOT auto-throw it no matter how long you stand there; completing the throw
hatches the dragon, auto-equips the first one, and disarms the confirm
immediately; a second throw attempt on an already-hatched egg does nothing;
`setEquippedDragon()` swaps between hatched dragons and refuses one merely
FOUND but never thrown; a real DOM click through the backpack's Dragons tab
equips a dragon (not just the underlying function); a `CompanionDragon`
ticked directly (no real animation frames) follows the player when nothing
is nearby, bites a forced-into-range live enemy for real
`Enemy#takeDamage()` damage, and resumes following once the target dies;
and the full save/load round trip plus additive-forever backfill both
hold. Ticked via direct `world.updateDragonShrines()`/`CompanionDragon#
update()` calls in synchronous `page.evaluate()` blocks — this session's
own established lesson (design/MINING.md, design/DEN-REBUILD.md): the real
render loop's `!transitioning`/`!narration.blocking` gates add real
wall-clock delay for reasons unrelated to the mechanic under test, and
narration triggered incidentally by test setup can hold those flags true
for real seconds.

One real bug the suite itself caught before it ever reached a screenshot:
the FIRST draft of the companion-attack check moved a forced enemy by
writing `foe.x = ...` directly — `Enemy#x`/`#z` are READ-ONLY getters onto
`root.position` (`js/enemies.js`), so the assignment silently no-op'd, the
enemy stayed at its original spawn spot outside hunting range, and "no
damage landed" read exactly like a companion AI bug. Fixed by writing
`foe.root.position.x` instead — a test bug, not a game bug, but exactly the
kind CLAUDE.md's "verify via real input paths, not inference" rule exists
to catch before it is mistaken for the real thing.

A SECOND real bug — this one a game bug, not a test bug — was caught by the
screenshot pass the suite itself has no way to see: the companion's first
draft used `buildDragonBody()`'s `fitHeight` option (like the Hopper/wasp
callers already do) at `0.95`. `fitHeight` measures a fresh bind-pose
`Box3().setFromObject()` height, which — for Dragon.glb specifically,
apparently never exercised this way before (every existing dragonling
passes a flat `scale`, never `fitHeight` — see the precedents section
above) — reports a wildly inflated number, and the companion rendered at an
invisible ~0.0023 scale: present in the scene graph, correctly following
and correctly biting (every automated check passed), simply too small to
see. `tools/verify-dragoneggs.mjs` had no reason to catch this — nothing in
it asserts a visual size — and the game would have shipped a companion
dragon that worked perfectly and was never once visible. Fixed by using a
flat `scale: 0.7` instead, the same idiom `Dragonling` itself already uses
for this exact asset. This is the whole reason CLAUDE.md holds room/visual
changes to a real screenshot pass rather than trusting a passing suite —
most of what play-testing finds is visual, and this was exactly that class
of bug.

`sh tools/lint.sh` clean throughout. `node tools/verify-boot.mjs` clean
after `node tools/sync-cache.mjs --write` resynced the precache list for
the two new modules (CACHE_NAME itself untouched — see the boundary note
above). `sh tools/verify-all.sh --quick` (the 12-suite push gate) stayed
fully green both before and after every edit in this slice.

A real Playwright screenshot pass (each shrine's arrival frame, the egg
chest visible in the same frame, and the companion dragon flying alongside
Kael in open ground) was taken and reviewed by eye before calling this
done — screenshots and the visual read live in this session's own report,
not copied into this file. The human pass CLAUDE.md requires before a merge
to `main` is still owed and is explicitly not claimed here.

**A THIRD real bug, caught in independent review after the slice above was
already reported done**: `#btn-dragon`'s icon shipped as a bare `🥚` emoji
span. Every other button in the SAME `.action-btn` family this one is
explicitly modeled on — `#btn-attack`/`#btn-ranged`/`#btn-defend`/
`#btn-jump`/`#special-btn` — uses the game's masked-PNG `ctl-glyph` icon
system (Kenney's Mobile Controls, CC0), zero exceptions; an emoji glyph on
this one button alone was a real, visible inconsistency the report's own
screenshot pass had no reason to flag (it only looked at the shrines and
the companion, never the new button in isolation). Fixed to reuse the
existing `ctl-star` glyph (already this family's own "cast/ranged action"
icon — throwing an egg is close enough in kind) at the button's own gold
accent colour, confirmed by a follow-up screenshot with the button actually
armed and visible on screen.

## v2 — the real shrine, the moat, and the cover-the-player reveal (2026-09-17, SHIPPED)

Dad, on seeing the v1 screenshots: "you can't reuse those assets as the
shrines, it will confuse the player. There was also meant to be some sort
of moat surrounding it to throw the egg into. I suggest we use the pop up
question to cover up the player. The question fires when the player
touches the moat. The text box covers the player and if they say yes then
the egg is already in their hands and kael drops it straight in. No
throwing animation needed. The baby dragon after a few seconds jumps out."
He also supplied a real model — "Fantasy Portal 3D LowPoly Model" — and
asked whether its face count was too high.

**The face-count check, before anything else**: 3,765 triangles (2 meshes,
1 material, no bones/animation), converted from the supplied `.fbx` and
benchmarked against what already ships — `rock-large-b.glb` (85 faces),
`Dragon.glb` (1,344, fully rigged/animated), and the closest existing
"big stone set-piece," the dungeon kit's own `Arch.glb` (4,484 faces,
already shipping). The portal sits comfortably under that Arch and well
above simple decor, and only 3 will ever exist in the whole game (one per
element, one per boss-arena room, never repeated) — not a budget concern.
Style-wise it's chunky, flat-shaded low-poly stone with moss accents,
compatible with the existing look. Verdict: usable as supplied, no need for
a different asset.

**License**: the pack shipped with no `LICENSE.txt`/README inside the
archive and no source URL; dad stated directly it is CC0 when asked.
Recorded honestly in `assets/LICENSES/MANIFEST.json` — `licence: null`,
`evidence: fantasy-portal-attestation.txt` (a plain-words record of that
exact exchange, dated, mirroring this session's own existing
`uploader-batch-2026-09-03-attestation.txt` precedent for the same
situation) — under the project's standing private-family-use decision,
not claimed as formally verified.

**The asset conversion** (`assets/env/shrine/portal.glb`, self-contained):
the supplied `.fbx` referenced its three textures (diffuse, metallic,
emissive) by absolute Windows paths that don't resolve anywhere but the
original machine. Converted via `assimp` (FBX → glTF) then `pygltflib`
(re-embedding all three textures as binary buffer chunks, dropping the
broken external URIs) into one portable `.glb`, matching how every other
single-file vendored model in this game already ships. A genuine discovery
made along the way: the model's glowing disk (what an egg is actually
thrown into) turned out to already be a SEPARATE mesh in the source file
(`Portal_01_Hole`, oddly named, 20 faces) sharing the frame's own material
by what looks like an export oversight — giving it its OWN material
(`PortalDisk`, base colour neutral, its emissive texture desaturated to a
grayscale mask so `.color`/`.emissive` multiply into a clean, predictable
tint) means only the disk recolours per element; the stone frame, moss and
root (`PortalFrame`, the original, untouched diffuse texture) never do.
Confirmed with real Playwright renders of the retint at all three elements
before wiring it into the game at all — a global tint (the first, wrong
attempt) painted the WHOLE model each element's colour, moss and stone
included, which read as wrong the moment it was screenshotted.

**The shrine** (`js/dragonEggs.js`'s `DragonShrine`): the portal replaces
`spiritShrine()` outright — `fitHeight`-scaled to 2.6u (a little taller than
Kael, a real set-piece), the disk material's `.color`/`.emissive` set to
the element's own tint (`DRAGON_ELEMENTS[el].tint`, unchanged from v1)
at `emissiveIntensity: 2.2`.

**The moat**: a flat `THREE.RingGeometry` (inner radius 1.7, outer 2.6)
laid flush with the floor, using `js/water.js`'s own `WATER.shallow`
tint/alpha — the SAME material read as "this is water" everywhere else in
the game, not a new one — rather than a light effect standing in for one.
`MOAT_OUTER` (2.6) is now also the shrine's own walk-up/touch radius
(`NEAR_R`), replacing v1's arbitrary invisible 3.2u circle — "touching the
moat" is now literally what the ring you can see means, not a separate
number nobody could see. Deliberately visual-only: it does not slow the
player the way Sunken Vale's own real water zones do (that machinery is
built for a handful of dedicated rooms, not three one-off rings in
otherwise-dry boss arenas) — documented as a scope decision, not an
oversight.

**"Cover the player," no throw animation, jump out after a few seconds**
(`js/main.js`'s `#btn-dragon` handler): tapping confirm is the entire "yes"
— the state flips immediately (`throwEgg()`: hatched, auto-equipped, egg
spent, unchanged from v1), but the companion's own appearance waits.
`dragonEmerging` (a new module flag) keeps `#caption` in a new, much bigger
centred `.big-cover` CSS state (up from a thin bottom strip to a
`min-height: 34vh` centred card) for the whole `EMERGE_DELAY_MS` (2200ms)
wait — literally covering the area Kael stands in, which is the entire
point: nothing needs to animate an egg leaving his hands because the
player cannot see that moment happen at all. `EMERGE_DELAY_MS` later,
`CompanionDragon#emergeAt(x, z)` (new) places the companion AT THE SHRINE
(not beside Kael, `place()`'s usual spot) and scales it up from 0.05 to
1.0 over `EMERGE_RISE_TIME` (0.9s) — "the baby dragon after a few seconds
jumps out," the way the brief asked for it, word for word.

**Two real bugs, both caught by the mandatory verification pass, not
assumed away:**

1. *A visual bug*, in the same family as the emoji-button catch above:
   a naive per-element retint set `material.color` on the WHOLE model, so
   the fire shrine's frame, moss and root all turned uniform orange — a
   real screenshot comparison (not inference) showed a monochrome statue
   rather than a stone shrine with a glowing disk. Fixed by discovering and
   using the disk's own separate mesh/material (above) instead of
   attempting a same-material split by hand.
2. *A real sequencing bug*, caught by `tools/verify-dragoneggs.mjs`'s own
   real-button test: the first draft called `narration.say(hatchLine)`
   immediately after `emergeAt()`/`dragonEmerging = false`, in the same
   synchronous task. `js/narration.js`'s `blocking` getter freezes the
   ENTIRE per-frame loop (`js/main.js`) the instant a non-repeat line
   starts — including the very `.big-cover` toggle and
   `CompanionDragon#update()` this feature depends on — so with zero real
   frames landing between "cleared" and "the hatch line starts," the cover
   would freeze on screen and the rise animation would freeze mid-scale for
   as long as the line took to speak, restarting only once it stopped: not
   a smooth reveal, and a real device with functioning TTS would show this
   every single time, not just under test. Fixed by waiting out
   `EMERGE_RISE_TIME` for real before clearing `dragonEmerging`, and adding
   one more short real gap (100ms) before the hatch line itself, so the
   per-frame loop gets an actual free window to apply "reveal complete,
   cover cleared" before allowing itself to freeze again for the
   announcement.

**Verified**: `tools/verify-dragoneggs.mjs` grew real portal/moat
assertions (a `PortalDisk` material recoloured to the right tint, on its
own — not the frame's — material; a moat ring present) and a REAL
`#btn-dragon` click driving the whole sequence end to end: state flips
instantly, the companion is provably NOT visible during the wait, `.big-
cover` is seen applied at some point during it, the companion appears
EXACTLY at the shrine's coordinates once the delay elapses, and the cover
clears once it has. This test surfaced a THIRD thing worth recording
plainly, this time about testing itself rather than the game: the shrine's
own real confirm line is a genuine, non-repeat `narration.say()` that the
real per-frame render loop can race into existence at any point, and
headless Chromium has no real TTS to ever finish a line on its own — its
text-length-based fallback timer can run for several real seconds, which
is longer than earlier draft's own fixed test waits. `waitQuiet()` (new,
polls and actively `skip()`s until narration is quiet for several
consecutive checks) reaches the same real eventual state — the line
finishing to speak, exactly as it would on a device with working TTS —
deterministically, 8/8 consecutive runs, rather than depending on which
side of a timing race one particular run happened to land on. A second,
unrelated hazard the same debugging pass found: `le`'s own fast-travel spot
sits close enough to the shrine's coordinates that teleporting the player
there for these checks also satisfies the travel spot's OWN proximity
trigger, popping the map menu open and freezing everything the same way —
the exact hazard `tools/shot-dragoneggs.mjs`'s own screenshot pass had
already found and stripped for this identical reason, applied here too.

`sh tools/lint.sh`, `node tools/verify-boot.mjs` (precache resynced for the
new `assets/env/shrine/portal.glb`), and `sh tools/verify-all.sh --quick`
all green. A real Playwright screenshot pass of all three retinted shrines
plus the companion mid-rise and fully emerged confirmed the visuals read
correctly before shipping — the human pass CLAUDE.md requires before a
merge to `main` is still owed and not claimed here.

## Still to design

- **A fourth or later dragon.** The system supports any number of elements
  trivially (`DRAGON_ELEMENTS` is a plain registry), but only three shrines
  exist in the world right now, matching dad's own "three dragon eggs"
  ask exactly. A future region (or an existing one not yet used this way)
  could carry a fourth.
- **Dragon-specific specials.** The companion currently has one behaviour
  regardless of element (follow + bite for `BITE_DMG` of its own element) —
  a fire dragon breathing a cone, a tide dragon healing, a storm dragon
  chaining lightning between foes, are all plausible future differentiators
  once the base loop has been played against real children.
- **Un-hatching / releasing a dragon.** There is no way to un-find an egg or
  un-hatch a dragon once thrown — matching the brief's own "no wasting a
  second throw, no picking it back up" instruction exactly, but also
  meaning there is no "give it back" path if a parent ever wanted one.
- **A HUD indicator that the equipped dragon is nearby/engaged.** Left out
  on purpose, the same "no counter, no marker" law the whole quest is built
  on — a child can already see the dragon flying beside them, which is the
  entire point of it being a companion rather than a passive stat.
