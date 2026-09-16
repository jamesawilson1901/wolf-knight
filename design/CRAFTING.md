# Crafting

Dad's ask (verbatim, 2026-09-16): "I want there to be a crafting system in
place. Similar to kingdom hearts where certain enemies have a certain drop
rate of items. I want there to be various things you can craft from potions
for health and stat boosts, to shields, armour, swords and ultimate versions
of them. Pots and crates should have their own drop rates too. This will
mean removing the regeneration of the levels once complete as we need the
enemies to still be present. Crafting should be able to be done at any time
through the backpack button and then a crafting tab. There needs to be a
tutorial for the crafting system. The crafting "table" tab should show what
crafting is available like Kingdom hearts. The more different items crafted
unlocks better items to craft. Hide "recipes" for special and unique craft
items in random places, enemy drop, pot, crate, chest etc."

Queued behind the rest of design/WIDER-WORLD.md (now complete — all seven
region dungeons ship as of v3.169) and ahead of the FX pack and the
mining/woodcutting system, per dad's own ordering.

## §0 — enemies survive the heal (v3.170, SHIPPED)

The one piece of this that could not wait for the rest: a crafting economy
that farms enemy drops needs enemies to keep existing, and until v3.170 they
did not — `design/WIDER-WORLD.md`'s own "Terranigma moment" (dad, earlier:
"animals replace enemies harmlessly grazing") took every regular enemy out
of a region the instant its guardian fell, forever, region-wide.

Asked directly which of three shapes this should take (keep the heal and add
a dedicated farming pocket / drop the heal entirely / keep the heal cosmetic
only and decouple enemy spawning from it), dad chose the third: **the heal
stays exactly as visible as it always was — ground, light, lava, wind,
blooms, water, NPCs, music — but it no longer removes anything that fights.**
Enemies spawn the same way in every room whether that room's region has
healed or not, from the start of the game, not just after its own boss.

This is a **narrower** amendment than it first reads: the only thing removed
is the grazing-pack SUBSTITUTION (`js/enemies.js`'s old `grazing`/
`takeEnemySpots()` gate, which harvested every enemy-spawn marker in a healed
room before any spawn block could read it, then handed the harvested spots
to `graze()` to fill with harmless wandering wolves). Every other consumer of
`isHealed()`/`growthStage()` in `js/restoration.js` — ground-patch
substitution, wind calming, hearth lighting, the live in-room heal moment —
reads unmodified. The pup pen's own herd (`design/WIDER-WORLD.md` §1.4 stage
2) shares the same `graze()`/`updateHerd()` machinery for an unrelated
feature (six rescued pups wandering the Den) and is untouched.

Shipped: `js/enemies.js` (`spawnEnemies()`'s `grazing` gate and
`takeEnemySpots()` deleted outright, not disabled — dead code, not kept for
later), `tools/verify-healing.mjs` (§3 now asserts the SAME enemy count
before/after a region heals rather than an empty room with a grazing pack;
the old §7, which existed only to test the grazing pack's harmlessness, is
gone rather than adapted, since there is no pack left for it to test).

## §1 — materials & drop tables (v3.171, SHIPPED)

Nine materials, `js/materials.js` — deliberately reusing the game's own
seven-element vocabulary (an enemy's `weakness`) rather than inventing a
parallel taxonomy, since a fire-weak enemy already reads as "the fire one":

| id | name | source |
|---|---|---|
| `shard_fire`/`shard_earth`/`shard_verdant`/`shard_frost`/`shard_storm`/`shard_tide`/`shard_moon` | Ember/Stone/Thorn/Rime/Storm/Tide/Moon Shard | any enemy with that weakness |
| `wisp` | Shadow Wisp | any enemy with no weakness; every breakable |
| `crystal` | Wolf's Crystal | rare — elites/guardians, gold chests |

**Enemy kills** (`js/enemies.js` `Enemy.die()`, `dropMaterial()`): its own
weakness's shard at `dropChance` (the SAME frequency already tuned for the
ember heal — an independent roll, so a kill can pay in both, one, or
neither), plus elites/guardians (`dropChance >= 1`) get a further 15% shot
at a Crystal. **Breakables** (`js/loot.js` `Breakable`, new `materialChance`
field alongside the existing `potionChance`): a Wisp at 15% ordinary / 50%
chest / 80% gold chest, and a gold chest further rolls 35% for a Crystal.
Both are drops ON TOP of the existing shard/potion/ember rolls, never a
replacement or a shared roll — `design/GAME-CONTRACT.md`'s ~120-160
shards/region number is untouched, and the amendment there says so.

The pickup itself (`spawnMaterialDrop`, `js/materials.js`) reuses the ember
heal's own floating-gem-that-fizzles-after-12s shape (now generalized in
`js/enemies.js`'s `updateDrops` via a `kind` field) rather than a second
visual language — collecting one credits `state.inventory.materials` instead
of hearts. Kept in `js/materials.js` rather than `js/enemies.js` or
`js/loot.js` specifically so both of those (which already import from each
other) can drop a material without a third import cycle.

