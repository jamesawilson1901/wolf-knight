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
//
// v2 REVISION (2026-09-17, dad's own review of the first screenshots): the
// original shrine was js/levelkit.js's spiritShrine() — a pure light effect,
// nothing to actually THROW an egg INTO. Dad: "you can't reuse those assets
// as the shrines, it will confuse the player. There was also meant to be
// some sort of moat surrounding it to throw the egg into." Replaced with a
// real vendored portal model (assets/env/shrine/portal.glb, a CC0 upload —
// see assets/LICENSES/MANIFEST.json) ringed by a literal moat (a flat water-
// tinted ring, js/water.js's own WATER.shallow palette so it reads as the
// SAME water this game already has rather than a new material) — touching
// the moat is now the trigger radius, not an invisible circle floating in
// open air. Dad also asked for the confirm prompt to "cover up the player"
// so no throw animation is needed ("the egg is already in their hands...
// Kael drops it straight in") and for the dragon to "jump out" a few seconds
// later rather than appear instantly — both handled in js/main.js (the
// #caption.big-cover CSS state and the EMERGE_DELAY_MS sequence) and
// js/companionDragon.js (CompanionDragon#emergeAt(), a scale-up reveal).
import * as THREE from 'three';
import { state } from './state.js';
import { loadGLB, prepareModel } from './assets.js';
import { WATER } from './water.js';
import { audio } from './audio.js';
import { juice } from './juice.js';

// One entry per element. `tint` colours the shrine's own portal disk (only
// the disk — js/levelkit.js's spiritShrine() header explains why a shrine
// used to be pure light; the portal keeps the same "colour says which
// element" law, just on a real mesh's own isolated material instead) and is
// also the base colour js/companionDragon.js reads off js/player.js's own
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

const PORTAL_URL = './assets/env/shrine/portal.glb';
let portalGltf = null;
async function preloadPortal() {
  if (!portalGltf) portalGltf = await loadGLB(PORTAL_URL);
}

const SHRINE_HEIGHT = 2.6;   // fitHeight target — a little taller than Kael, a real set-piece
const MOAT_INNER = 1.7;      // just outside the portal's own stone base
const MOAT_OUTER = 2.6;      // the moat's outer edge IS the walk-up/touch radius now
const NEAR_R = MOAT_OUTER;

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

// THE SKELETON HINT (2026-09-17, dad's own ask): a curled dragon skeleton —
// ribcage, skull, wing-finger bones fanned out, a curled tail — half-buried
// in each element region's own FIRST room, well clear of any fight zone.
// Wordless foreshadowing, the same "no reading required" idiom every other
// hint in this game already follows: a child who notices it has no way to
// know what it means yet, but remembers it once the egg turns up later. One
// per element (fire/tide/storm) in that region's own opening room — la
// (Ember Hollow), d1a (Sunken Vale), s1a (Stormreach) — never the same room
// as the egg's own chest, since the point is the LONG walk between "here is
// a clue" and "here is the answer".
//
// Kept-as-supplied material, same reasoning as js/levelDenRebuild.js's
// Monument: a one-off set piece, never retinted per-instance, so its own
// bone-white colour survives untouched. No collider — a ground-hugging ruin
// a child walks over, the same "small clutter, no box" idiom every level
// file's own rubbleField()/similar dressing already uses.
const SKELETON_URL = './assets/env/dragon-skeleton.glb';
let skeletonGltf = null;
export async function preloadDragonSkeleton() {
  if (!skeletonGltf) skeletonGltf = await loadGLB(SKELETON_URL);
}

export function spawnDragonSkeletonHint(world, x, z, ry, targetDiameter = 4.2) {
  if (!skeletonGltf) return;   // greybox, or preloadDragonSkeleton() skipped
  const model = prepareModel(skeletonGltf.scene.clone());
  const bb = new THREE.Box3().setFromObject(model);
  const size = bb.getSize(new THREE.Vector3());
  const s = targetDiameter / Math.max(size.x, size.z);
  model.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const holder = new THREE.Group();
  holder.add(model);
  holder.scale.setScalar(s);
  holder.position.set(x, 0, z);
  holder.rotation.y = ry;
  world.add(holder);
}

