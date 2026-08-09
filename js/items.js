// Gear registry: weapons and shields Kael can own, buy, and equip. Each
// weapon changes the sword FEEL (damage / swing speed / reach), not just a
// number; shields trade blunt strength against parry window. Models are the
// real KayKit props, swapped onto the knight's handslot bones.

import { state } from './state.js';
import { CONFIG } from './config.js';
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
// `tier` is Maren's stock LADDER, not a power rating: which rung of
// CONFIG.SHOP.TIERS a line arrives on. Tier 1 is on the shelf from the first
// visit; every later rung waits for a region to be healed, so the shop is a
// place that changes rather than a fixed catalogue a child reads once and
// stops looking at. A line with no `tier` is treated as tier 1 — an addition
// that forgets the field lands in the opening stock rather than vanishing.
export const SHOP_STOCK = [
  { kind: 'potion', name: 'Healing Potion', icon: '🧪', price: 15, tier: 1, blurb: '+3 hearts. Cherry flavor.' },
  { kind: 'shield', id: 'shield_a', price: 70, tier: 1 },
  { kind: 'weapon', id: 'dagger_a', price: 80, tier: 1 },
  { kind: 'weapon', id: 'sword_b', price: 90, tier: 2 },
  { kind: 'weapon', id: 'spear_a', price: 120, tier: 2 },
  { kind: 'shield', id: 'shield_c', price: 180, tier: 3 },
  { kind: 'weapon', id: 'sword_d', price: 200, tier: 3 },
  { kind: 'weapon', id: 'hammer_a', price: 300, tier: 4 },
];

// Has this rung of the ladder arrived? Tier 1 (and anything with no `after`)
// is always in. Unknown tiers stay OUT rather than defaulting open: a typo
// should hide one card, not hand a five-year-old the Boulder Hammer.
export function shopTierOpen(tier) {
  const t = CONFIG.SHOP.TIERS.find((x) => x.tier === (tier || 1));
  if (!t) return false;
  return !t.after || WS.get(t.after, 'restored');
}

// What Maren has on the shelf right now.
export function shopStock() {
  return SHOP_STOCK.filter((s) => shopTierOpen(s.tier));
}

// The next rung that has NOT arrived, so the shop can promise it. Returns null
// once the ladder is complete — a finished shop says nothing rather than
// showing an empty promise.
export function nextShopTier() {
  return CONFIG.SHOP.TIERS.find((t) => !shopTierOpen(t.tier)) || null;
}
