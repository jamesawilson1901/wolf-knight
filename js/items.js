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

// ---- Maren's counter GROWS -------------------------------------------------
//
// GAME-CONTRACT's region shipping checklist asks every region for a "shop tier",
// and its progression targets set the ladder at "≈ 60/90/150/250/400 per region
// tier". The shop shipped as one flat shelf: all eight rows on a child's first
// visit, and no ladder at all. Stock now carries a `tier`, and a tier is
// unwrapped by the region whose restoration pays for it — the same Terranigma
// beat the Den itself already runs on (mushrooms after the Warden, a third
// tent, Rook when Ember heals, Bram when Stoneroot sings).
//
// A locked row is SHOWN, wrapped — never hidden. An empty counter says "this is
// all there is"; a wrapped one says "come back". That is the rule the promise
// gates follow (FIX-PLAN A8), and the shop is the one place in the game a child
// can see the whole ladder at once.
//
// `unlocked` is a predicate rather than a stored flag so that an old save, which
// already knows which regions it has healed, opens the right shelves the moment
// it loads — no migration, additive-forever.
export const SHOP_TIERS = [
  { tier: 1, unlocked: () => true },
  { tier: 2, unlocked: () => WS.get('stone', 'restored'),
    teaser: 'Wrapped in oilcloth — Maren unpacks it when the Caverns sing again.' },
];

export function shopTierOpen(tier) {
  const t = SHOP_TIERS.find((x) => x.tier === tier);
  return t ? t.unlocked() : true; // an undeclared tier is on the shelf
}

export function shopTierTeaser(tier) {
  const t = SHOP_TIERS.find((x) => x.tier === tier);
  return (t && t.teaser) || 'Not for sale yet.';
}

// Shop stock (the Den). Potions and gear; sold-out gear vanishes. Rows are
// listed in tier order, which is also the order a child reads them.
export const SHOP_STOCK = [
  { kind: 'potion', name: 'Healing Potion', icon: '🧪', price: 15, tier: 1, blurb: '+3 hearts. Cherry flavor.' },
  { kind: 'weapon', id: 'dagger_a', price: 80, tier: 1 },
  { kind: 'weapon', id: 'sword_b', price: 90, tier: 1 },
  { kind: 'shield', id: 'shield_a', price: 70, tier: 1 },
  { kind: 'weapon', id: 'spear_a', price: 120, tier: 2 },
  { kind: 'shield', id: 'shield_c', price: 180, tier: 2 },
  { kind: 'weapon', id: 'sword_d', price: 200, tier: 2 },
  { kind: 'weapon', id: 'hammer_a', price: 300, tier: 2 },
];