// A real vendored portal (CC0, converted to a self-contained .glb — see
// assets/LICENSES/MANIFEST.json), ringed by a flat water-tinted moat. Only
// the portal's own glowing disk is tinted per element — it is a SEPARATE
// mesh in the source file (Portal_01_Hole) with its own material
// ('PortalDisk'), so recolouring it never repaints the stone frame, moss or
// root the model already carries.
class DragonShrine {
  constructor(world, x, z, element) {
    this.x = x; this.z = z; this.element = element;
    const tint = DRAGON_ELEMENTS[element].tint;

    const model = prepareModel(portalGltf.scene.clone());
    const bb = new THREE.Box3().setFromObject(model);
    const h = Math.max(0.01, bb.max.y - bb.min.y);
    const s = SHRINE_HEIGHT / h;
    model.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    model.traverse((n) => {
      if (!n.isMesh || !n.material || n.material.name !== 'PortalDisk') return;
      n.material = n.material.clone();
      n.material.color.setHex(tint);
      n.material.emissive.setHex(tint);
      n.material.emissiveIntensity = 2.2;
    });
    const root = new THREE.Group();
    root.add(model);
    root.scale.setScalar(s);
    root.position.set(x, world.deckY || 0, z);
    world.add(root);

    // THE MOAT — a flat ring using the SAME water tint/alpha
    // js/water.js's own WATER.shallow already uses (this game's one
    // established "this is water" read), not a new material. Visual only —
    // it does not slow the player like a real waterZone() the way Sunken
    // Vale's own water does; that would need registering an actual
    // collision/depth zone for a handful of one-off rings, more machinery
    // than three fixed, dry-floored boss arenas need. Documented as a
    // deliberate simplification, not an oversight.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(MOAT_INNER, MOAT_OUTER, 40),
      new THREE.MeshStandardMaterial({
        color: WATER.shallow.tint, transparent: true, opacity: WATER.shallow.alpha,
        side: THREE.DoubleSide, roughness: 0.35, metalness: 0,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, (world.deckY || 0) + 0.015, z);
    world.add(ring);
    this.portalRoot = root; // kept for tools/verify-dragoneggs.mjs's own introspection
    this.moatRing = ring;
    // NOT reserved here — each room builder already calls world.reserve(x,
    // z, 3.4, 'dragonShrine') itself, comfortably bigger than MOAT_OUTER,
    // BEFORE its own scatter() pass runs (js/level1.js/level5.js/level6.js).
    // A second reserve() from inside this shared class would only duplicate
    // that, at a smaller radius, with no ordering guarantee of its own.

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

  // Spends the egg and flips the state immediately (owning the dragon is
  // real the instant you say yes) but does NOT touch the companion body —
  // js/main.js's #btn-dragon handler owns the "cover the player, wait a few
  // seconds, then it jumps out of the portal" choreography, since that is a
  // UI sequencing concern, not this module's own state-machine.
  throwEgg() {
    if (!this.armed) return false;
    if (!hatchEgg(this.element)) return false;
    this.armed = false;
    // THE FIRST DRAGON JOINS AUTOMATICALLY. A second or third hatch leaves
    // the equip choice alone — swapping between hatched dragons is what the
    // backpack's own Dragons tab (js/menus.js) is for.
    if (!equippedDragon()) setEquippedDragon(this.element);
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
  await preloadPortal();
  world.dragonShrines = spots.map((s) => new DragonShrine(world, s.x, s.z, s.element));
  world.dragonShrineEvent = null;    // this frame's edge-triggered event, or null
  world.dragonPromptElement = null;  // element of the currently-armed shrine, or null
  world.dragonPromptPos = null;      // {x,z} of the currently-armed shrine, or null
  world.updateDragonShrines = (dt, t, player) => {
    let event = null, armed = null, pos = null;
    for (const s of world.dragonShrines) {
      const e = s.update(player);
      if (e) event = e;
      if (s.armed) { armed = s.element; pos = { x: s.x, z: s.z }; }
    }
    world.dragonShrineEvent = event;
    world.dragonPromptElement = armed;
    world.dragonPromptPos = pos;
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
      if (s.armed) {
        const el = s.throwEgg();
        if (el) juice.burst(s.x, 1.0, s.z, DRAGON_ELEMENTS[el].tint, 26);
        return el;
      }
    }
    return null;
  };
}
