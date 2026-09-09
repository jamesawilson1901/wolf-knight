// THE HEALING — what a region looks like once its guardian is free.
//
// Dad's ask (2026-09-08): "when the boss of each area I want the area to be
// transformed. grass begins to return, flowers. lava cools to rock. water
// returns, winds calm. animals replace enemies harmlessly grazing. a real
// terranigma moment."
//
// WHAT WAS ACTUALLY THERE BEFORE THIS FILE. Measured, not remembered:
// js/main.js already sets `WS.set(<region>, 'restored')` for all seven regions
// the moment their boss falls — and NOT ONE ROOM IN ANY REBUILT LEVEL READS
// IT. `grep -c restored js/level{1..7}.js` is 0, 0, 1 (a comment), 0, 0, 0, 0.
// The only readers left are the Den's villager list and a handful of rooms in
// js/rooms.js that RETIRED_ROOMS redirects away from. So the flag has been
// written and thrown away since the day it was added: a child beat Ember and
// walked back through an Ember that had not changed by one pixel.
//
// This module is the reader. It is deliberately five small answers rather than
// one big cutscene, because the transformation has to survive being walked
// away from and come back to — it is what the region IS now, not something
// that plays:
//
//   1. THE GROUND heals. A scorch becomes moss, ash becomes grass, corruption
//      becomes grass. Ground patches are data (js/ground.js PATCH_KINDS) and
//      every room in the game hands them to one function, so this is one
//      substitution table applied in one place.
//   2. THE WIND drops. Every gale lane in the game is built by one call
//      (js/wind.js), so a healed region's gales fall back to the same harmless
//      breeze the Landing teaches the wind with.
//   3. THE LAVA cools. Ember's molten channels go to cooled black crust — the
//      thing Pip has been promising since `lava_cooled` was written.
//   4. FLOWERS AND GRASS come up, on ground measured clear at build time so
//      nothing blooms inside a rock, instanced so a roomful costs two draws.
//   5. THE ANIMALS come back. Where an enemy stood, a wolf grazes. Not a new
//      creature — wolf.gltf is the game's own animal, the one the pups are
//      made of, and it ships with Eating, Idle_2_HeadLow, Idle and Walk: a
//      grazing vocabulary, already rigged (CLAUDE.md's standing rule).
//
// WHAT IS DELIBERATELY NOT HEALED: the Village and the Spire. The Village's
// wards are "kill everything in this square" gates (js/levelVillage.js checks
// `world.enemies.length && every dead`) and an empty room fails that test
// forever; the Spire's is the mirror of it and would pass instantly. Both
// already have their own before/after treatment — `villageShadow` and
// `village` are two hues of one ground style — so neither needs this one.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter, instancePlacements } from './assets.js';
import { WS } from './worldstate.js';
import { regionOf } from './state.js';

// regionOf() names the WORLD; worldstate keys name the SAVE, and the two have
// always been spelled differently ('ember_hollow' vs 'ember'). One table, so
// the mapping cannot drift — and the ROADS heal with the region they belong
// to, because a child who freed Ember and then walks the night road out of it
// would otherwise cross a strip of untouched dark between two healed places.
const WS_KEY = {
  ember_hollow: 'ember', night_road: 'ember',
  stoneroot: 'stone', greenway: 'stone',
  wildwoods: 'wild', coldclimb: 'wild',
  frostpeak: 'frost', market: 'frost',
  stormreach: 'storm', plunge: 'storm',
  sunkenvale: 'vale', hollowroad: 'vale',
  shadowcourt: 'court',
  // village / spire: see the note at the top. Absent on purpose.
  //
  // THE LAST THREE ROADS WERE LEFT OUT (2026-09-08 → fixed 2026-09-09). The
  // Cold Climb, the Plunge and the Hollow Road shipped a day after this table
  // did, and none of the three was ever added to it — so a child who freed
  // Frostpeak walked back through six rooms of untouched shadow between two
  // healed places, exactly the strip this table's own comment above says a
  // road must not be. design/WIDER-WORLD.md §1.8 names it slice one because
  // it is a bug, it is visible, and it is the first thing a returning child
  // crosses.
};

