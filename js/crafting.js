// CRAFTING (design/CRAFTING.md §2) — Kingdom-Hearts-style: spend materials
// (js/materials.js) to make potions, gear, and — once enough DIFFERENT
// things have been crafted — this game's best-in-class "ultimate" tier of
// sword/shield/armour. A recipe's `tier` gates on a usage-count ladder
// (state.inventory.crafted.length), not a story-state one, per dad's own
// "the more different items crafted unlocks better items to craft"; a
// `hidden` recipe additionally needs its id in state.inventory.recipesKnown
// before it can be crafted at all, found the way a heart piece is — enemy
// drop, pot, crate, chest.
import { state } from './state.js';
import { canAfford, spendMaterials } from './materials.js';
import { addGear } from './items.js';
import { bumpCounter } from './progress.js';

// How many DIFFERENT recipes crafted before each tier unlocks. Tier 1 is
// open from the very first Crafting-tab visit, the same "tier 1 needs no
// story flag" law the shop ladder already follows (js/items.js
// shopTierOpen).
const TIER_AT = [0, 2, 4];

export const RECIPES = {
  healing_draught: {
    name: 'Healing Draught', icon: '🧪', tier: 1,
    cost: { wisp: 2 },
    craft: () => { state.potions = Math.min(3, state.potions + 1); },
    // THE BAG HAS THREE SLOTS. Crafting a fourth used to spend the wisps and
    // hand back nothing (Math.min above) — Dad: "you are able to craft potions
    // but unable to... use them".
    full: () => state.potions >= 3,
    blurb: 'Two wisps, brewed into a potion.',
  },
  might_draught: {
    name: 'Might Draught', icon: '💪', tier: 1,
    cost: { shard_fire: 2, wisp: 1 },
    // HELD, NOT GULPED. It used to be drunk the instant it was crafted —
    // inside the paused menu, nowhere near a fight — so it never existed as
    // a thing you own and choose to use. It goes in the bag now, shows as its
    // own flask beside the potions, and a tap drinks it (js/main.js).
    craft: () => {
      const d = state.inventory.draughts || (state.inventory.draughts = {});
      d.might = Math.min(3, (d.might || 0) + 1);
    },
    full: () => ((state.inventory.draughts || {}).might || 0) >= 3,
    blurb: 'Keep it for a big fight — tap the flask and hits hit harder for a while.',
  },
  shield_ultimate: {
    name: "Alpha's Aegis", icon: '🛡️', tier: 2,
    // `ingot` (design/DEN-REBUILD.md's Forge payout) added here and to the
    // other two ultimates below — the one gap both design docs flagged: the
    // Forge could be built and could pay out, but nothing ever spent what it
    // made. Forged steel belongs in the game's best-in-class GEAR
    // specifically (not the potions above, which are brewed, not forged),
    // so all three ultimate recipes take a share rather than inventing a
    // fourth "ingot-only" item that would duplicate what these already are.
    cost: { shard_earth: 3, shard_storm: 3, crystal: 2, ingot: 2 },
    gear: 'shield_ultimate', kind: 'shield',
    blurb: 'The pack stands behind it.',
  },
  // THE ONE HIDDEN RECIPE (v1) — never visible until its scroll is found
  // (js/loot.js's gold-chest roll, discoverRandomHiddenRecipe below). The
  // game's single best weapon is the thing a child stumbles into owning,
  // not the thing the tab always showed them.
  sword_ultimate: {
    name: 'Wolf Fang', icon: '🗡️', tier: 2, hidden: true,
    cost: { shard_fire: 3, shard_frost: 3, shard_moon: 3, crystal: 2, ingot: 3 },
    gear: 'sword_ultimate', kind: 'weapon',
    blurb: 'Every element the pack ever carried, in one blade.',
  },
  armour_ultimate: {
    name: "Alpha's Mantle", icon: '🐺', tier: 3,
    cost: { shard_verdant: 2, shard_tide: 2, wisp: 4, crystal: 3, ingot: 2 },
    gear: 'alpha_mantle', kind: 'armour',
    blurb: 'Worn by the wolf who came home.',
  },
};

export function tierUnlocked(tier) {
  const count = (state.inventory.crafted || []).length;
  return count >= (TIER_AT[tier - 1] ?? 0);
}

// A recipe is VISIBLE (shows on the crafting tab at all, even greyed out
// for cost) once its tier is open and — if hidden — its id has been found.
export function isRecipeVisible(id) {
  const r = RECIPES[id];
  if (!r) return false;
  if (r.hidden && !(state.inventory.recipesKnown || []).includes(id)) return false;
  return tierUnlocked(r.tier);
}

export function canCraft(id) {
  const r = RECIPES[id];
  if (!r || !isRecipeVisible(id)) return false;
  if (r.full && r.full()) return false;          // never spend for nothing
  if (r.gear && ownsCrafted(r)) return false;    // one of each forged piece
  return canAfford(r.cost);
}

// Why a visible recipe cannot be made right now, in words the tab can show.
export function craftBlockedReason(id) {
  const r = RECIPES[id];
  if (!r || !isRecipeVisible(id)) return null;
  if (r.full && r.full()) return 'Bag full';
  if (r.gear && ownsCrafted(r)) return 'You have it';
  if (!canAfford(r.cost)) return null;           // the cost chips already say so
  return null;
}

function ownsCrafted(r) {
  if (r.kind === 'armour') return (state.inventory.armours || []).includes(r.gear);
  return (state.inventory.gear || []).includes(r.gear);
}

// `ctx` is passed through to a `craft()` recipe unchanged (e.g. `{player}`
// for Might Draught, which needs a live Player instance to buff).
export function craftItem(id, ctx) {
  const r = RECIPES[id];
  if (!canCraft(id)) return false;
  if (!spendMaterials(r.cost)) return false;
  if (r.gear) {
    if (r.kind === 'armour') {
      if (!state.inventory.armours.includes(r.gear)) state.inventory.armours.push(r.gear);
    } else {
      addGear(r.gear);
    }
  } else if (r.craft) {
    r.craft(ctx);
  }
  if (!state.inventory.crafted.includes(id)) state.inventory.crafted.push(id);
  bumpCounter('itemsCrafted');
  return true;
}

export function unlockRecipe(id) {
  if (!RECIPES[id]) return;
  if (!state.inventory.recipesKnown.includes(id)) state.inventory.recipesKnown.push(id);
}

// Called from a rare drop roll (js/loot.js gold chests): finds a recipe the
// child has not yet discovered and unlocks it. Returns {id, name} for a
// toast, or null once every hidden recipe is already known.
export function discoverRandomHiddenRecipe() {
  const known = state.inventory.recipesKnown || [];
  const candidates = Object.keys(RECIPES).filter((id) => RECIPES[id].hidden && !known.includes(id));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  unlockRecipe(pick);
  return { id: pick, name: RECIPES[pick].name };
}
