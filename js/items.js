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

  // -------------------------------------------------------------------------
  // THE REST OF THE RACK — and the oldest trick in the book.
  //
  // Dad: "add different weapons and armour that you can find and equip. use
  // whatever weapon assets you have, swords, axes, bows and arrows... use the
  // old developer trick of recolouring the same asset, give it a different name
  // and stats and call it a day."
  //
  // Four models in assets/gear were vendored, licence-cleared and never used at
  // all: axe_B, sword_C, sword_E and staff_A (and shield_B). They are real
  // weapons now — and then each one is worn twice more in a different colour
  // with different numbers, which is exactly the trick he asked for and the same
  // asset-multiplication law the environment kit already runs on.
  //
  // `tint` recolours the model at equip time. The materials come out of the
  // shared loader cache, so player.js clones them before touching them —
  // tinting the cache would repaint every skeleton's sword in the game.
  // -------------------------------------------------------------------------
  axe_b: {
    name: 'Woodcutter Axe', icon: '🪓', file: './assets/gear/axe_B.gltf',
    dmg: 1.8, lock: 0.66, range: 1.9, price: 140, arc: 78, stun: 0.25,
    blurb: 'Heavy and wide. Chops through a crowd.',
  },
  axe_ember: {
    name: 'Cinder Axe', icon: '🔥', file: './assets/gear/axe_B.gltf', tint: 0xff6a2a,
    dmg: 2.0, lock: 0.66, range: 1.9, price: 260, arc: 78, stun: 0.25, element: 'fire',
    blurb: 'Still warm from the Kiln.',
  },
  axe_frost: {
    name: 'Rimebite Axe', icon: '❄️', file: './assets/gear/axe_B.gltf', tint: 0x8fd8ff,
    dmg: 2.0, lock: 0.72, range: 1.9, price: 280, arc: 78, stun: 0.55, element: 'frost',
    blurb: 'The cold makes them slow.',
  },
  sword_c: {
    name: 'Broadblade', icon: '🗡️', file: './assets/gear/sword_C.gltf',
    dmg: 1.6, lock: 0.6, range: 2.2, price: 150, arc: 78,
    blurb: 'A wide, honest swing.',
  },
  sword_e: {
    name: 'Twin Fang', icon: '⚔️', file: './assets/gear/sword_E.gltf',
    dmg: 1.2, lock: 0.4, range: 2.0, price: 170,
    blurb: 'Quick as the dagger, long as a sword.',
  },
  sword_verdant: {
    name: 'Thornblade', icon: '🌿', file: './assets/gear/sword_E.gltf', tint: 0x7ad46a,
    dmg: 1.4, lock: 0.4, range: 2.0, price: 240, element: 'verdant',
    blurb: "Sylva's green edge — it BITES the corrupted.",
  },
  sword_storm: {
    name: 'Stormfang', icon: '🌩️', file: './assets/gear/sword_C.gltf', tint: 0xc8b4ff,
    dmg: 2.2, lock: 0.6, range: 2.2, price: 320, arc: 78, element: 'storm', stun: 0.3,
    blurb: 'It cracks like thunder.',
  },
  staff_a: {
    name: 'Old Staff', icon: '🪄', file: './assets/gear/staff_A.gltf',
    dmg: 1.1, lock: 0.5, range: 2.6, price: 130, arc: 60, stun: 0.35,
    blurb: 'Long reach, and a good sharp KNOCK.',
  },
  staff_moon: {
    name: 'Moonwood Staff', icon: '🌙', file: './assets/gear/staff_A.gltf', tint: 0xbfa8ff,
    dmg: 1.6, lock: 0.5, range: 2.8, price: 300, arc: 60, stun: 0.5, element: 'moon',
    blurb: 'Luna lit the tip of it.',
  },
  spear_tide: {
    name: 'Deepwater Pike', icon: '🌊', file: './assets/gear/spear_A.gltf', tint: 0x4fd0d8,
    dmg: 1.5, lock: 0.6, range: 2.9, price: 290, arc: 36, element: 'tide',
    blurb: 'Reaches further than anything.',
  },
  hammer_earth: {
    name: 'Petra’s Maul', icon: '🪨', file: './assets/gear/hammer_A.gltf', tint: 0xd8b06a,
    dmg: 3.4, lock: 0.85, range: 1.9, price: 420, arc: 82, stun: 0.9, element: 'earth',
    blurb: 'The ground itself complains.',
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
  shield_b: {
    name: 'Kite Shield', icon: '🔶', file: './assets/gear/shield_B.gltf',
    blunt: 0.4, parryBonus: 0.06, price: 130,
    blurb: 'A bit of both.',
  },
  shield_moon: {
    name: 'Moonguard', icon: '🌙', file: './assets/gear/shield_B.gltf', tint: 0xbfa8ff,
    blunt: 0.3, parryBonus: 0.18, price: 340,
    blurb: 'It KNOWS when to catch a blow.',
  },
};