export function healKeyOf(roomId) {
  // 'den' has no prefix of its own, so regionOf falls it through to Ember —
  // and the Den already has its own healing (a third tent, the glade's
  // mushrooms, Rook and Bram arriving). It is not a place with weather or
  // enemies to mend, and it is named here so that stays true by decision
  // rather than by the accident of world.halfW being undefined for it.
  if (!roomId || roomId === 'den') return null;
  return WS_KEY[regionOf(roomId)] || null;
}

export function isHealed(roomId) {
  const k = healKeyOf(roomId);
  return !!(k && WS.get(k, 'restored'));
}

// ---------------------------------------------------------------------------
// 1 · THE GROUND
// ---------------------------------------------------------------------------
// Only the kinds that MEAN damage move. Gravel, sand, water and ice are what
// the place is made of, not what was done to it, and a healed shore that has
// stopped being sandy reads as a different room rather than a mended one.
const HEALED_PATCH = {
  scorch: 'moss',
  ash: 'grass',
  corruption: 'grass',
  rubble: 'moss',
  // WATER RETURNS. A mud flat is a place the water left — cracked, churned,
  // the shape of a pool with no pool in it — so a mud patch is where a healed
  // region gets its water back. It is the one item on dad's list with no
  // obvious home otherwise: the Vale is the water region and its problem is
  // too MUCH water, which Meri's own defeat already drains (js/boss.js
  // _drain), so this is the place where water coming BACK is a true sentence.
  mud: 'water',
};

export function healPatches(patches, roomId) {
  if (!patches || !patches.length || !isHealed(roomId)) return patches;
  return patches.map((p) => (HEALED_PATCH[p.kind]
    ? { ...p, kind: HEALED_PATCH[p.kind] }
    : p));
}

// ---------------------------------------------------------------------------
// 2 · THE WIND
// ---------------------------------------------------------------------------
// 'breeze' is the strength s1a's opening lane uses to teach that wind is
// harmless: the banners lean, the motes drift, and nothing pushes a child
// anywhere. Falling back to it — rather than deleting the lane — is what makes
// a calmed cliff still LOOK like weather.
export function calmedStrength(strength, roomId) {
  return isHealed(roomId) ? 'breeze' : strength;
}

// ---------------------------------------------------------------------------
// 3b · THE LIGHT
// ---------------------------------------------------------------------------
// The first healed contact sheet said this out loud: a Wild Woods with flowers
// in it and wolves grazing through it was still a Wild Woods you could barely
// see. Every other part of the healing is a thing IN the room, and the room's
// own mood — the value main.js normalises each district's tint to in
// applyRoomMood — went on saying what it said while the shadow was there.
//
// One number, applied to all three lights and to the background, because that
// is what "the shadow lifted" means in a renderer: the same hues, the same
// wayfinding, half a stop brighter. It stays SMALL on purpose. Frostpeak is
// still a cold mountain and the Court is still the darkest place in the game;
// they are simply no longer being lit as if something were sitting on them.
export const MOOD_LIFT = 0.10;

export function moodLift(roomId) {
  return isHealed(roomId) ? MOOD_LIFT : 0;
}

// ---------------------------------------------------------------------------
// 4 · THE FLOWERS
// ---------------------------------------------------------------------------
// A cave heals into luminescence, not into a lawn — the same distinction
// js/rooms.js already draws between healedSprouts and healedGlowmoss, kept
// here rather than re-decided per region.
const FLORA = {
  ember: ['./assets/env/flower-a.glb', './assets/env/flower-b.glb', './assets/env/bush-large.glb'],
  stone: ['./assets/env/mushroom-group.glb', './assets/env/mushroom-tall.glb'],
  wild: ['./assets/env/flower-a.glb', './assets/env/flower-b.glb', './assets/env/bush-large.glb'],
  frost: ['./assets/env/flower-a.glb', './assets/env/bush-large.glb'],
  storm: ['./assets/env/flower-b.glb', './assets/env/bush-large.glb'],
  vale: ['./assets/env/flower-a.glb', './assets/env/bush-large.glb'],
  court: ['./assets/env/flower-b.glb', './assets/env/bush-large.glb'],
};
const LEAF = 0x4e9a4a, STEM = 0x8a6a48;

