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

## §1 — still to design

Nothing below this line is built yet. Loose notes only, so a session picking
this up does not start from nothing:

- **Materials**: no "resource"/"material" item type exists anywhere in the
  game yet (`js/items.js` only has weapon/shield/armour; `state.js`'s
  `inventory` has `gear`/`armours`/`treasures`, nothing material-shaped).
  Needs a new typed drop, a new `state.inventory.materials` (or similar)
  bucket, and — since saves are additive-forever — a schema that never has
  to remove a field later.
- **Drop tables**: today's enemy drops are untyped (an ember heal pickup,
  rarely a whole weapon) and pot/crate/chest drops are shards + an
  occasional potion (`js/loot.js`'s `potionChance` per breakable kind). A
  materials drop needs its own rate per enemy family/tier and per
  breakable kind, additively — it should not just replace what drops today.
- **GAME-CONTRACT.md's shard economy** (`~120-160 shards per region`) is a
  binding number this session's own CLAUDE.md treats as load-bearing;
  a second drop competing for the same kill/breakable rolls needs a written
  amendment stating the new expected materials yield and how it composes
  with that number, the same way "a branch ends in a reward, not a duel"
  got one before MINI_ROSTER shipped.
- **Recipes & tiers**: potions (health/stat boosts), shields, armour,
  swords, and an "ultimate" tier of each. `js/items.js`'s existing
  "one file, many tints" idiom is the natural way to make an ultimate a real
  reskin rather than a new asset (CLAUDE.md's no-code-built-creatures rule
  has a gear equivalent: dress what already shipped).
- **Progressive unlock**: "the more different items crafted unlocks better
  items to craft" wants a usage-count gate, not a story-state gate — most
  likely a new counter in `state.counters` (`js/progress.js`'s existing
  free-form tally, already the sticker book's own mechanism) rather than
  reusing the region-`WS.set(...,'restored')` gate every other unlock in
  this game uses.
- **Hidden recipes**: found the same way a heart piece or a keepsake is —
  enemy drop, pot, crate, chest — per dad's own list.
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
