// THE FORGE (v3.200, design/DEN-REBUILD.md "The Forge"). Dad asked for a real
// reason to build and craft; this is the one a child feels in their hand.
// Once the Outer Camp's Forge is restored, walking up to it opens the Forge
// tab, and the sword (or shield, or armour) you already carry can be taken up
// three steps — each one SEEN on the thing itself:
//
//   ★      it glows in its own colour, and hits a little harder;
//   ★★     sparks come off it as you walk;
//   ★★★    every swing leaves a trail of light.
//
// The stats live in js/items.js forgedDef() so every reader sees them; this
// file is only the price list and the act of forging.
import { state } from './state.js';
import { elementColor } from './juice.js';
import { canAfford, spendMaterials } from './materials.js';
import { bumpCounter } from './progress.js';
import { isRestored } from './denRebuild.js';
import { WEAPONS, SHIELDS, ARMOURS, FORGE_MAX, forgeLevel } from './items.js';

// What each step costs: ingots from the Forge itself, ore, and — for the last
// two — crystals, the rare thing the broken bridges' chests hold.
export const FORGE_STEPS = [
  { ingot: 2, ore: 3 },
  { ingot: 3, ore: 3, crystal: 1 },
  { ingot: 4, crystal: 2 },
];

export const forgeOpen = () => isRestored('forge');

export function forgeCost(id) {
  const L = forgeLevel(id);
  return L >= FORGE_MAX ? null : FORGE_STEPS[L];
}

export function canForge(id) {
  const c = forgeCost(id);
  return forgeOpen() && !!c && canAfford(c);
}

// Takes one piece up a step. Returns the new level, or 0 if it could not.
export function forgeUp(id) {
  if (!(WEAPONS[id] || SHIELDS[id] || ARMOURS[id])) return 0;
  if (!canForge(id)) return 0;
  if (!spendMaterials(forgeCost(id))) return 0;
  const u = state.inventory.upgrades || (state.inventory.upgrades = {});
  u[id] = (u[id] || 0) + 1;
  bumpCounter('upgrades');
  return u[id];
}

// The colour a forged piece glows in: its own element's, else the gold every
// "special" thing in this game already wears.
// (the table itself lives in js/juice.js, shared with the weakness flare)
export function forgeGlow(def) {
  return elementColor(def && def.element, 0xffd76a);
}

export function stars(L) {
  return '★'.repeat(L) + '☆'.repeat(Math.max(0, FORGE_MAX - L));
}
