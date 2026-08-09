// Gear registry: weapons and shields Kael can own, buy, and equip. Each
// weapon changes the sword FEEL (damage / swing speed / reach), not just a
// number; shields trade blunt strength against parry window. Models are the
// real KayKit props, swapped onto the knight's handslot bones.

import { state } from './state.js';

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

// ---------------------------------------------------------------------------
// THE SHOP LADDER — Maren's cart is restocked by the WORLD getting better.
//
// GAME-CONTRACT's region shipping checklist asks every region for a "shop
// tier", and the progression targets name the rungs (~60/90/150/250/400).
// Until now the shelf was flat: every weapon in the game was on it the first
// time a child walked up to the cart, so a lucky pot-smashing run in Ember
// Hollow could buy the Boulder Hammer before the first boss. The ladder
// existed only in the doc.
//
// A rung opens when the region that pays for it is FREE — not when the purse
// is fat. Each rung names the flag that region's boss sets, and the place a
// child would recognise, so the locked crate can say what it is waiting for
// without spoiling what is inside.
//
// Counted from the FRONT and stopping at the first unfreed region, exactly
// like `WS.stage()`: a tier means "everything up to here is done".
export const SHOP_TIERS = [
  { tier: 1, flag: null,             place: null },
  { tier: 2, flag: 'wardenDefeated', place: 'the Stoneroot Caverns' },
  { tier: 3, flag: 'sylvaDefeated',  place: 'the Wild Woods' },
  { tier: 4, flag: 'borealDefeated', place: 'Frostpeak' },
];

// Shop stock (the Den). Potions and gear; sold-out gear vanishes. Potions
// carry no tier — they are the one thing always on the shelf.
export const SHOP_STOCK = [
  { kind: 'potion', name: 'Healing Potion', icon: '🧪', price: 15, blurb: '+3 hearts. Cherry flavor.' },
  { kind: 'shield', id: 'shield_a', price: 70, tier: 1 },
  { kind: 'weapon', id: 'dagger_a', price: 80, tier: 1 },
  { kind: 'weapon', id: 'sword_b', price: 90, tier: 1 },
  { kind: 'weapon', id: 'spear_a', price: 120, tier: 2 },
  { kind: 'shield', id: 'shield_c', price: 180, tier: 2 },
  { kind: 'weapon', id: 'sword_d', price: 200, tier: 3 },
  { kind: 'weapon', id: 'hammer_a', price: 300, tier: 4 },
];

// How many rungs are open. Reads the same boss flags the map screen and the
// fast-travel list already read, so nothing new has to be saved — the
// additive-forever law holds for free.
export function shopTier() {
  let n = 0;
  for (const t of SHOP_TIERS) {
    if (t.flag && !state.flags[t.flag]) break;
    n = t.tier;
  }
  return n;
}

// The next rung, or null once the shelf is full. This is what the locked
// crate on the shelf promises.
export function nextShopTier() {
  const open = shopTier();
  return SHOP_TIERS.find((t) => t.tier > open) || null;
}

// What a child actually sees on the shelf today.
export function shopStock() {
  const open = shopTier();
  return SHOP_STOCK.filter((s) => s.kind === 'potion' || s.tier <= open);
}
