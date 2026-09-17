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

## The rollout — 2026-09-16 (SHIPPED to branch)

Every region named in this section's own "still to design" note now has its
own rock and/or tree. `sw.js`'s `CACHE_NAME`/`#badge` were deliberately left
un-bumped (this session's own explicit task boundary — no new module is
imported, so `verify-boot`'s precache check has nothing to catch) and
`git commit`/`push` were left to whoever reviews the diff; the version this
would ship as is still v3.178.0 until that review bumps it.

### `js/nodes.js` grew one thing: an optional per-placement tint

`ResourceNode`'s constructor takes an optional 5th argument, `tint` — a
single hex colour applied to every mesh material on the cloned model, the
SAME idiom `Player.js`'s own `_tintGear()` already uses to recolour a
cloned weapon (clone each material, set `.color`, never touch the loader's
shared cache — painting the cache would repaint every other node's rock in
the game). `world.markers.rockSpots`/`treeSpots` entries carry it as a
third field: `{ x, z, tint: 0x... }`. A spot with no `tint` renders exactly
as it always has — `lc`'s original pair carries no `tint` field and needed
no code change at all, so there is no regression to it. This is still the
SAME two models and the SAME `ore`/`wood` materials underneath; nothing
about the mechanic changed, only what a node can look like.

### Where, what, and why — one rock and/or tree per region

Every coordinate below was chosen the way `lc`'s original pair was
supposed to be (design/MINING.md's own postscript): by reading that room's
*actual, running* marker/collider list — not just the source — via a
headless dev-harness dump of `world.circleColliders`/`boxColliders`/
`lavaZones`/`waterZones`/`pitZones` after a real room build, THEN checked
against a real Playwright arrival/walk-up screenshot. Each new node is also
`world.reserve()`d in its room builder, before that room's own seeded
`scatter()`/`potSpotsOrFewer()` calls run — `lc`'s original pair predates
that idiom and relied on `lg2`/whichever seed happening not to collide with
it; this rollout does not repeat that, so a node can never end up with a
pot or a scatter rock spawned on top of it after the fact.

| region | room | kind | x, z | tint | why here |
|---|---|---|---|---|---|
| Ember Hollow (v3.175, unchanged) | `lc` | rock + tree | (10,7) / (-9,-6) | none | the original proof-of-concept pair |
| Wild Woods | `t1a` (Thornedge) | tree | (10, -1) | `0x6fae4a` (`WOLF_TINTS.verdant_wolf`) | the room's own open east flank, clear of the thicket at (5,-4), the shrine keep-clear at (0,0) and every scatter/grove collider a real dump confirmed; nearest other collider 2.19u away |
| Frostpeak | `f1` (The Rime Gate) | rock | (1.5, 7) | `0x9be3ff` (`WOLF_TINTS.frost_wolf`) | on the walking spine `mountain()` itself keeps clear of its own rockfall dressing (x -2.5..2.5), between the hound gauntlet and the drift/firs either side; nearest other collider 2.57u away |
| Stormreach | `s1a` (The Landing) | rock | (9, -2) | `0xc9d4ff` (`WOLF_TINTS.storm_wolf`) | sits in the room's own 'gravel' ground patch (SE corner), clear of the gale hound and the rubbleField at (11,-9); nearest other collider 5.02u away |
| Sunken Vale | `d1a` (The Shallows) | tree | (3, 3) | `0x3fb0c4` (`WOLF_TINTS.tide_wolf`) | 9u+ clear of the room's own deep/shallow water zones (x -17..-6.25), the visored wight and the tide slime; nearest other collider 1.97u away |
| Shadow Court | `x1` (The Approach) | rock | (11, -8) | `0xe8e4ff` (`WOLF_TINTS.ghost_wolf`) | broken masonry among the room's own 'rubble' ground patch (SE corner), clear of the shadewalker hound and the watcher's whole gate; nearest other collider 3.37u away |
| The Village | — (skipped) | — | — | — | see below |
| The Den's outer camp | `dr` | rock + tree | (6.5,3) / (6.5,-3) | none | the room whose own greybox label already reads "mine, chop, and rebuild" (`buildDr`'s `finish()`); its open east half, clear of the three restorable buildings' footprints; nearest other collider 3.77u/4.72u away |

**A real visibility bug, caught in independent review after this section was
already reported done**: the first draft picked `dark_wolf` (main
`0x4a3b6b`, this game's own established dark violet — the shadow the region
is steeped in, not the light that frees it) over `ghost_wolf` (Luna's own
pale near-white moonlight, the form the region GRANTS) as the "more
correct" element for the Shadow Court's own shadow theme. It was also
nearly invisible: `x1`'s own ambient lighting is ALREADY a dark violet, so
a dark-violet rock read as barely-distinguishable murk rather than a
resource, in every screenshot taken of it, close up or from a distance —
exactly the failure a human-eye pass exists to catch (CLAUDE.md). Both
`dark_wolf` and `ghost_wolf` map to the SAME `'moon'` element
(`js/player.js`'s `FORM_ELEMENT`), so swapping to `ghost_wolf` costs
nothing thematically and fixes the read completely — a bright, unmistakable
rock in a dark room instead of one more shadow in it.

The Den's own pair carries no tint at all: the Outer Camp is home base, not
one of the seven elemental regions, and nothing in `WOLF_TINTS` names it —
rendering exactly as `lc`'s untinted originals do is the correct "no
element" answer, not an oversight.

**The Village was checked and skipped.** `ysq` (the Village Square) is, by
its own in-source commentary, the single most density-calibrated room in
the game — a real red-lined `verify-density` floor/ceiling on its arrival
frame, fought over explicitly enough to have its own paragraph about why
piling on more of the same asset pack never moves the count. It is also a
paved town square with a single already-placed hero tree
(`world.markers.villageTreeSpot`) rather than open ground with a natural
rock/tree reason to be there — the epilogue's own beat is streets cleared
of a shadow, not a resource to gather. Every other Village room (`yhs`,
`ylw`, the six district streets) is either a through-street with the same
density discipline or a guardian-fight room. Forcing a node into any of
them traded a real risk (tripping a metric this project has already been
burned by once) for a placement with no story reason to exist. Skipped,
not merely deferred.

### `tools/verify-mining.mjs` — proportionate coverage, documented

The original 13 checks (all still passing, unchanged) prove the MECHANIC —
proximity-gated channeling, three hits, payout, lockTime, walk-away
cancel, room-rebuild respawn — end to end on `lc`. That proof does not care
which room it runs in: `ResourceNode.update()` reads `player`/`world`
generically, with no `if (roomId === 'lc')` anywhere. Repeating all 13
checks six more times would re-prove code that cannot vary by room and not
buy any new confidence.

What CAN vary by room is the SEEDING — did the right room end up with the
right marker, with the right tint, sitting somewhere a child can actually
reach and channel. So the new checks are a lighter, seed-and-reach
existence check per new room: jump to the room, confirm `world.nodes`
carries exactly the kind(s) and tint(s) this table promises, then run the
SAME direct-tick pattern as check #3 (own the tool, stand on it, tick
`world.updateNodes()`) for at least one full channel-and-deplete on two of
the six rooms (`f1`'s rock and `d1a`'s tree — one of each kind, one on each
side of the roster) as a spot-check that the generic mechanic really does
fire correctly from a non-`lc` room and a non-default tint. The other four
rooms get the seed/tint/reachability check only — reachability meaning "no
hazard zone contains it and its nearest collider clears by more than a
body-width", the same real dump this session used to place them in the
first place, re-run as an assertion rather than a one-off probe.

## Still to design

- **Visual tool-swap**: dad's own words were "it auto equips" — this ships
  the MECHANICAL half (ownership gates the action) but not yet the visual
  half (seeing the pickaxe/axe actually in Kael's hand while it happens).
  `Player.equipGear()` already rebuilds the hand mesh from
  `state.inventory.equipped.weapon` on demand; a future pass could swap to
  the tool for the channel's duration and restore the real weapon after,
  without touching the player's own saved loadout choice.
- **Feeds the Den rebuild** (`design/DEN-REBUILD.md`): ore and wood are the
  two resources that system's own building costs are written against. The
  rollout above gives the Outer Camp (`dr`) its own rock and tree right in
  the room the resources are spent in, so a child never has to leave the
  camp to gather the first few payments — but with only one node of each
  kind in the whole game per region, a full base-building loop still means
  walking a region's own early room, not standing in one spot. A denser
  per-region seeding (more than one rock/tree in a room, or a second room
  per region) is future work if that walk proves too long in play.
- **Stoneroot Caverns has no node of its own.** Not an oversight: the task
  that shipped this rollout named seven specific stops (the five later
  wolf regions, the Village, and the Den's outer camp) and Stoneroot was
  not one of them. Its own early room (`vh`, the Great Vault hub) is a
  plausible future stop on the same "earth-toned rock" logic Frostpeak and
  Stormreach already got, whenever that region's own turn comes up.
- **A rarer node tier**: dad's own "rare crystal" line is answered here by
  the SAME universal `crystal` material every other system drops, at 15%
  from a rock — a dedicated rare ORE material (distinct from Wolf's
  Crystal) is a plausible future addition if the crafting recipe list ever
  wants an ore-specific "ultimate" ingredient.
