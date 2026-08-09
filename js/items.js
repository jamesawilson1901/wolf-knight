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

// THE SHOP LADDER (BUILDLOG queue: "Maren tier-2 stock after Stoneroot").
//
// Maren's stall is not a fixed catalogue. It GROWS as regions are freed, so
// coming home from a boss is worth doing for its own sake: there is something
// new on the table that was not there this morning. This is the Den's version
// of the promise gates — a locked tier is a REASON TO COME BACK, and Maren
// says so, rather than the shop silently being the same shop forever.
//
// Each tier names the WorldState flag that opens it (the same `restored` flag
// the villagers, the minigames and the Den's own dressing already read) and
// the line Maren says while it is still shut. Tier 1 has no gate. Locked stock
// is HIDDEN rather than shown greyed out — a card a child can see, tap and not
// buy teaches "the shop is broken"; the promise line teaches "come back".
//
// Adding a tier is one row here plus a `tier:` on the stock it opens.
export const SHOP_TIERS = [
  { tier: 1, region: null, key: null, promise: null },
  { tier: 2, region: 'stone', key: 'restored',
    promise: 'Maren rests a hand on a roped-shut crate. “Wake the caverns and I’ll open this one.”' },
];

// Is this tier's stock on the table yet? Unknown tiers read as open, so a
// stock row can never vanish because someone mistyped a number.
export function shopTierOpen(tier) {
  const t = SHOP_TIERS.find((x) => x.tier === (tier || 1));
  if (!t || !t.region) return true;
  return WS.get(t.region, t.key);
}

// The first tier that is still shut AND still has something in it — what
// Maren is promising right now. Null once everything is on the table.
export function lockedTierPromise() {
  for (const t of SHOP_TIERS) {
    if (shopTierOpen(t.tier)) continue;
    if (!SHOP_STOCK.some((s) => (s.tier || 1) === t.tier)) continue;
    return t.promise;
  }
  return null;
}

// Shop stock (the Den). Potions and gear; sold-out gear vanishes.
// `tier` defaults to 1 (open from the first visit).
export const SHOP_STOCK = [
  { kind: 'potion', name: 'Healing Potion', icon: '🧪', price: 15, blurb: '+3 hearts. Cherry flavor.' },
  { kind: 'weapon', id: 'dagger_a', price: 80 },
  { kind: 'weapon', id: 'sword_b', price: 90 },
  { kind: 'shield', id: 'shield_a', price: 70 },
  { kind: 'weapon', id: 'spear_a', price: 120 },
  { kind: 'shield', id: 'shield_c', price: 180, tier: 2 },
  { kind: 'weapon', id: 'sword_d', price: 200, tier: 2 },
  { kind: 'weapon', id: 'hammer_a', price: 300, tier: 2 },
];
