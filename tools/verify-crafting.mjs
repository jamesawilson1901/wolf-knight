// CRAFTING (design/CRAFTING.md §2) — the recipe ladder: tier gating by
// unique-items-crafted count, hidden-recipe visibility, affordability,
// craftItem()'s actual effects (a potion, a timed damage buff, gear
// actually granted), and the gold-chest recipe-scroll discovery roll.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('CRAFTPROBE');

// 1. tier gating and visibility.
const tierCheck = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.state.inventory.crafted = [];
  g.state.inventory.recipesKnown = [];
  const t1 = { healing: c.isRecipeVisible('healing_draught'), might: c.isRecipeVisible('might_draught'),
    shield: c.isRecipeVisible('shield_ultimate'), armour: c.isRecipeVisible('armour_ultimate'),
    hiddenSword: c.isRecipeVisible('sword_ultimate') };
  g.state.inventory.crafted = ['a', 'b']; // 2 unique crafted -> tier 2 opens
  const t2 = { shield: c.isRecipeVisible('shield_ultimate'), armour: c.isRecipeVisible('armour_ultimate') };
  g.state.inventory.crafted = ['a', 'b', 'c', 'd']; // 4 -> tier 3 opens
  const t3 = { armour: c.isRecipeVisible('armour_ultimate') };
  g.state.inventory.recipesKnown = ['sword_ultimate'];
  const hiddenNowVisible = c.isRecipeVisible('sword_ultimate');
  g.state.inventory.crafted = [];
  g.state.inventory.recipesKnown = [];
  return { t1, t2, t3, hiddenNowVisible };
});
check('tier 1 recipes are visible from the start; tier 2/3 and the hidden recipe are not',
  tierCheck.t1.healing && tierCheck.t1.might && !tierCheck.t1.shield && !tierCheck.t1.armour && !tierCheck.t1.hiddenSword,
  tierCheck.t1);
check('crafting 2 unique things opens tier 2 (shield_ultimate), not tier 3 (armour_ultimate)',
  tierCheck.t2.shield && !tierCheck.t2.armour, tierCheck.t2);
check('crafting 4 unique things opens tier 3 (armour_ultimate)', tierCheck.t3.armour, tierCheck.t3);
check('a hidden recipe becomes visible once its id is in recipesKnown (tier still required)',
  tierCheck.hiddenNowVisible, tierCheck);

// 2. affordability gating.
const affordCheck = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.state.inventory.materials = {};
  const noMats = c.canCraft('healing_draught');
  g.state.inventory.materials = { wisp: 2 };
  const withMats = c.canCraft('healing_draught');
  return { noMats, withMats };
});
check('canCraft is false without the materials and true with them',
  !affordCheck.noMats && affordCheck.withMats, affordCheck);

// 3. craftItem() actually pays out: a potion, spends materials, tracks crafted.
const potionCraft = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.state.inventory.materials = { wisp: 2 };
  g.state.potions = 1;
  g.state.inventory.crafted = [];
  const ok = c.craftItem('healing_draught');
  return { ok, potions: g.state.potions, materials: { ...g.state.inventory.materials },
    crafted: [...g.state.inventory.crafted] };
});
check('craftItem(healing_draught) succeeds, adds a potion, spends the wisps, and tracks it as crafted',
  potionCraft.ok && potionCraft.potions === 2 && (potionCraft.materials.wisp || 0) === 0
    && potionCraft.crafted.includes('healing_draught'), potionCraft);

// 4. craftItem() refuses without materials, and never double-spends.
const refuseCraft = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.state.inventory.materials = {};
  return { ok: c.craftItem('healing_draught') };
});
check('craftItem refuses when materials are short', !refuseCraft.ok, refuseCraft);

// 5. the Might Draught is HELD (v3.194 — Dad: "you are able to craft potions
// and stuff but unable to equip and use them"): crafting puts a flask in the
// bag and changes nothing yet; tapping the flask on the HUD drinks it, and
// THAT raises live attack damage.
const mightCraft = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.player._mightT = 0;
  g.state.inventory.draughts = {};
  const before = g.player.attackConfig().dmg;
  g.state.inventory.materials = { shard_fire: 2, wisp: 1 };
  const ok = c.craftItem('might_draught', { player: g.player });
  const held = g.state.inventory.draughts.might || 0;
  const timerAfterCraft = g.player._mightT;
  if (g.player.onPotionsChanged) g.player.onPotionsChanged(g.player.potions);   // HUD repaint
  const slot = document.querySelector('#potions .might-slot');
  const slotShown = !!slot;
  if (slot) slot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const after = g.player.attackConfig().dmg;
  return { ok, held, timerAfterCraft, slotShown, before, after, mightT: g.player._mightT,
    left: g.state.inventory.draughts.might || 0,
    slotGone: !document.querySelector('#potions .might-slot') };
});
check('crafting a Might Draught puts one flask in the bag and does not drink it',
  mightCraft.ok && mightCraft.held === 1 && mightCraft.timerAfterCraft === 0, mightCraft);
check('the flask shows on the HUD beside the potions', mightCraft.slotShown, mightCraft);
check('tapping the flask drinks it: a real timer and higher live attack damage',
  mightCraft.mightT > 0 && mightCraft.after > mightCraft.before, mightCraft);
