// WORLD STATE — the system that lets a place you already know read differently
// the next time you walk into it.
//
// This started as two functions over a flag bag. Level 2's Great Vault needs
// more than that: the hub is crossed six times and changes three times, and a
// child who quits after the second change and comes back tomorrow must find the
// vault exactly as they left it. That is not something you can bolt on with
// per-room `if` statements — the change has to be DATA the room reads.
//
// The shape:
//
//   defineRestoration(region, [ {key, title, ...}, ... ])
//        declares a region's milestones IN ORDER, once, at module load.
//   WS.complete(region, key)
//        records one. Returns true only the first time.
//   WS.stage(region)
//        how many milestones are done, counted from the front of the list —
//        this is the single number a hub builder branches on.
//   WS.snapshot() / WS.restore()
//        the whole thing, serialisable, for the save file.
//
// Everything lives under `state.flags.world`, which `js/save.js` already
// round-trips into the per-child localStorage profile, so an old profile with
// no `world` key simply reads stage 0 — the additive-forever law holds.
//
// It is deliberately not Level-2-specific. The same mechanism is meant to drive
// world restoration across the whole game later; writing it as a registry now
// costs a few dozen lines, and retrofitting it after four regions of hardcoded
// triggers would cost a rewrite.

import { state } from './state.js';

// RENAMED MILESTONES, so a finished room stays finished.
//
// A restoration key is written into the save. Renaming one without a bridge
// would silently un-finish that milestone for every child already past it —
// stage() counts from the front of the list, so the vault's crypt door would
// shut again on a save that had already opened it. Each entry is
// `newKey: [old keys that also count]`, read-only and additive forever.
const KEY_ALIASES = {
  // v3.64: the titan and its propped-up arm were cut; the crypt is opened by
  // lighting the deep lantern now. A save that dropped the hand has earned it.
  vault: { deepLantern: ['handDown'] },
};

export const WS = {
  get(region, key) {
    const w = state.flags.world && state.flags.world[region];
    if (!w) return false;
    if (w[key]) return true;
    const alias = KEY_ALIASES[region] && KEY_ALIASES[region][key];
    return !!(alias && alias.some((k) => w[k]));
  },
  set(region, key, v = true) {
    if (!state.flags.world) state.flags.world = {};
    if (!state.flags.world[region]) state.flags.world[region] = {};
    state.flags.world[region][key] = v;
  },

  // How far along a region's restoration is, counted from the FRONT of its
  // milestone list. Stops at the first incomplete one on purpose: a stage is
  // "everything up to here is done", which is what geometry wants to branch on.
  // A region with no declared restoration is always stage 0.
  stage(region) {
    const list = RESTORATIONS[region];
    if (!list) return 0;
    let n = 0;
    for (const m of list) {
      if (!WS.get(region, m.key)) break;
      n++;
    }
    return n;
  },

  // Mark a milestone. Returns true only the first time, so a caller can play
  // the fanfare without having to remember whether it already did.
  complete(region, key) {
    if (WS.get(region, key)) return false;
    WS.set(region, key, true);
    return true;
  },

  // Everything a region knows, for a debug overlay or a headless assertion.
  describe(region) {
    const list = RESTORATIONS[region] || [];
    return {
      region,
      stage: WS.stage(region),
      total: list.length,
      milestones: list.map((m) => ({ key: m.key, title: m.title, done: WS.get(region, m.key) })),
    };
  },

  snapshot() { return JSON.parse(JSON.stringify(state.flags.world || {})); },
  restore(obj) { state.flags.world = obj && typeof obj === 'object' ? obj : {}; },
};

// ---------------------------------------------------------------------------
// The registry. Order matters — `stage()` counts down this list.
// ---------------------------------------------------------------------------
const RESTORATIONS = {};

export function defineRestoration(region, milestones) {
  RESTORATIONS[region] = milestones;
  return milestones;
}

export function restorationOf(region) { return RESTORATIONS[region] || []; }

