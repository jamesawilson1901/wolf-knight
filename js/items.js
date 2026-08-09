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

// MAREN'S SHELF GROWS (GAME-CONTRACT: "shop ladder per region tier
// ~60/90/150/250/400 — a kid who explores buys one big thing per region", and
// the region shipping checklist ships a shop tier per region). Every rung used
// to be on the shelf the first time a child walked into the Den, so the ladder
// existed only in the prices: a five-year-old with 300 shards could skip
// straight to the hammer, and a five-year-old with 40 saw seven things they
// could not have and no reason why.
//
// `after` names the WorldState region flag that opens a rung — the same
// 'restored' flag the villagers, the minigames and the healed dressing already
// read, so the shop grows on exactly the beat everything else in the Den does.
// No `after` means it is on the shelf from the first visit.
//
// The rung a region opens is the one its own shards can nearly buy, and where
// possible it is also the one its fiction earns: the Ember Blade is forged in
// the Hollow (and fire is what the BONE of Stoneroot fears next), the Tower
// Shield is the Bone Warden's own answer, and the Long Spear reaches past the
// caverns' spike gauntlets. The two dearest sit at the top of the ladder by
// price, which is what the contract binds.
export const SHOP_TIERS = {
  ember: 'Ember Hollow',
  stone: 'Stoneroot Caverns',
  wild: 'the Wild Woods',
  frost: 'Frostpeak',
};

// Shop stock (the Den). Potions and gear; sold-out gear vanishes.
export const SHOP_STOCK = [
  { kind: 'potion', name: 'Healing Potion', icon: '🧪', price: 15, blurb: '+3 hearts. Cherry flavor.' },
  { kind: 'shield', id: 'shield_a', price: 70 },
  { kind: 'weapon', id: 'dagger_a', price: 80 },
  { kind: 'weapon', id: 'sword_b', price: 90, after: 'ember' },
  { kind: 'weapon', id: 'spear_a', price: 120, after: 'stone' },
  { kind: 'shield', id: 'shield_c', price: 180, after: 'stone' },
  { kind: 'weapon', id: 'sword_d', price: 200, after: 'wild' },
  { kind: 'weapon', id: 'hammer_a', price: 300, after: 'frost' },
];

// Is this rung on the shelf yet? A locked rung is still SHOWN (menus.js draws
// it as a promise naming the region that opens it) — a thing that silently
// vanishes from a shop a child has already browsed reads as a bug, and the
// ladder they can see is half the reason to go and free the next spirit.
export function shopOpen(s) {
  return !s.after || WS.get(s.after, 'restored');
}
