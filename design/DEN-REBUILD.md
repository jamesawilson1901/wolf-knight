# The Den Rebuilt

Dad's ask (verbatim, 2026-09-16): "I also want to change the den. I want to
change it so it's much bigger. I want it to be like the rebuilding rome in
assassin's Creed. You mine/cut/collect a certain amount of resources and you
get to rebuild the town around the den. Each building, monument, pup pen etc
restored offers benefits. Tavern directly gives you hold coins every x
amount of minutes. Forge gives ingotts every x amount of minutes so on and
so forth."

An Assassin's-Creed-style base-building meta-progression: gathered resources
spend on restoring buildings around the Den, each of which then passively
generates a reward over real time. Queued after mining & woodcutting (this
needs ore/wood to spend) and before the dragon-egg side quest.

## What's already true (researched, not yet built on)

- **The Den today**: `js/rooms.js` `buildDen()`, ONE hand-built room
  (24x18 — not on the shared `MODULES`/`shell()`/`sideDoor()` toolkit every
  region uses), already near its own draw-call ceiling (135 max, 137
  measured with everything present). **"Bigger" has to mean a real
  multi-room Den TOWN built on that same shared toolkit** (`M.hub` square +
  1-3 `M.pocket` districts, exactly the pattern `js/levelVillage.js` already
  uses), not cramming more buildings into the current room.
- **The reusable timer idiom** (`js/restoration.js`'s garden bed,
  1020-1167): a raw `Date.now()` timestamp (`WS.set('den','gardenPlanted',
  Date.now())`), a stage DERIVED from elapsed real time
  (`Math.floor((Date.now()-planted)/DAY_MS)`), and a ratchet that only ever
  writes the stage FORWARD (`stage = Math.max(stored, elapsed)`) so a wrong
  device clock can't walk it backwards. No numeric countdown UI anywhere —
  progress is shown diegetically (the plant visibly grows). **This is the
  exact mechanic a building's payout timer reuses**, generalized from one
  planting to N buildings.
- **Building assets**: no tavern/forge/monument-specific model exists
  anywhere vendored. What DOES exist and is already proven: `houses-pack.glb`
  is split into individually-placeable, individually-tintable buildings by
  `js/levelVillage.js`'s `splitBuildings()` (union-find over overlapping
  AABBs) — the Village's whole town is built this way. `hut.glb`,
  `tower-2.glb`, `tower-3.glb`, `walls-pack.glb`, `wagons.glb` are all
  already loaded by that same kit and unused elsewhere. **A Den-town reuses
  this exact kit and this exact split-and-retint technique** — one split
  building retinted warm/hearth-coloured reads as a tavern, another retinted
  dark/iron reads as a forge, purely through `tintedModel()`'s
  corrupt→restored colour blend (the SAME idiom gear/enemies already use) —
  no new geometry, per the standing rule. `FirePlace_1_1_A.glb` (village
  prop set) dresses a tavern's hearth; `Grinder_A.glb`/`Wheel_A.glb` dress a
  forge/mill.
- **The pup pen is decorative only today** (`js/restoration.js`
  `spawnPupPen`, 955-1018): filling a region's row flips a WorldState flag
  and fires a narration/toast callback, no resource payout. Dad named it
  alongside buildings, so it needs the SAME payout hook the others get.
- **The Village's `guardiansDown()`/`blend` model** (continuous 0-6 progress
  driving a corrupt→restored colour mix and a growing flower ring as the
  ONLY progress readout, `js/levelVillage.js`) is the right template for
  "how many of N things are restored" — closer to what a Den-town needs than
  `growthStage()` (which is combat/exploration-driven, per-region weather
  healing). This should be its OWN stage function, resource-spend-driven,
  the same way `guardiansDown()` is its own function rather than reusing
  `growthStage`. `healKeyOf('den') === null` (the Den has no weather/enemies
  to heal) is orthogonal to this and does not need to change.
- **Resources**: `js/materials.js`'s `MATERIALS`/`canAfford(cost)`/
  `spendMaterials(cost)` are already generic multi-line-cost primitives —
  directly reusable for "N ore + M wood restores the tavern." Ore and wood
  themselves don't exist yet; they arrive with the mining/woodcutting system
  this is queued behind.

## A concrete first draft (adjust freely when actually building this)

Four restorable structures, matching dad's own list, each on a
`spendMaterials()`-gated cost and a garden-bed-style real-time payout timer:

| structure | asset | cost (draft) | payout | interval (draft) |
|---|---|---|---|---|
| Tavern | split `houses-pack` building, warm retint, `FirePlace_1_1_A` | wood-heavy | shards (coins) | ~20 min, cap ~3 collections |
| Forge | split `houses-pack` building, iron retint, `Grinder_A`/`Wheel_A` | ore-heavy | a new `ingot` material (feeds crafting/ultimate recipes) | ~20 min, cap ~3 |
| Mill | `hut.glb`, retinted | wood + a little ore | wood back out at a small profit (a "the mill pays for itself" idiom kids read fast) | ~20 min, cap ~3 |
| Pup Pen | already exists — no new asset | free (already rescued the pups) | its first real benefit: a small XP trickle, "the pack brings something back" | ~20 min, cap ~3 |

Same cap philosophy as the garden bed (`GARDEN_HARVEST_SHARDS = 12`, "a
pot's worth" — dad's own economy-freeze rule): a payout that stops accruing
past a few collections' worth, so leaving the game running overnight isn't
a shortcut, and a design a five-year-old already understands ("come back
later, don't need to watch a clock").

Open for the actual build session: exact costs/intervals/caps (tune against
`GAME-CONTRACT.md`'s existing shard-economy amendment once ore/wood exist),
whether the Den-town is 2 or 3 extra rooms, and whether collecting is purely
walk-up-and-tap (garden bed's own idiom) or gets a small "town status" HUD
element the way the sticker book gives collection systems their own screen.
