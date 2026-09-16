// DRAGON EGGS & GRAND ELEMENTAL SHRINES (design/DRAGON-EGGS.md) — dad's
// hidden side quest, this session: three dragon eggs (fire/tide/storm) found
// hidden in the world, each thrown into its own matching elemental shrine to
// hatch a companion dragon. Deliberately a quiet, unflagged secret: no quest
// marker, no map pin, no "x/3 eggs" HUD counter anywhere in this file or its
// callers.
//
// STATE lives in state.inventory (js/state.js), the same bucket
// materials/crafted/recipesKnown already share, and round-trips through
// js/save.js's additive-forever backfill exactly like they did:
//   dragonEggs:     { element -> true }  — which eggs have been FOUND
//   dragonsHatched: { element -> true }  — which have been THROWN and hatched
//   dragonEquipped: element | null       — which hatched dragon runs with Kael
//
// NARRATION is deliberately NOT called from this module. Every narration.say
// call site in this game lives in js/main.js (grep it) — Narration itself is
// only ever instantiated there — so a DragonShrine reports what just
// happened as a plain event object and main.js decides what, if anything, to
// say about it, the same separation js/nodes.js's ResourceNode and
// js/denRebuild.js's building spots already keep from their own callers.
import { state } from './state.js';
import { spiritShrine } from './levelkit.js';
import { audio } from './audio.js';
import { juice } from './juice.js';

// One entry per element. `tint` colours the shrine's own light effect
// (js/levelkit.js spiritShrine, reused as-is — a shrine is light, not a
// creature, the same reasoning that function's own header already gives for
// why it is built from primitives rather than a vendored model) and is also
// the base colour js/companionDragon.js reads off js/player.js's own
// WOLF_TINTS for the matching wolf form, so a fire dragon is exactly Fire
// Wolf orange rather than a fourth new palette.
export const DRAGON_ELEMENTS = {
  fire: {
    name: 'Ember Dragon', eggName: 'an Ember Dragon Egg', tint: 0xff5a2b,
    hintLine: 'dragon_hint_fire', confirmLine: 'dragon_confirm_fire', hatchLine: 'dragon_hatch_fire',
  },
  tide: {
    name: 'Tide Dragon', eggName: 'a Tide Dragon Egg', tint: 0x3fb0c4,
    hintLine: 'dragon_hint_tide', confirmLine: 'dragon_confirm_tide', hatchLine: 'dragon_hatch_tide',
  },
  storm: {
    name: 'Storm Dragon', eggName: 'a Storm Dragon Egg', tint: 0xc9d4ff,
    hintLine: 'dragon_hint_storm', confirmLine: 'dragon_confirm_storm', hatchLine: 'dragon_hatch_storm',
  },
};

const NEAR_R = 3.2; // walk-up radius — this game's only interaction law (js/nodes.js's own header)

export function hasEgg(el) { return !!(state.inventory.dragonEggs || {})[el]; }

// Idempotent, like js/treasures.js's addTreasure() — a chest opened twice
// (or re-read from a stale marker) never re-announces or double-counts a
// find.
export function addEgg(el) {
  if (!DRAGON_ELEMENTS[el]) return false;
  if (!state.inventory.dragonEggs) state.inventory.dragonEggs = {};
  if (state.inventory.dragonEggs[el]) return false;
  state.inventory.dragonEggs[el] = true;
  return true;
}

export function isHatched(el) { return !!(state.inventory.dragonsHatched || {})[el]; }

// Marks the egg permanently spent — "no wasting a second throw, no picking
// it back up" (the brief's own words). Returns false if there is no egg to
// throw or it is already hatched, so a caller can never double-pay a hatch.
export function hatchEgg(el) {
  if (!hasEgg(el) || isHatched(el)) return false;
  if (!state.inventory.dragonsHatched) state.inventory.dragonsHatched = {};
  state.inventory.dragonsHatched[el] = true;
  return true;
}

export function hatchedDragons() {
  const h = state.inventory.dragonsHatched || {};
  return Object.keys(DRAGON_ELEMENTS).filter((el) => h[el]);
}