check('...and the flask is used up, its slot gone', mightCraft.left === 0 && mightCraft.slotGone, mightCraft);

// 5b. a full bag refuses rather than eating the materials for nothing.
const fullBag = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.state.potions = 3;
  g.state.inventory.materials = { wisp: 2 };
  const can = c.canCraft('healing_draught');
  const ok = c.craftItem('healing_draught');
  return { can, ok, wisp: g.state.inventory.materials.wisp || 0, why: c.craftBlockedReason('healing_draught') };
});
check('with three potions already, a Healing Draught cannot be crafted and no wisps are spent',
  !fullBag.can && !fullBag.ok && fullBag.wisp === 2 && fullBag.why === 'Bag full', fullBag);

// 6. a gear recipe actually grants the item (weapon -> gear[], armour -> armours[]).
const gearCraft = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const i = await import('/js/items.js');
  const g = window.__game;
  g.state.inventory.gear = g.state.inventory.gear.filter((x) => x !== 'shield_ultimate');
  g.state.inventory.crafted = ['a', 'b']; // tier 2 open
  g.state.inventory.materials = { shard_earth: 3, shard_storm: 3, crystal: 2, ingot: 2 };
  const ok = c.craftItem('shield_ultimate');
  return { ok, owns: i.ownsGear('shield_ultimate') };
});
check('craftItem(shield_ultimate) actually grants the gear', gearCraft.ok && gearCraft.owns, gearCraft);

const armourCraft = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.state.inventory.armours = g.state.inventory.armours.filter((x) => x !== 'alpha_mantle');
  g.state.inventory.crafted = ['a', 'b', 'c', 'd']; // tier 3 open
  g.state.inventory.materials = { shard_verdant: 2, shard_tide: 2, wisp: 4, crystal: 3, ingot: 2 };
  const ok = c.craftItem('armour_ultimate');
  return { ok, owns: g.state.inventory.armours.includes('alpha_mantle') };
});
check('craftItem(armour_ultimate) adds to inventory.armours (not .gear)',
  armourCraft.ok && armourCraft.owns, armourCraft);

// 7. the hidden recipe cannot be crafted before it is found, even with materials and tier.
const hiddenGate = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.state.inventory.recipesKnown = [];
  g.state.inventory.crafted = ['a', 'b'];
  g.state.inventory.materials = { shard_fire: 3, shard_frost: 3, shard_moon: 3, crystal: 2, ingot: 3 };
  const before = c.canCraft('sword_ultimate');
  c.unlockRecipe('sword_ultimate');
  const after = c.canCraft('sword_ultimate');
  return { before, after };
});
check('sword_ultimate is uncraftable until discovered, then craftable with the same materials/tier',
  !hiddenGate.before && hiddenGate.after, hiddenGate);

// 8. discoverRandomHiddenRecipe() only ever returns a currently-hidden, undiscovered id.
const discover = await wk.page.evaluate(async () => {
  const c = await import('/js/crafting.js');
  const g = window.__game;
  g.state.inventory.recipesKnown = [];
  const found = c.discoverRandomHiddenRecipe();
  const stillHas = (g.state.inventory.recipesKnown || []).includes(found ? found.id : null);
  const second = c.discoverRandomHiddenRecipe(); // only one hidden recipe exists in v1
  return { found, stillHas, second };
});
check('discoverRandomHiddenRecipe finds sword_ultimate (the only hidden recipe) and records it',
  discover.found && discover.found.id === 'sword_ultimate' && discover.stillHas, discover);
check('once every hidden recipe is known, discovery returns null rather than a dupe',
  discover.second === null, discover);

// 9. wired end-to-end: a real Breakable, forced to goldchest + a guaranteed
// roll, actually calls into js/crafting.js and fires the onRecipeFound toast
// hook — not just the standalone crafting.js functions tested above.
const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
await wk.page.evaluate((f) => window.__wkJump('lc', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lc' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const wiredCheck = await wk.page.evaluate(async () => {
  const g = window.__game;
  const w = g.world;
  g.state.inventory.recipesKnown = [];
  const pot = (w.enemies || []).find((e) => e.scenery && e.constructor.name === 'Breakable');
  if (!pot) return { found: false };
  pot.kind = 'goldchest'; // force the gold-chest-only roll path
  let toastMsg = null;
  const { lootEvents } = await import('/js/loot.js');
  const prevHook = lootEvents.onRecipeFound;
  lootEvents.onRecipeFound = (r) => { toastMsg = r; };
  const realRandom = Math.random;
  Math.random = () => 0; // guarantee every roll in takeDamage() succeeds
  pot.takeDamage();
  Math.random = realRandom;
  lootEvents.onRecipeFound = prevHook;
  return { found: true, toastMsg, recipesKnown: [...g.state.inventory.recipesKnown] };
});
check('a real goldchest Breakable break can discover the hidden recipe and fire the toast hook',
  wiredCheck.found && wiredCheck.toastMsg && wiredCheck.toastMsg.id === 'sword_ultimate'
    && wiredCheck.recipesKnown.includes('sword_ultimate'), wiredCheck);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — crafting recipes gate, pay out and discover correctly');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
