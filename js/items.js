// Gear registry: weapons and shields Kael can own, buy, and equip. Each
// weapon changes the sword FEEL (damage / swing speed / reach), not just a
// number; shields trade blunt strength against parry window. Models are the
// real KayKit props, swapped onto the knight's handslot bones.

import { state } from './state.js';
import { WS } from './worldstate.js';

// STYLE fields (standing rule — weapons differ in HOW they swing, not just
// numbers): `arc` = swing half-angle in degrees (default ±70), `stun` =
// seconds of daze on hit, `element` = the strike's element (default steel —
// elemental blades let the KNIGHT hit weaknesses: the Ember Blade burns,
// the Moon Sword carries Luna's light).
export const WEAPONS = {
  sword_knight: {
    name: 'Knight Sword', icon: '🗡️', file: './assets/chars/sword_1handed.gltf',
    dmg: 1, lock: 0.55, range: 2.0, price: 0,
    blurb: 'Trusty and true.',
  },
  dagger_a: {
    name: 'Swift Fang', icon: '🔪', file: './assets/gear/dagger_A.gltf',
    dmg: 0.75, lock: 0.34, range: 1.7, price: 80,
    blurb: 'Small but SO fast.',
  },
  sword_b: {
    name: 'Ember Blade', icon: '⚔️', file: './assets/gear/sword_B.gltf',
    dmg: 1.5, lock: 0.55, range: 2.0, price: 90, element: 'fire',
    blurb: 'Forged in the Hollow — it BURNS.',
  },
  spear_a: {
    name: 'Long Spear', icon: '🥢', file: './assets/gear/spear_A.gltf',
    dmg: 1, lock: 0.6, range: 2.7, price: 120, arc: 36,
    blurb: 'Poke from FAR away. Aim true!',
  },
  sword_d: {
    name: 'Moon Sword', icon: '🌙', file: './assets/gear/sword_D.gltf',
    dmg: 2, lock: 0.55, range: 2.1, price: 200, element: 'moon',
    blurb: "Luna's favorite — shadows fear it.",
  },
  hammer_a: {
    name: 'Boulder Hammer', icon: '🔨', file: './assets/gear/hammer_A.gltf',
    dmg: 3, lock: 0.85, range: 1.9, price: 300, arc: 82, stun: 0.6,
    blurb: 'Slow… but WHAM. Leaves them dizzy!',
  },
};

export const SHIELDS = {
  shield_badge: {
    name: 'Badge Shield', icon: '🛡️', file: './assets/chars/shield_badge.gltf',
    blunt: 0.5, parryBonus: 0, price: 0,
    blurb: 'A knight’s first friend.',
  },
  shield_a: {
    name: 'Round Guard', icon: '🟠', file: './assets/gear/shield_A.gltf',
    blunt: 0.5, parryBonus: 0.12, price: 70,
    blurb: 'Easier perfect blocks!',
  },
  shield_c: {
    name: 'Tower Shield', icon: '🔷', file: './assets/gear/shield_C.gltf',
    blunt: 0.25, parryBonus: 0, price: 180,
    blurb: 'Blocks almost everything.',
  },
};

export function weaponDef() {
  return WEAPONS[state.inventory.equipped.weapon] || WEAPONS.sword_knight;
}

export function shieldDef() {
  return SHIELDS[state.inventory.equipped.shield] || SHIELDS.shield_badge;
}

export function ownsGear(id) {
  return state.inventory.gear.includes(id);
}

export function addGear(id) {
  if (!ownsGear(id)) state.inventory.gear.push(id);
}

// Shop stock (the Den). Potions and gear; sold-out gear vanishes.
//
// MAREN'S CART GROWS WITH THE WORLD (v3.35.0). Every row used to be on the
// cart from the first minute, so a child with 15 shards read eight cards, five
// of which were a region or two of saving away, with nothing to say the cart
// would ever change. `tier` is WHEN a row goes on sale; no price moved.
//
// The split follows GAME-CONTRACT's ladder ("shop ladder per region tier
// ≈ 60/90/150/250/400", "a kid who explores buys one big thing per region"):
// tier 1 tops out at 90, which is what Ember Hollow's ~120-160 shards can
// reach, and tier 2 opens at 120 for a child who has Stoneroot's income behind
// them.
export const SHOP_STOCK = [
  { kind: 'potion', name: 'Healing Potion', icon: '🧪', price: 15, blurb: '+3 hearts. Cherry flavor.', tier: 1 },
  { kind: 'weapon', id: 'dagger_a', price: 80, tier: 1 },
  { kind: 'weapon', id: 'sword_b', price: 90, tier: 1 },
  { kind: 'shield', id: 'shield_a', price: 70, tier: 1 },
  { kind: 'weapon', id: 'spear_a', price: 120, tier: 2 },
  { kind: 'shield', id: 'shield_c', price: 180, tier: 2 },
  { kind: 'weapon', id: 'sword_d', price: 200, tier: 2 },
  { kind: 'weapon', id: 'hammer_a', price: 300, tier: 2 },
];

// A tier is a promise, so it says what pays it. The note is written for a child
// who cannot yet read prices: not "tier 2 locked" but "she'll bring more, and
// here is what brings her". Tier 1 has no note because nothing is held back.
//
// The unlock reads WorldState, which js/save.js already round-trips, so this
// adds no field to the save file and an old profile that has beaten Stoneroot
// walks up to a full cart.
export const SHOP_TIERS = [
  { tier: 1, unlocked: () => true, note: null },
  {
    tier: 2,
    unlocked: () => WS.get('stone', 'restored'),
    note: 'Maren’s cart is only half unpacked. Free Stoneroot and she’ll bring the rest.',
  },
];

function tierDef(n) {
  return SHOP_TIERS.find((t) => t.tier === n) || SHOP_TIERS[0];
}

// What is on the cart today.
export function stockForSale() {
  return SHOP_STOCK.filter((s) => tierDef(s.tier || 1).unlocked());
}

// The line under the grid, or null when the cart is everything it will ever be.
// The FIRST locked tier: a child is told about the next step, never a ladder.
export function lockedTierNote() {
  const locked = SHOP_TIERS.find((t) => !t.unlocked() && SHOP_STOCK.some((s) => (s.tier || 1) === t.tier));
  return locked ? locked.note : null;
}