// ---------------------------------------------------------------------------
// ARMOUR — the same trick, on Kael himself.
//
// There is no armour model in any vendored pack, and inventing one is not on
// the table. But the knight already wears plate, so a suit of armour is that
// plate in a different colour with a different number against it — which is
// precisely the trick dad named, and it is the ONLY honest way to have armour
// here at all.
//
// `soak` is flat damage taken off every hit before anything else, floored so a
// hit always costs something; `weight` slows Kael a touch, so heavy armour is a
// real trade rather than a straight upgrade.
// ---------------------------------------------------------------------------
export const ARMOURS = {
  plain: {
    name: 'Squire Plate', icon: '🩶', tint: null, soak: 0, weight: 0, price: 0,
    blurb: 'What you set out in.',
  },
  ember: {
    name: 'Kiln Plate', icon: '🟠', tint: 0xd8763a, soak: 0.5, weight: 0.03, price: 110,
    blurb: 'Beaten out over the forge. Warm to touch.',
  },
  stone: {
    name: 'Vault Plate', icon: '🪨', tint: 0x9aa4b0, soak: 1.0, weight: 0.08, price: 220,
    blurb: 'Heavy as the stone it came from.',
  },
  verdant: {
    name: 'Greenweave', icon: '🌿', tint: 0x6fae5c, soak: 0.5, weight: -0.04, price: 260,
    blurb: 'Light as leaves — you move QUICKER.',
  },
  frost: {
    name: 'Rime Plate', icon: '❄️', tint: 0x9fd4ee, soak: 1.0, weight: 0.03, price: 300,
    blurb: 'Cold, and it does not care.',
  },
  moon: {
    name: 'Moonplate', icon: '🌙', tint: 0xc4b0ff, soak: 1.5, weight: 0, price: 480,
    blurb: "Luna's own. Nothing weighs it down.",
  },
};

export function armourDef() {
  return ARMOURS[state.inventory.equipped.armour] || ARMOURS.plain;
}

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
  // THE FULL RACK, spread up Maren's ladder so the shop keeps changing. Armour
  // is bought here too — the ones a child does not find in a chest.
  { kind: 'weapon', id: 'staff_a', price: 130, tier: 1 },
  { kind: 'shield', id: 'shield_b', price: 130, tier: 1 },
  { kind: 'armour', id: 'ember', price: 110, tier: 1 },
  { kind: 'weapon', id: 'axe_b', price: 140, tier: 2 },
  { kind: 'weapon', id: 'sword_c', price: 150, tier: 2 },
  { kind: 'armour', id: 'stone', price: 220, tier: 2 },
  { kind: 'weapon', id: 'sword_e', price: 170, tier: 3 },
  { kind: 'weapon', id: 'axe_ember', price: 260, tier: 3 },
  { kind: 'armour', id: 'verdant', price: 260, tier: 3 },
  { kind: 'weapon', id: 'axe_frost', price: 280, tier: 4 },
  { kind: 'weapon', id: 'spear_tide', price: 290, tier: 4 },
  { kind: 'armour', id: 'frost', price: 300, tier: 4 },
  { kind: 'weapon', id: 'staff_moon', price: 300, tier: 5 },
  { kind: 'weapon', id: 'sword_storm', price: 320, tier: 5 },
  { kind: 'shield', id: 'shield_moon', price: 340, tier: 5 },
  { kind: 'weapon', id: 'hammer_earth', price: 420, tier: 5 },
  { kind: 'armour', id: 'moon', price: 480, tier: 5 },
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
