# Mining & Woodcutting

Dad's ask (verbatim, from the crafting-system brief): "You mine/cut/collect
a certain amount of resources... If you have a pick axe in your inventory
it auto equips if the player selects a rock to mine. The player than
automatically walks over and start mining it. Same with the wood cutting
if they have a wood axe in their inventory. I am picturing this mechanism
to work like it did in the game Runescape."

## The one deliberate scope cut, and why

RuneScape's own loop is click-to-target: click a rock anywhere on screen,
the character paths to it and mines automatically. This game has **no
tap-to-target system anywhere** — every interactive thing in it triggers on
PROXIMITY instead (a chest opens when you walk into it, a minigame host
arms on approach, an NPC starts a conversation when you're close). There is
no camera-raycast-into-the-world code at all to build that click-target
flow on top of, and inventing one is a much bigger, riskier addition than
mining itself.

So a node follows the SAME law everything else in this game already
follows: **walk up to it yourself** (ordinary joystick control, exactly as
today), and if you own the right tool, mining/chopping starts on its own —
no manual tap to swing needed, which is the part of "automatically" that
actually matters for the RuneScape feel. The literal "walks over by
itself" is the one piece not built; "you don't have to keep tapping" is.

## v3.175 — the core loop (SHIPPED)

`js/nodes.js`, `ResourceNode` — reuses the SAME rock/tree models already
scattered as pure decoration everywhere (`rock-large-b.glb`, `tree-a.glb`)
rather than a new asset, the same "no code-built, no new geometry" law
every other system in this game follows.

- **Tools**: a pickaxe (`js/items.js`, new `pickaxe` id — `axe_c.gltf`
  retinted steel-grey, the same "one file, many tints" trick as everything
  else in the rack; bought at the Den shop, tier 1, 60 shards) for rock, and
  the ALREADY-shipping `axe_b` "Woodcutter Axe" (its own name and blurb
  already said woodcutting before this system existed) for trees. Owning
  either is a simple `ownsGear(id)` check — no new inventory bucket.
- **The loop**: within ~1.6u of an un-depleted node, owning its tool, the
  node channels on its own — `player.lockTime` held up every frame (the
  same field a real attack sets, so the child is "mid-swing" exactly the
  way a sword swing already locks movement) until a hit lands every 0.7s.
  Three hits deplete it. Walking away at any point cancels — proximity IS
  the cancel, no separate input needed.
- **Payout**: a rock pays `ore`, a tree pays `wood` (both new
  `js/materials.js` ids, same bucket every other material already uses —
  `canAfford()`/`spendMaterials()` and the whole crafting system already
  work with them for free), and a rock has a 15% chance of an extra
  `crystal` — mining is this game's OTHER source of the rare universal
  ultimate-recipe material, not just elite kills and gold chests.
- **Respawn**: none needed — a node simply exists again the next time its
  room is built, the same "always there to farm" law v3.170 already gave
  every enemy. No real-time timer, no persisted depletion state.
- **Wired in**: `world.markers.rockSpots`/`treeSpots` (plain `{x,z}`
  arrays), read by the shared per-room pipeline (`js/main.js`, right beside
  `spawnBreakables`/`spawnChests`) — any room can place nodes the same way
  any room places a crate. One room seeded for this first slice (`lc`,
  Ember Hollow's Cinder Bridges — a rock and a tree, clear of every
  existing marker and the lava band) to prove the whole pipeline end to
  end; a real rollout across every region is the next session's work.

Verified: `tools/verify-mining.mjs` (new, 13 checks) — without the tool,
standing next to a node does nothing at all for many ticks; with it,
standing near a rock/tree channels automatically (no attack input), one
tick lands one hit, three deplete it, the right material lands in
`state.inventory.materials`, `player.lockTime` is held while channeling,
walking out of range mid-channel resets progress to zero with no hit taken,
a depleted node is gone (off-scene) for the rest of that visit, and leaving
the room and coming back rebuilds it fresh with nothing still depleted.
Ticked via direct `world.updateNodes()` calls in one synchronous step
rather than waiting on real animation frames (this session's own
established lesson — the real render loop's
`!transitioning`/`!narration.blocking` gates can add real wall-clock delay
for reasons unrelated to the mechanic under test). Lint, `verify-boot`, and
the `--quick` gate all green.

An arrival-frame check on `lc` (CLAUDE.md's rule for anything touching room
contents) caught a real placement bug before ship: the tree spot's first
draft (`x: -9, z: -3`) sat exactly on `minZ` of the lava rectangle
(`world.addLava(-16, 12.5, -3, 1)`), which is an INCLUSIVE bound — the
"clear of the lava band" comment above it was wrong the day it was written.
Moved to `z: -6`, screenshotted again to confirm the tree now renders well
clear of both the lava and the two safe bridge slabs.

## Still to design

- **Rollout**: every region gets its own rock/tree placements, likely
  themed (Frostpeak's own rock kind, Wild Woods' own trees) rather than the
  one generic pair shipped here.
- **Visual tool-swap**: dad's own words were "it auto equips" — this ships
  the MECHANICAL half (ownership gates the action) but not yet the visual
  half (seeing the pickaxe/axe actually in Kael's hand while it happens).
  `Player.equipGear()` already rebuilds the hand mesh from
  `state.inventory.equipped.weapon` on demand; a future pass could swap to
  the tool for the channel's duration and restore the real weapon after,
  without touching the player's own saved loadout choice.
- **Feeds the Den rebuild** (`design/DEN-REBUILD.md`): ore and wood are the
  two resources that system's own building costs are written against —
  nothing there can be spent until this ships, which is why it was queued
  first.
- **A rarer node tier**: dad's own "rare crystal" line is answered here by
  the SAME universal `crystal` material every other system drops, at 15%
  from a rock — a dedicated rare ORE material (distinct from Wolf's
  Crystal) is a plausible future addition if the crafting recipe list ever
  wants an ore-specific "ultimate" ingredient.
