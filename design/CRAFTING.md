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

## §3 — the Crafting tab and its tutorial (v3.173, SHIPPED)

Per dad's own words ("through the backpack button and then a crafting
tab"), Crafting lives INSIDE the Armoury (`#inv-menu`) rather than as a new
top-level panel — the one design-doc recommendation this section reversed
once the literal ask was re-read. A small tab strip (`js/menus.js`,
`.arm-tabs`) sits above the existing rack column: **Gear** (unchanged) and
**Craft** (new). Switching tabs swaps only the right-hand rack list; the
turning knight and his three worn slots on the left are never rebuilt.

`_paintCraftTab()` reuses the Armoury's own `.rack-row`/`.rack-art`/
`.rack-body` chrome — a recipe IS an item on a shelf, just paid for in
materials instead of coins. Each visible recipe shows its cost as
`icon count/needed` chips (red when short), a `Craft` button (visually and
functionally disabled when unaffordable, per `canCraft()`), and its blurb.
A tier-locked or undiscovered-hidden recipe renders exactly like an
unearned sticker: greyed (`.rack-row.locked`, `filter: grayscale(1)`),
named `???`, no button at all — the sticker book's own idiom, reused rather
than invented. Tapping Craft calls `craftItem(id, {player})`, persists, and
repaints just the recipe list.

**The tutorial is one line**: `craft_intro` (`js/narration.js`), fired via
`Menus`'s new `narration` reference the first time the Craft tab is ever
opened (`Narration.say()`'s own once-per-save guard — no new flag needed).
The rest of the teaching is wordless: the `???` rows themselves already say
"there is more here" without a sentence, the same demo-then-discover shape
`design/DEN-MINIGAMES.md`'s no-reading-required rule asks for everywhere
else in this game. No blocking full-screen walkthrough, no second system —
the smallest thing that actually teaches it.

Verified: `tools/verify-craftui.mjs` (new) — the Armoury opens on Gear by
default, a Craft tab exists and switching to it swaps only the rack column
(knight/slots survive untouched), tier-1 recipes are unlocked with a real
Craft button while tier-2+/hidden recipes read as locked `???` rows, tapping
Craft without materials refuses silently, tapping it WITH materials pays out
through the real DOM (not just the underlying functions — `verify-crafting
.mjs` already owns those in isolation), the tutorial line fires exactly once
on first open, and switching back to Gear restores the original view.
`verify-armoury.mjs` (phone-width fit, the live knight preview) still
passes unmodified.

---

**The crafting system (§0-§3) is complete** as of v3.173: enemies farmable
everywhere regardless of a region's heal, nine materials with real drop
tables, five recipes on a usage-count tier ladder with one hidden recipe
found in the world, and a Crafting tab in the backpack with its own
one-line tutorial. Next in dad's own ordering: the FX pass (Kenney
Particle Pack), then mining & woodcutting (`design/DEN-REBUILD.md`'s own
resource system depends on this), then the Den rebuild, then the
dragon-egg side quest.

## §4 — closing the ingot gap (v3.178, SHIPPED)

The Den Rebuild (`design/DEN-REBUILD.md`, v3.176) gave the Forge a real
payout — `ingot`, a new `js/materials.js` id — but no recipe ever spent it:
a produced-and-wasted resource, flagged as an explicit loose end in that
doc's own "still to design" section. Closed by adding `ingot` as an
ADDITIONAL cost line to all three existing ultimate recipes
(`shield_ultimate: +2`, `sword_ultimate: +3`, `armour_ultimate: +2`) rather
than inventing a fourth "ingot-only" item — forged steel belongs with this
game's best-in-class forged GEAR specifically (not the two potions above,
which are brewed, not forged), and the three ultimates were already the
natural home for it. `tools/verify-crafting.mjs`'s existing gear-craft
checks were updated to grant `ingot` alongside their other materials;
`verify-gear.mjs`'s balance/obtainability checks (unaffected — they don't
read recipe costs) and the full `--quick` gate stayed green throughout.