// The room blooms the SAME WAY every time it is walked into. A room that
// re-scatters its flowers on every visit is a room that flickers, and a child
// who leaves and comes straight back would see the meadow rearrange itself.
function seeded(roomId) {
  let h = 2166136261;
  for (let i = 0; i < roomId.length; i++) { h ^= roomId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; };
}

// WOULD A BODY FIT HERE? The overlap test verify-spawn-clear and
// probe-freespot both use — NOT resolveCircle, which answers the weaker
// question "would a body be pushed off this point" and cannot push a body out
// of a circle it is exactly centred in. A flower has no collider and cannot
// trap anybody, but one growing through a wall or out of a chest is the
// visual-and-positional class of bug that dad's play-testing keeps finding.
function freeAt(world, x, z, r) {
  for (const c of world.boxColliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
  }
  for (const c of world.circleColliders) {
    if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return false;
  }
  return true;
}

const BLOOM_MAX = 14;     // per room
const BLOOM_CLEAR = 0.8;  // u of clear ground a bloom wants around it

// Somewhere clear, spread out, and away from the walls. `salt` keeps the live
// moment's spots from landing on the static bloom's, so a room that plays its
// restoration and is then walked back into does not put the second meadow
// exactly on top of the first.
function pickSpots(world, max, kinds, salt) {
  const rnd = seeded(world.roomId + ':' + salt);
  const spots = [];
  for (let tries = 0; tries < 400 && spots.length < max; tries++) {
    const x = (rnd() * 2 - 1) * (world.halfW - 1.6);
    const z = (rnd() * 2 - 1) * (world.halfD - 1.6);
    if (!freeAt(world, x, z, BLOOM_CLEAR)) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 1.8)) continue;
    spots.push({ x, z, ry: rnd() * Math.PI * 2, k: Math.floor(rnd() * kinds.length) });
  }
  return spots;
}

// INSTANCED, one group per model — a roomful of flowers costs a draw call per
// material, not per flower. The 125-call budget is game-wide and the healed
// rooms have to fit inside it exactly as the unhealed ones do.
async function plant(world, kinds, spots, scaleOf) {
  const gltfs = await Promise.all(kinds.map((u) => loadGLB(u)));
  const tints = { grass: LEAF, foliage: LEAF, leafsGreen: LEAF, dirt: STEM, woodBark: STEM };
  const groups = [];
  for (let k = 0; k < kinds.length; k++) {
    const mine = spots.filter((s) => s.k === k);
    if (!mine.length) continue;
    const isShroom = kinds[k].includes('mushroom');
    const g = instancePlacements(gltfs[k].scene, mine.map((s) => ({
      x: s.x, z: s.z, ry: s.ry, sx: scaleOf(s), sy: scaleOf(s), sz: scaleOf(s),
    })), { castShadow: false, materialTints: isShroom ? null : tints });
    if (isShroom) {
      // Stoneroot's regrowth LIGHTS UP (js/rooms.js healedGlowmoss). One
      // shared emissive on the instanced material, no per-cluster lights: a
      // cave full of point lights is a cave that drops frames on a tablet.
      g.traverse((n) => {
        if (!n.isMesh || !n.material.emissive) return;
        n.material = n.material.clone();
        n.material.emissive.setHex(0x7ee787);
        n.material.emissiveIntensity = 0.8;
      });
    }
    world.add(g);   // decoration only — no colliders, kids walk through flowers
    groups.push({ g, mine });
  }
  return groups;
}