// null (nothing equipped) is always valid; any other value must be an
// already-hatched dragon — a menu can never equip one that does not exist.
export function equippedDragon() {
  const el = state.inventory.dragonEquipped;
  return el && isHatched(el) ? el : null;
}

export function setEquippedDragon(el) {
  if (el !== null && !isHatched(el)) return false;
  state.inventory.dragonEquipped = el;
  return true;
}

// One shrine's own tiny state machine — walk up, get told what to do (an
// event main.js turns into a narration line) or get shown nothing at all.
class DragonShrine {
  constructor(world, x, z, element) {
    this.x = x; this.z = z; this.element = element;
    spiritShrine(world, x, z, DRAGON_ELEMENTS[element].tint, 1.15);
    this._near = false;
    this.armed = false; // true only while near, egg in hand, not yet hatched
  }

  // Edge-triggered: fires an event ONLY the frame "near" flips from false to
  // true, the same hysteresis idiom js/levelDenRebuild.js's own building
  // spots and js/main.js's shop/travel spots already use, so a child
  // standing still at the shrine does not hear the line on a loop.
  update(player) {
    const dx = player.root.position.x - this.x, dz = player.root.position.z - this.z;
    const near = (dx * dx + dz * dz) < NEAR_R * NEAR_R;
    let event = null;
    if (near && !this._near) {
      if (isHatched(this.element)) event = null; // already given — nothing left to say
      // WRONG SHRINE (or right shrine, egg not yet found): the SAME generic
      // hint either way, on purpose — a shrine never confirms which element
      // an egg in your bag belongs to before you have found the one it wants.
      else if (!hasEgg(this.element)) event = { type: 'hint', element: this.element };
      else event = { type: 'confirm', element: this.element };
    }
    this._near = near;
    this.armed = near && hasEgg(this.element) && !isHatched(this.element);
    return event;
  }

  throwEgg() {
    if (!this.armed) return false;
    if (!hatchEgg(this.element)) return false;
    this.armed = false;
    // THE FIRST DRAGON JOINS AUTOMATICALLY. A second or third hatch leaves
    // the equip choice alone — swapping between hatched dragons is what the
    // backpack's own Dragons tab (js/menus.js) is for.
    if (!equippedDragon()) setEquippedDragon(this.element);
    juice.burst(this.x, 1.0, this.z, DRAGON_ELEMENTS[this.element].tint, 26);
    juice.flare(this.x, 1.0, this.z, DRAGON_ELEMENTS[this.element].tint);
    audio.play('checkpoint', { volume: 0.8, rate: 0.75 });
    return this.element;
  }
}

// Wired into the shared per-room pipeline (js/main.js) exactly beside
// spawnResourceNodes/spawnBreakables/spawnChests — `spots` is a plain
// {x,z,element} array a room sets on world.markers.dragonShrineSpots, the
// same data-only contract js/nodes.js's rockSpots/treeSpots already keep.
export async function spawnDragonShrines(world, spots = []) {
  if (!spots.length) return;
  world.dragonShrines = spots.map((s) => new DragonShrine(world, s.x, s.z, s.element));
  world.dragonShrineEvent = null;    // this frame's edge-triggered event, or null
  world.dragonPromptElement = null;  // element of the currently-armed shrine, or null
  world.updateDragonShrines = (dt, t, player) => {
    let event = null, armed = null;
    for (const s of world.dragonShrines) {
      const e = s.update(player);
      if (e) event = e;
      if (s.armed) armed = s.element;
    }
    world.dragonShrineEvent = event;
    world.dragonPromptElement = armed;
  };
  // THE CONFIRM TAP. main.js wires the one on-screen button
  // (#btn-dragon, revealed only while world.dragonPromptElement is set —
  // the SAME "contextual action button" idiom #btn-ranged/#btn-defend/
  // #btn-jump already use, index.html's own .revealed class) to this call.
  // Returns the hatched element on success, or null — a tap with no armed
  // shrine, or an already-spent egg, does nothing at all, same as every
  // other "no tool = does nothing" precedent in this game (js/nodes.js).
  world.confirmDragonThrow = () => {
    for (const s of world.dragonShrines) {
      if (s.armed) return s.throwEgg();
    }
    return null;
  };
}