`state.inventory.materials` (`{id: count}`) and `state.inventory.crafted`
(ids of every unique thing ever crafted, for §1's own unlock ladder) are new,
additive-forever fields — `js/save.js` backfills both on load exactly the
way `treasures`/`armours` were backfilled when THEY arrived, so a save from
before this system existed still loads. `canAfford(cost)`/`spendMaterials(
cost)` (`js/materials.js`) are the recipe-affordability primitives the next
section's `craft()` will call.

Verified: `tools/verify-materials.mjs` (new) — the right shard drops for a
kill's own weakness, a breakable's Wisp roll, walking onto a drop credits the
right bucket, `canAfford`/`spendMaterials` round-trip a cost correctly, and
materials/crafted survive a real save→load cycle.

## §2 — recipes, tiers, hidden recipes (v3.172, SHIPPED)

Five recipes, `js/crafting.js`, `RECIPES`:

| id | tier | cost | pays out |
|---|---|---|---|
| `healing_draught` | 1 | 2 wisp | +1 potion (capped 3, same as buying one) |
| `might_draught` | 1 | 2 shard_fire + 1 wisp | 45s, ×1.5 melee damage (`player.drinkMight()`) |
| `shield_ultimate` | 2 | 3 shard_earth + 3 shard_storm + 2 crystal | "Alpha's Aegis" (`js/items.js`) |
| `sword_ultimate` | 2, **hidden** | 3 shard_fire + 3 shard_frost + 3 shard_moon + 2 crystal | "Wolf Fang" |
| `armour_ultimate` | 3 | 2 shard_verdant + 2 shard_tide + 4 wisp + 3 crystal | "Alpha's Mantle" |

**Tiers** (`tierUnlocked()`) gate on `state.inventory.crafted.length` — a
usage-count ladder, not a story-state one, exactly as asked ("the more
different items crafted unlocks better items to craft"): tier 1 open from
the start, tier 2 at 2 unique things ever crafted, tier 3 at 4. This is the
SAME shape as the shop's own tier ladder (`items.js` `shopTierOpen`) with a
crafted-count gate instead of a `WS.get(region,'restored')` one.

**The hidden recipe** (`sword_ultimate`) is invisible — `isRecipeVisible()`
returns false — until its id is in `state.inventory.recipesKnown`, gained
ONLY from a gold chest's own rare roll (`js/loot.js` `Breakable.takeDamage()`,
20% on top of the existing crystal roll) via `discoverRandomHiddenRecipe()`,
which finds any still-undiscovered hidden recipe at random (returns `null`
once none remain) and fires a toast (`lootEvents.onRecipeFound`, wired in
`js/main.js`) — "found the same way a heart piece or a keepsake is."

**A crafted "ultimate"** is the same "one file, many tints" trick every
other reskin in this game already uses — `sword_ultimate`/`shield_ultimate`
retint an existing model near-black; `alpha_mantle` (armour) retints the
knight's own plate — no new geometry, and none are ever sold or found in a
chest, only made (`tools/verify-gear.mjs` amended to know crafting is now a
FOURTH acquisition path, reading `js/crafting.js`'s own `RECIPES` rather
than a hand-kept exemption list, the same "can't rot" reasoning that suite
already applies to reading level files out of `sw.js`'s precache list).
Each ultimate sits at or just past the game's own existing power ceiling
per slot WITHOUT breaking an existing balance rule — `alpha_mantle` first
shipped at soak 2.0/weight −0.02 and `verify-gear.mjs` correctly caught
both "a hit must always cost something" (soak ≤ 1.5, a real, pre-existing
rule) and "the heaviest soak also costs speed" (moon's own named exception
aside); it now ties Moonplate's soak ceiling and pays for it in weight
instead, which is the actual trade a top-tier suit should offer.

`Might Draught`'s buff (`player._mightT`, `attackConfig()`, `js/player.js`)
is a flat, timed multiplier independent of the Surge/perks, the smallest
possible addition — no new buff-stacking system, no UI countdown (mirrors
the garden bed's own "no numbers, just an effect" idiom).

Verified: `tools/verify-crafting.mjs` (new) — tier visibility at each
threshold, affordability gating, `craftItem()`'s real effects (a potion
appears, materials are actually spent, a timed buff really raises live
attack damage, gear lands in the RIGHT bucket — `.gear` for weapons/shields,
`.armours` for armour, never confused), the hidden recipe staying uncraftable
until discovered, `discoverRandomHiddenRecipe()` never handing out a
duplicate, and a real `Breakable` forced to `goldchest` actually reaching
into `js/crafting.js` and firing the toast hook end-to-end (not just the
standalone functions in isolation). `tools/verify-gear.mjs`,
`tools/verify-materials.mjs` and `tools/verify-armoury.mjs` all still pass.

## §3 — still to design

Nothing below this line is built yet. Loose notes only, so a session
picking this up does not start from nothing:

- **UI**: `js/menus.js`'s Armoury (`#inv-menu`) is the backpack; there is no
  tab strip inside any panel today, each "screen" (Armoury/shop/map/sticker
  book) is its own top-level DOM panel toggled by `Menus._open()`'s
  allowlist. A new `craft-menu` panel is the path of least resistance,
  wired the same way, rather than retrofitting tabs into the Armoury. The
  sticker book's `???`-for-undiscovered treatment (`js/menus.js`) is the
  right idiom for a locked/hidden recipe card. `itemThumb()`/`meshThumb()`
  (`js/equipscene.js`) render real item art for any def already, including
  code-built ones (the potion) — a recipe card showing ingredients and
  result needs no new art pipeline.
- **Tutorial**: this game's hard rule is no reading required
  (`design/DEN-MINIGAMES.md`). Precedent is two idioms, likely combined: a
  single blocking, once-per-save `Narration.say(...)` line (voiced +
  captioned, the way `first_enemy`/`boss_swipe_tell` teach a new verb) paired
  with a wordless in-UI demonstration on first open (the minigame harness's
  demo-then-mash pattern), not a text walkthrough.