export async function bloom(world) {
  const key = healKeyOf(world.roomId);
  if (!key || !isHealed(world.roomId) || !world.halfW) return 0;
  const kinds = FLORA[key];
  if (!kinds) return 0;
  const spots = pickSpots(world, BLOOM_MAX, kinds, 'bloom');
  if (!spots.length) return 0;
  await plant(world, kinds, spots, (s) => 1.1 + (s.ry % 0.4));
  world.markers.bloomSpots = spots.map((s) => ({ x: s.x, z: s.z }));
  return spots.length;
}

// ---------------------------------------------------------------------------
// THE MOMENT ITSELF
// ---------------------------------------------------------------------------
// Ember and Stoneroot have had a WITNESSED restoration since they were built —
// green rising round the player's feet while they stand in the arena they just
// won (js/rooms.js emberRestorationLive / stoneRestorationLive). The other five
// regions had a background colour change on the next rebuild and nothing else,
// which means five of the seven biggest moments in the game happened off
// screen. This is the same beat, generalised, so every region gets one.
//
// It grows the INSTANCE MATRICES rather than a model per flower: the whole
// meadow is still one draw call per material while it is coming up, which is
// what makes it affordable in an arena that has just finished a boss fight.
const LIVE_SECONDS = 9;

export async function healLive(world) {
  const key = healKeyOf(world.roomId);
  if (!key || !isHealed(world.roomId) || !world.halfW) return 0;
  if (world.markers.restorationPlayed) return 0;   // ember/stone play their own
  const kinds = FLORA[key];
  if (!kinds) return 0;
  const spots = pickSpots(world, 10, kinds, 'live');
  if (!spots.length) return 0;

  const groups = await plant(world, kinds, spots, () => 0.001);
  for (const { g } of groups) world.keepLoose(g);
  spots.forEach((s, i) => { s.delay = 0.6 + i * 0.5; s.target = 1.15 + (s.ry % 0.35); });

  const dummy = new THREE.Object3D();
  let t = 0;
  world.onAnimate((tt, dt) => {
    if (t > LIVE_SECONDS) return;
    t += dt;
    for (const { g, mine } of groups) {
      g.traverse((n) => {
        if (!n.isInstancedMesh) return;
        mine.forEach((s, i) => {
          const p = Math.min(1, Math.max(0, (t - s.delay) / 1.2));
          const e = 1 - (1 - p) * (1 - p);              // ease out, slight pop
          const sc = Math.max(0.001, s.target * (e * 1.08 - 0.08 * e * e));
          dummy.position.set(s.x, 0, s.z);
          dummy.rotation.set(0, s.ry, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          n.setMatrixAt(i, dummy.matrix);
        });
        n.instanceMatrix.needsUpdate = true;
      });
    }
  });
  world.markers.restorationPlayed = true;
  world.markers.bloomSpots = spots.map((s) => ({ x: s.x, z: s.z }));
  return spots.length;
}

// ---------------------------------------------------------------------------
// 5 · THE ANIMALS
// ---------------------------------------------------------------------------
// Where an enemy stood, a wolf grazes. wolf.gltf is the game's OWN animal —
// the pups are made of it, Kael turns into one — and it ships Eating, Idle,
// Idle_2_HeadLow and Walk, which is a whole grazing life without a single new
// asset or a line of procedural geometry (CLAUDE.md).
//
// They have NO COLLIDER, exactly like Biscuit in the Den. A healed room must
// not be a room a child can be shoved around in, and a wandering body with a
// collider is a wandering obstacle: the one thing worse than an enemy in a
// place that is supposed to be safe.
const HERD_MAX = 4;

// A pack takes its coat from the country it lives in — the same tint-delta
// idiom VARIANTS uses for enemies, applied to the one Main material.
const COAT = {
  ember: 0xb9855c, stone: 0x8f8b80, wild: 0x7d8f5c, frost: 0xdfe8f2,
  storm: 0x9aa6b4, vale: 0x8fb0ac, court: 0xa79ec2,
};

export async function graze(world, spots) {
  if (!spots || !spots.length) return 0;
  const key = healKeyOf(world.roomId);
  const gltf = await loadGLB('./assets/chars/wolf.gltf');
  const herd = [];
  const rnd = seeded(world.roomId + ':graze');
  for (const s of spots.slice(0, HERD_MAX)) {
    const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    // Pups are wolves at 0.42; these are the grown pack, a little bigger, and
    // a little different from each other so a herd does not read as a stamp.
    model.scale.setScalar(0.52 + rnd() * 0.12);
    model.position.set(s.x, 0, s.z);
    model.rotation.y = rnd() * Math.PI * 2;
    if (COAT[key]) {
      model.traverse((n) => {
        if (!n.isMesh || n.material.name !== 'Main') return;
        n.material = n.material.clone();
        n.material.color.setHex(COAT[key]);
      });
    }
    world.add(model);
    world.keepLoose(model);          // it walks; flattenStatic must not fold it
    const mixer = new THREE.AnimationMixer(model);
    const clips = {};
    for (const name of ['Idle', 'Idle_2_HeadLow', 'Eating', 'Walk']) {
      const c = gltf.animations.find((a) => a.name === name);
      if (c) clips[name] = mixer.clipAction(c);
    }
    herd.push({
      model, mixer, clips, current: null,
      home: { x: s.x, z: s.z }, target: null,
      state: 'graze', waitT: 0.5 + rnd() * 3, rnd,
    });
  }
  world.grazers = herd;
  world.updateGrazers = (dt, t, player) => updateHerd(world, dt, player);
  return herd.length;
}

function playClip(a, name, fade = 0.3) {
  const next = a.clips[name];
  if (!next || a.current === next) return;
  next.reset().play();
  if (a.current) a.current.crossFadeTo(next, fade, false);
  a.current = next;
}

// Graze, wander a couple of paces, graze again — and look up when Kael comes
// near, which is the whole point of them. They never approach and never flee:
// a child who has spent the region being charged at gets to walk through a
// field of animals that simply do not mind.
function updateHerd(world, dt, player) {
  const px = player.root.position.x, pz = player.root.position.z;
  for (const a of world.grazers) {
    a.mixer.update(dt);
    const pos = a.model.position;
    const near = (px - pos.x) ** 2 + (pz - pos.z) ** 2 < 3.2 * 3.2;
    if (a.state === 'walk' && a.target) {
      const tx = a.target.x - pos.x, tz = a.target.z - pos.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.12) {
        a.state = 'graze';
        a.waitT = 2.5 + a.rnd() * 4;
      } else {
        playClip(a, 'Walk');
        pos.x += (tx / dist) * 0.85 * dt;
        pos.z += (tz / dist) * 0.85 * dt;
        turn(a.model, Math.atan2(tx, tz), 4, dt);
      }
      continue;
    }
    // heads down to feed, up and toward him when he is close
    playClip(a, near ? 'Idle' : (a.waitT % 2 < 1 ? 'Eating' : 'Idle_2_HeadLow'));
    if (near) turn(a.model, Math.atan2(px - pos.x, pz - pos.z), 2.5, dt);
    a.waitT -= dt;
    if (a.waitT <= 0) {
      // Never further than a couple of paces from where it started, so a herd
      // cannot drift across a room and end up inside the scenery.
      //
      // SIX TRIES, THEN STAY PUT. The first cut took one guess and fell back
      // to "walk to where you already are" — which arrives instantly, resets
      // the timer and moves nobody, so a dressed room could hold a herd that
      // never took a step. verify-healing §7 caught exactly that: three
      // animals, six seconds, zero displacement between them.
      let target = null;
      for (let i = 0; i < 6 && !target; i++) {
        const ang = a.rnd() * Math.PI * 2, r = 0.7 + a.rnd() * 1.5;
        const tx = a.home.x + Math.cos(ang) * r, tz = a.home.z + Math.sin(ang) * r;
        if (freeAt(world, tx, tz, 0.4)) target = { x: tx, z: tz };
      }
      if (target) { a.target = target; a.state = 'walk'; } else a.waitT = 1.5;
    }
  }
}

function turn(model, want, rate, dt) {
  let d = want - model.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  model.rotation.y += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
}