// LEVEL 2 — THE GREAT VAULT. Three spokes, three changes, in the order they
// can physically be done: Spoke A is the only door open at the start, so the
// spark always lands first; B and C may be done in either order, but the hub
// only shows change 2 once one of them is in and change 3 once both are.
//
// `titles` are what a grown-up reads in a debug list. The child is told
// nothing — they walk in and the room is different, which is the entire point.
// THE VAULT RUNS ON LANTERNS. It used to end on a stone giant whose propped-up
// arm you burned free so it fell into a ramp — which nothing in the room ever
// explained, and which dad named exactly: "the second level makes zero sense in
// terms of things you need to do to unlock the door." The titan is gone. Two
// lanterns are lit with the Fire Wolf instead, in two different places, and the
// second of them is in the dark where only the Dark Wolf can see the floor.
//
// `handDown` is kept as a DEAD KEY, never written and never read: saves are
// additive-forever, and a profile mid-Stoneroot may still carry it. Removing
// the name from this list would silently renumber stage() for that child and
// shut a door they had already opened.
defineRestoration('vault', [
  { key: 'spark', title: 'the vault lantern relights',
    opens: 'the Bone Quarry and the Sunken Stair doors, invisible in the dark' },
  { key: 'drained', title: 'the water drains from the sunken ring',
    opens: 'the vault floor, and the chest that was underwater' },
  { key: 'deepLantern', title: 'the deep lantern is lit in the dark',
    opens: "the Warden's Crypt" },
]);

// LEVEL 3 — THE WILD WOODS. Two shortcuts and the great thorn-knot. Unlike the
// vault's three, these are not a strict sequence: the chords open in whatever
// order a child finds them, and `stage()` is not used for the woods — each key
// is read on its own. Declaring them here still keeps them in one registry, and
// gives the debug list something truthful to print.
defineRestoration('wild3', [
  { key: 'rootCut', title: 'the root-wall is cut open',
    opens: 'a chord from the Rootbound Deep back to the Gloomwood' },
  { key: 'logDown', title: 'the great log is hauled down',
    opens: 'a chord from the Bloomfall back to Thornedge' },
  { key: 'knotCut', title: 'the great thorn-knot is parted',
    opens: "Sylva's Glade" },
]);

// Mystery log — "come back later" promises shown as ??? on the map screen.
// Registered the first time the player SEES the obstacle.
export function logMystery(id, icon, label) {
  if (!state.flags.mysteries) state.flags.mysteries = {};
  if (state.flags.mysteries[id]) return false;
  state.flags.mysteries[id] = { icon, label, found: false };
  return true; // caller shows the "added to map" toast
}

export function resolveMystery(id) {
  if (state.flags.mysteries && state.flags.mysteries[id]) {
    state.flags.mysteries[id].found = true;
  }
}

// ---------------------------------------------------------------------------
// RESCUES — one count, in one place.
//
// design/DEN-MINIGAMES.md §5.1: the Den's tier and every mini game unlock derive
// from the total rescue count, and *"rescue count must not be duplicated in a
// second place"*. So it is derived here rather than stored: whatever the save
// already knows about who has been freed IS the count, and there is nothing to
// keep in sync.
//
// The spec names this `WorldState.rescuedIds`. Until the Den growth work (build
// order step 4) needs the ids themselves, the count is what every caller wants,
// and deriving it now means the number is never wrong in the meantime.
export function rescueCount(state) {
  const pups = state.flags && state.flags.pups ? Object.keys(state.flags.pups).length : 0;
  const folk = state.flags && state.flags.rescued ? Object.keys(state.flags.rescued).length : 0;
  return pups + folk;
}

// §4 unlock tiers: 1-3 rescues open Tier 1, 4-8 Tier 2, 9+ Tier 3. Unlocks are
// driven by the COUNT and never by which characters a child happened to find,
// so no game is orphaned by a missed rescue.
export function unlockTier(state) {
  const n = rescueCount(state);
  return n >= 9 ? 3 : n >= 4 ? 2 : n >= 1 ? 1 : 0;
}
