// TREASURES — the reward that is not a wolf.
//
// Dad, 2026-09-02: "we are going to add a new level that doesn't reward a wolf
// but something else inbetween all existing levels."
//
// The form ladder is finished at ten and the tenth is the ending's gift, so the
// levels between regions cannot pay in wolves. They pay in KEEPSAKES: one
// object per place, kept forever, worth nothing in a fight and everything to a
// child who is collecting.
//
// `state.inventory.treasures` has been in the save file since the beginning —
// declared, persisted on every write, and read by absolutely nothing. This
// module is the thing that was missing, not a new system bolted on.
//
// THE RULES, and tools/verify-treasures.mjs holds them:
//
//   1. A treasure is FOUND, never bought. Nothing here goes in SHOP_STOCK.
//   2. A treasure does NOTHING. No stat, no slot, no unlock. The moment one of
//      these grants a heart or a damage bonus, a child who wants to keep up has
//      to hunt them, and the whole point is that they are optional.
//   3. Every treasure in this table is placed somewhere a child can reach it.
//      The registry may not run ahead of the world — an entry with no home is a
//      `???` slot in the collection that can never be filled, which teaches a
//      non-reader that they missed something that was never there.
//   4. One per level, so the collection reads as a map of where you have been.
//
// Rule 3 is why this table starts at one entry. The other in-between levels are
// designed (design/LEVEL-DESIGN-BRANCHES.md) and not built; each one's treasure
// lands here the day its level does, and the suite fails if that order slips.

import { state } from './state.js';

export const TREASURES = {
  // EMBER DEEP's keepsake. The branch is about fire as something you carry
  // rather than a key you turn, so what you carry out is a piece of the hearth
  // that was cold when you got there.
  //
  // NO TINT, and that is deliberate. These models are TEXTURED — every one of
  // them is a single white material over a shared atlas, so the colour lives in
  // the map and a `tint` MULTIPLIES it rather than replacing it. Tinting the
  // topaz to the Kiln's orange turned it muddy red. Rendered untinted it is
  // already an ember (scratchpad/gemstrip.png), which is the whole reason to
  // pick the right model instead of recolouring the wrong one. The rest of the
  // set reads the same way for the levels still to come — diamond is frost,
  // emerald is the woods, and the two keys and the scroll are their own thing.
  banked_ember: {
    name: 'The Banked Ember',
    file: './assets/loot/treasure/gem-topaz.glb',
    blurb: 'Still warm, after all that time.',
    from: 'Ember Deep',
  },
  // THE NIGHT ROAD's keepsake — the road between Ember Hollow and Stoneroot.
  // An old iron key, and no lock left anywhere that fits it: the road had
  // houses on it once, and this is the one thing on the whole moor that is
  // proof of it. It is also the plainest READ in the set — a five-year-old
  // knows what a key is from across the room, which matters most for the
  // earliest keepsake, the first one a child will ever be handed.
  wayfarers_key: {
    name: "The Wayfarer's Key",
    file: './assets/loot/treasure/key-skeleton.glb',
    blurb: 'Somebody\'s door, a long time ago.',
    from: 'The Night Road',
  },
  // THE GREENWAY's keepsake — the road up out of Stoneroot into the Wild
  // Woods. Emerald is the woods (the note above), and this is the first green
  // thing a child is handed: something that was a seed once, or a stone, and
  // has been both for long enough that it is hard to say which.
  rootstone: {
    name: 'The Rootstone',
    file: './assets/loot/treasure/gem-emerald.glb',
    blurb: 'A seed once. Or a stone. Hard to say.',
    from: 'The Greenway',
  },
  // THE DROWNED MARKET's keepsake. Teal, because the whole town is under ice
  // and this is the one thing in it that was worth keeping — and because the
  // set wants to read as a map of where you have been, which only works if no
  // two look alike.
  frozen_tear: {
    name: 'The Frozen Tear',
    file: './assets/loot/treasure/gem-diamond.glb',
    blurb: 'The harbour, keeping one thing back.',
    from: 'The Drowned Market',
  },
};

export function ownsTreasure(id) {
  return (state.inventory.treasures || []).includes(id);
}

// Returns true only the FIRST time, so a caller can play the fanfare without
// having to remember whether it already did — same contract WS.complete() has.
export function addTreasure(id) {
  if (!TREASURES[id]) return false;
  if (!state.inventory.treasures) state.inventory.treasures = [];
  if (state.inventory.treasures.includes(id)) return false;
  state.inventory.treasures.push(id);
  return true;
}

export function treasureCount() {
  return (state.inventory.treasures || []).length;
}
