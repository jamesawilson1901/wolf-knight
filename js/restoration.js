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
import { regionOf, state } from './state.js';
import { PUP_HOME } from './pip.js';
import { ownsTreasure } from './treasures.js';
import { loadVillageKit, placeOne } from './levelVillage.js';
import { characterNpc, SETTLER_POSTS } from './npcs.js';
import { juice } from './juice.js';
import { audio } from './audio.js';
import { flattenStatic } from './batch.js';
import { bumpCounter } from './progress.js';

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
// THE GROWTH STAGE — design/WIDER-WORLD.md §1.2.
// ---------------------------------------------------------------------------
// The Great Vault is already a function of `WS.stage('vault')` and the
// Village square already reads `guardiansDown()` 0-6 into a continuous look —
// so the machinery for "a room that rebuilds differently on every return" is
// proven twice. What was missing was a stage number for the seven healing
// regions and a room in each that reads it.

// The keepsake found on the road OUT of a region — the deed a child does
// AFTER healing it, which is why it is the third fact rather than the first.
// The Court has no road out (`xth` is the ending, not a door), so its third
// fact is its own: all four relics found, the same test that already opens
// its throne stair (js/main.js, `WS.get('court','relic_'+name)`).
export const KEEPSAKE = {
  ember: 'wayfarers_key', stone: 'rootstone', wild: 'sealed_map',
  frost: 'frozen_tear', storm: 'harbour_key', vale: 'moon_coin',
};
export const COURT_RELICS = ['ember', 'thorn', 'tide', 'moon'];

export function pupsHomeFor(key) {
  const ids = Object.keys(PUP_HOME).filter((id) => PUP_HOME[id] === key);
  return ids.length > 0 && ids.every((id) => state.flags.pups[id]);
}

function keepsakeFoundFor(key) {
  if (key === 'court') return COURT_RELICS.every((n) => WS.get('court', 'relic_' + n));
  return !!KEEPSAKE[key] && ownsTreasure(KEEPSAKE[key]);
}

// FIVE FACTS, COUNTED INDIVIDUALLY — NOT front-to-back the way `WS.stage()`
// counts everything else. Two of the four early drafts of this plan tried
// `WS.stage()`'s strict count, which stops dead at the first gap in the
// list — and both drafts had to admit the consequence out loud: a child who
// clears the region's dungeon (§2) before finding its road keepsake would
// sit at a LOWER stage than what they have actually done, with the dungeon's
// own payoff invisible. That is an ordering rule nobody can see, in a game
// built for someone who cannot read one if it were written down.
//
// So every fact is a separate `if`, and the count is a plain sum. Every fact
// is already written by a system that existed before this file did (the boss
// branches, `spawnPups`'s collection, `treasures.js`'s `addTreasure`, and —
// once §2 ships — the dungeon's own `WS.complete`), so an OLD SAVE reads the
// right stage on its very first entry: nothing in js/save.js changes for
// this, and nothing here can regress a stage a save has already earned.
export function growthStage(key) {
  if (!key) return 0;
  let n = 0;
  if (WS.get(key, 'restored')) n++;
  if (pupsHomeFor(key)) n++;
  if (keepsakeFoundFor(key)) n++;
  if (WS.get(key, 'dungeon')) n++;
  if (state.flags.grimmFreed) n++;
  return n;
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

// AT STAGE 4, THE GREEN GOES FURTHER. `js/ground.js` has carried a `blossom`
// patch kind — pink, fallen petals, the Bloomfall's own colour — since it was
// written, with nothing in the game ever asking for it. It is where 'grass'
// and 'moss' go once a region has done more than just heal: the region's
// dungeon cleared on top of the pups home and the keepsake found. Water is
// left alone; a healed pool does not become a flower bed.
const DEEP_BLOOM = new Set(['grass', 'moss']);

export function healPatches(patches, roomId) {
  if (!patches || !patches.length) return patches;
  const stage = growthStage(healKeyOf(roomId));
  if (!stage) return patches;
  return patches.map((p) => {
    if (!HEALED_PATCH[p.kind]) return p;
    let kind = HEALED_PATCH[p.kind];
    if (stage >= 4 && DEEP_BLOOM.has(kind)) kind = 'blossom';
    return { ...p, kind };
  });
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
const MOOD_LIFT_STEP = 0.02;   // per stage past the first
const MOOD_LIFT_CAP = 0.16;    // Frostpeak stays a cold mountain; the Court stays dark

// SCALES WITH STAGE — a region that has done more than just heal is lit a
// little more than one that only just did. Capped well short of "bright":
// Frostpeak is still a cold mountain and the Shadow Court is still the
// darkest place in the game at every stage; they are simply, gradually, less
// lit as if something were sitting on them.
export function moodLift(roomId) {
  const stage = growthStage(healKeyOf(roomId));
  if (!stage) return 0;
  return Math.min(MOOD_LIFT_CAP, MOOD_LIFT + MOOD_LIFT_STEP * (stage - 1));
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

const BLOOM_CLEAR = 0.8;  // u of clear ground a bloom wants around it

// THICKENS WITH STAGE (design/WIDER-WORLD.md §1.4), before a single settler
// exists: a freshly-healed region — restored, nothing else done yet — is a
// sparser meadow than one where the child has also brought its pups home,
// found its keepsake, cleared its dungeon and freed Grimm. Recovery deepens
// with what has actually been done, the same law the settler and the hearth
// furniture follow later in this file.
function bloomMaxFor(stage) {
  if (stage <= 1) return 8;
  if (stage === 2) return 12;
  if (stage === 3) return 16;
  return 18; // stage 4 and 5
}

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
  const stage = growthStage(key);
  if (!key || !stage || !world.halfW) return 0;
  const kinds = FLORA[key];
  if (!kinds) return 0;
  const spots = pickSpots(world, bloomMaxFor(stage), kinds, 'bloom');
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
// THICKENS WITH STAGE, same law as `bloomMaxFor` above.
function herdMaxFor(stage) {
  if (stage <= 1) return 2;
  if (stage === 2) return 3;
  return 4; // stage 3 and beyond
}

// A pack takes its coat from the country it lives in — the same tint-delta
// idiom VARIANTS uses for enemies, applied to the one Main material.
export const COAT = {
  ember: 0xb9855c, stone: 0x8f8b80, wild: 0x7d8f5c, frost: 0xdfe8f2,
  storm: 0x9aa6b4, vale: 0x8fb0ac, court: 0xa79ec2,
};

export async function graze(world, spots) {
  if (!spots || !spots.length) return 0;
  const key = healKeyOf(world.roomId);
  const gltf = await loadGLB('./assets/chars/wolf.gltf');
  const herd = [];
  const rnd = seeded(world.roomId + ':graze');
  for (const s of spots.slice(0, herdMaxFor(growthStage(key)))) {
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

// A ONE-SHOT, unlike playClip's continuous locomotion loop — the pen's pet
// verb plays a jump then a landing, once each, never repeating mid-gesture
// the way Walk/Eating/Idle are meant to.
function playOnce(a, name, fade) {
  const next = a.clips[name];
  if (!next) return;
  next.setLoop(THREE.LoopOnce, 1);
  next.clampWhenFinished = true;
  next.reset().play();
  if (a.current) a.current.crossFadeTo(next, fade, false);
  a.current = next;
}

// Graze, wander a couple of paces, graze again — and look up when Kael comes
// near, which is the whole point of them. They never approach and never flee:
// a child who has spent the region being charged at gets to walk through a
// field of animals that simply do not mind.
export function updateHerd(world, dt, player) {
  const px = player.root.position.x, pz = player.root.position.z;
  for (const a of world.grazers) {
    a.mixer.update(dt);
    const pos = a.model.position;
    if (a.petCooldown) a.petCooldown = Math.max(0, a.petCooldown - dt);

    // PET: only pen pups (`canPet`) offer this — a one-shot celebration when
    // Kael walks up close, no state kept past the animation itself. §3.1's
    // "the first pet verb, no state": a toy, not a system, repeatable
    // forever, and it never touches a save.
    if (a.canPet && a.state !== 'pet' && a.state !== 'eat' && !a.petCooldown
      && (px - pos.x) ** 2 + (pz - pos.z) ** 2 < 0.6 * 0.6) {
      a.state = 'pet'; a.petT = 1.1; a.petPhase = 0;
      playOnce(a, 'Gallop_Jump', 0.1);
      audio.play('pup-chime', { volume: 0.6, rate: 1.1 });
      // v3.132: the pet verb still keeps no state of its own past the
      // animation (§3.1's "a toy, not a system" — a pup can be petted the
      // same way forever); the STICKER BOOK is the one thing allowed to
      // count it, the same way it counts kills without the fight itself
      // remembering how many there have been.
      bumpCounter('pupsPetted');
    }
    if (a.state === 'pet') {
      a.petT -= dt;
      if (a.petT <= 0.7 && a.petPhase === 0) { a.petPhase = 1; playOnce(a, 'Jump_ToIdle', 0.15); }
      if (a.petT <= 0) { a.state = 'graze'; a.waitT = 1 + a.rnd() * 2; a.petCooldown = 2.5; }
      continue;
    }
    // EAT: the trough's group call (js/restoration.js spawnPupPen) — gallop
    // to a spot round the trough, eat a moment, wander off on its own again.
    if (a.state === 'eat') {
      const ex = a.eatSpot.x - pos.x, ez = a.eatSpot.z - pos.z;
      const dist = Math.hypot(ex, ez);
      if (dist > 0.15) {
        playClip(a, 'Gallop');
        pos.x += (ex / dist) * 1.6 * dt; pos.z += (ez / dist) * 1.6 * dt;
        turn(a.model, Math.atan2(ex, ez), 5, dt);
      } else {
        playClip(a, 'Eating');
        a.eatT -= dt;
        if (a.eatT <= 0) { a.state = 'graze'; a.waitT = 1 + a.rnd() * 2; }
      }
      continue;
    }
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

// ---------------------------------------------------------------------------
// THE SETTLERS — design/WIDER-WORLD.md §1.5.
// ---------------------------------------------------------------------------
// Four KayKit humanoids are already somebody in the Den (Wren, Rook, Bram,
// Tam) on the same Rig_Medium skeleton, so a settler is that same idiom
// applied to a hearth: clone the one shared material and colour-wash it,
// rather than a new face for every region. `SETTLER_POSTS` (js/npcs.js)
// carries the body, the tint and the growth key per hearth room; this file
// owns WHEN one appears, because that is a question about a stage number,
// which is a question about the save — not about who stands where.
//
// STAGE_CLUTTER carries the FURNITURE, additive per stage: everything up to
// and including the reached stage is placed, so a room dressed at stage 3
// is a strict superset of the same room at stage 2. Rows are
// `[key, x, z, scale, ry]` in the village pack's own vocabulary
// (`js/levelVillage.js` `loadVillageKit`'s key names) — the same pack every
// hearth in the game will draw its fire, stool and hut from, which is why
// `loadVillageKit()` runs from a non-Village room without apology: those 21
// GLBs have been in the precache since v3.126 for exactly this.
//
// Only the hearth and the hut get a collider — a stool and a stack of
// firewood are ankle height, and a child should be able to walk straight
// through a fireside without the game stopping them.
// v3.131: 'cart' joins the solid set for the same reason `levelVillage.js`'s
// own SOLID_PROPS treats it as one — a loaded cart is not a thing a body
// walks through. 'target' and 'manikin' match the Den's own precedent
// (js/rooms.js: an armour stand and a straw target both got colliders there,
// "budget, written down because it is tight" — same shapes, same call here).
const HEARTH_SOLID = new Set(['hearth', 'hut', 'cart', 'target', 'manikin']);

export const STAGE_CLUTTER = {
  la: {
    2: [
      ['hearth', -2.3, 7.6, 1.0, 0.4],
      ['stool', -3.5, 8.1, 0.8, 1.1],
    ],
    3: [
      ['hut', -7.0, 8.6, 0.95, 2.3],
      ['laundry', -1.3, 8.7, 1.0, -0.5],
      ['firewood', -4.2, 8.6, 1.0, 0.3],
    ],
    // THE YARD (v3.131, design/WIDER-WORLD.md §1.4 stage 4): the cart Maren
    // sent ahead, and the target + manikin that make the settler's new trade
    // legible without a word — the same two props and the same reasoning the
    // Den's own Armoury pitch already uses (js/rooms.js). The cart's own spot
    // is `SETTLER_POSTS.la.shop` below; walking up to it opens the same
    // Moonlit Trading Post the Den's cart does, at the rung already unlocked
    // — there is no second shop to stock.
    4: [
      ['target', 0.3, 8.0, 1.0, 0.5],
      ['manikin', 1.6, 7.0, 1.0, -0.4],
      ['cart', 3.0, 8.0, 1.0, -0.3],
      ['sack', 3.9, 7.4, 1.0, 0.6],
    ],
  },
  // v3.135: Stoneroot's own hearth, in the Great Vault (`vh`). Old Bram's
  // camp (`coldHearth`, js/level2.js) is "the only warm thing in the room"
  // while Stone is unhealed — this is the region growing a second one, not a
  // contradiction of that line. Measured clear via tools/probe-freespot.mjs's
  // own live-grid method against the room at its own fullest build (WS.stage
  // 'vault' 3) in the open pocket east of the sunken ring, well clear of
  // Bram's camp (-8, 6.6), the beacon, the crypt ramp and ring props.
  vh: {
    2: [
      ['hearth', 11.5, 0.8, 1.0, 0.4],
      ['stool', 13.2, 1.3, 0.8, 1.1],
    ],
    3: [
      ['hut', 15.5, 2.0, 0.95, 2.3],
      ['laundry', 12.0, 3.3, 1.0, -0.5],
      ['firewood', 14.0, -0.5, 1.0, 0.3],
    ],
    4: [
      ['target', 16.5, 0.5, 1.0, 0.5],
      ['manikin', 15.0, 4.0, 1.0, -0.4],
      ['cart', 11.0, -1.0, 1.0, -0.3],
      ['sack', 10.3, -1.6, 1.0, 0.6],
    ],
  },
  // v3.135: the Wild Woods' own hearth, at `t1a`'s existing `restSpot`
  // (-7, 4) — measured clear of the mossy ruin, the thicket and the log-down
  // chord's own 'w' door the same live-grid way.
  t1a: {
    2: [
      ['hearth', -7.0, 4.5, 1.0, 0.4],
      ['stool', -8.3, 3.5, 0.8, 1.1],
    ],
    3: [
      ['hut', -9.3, 5.5, 0.95, 2.3],
      ['laundry', -6.3, 5.8, 1.0, -0.5],
      ['firewood', -8.8, 2.8, 1.0, 0.3],
    ],
    4: [
      ['target', -6.5, 3.0, 1.0, 0.5],
      ['manikin', -9.5, 3.5, 1.0, -0.4],
      ['cart', -6.8, 6.3, 1.0, -0.3],
      ['sack', -8.0, 6.8, 1.0, 0.6],
    ],
  },
  // v3.139: Frostpeak's own hearth, at f1 — a clear pocket east of the gate
  // lane, clear of the gateposts, the hound pack, the drift/firs clusters
  // and the spur path to f1b, measured the same live-grid way.
  f1: {
    2: [
      ['hearth', 9.5, 5.0, 1.0, 0.4],
      ['stool', 10.5, 5.5, 0.8, 1.1],
    ],
    3: [
      ['hut', 11.0, 7.0, 0.95, 2.3],
      ['laundry', 9.0, 7.5, 1.0, -0.5],
      ['firewood', 10.0, 4.0, 1.0, 0.3],
    ],
    4: [
      ['target', 11.0, 5.0, 1.0, 0.5],
      ['manikin', 9.0, 8.5, 1.0, -0.4],
      ['cart', 10.5, 8.0, 1.0, -0.3],
      ['sack', 9.5, 9.0, 1.0, 0.6],
    ],
  },
  // v3.140: the Spire's own hearth, at s1a — a clear pocket in the Landing's
  // NE corner, clear of the gatehouse (0,0), the sea-cave gate/promise (west
  // wall), the wayshrine (12.5,3.5), the cartwreck (8.5,7) and the moss
  // patch, measured the same live-grid way.
  s1a: {
    2: [
      ['hearth', 11.0, 7.0, 1.0, 0.4],
      ['stool', 12.0, 7.5, 0.8, 1.1],
    ],
    3: [
      ['hut', 12.5, 9.0, 0.95, 2.3],
      ['laundry', 10.5, 9.5, 1.0, -0.5],
      ['firewood', 12.0, 6.5, 1.0, 0.3],
    ],
    4: [
      ['target', 12.5, 7.0, 1.0, 0.5],
      ['manikin', 10.5, 10.0, 1.0, -0.4],
      ['cart', 12.0, 9.5, 1.0, -0.3],
      ['sack', 11.0, 10.5, 1.0, 0.6],
    ],
  },
  // v3.141: the Vale's own hearth, at d1a — the Shallows' dry NE corner
  // (the region's west half is lagoon), clear of the gatehouse, the
  // rest/travel spots and the shore dressing, same pocket shape as s1a's.
  d1a: {
    2: [
      ['hearth', 11.0, 7.0, 1.0, 0.4],
      ['stool', 12.0, 7.5, 0.8, 1.1],
    ],
    3: [
      ['hut', 12.5, 9.0, 0.95, 2.3],
      ['laundry', 10.5, 9.5, 1.0, -0.5],
      ['firewood', 12.0, 6.5, 1.0, 0.3],
    ],
    4: [
      ['target', 12.5, 7.0, 1.0, 0.5],
      ['manikin', 10.5, 10.0, 1.0, -0.4],
      ['cart', 12.0, 9.5, 1.0, -0.3],
      ['sack', 11.0, 10.5, 1.0, 0.6],
    ],
  },
  // v3.142: the Court's own hearth, at x1 — the same NE pocket as the last
  // three, clear of the watcher/gold-chest lock (west wall), the rest/travel
  // spots and the corruption/rubble patches. `firewood` moved half a unit
  // (6.5→7.0) from the other five hearths' shared offset: this room's own
  // scatter/breakables land one cell differently at that exact spot.
  x1: {
    2: [
      ['hearth', 11.0, 7.0, 1.0, 0.4],
      ['stool', 12.0, 7.5, 0.8, 1.1],
    ],
    3: [
      ['hut', 12.5, 9.0, 0.95, 2.3],
      ['laundry', 10.5, 9.5, 1.0, -0.5],
      ['firewood', 12.0, 7.0, 1.0, 0.3],
    ],
    4: [
      ['target', 12.5, 7.0, 1.0, 0.5],
      ['manikin', 10.5, 10.0, 1.0, -0.4],
      ['cart', 12.0, 9.5, 1.0, -0.3],
      ['sack', 11.0, 10.5, 1.0, 0.6],
    ],
  },
};

// Place one stage's worth of furniture (already-loaded kit, one call per
// prop). Returns the placed groups so a first-time grow-in can tween them.
function placeStageClutter(world, kit, key, x, z, s, ry, tint) {
  const gltf = kit[key];
  if (!gltf) return null;
  const g = placeOne(world, gltf, key, x, z, s, ry, tint);
  if (g && HEARTH_SOLID.has(key)) world.addCircle(x, z, 0.7 * s);
  return g;
}

// THE SETTLER ARRIVES A BEAT AFTER THE FURNITURE, the same shape
// `summonWayfarer` (js/main.js) uses for Tam: a short delay so a doorway, a
// shard shower and a person do not all land in the same frame, then a burst
// in their own tint and the moonstone's chime.
function summonSettler(world, post) {
  let comeIn = 2.6;
  world.onAnimate((tNow, dt) => {
    if (comeIn <= 0) return;
    comeIn -= dt || 0.016;
    if (comeIn > 0) return;
    for (let i = 0; i < 8; i++) {
      juice.burst(post.x + (Math.random() * 2 - 1) * 0.6, 0.3 + Math.random() * 1.2,
        post.z + (Math.random() * 2 - 1) * 0.6, post.tint, 6);
    }
    audio.play('form-switch', { volume: 0.55, rate: 1.05 });
  });
}

// Called from `setupRoomExtras` (js/main.js) BEFORE `bloom()`, so a bloom
// picking spots for itself sees the hearth's collider and never lands one in
// the fire. Growth is read at build: every fact that raises a stage is set
// somewhere OTHER than the hearth (pups in their own rooms, the keepsake on
// the road out, the dungeon under its own gate, Grimm at the Spire), so by
// construction the child is elsewhere when the world changes and sees it on
// the next visit — the Terranigma law, made mechanical rather than promised.
//
// `onGrowIn(key, stage)` is provided by the caller because narration's
// singleton instance lives in js/main.js, not here — the same reason
// `spawnPups` takes an `onCollected` callback instead of importing narration
// itself.
export async function spawnSettlers(world, onGrowIn) {
  const post = SETTLER_POSTS[world.roomId];
  if (!post || world.settler) return;
  const stage = growthStage(post.key);
  if (stage < post.minStage) return;

  const kit = await loadVillageKit();
  const rigAnims = (await loadGLB('./assets/anims/rig-medium-general.glb')).animations;
  const gltf = await loadGLB(post.file);
  const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
  model.scale.setScalar(0.5);
  // ONE material wash, the Tam idiom: whichever KayKit body this is, its
  // whole figure sits on one shared atlas, so one clone-and-multiply colours
  // all of it and nothing else in the room.
  model.traverse((n) => {
    if (!n.isMesh) return;
    n.material = n.material.clone();
    n.material.color.setHex(post.tint);
  });
  world.addCircle(post.x, post.z, 0.35); // solid, like every other friend
  world.settler = characterNpc(world, {
    model, id: post.id, x: post.x, z: post.z, ry: post.ry,
    rigAnims, gestureName: 'Idle_B',
  });
  world.markers.settlerSpot = { x: post.x, z: post.z };
  // THE YARD OPENS FOR TRADE (v3.131): the same generic shopSpot check
  // main.js already runs for the Den's own cart (`nearSpot` + `menus.showShop()`)
  // — no room check in that path, so handing it a marker here is the whole
  // feature. `shopWasNear` is reset to true right after this by
  // `setupRoomExtras`, so walking in does not pop the shelf on arrival.
  if (stage >= 4 && post.shop) world.markers.shopSpot = { x: post.shop.x, z: post.shop.z };

  // THE FURNITURE, additive up to the reached stage. `firstTime` groups are
  // only the ones this exact visit is placing for the first time this stage
  // reveal (i.e. every stage's rows, since a fresh build always starts from
  // nothing) — the `seen_N` gate below decides whether that counts as NEW to
  // the SAVE, which is the only thing that should ever play a fanfare twice.
  const rows = STAGE_CLUTTER[world.roomId] || {};
  const placed = [];
  for (let s = 2; s <= stage; s++) {
    for (const [key, x, z, sc, ry] of (rows[s] || [])) {
      const g = placeStageClutter(world, kit, key, x, z, sc, ry,
        key === 'hut' ? post.tint : 0xffffff);
      if (g) placed.push(g);
    }
  }
  // This furniture lands after the room's own build-time `flattenStatic()`
  // pass, so none of it was folded into that batch — each small GLB's own
  // materials would otherwise stay separate draw calls forever. A second
  // `flattenStatic()` here is safe: it skips content already flagged
  // `isBatchedMesh` (the room's existing merge), so it only ever touches
  // this new clutter, and its `contactShadows()` sub-step's own size filter
  // means these small props pick up a shadow instead of the whole room
  // being reprocessed.
  if (placed.length) flattenStatic(world);

  if (!WS.get(post.key, 'seen_' + stage)) {
    WS.set(post.key, 'seen_' + stage, true);
    summonSettler(world, post);
    if (onGrowIn) onGrowIn(post.key, stage);
  }
}

// ---------------------------------------------------------------------------
// THE PUP PEN — design/WIDER-WORLD.md §3.1, slice v3.128.
// ---------------------------------------------------------------------------
// REPLACES js/rooms.js's old "every rescued pup orbits a fixed grid" loop.
// Measured, the old loop had two faults, not one: a save with 24 pups cost
// ~120 extra draw calls in a room whose ceiling is 135 (each pup its own
// unbatched skinned mesh plus its own shadow), and its own orbit centres
// (`cz = 3.0 + floor(i/3)*2.2`) put pup 24 at z=18.4 — nine and a half units
// past the north wall at halfD=9, standing in the void. Nobody saw either
// fault because no playtest has had more than a handful of pups home at
// once.
//
// The pen nets the Den down before anything else is added there: AT MOST
// SIX pups are ever a live skinned body, reusing the exact wander/graze
// state machine the healed regions' herds already use (`updateHerd` above,
// extended with two more states rather than forked). Every OTHER rescued
// pup is a difference in which BED PROPS exist — an instanced, unbatched
// static mesh, no mixer, no extra draw call once merged — which is also how
// a non-reader reads the count: an empty spot in a row says a pup is still
// lost there, with no number anywhere. "The field is the counter."
const PEN_KEYS = ['ember', 'stone', 'wild', 'frost', 'storm', 'vale', 'court', 'village'];
// COAT (above) has no 'village' entry — the Village is not a healKeyOf
// region and grows no grazing herd of its own — so the pen adds the one
// tint it is missing, in the same warm-neutral family as the rest.
const PEN_COAT = { ...COAT, village: 0xc9a06a };

// Two columns of four rows, each row three bed slots — 24 in total, one per
// PUP_HOME id. Kept well clear of PEN_FENCE (below) on every side: the
// closest slot (x ±2.5) is 1.7u inside the nearest fence line (x ±4.2).
const PEN_ROW_POS = {
  ember: { x: -3.2, z: 2.4 }, stone: { x: -3.2, z: 3.5 },
  wild: { x: -3.2, z: 4.6 }, frost: { x: -3.2, z: 5.6 },
  storm: { x: 3.2, z: 2.4 }, vale: { x: 3.2, z: 3.5 },
  court: { x: 3.2, z: 4.6 }, village: { x: 3.2, z: 5.6 },
};

// The six wander/graze spots and the trough, in the open lane between the
// two bed columns — clear of both (|x| < 1.5) and of the fence.
// Kept clear of js/minigames.js's own fetch-quest ring at (1.6, 4.6) — "the
// ring goes by the meadow where the pups actually play" (its own comment),
// which was true of the old orbit loop's zone and is now true of this one; a
// first pass put two spots and the trough itself close enough to visibly
// overlap it in a contact sheet.
const PEN_SPOTS = [
  { x: -1.2, z: 2.6 }, { x: 1.0, z: 2.4 }, { x: -1.0, z: 3.8 },
  { x: 1.3, z: 3.2 }, { x: -0.8, z: 5.0 }, { x: 0.6, z: 5.4 },
];
const TROUGH = { x: 0, z: 3.0 };

// The fenced rectangle itself (js/npcs.js's DOG_STOPS was moved clear of
// this, 2026-09-09). A gate gap on the south edge, facing the spawn point
// (0, 7.4) so a child walks straight up to it on arrival — matching the
// ground painter's own "fire to the meadow" path (js/rooms.js buildDen,
// `[[0,-1],[1,3],[1,6]]`), which already ends one unit short of here.
//
// minZ moved from 1.2 to 2.0 (2026-09-09): the room's own ariaHome (-2.6,
// 1.0) and borealHome (3.0, 0.6) spirit-lights sit right where the fence's
// first draft put its north wall — verify-den's "none of them is standing
// in the scenery" check caught both. Those two lights are load-bearing
// content from an earlier slice; the pen moved, not them.
export const PEN_FENCE = { minX: -4.4, maxX: 4.4, minZ: 2.0, maxZ: 6.4, gateMinX: 0.1, gateMaxX: 1.9 };

// Which up to six rescued ids are the live, wandering ones THIS visit —
// "chosen by rotating ids per entry so every pup takes turns" (§3.1).
// Bumped once per Den build, so a save with more than six pups sees a
// different six on its next homecoming rather than the same six forever.
function penTurn(ids) {
  if (!ids.length) return [];
  state.counters.penTurn = (state.counters.penTurn || 0) + 1;
  const start = state.counters.penTurn % ids.length;
  return ids.slice(start).concat(ids.slice(0, start)).slice(0, 6);
}

// Growth tiers, additive: at 3/6/12/24 pups home the pen itself grows a
// little more furniture, on top of the beds the pups' own presence already
// places. `Banner_wall` (used elsewhere for dungeon flags) hangs from a
// mount point at its TOP with the cloth extending 2.84u below it — exactly
// what turned it into "a pale slab on the ground" the one other place this
// codebase tried it flat (js/rooms.js's own comment, the Den's main gate).
// A cartwheel trellis reads the same "someone tends this place" note
// without that risk: it is a real prop, grounded, no hanging orientation to
// get wrong.
async function penGrowth(world, kit, n) {
  if (n >= 3) {
    placeOne(world, kit.sack, 'sack', 0.4, 5.9, 0.85, 1.0, 0xffffff);
  }
  if (n >= 6) {
    placeOne(world, kit.laundry, 'laundry', -2.1, 5.9, 0.95, -0.6, 0xffffff);
  }
  if (n >= 12) {
    placeOne(world, kit.cartwheel, 'cartwheel', -3.6, 6.1, 0.7, 0.3, 0xffffff);
    placeOne(world, kit.cartwheel, 'cartwheel', 3.6, 6.1, 0.7, -0.3, 0xffffff);
  }
  if (n >= 24) {
    const torchGltf = await loadGLB('./assets/env/dungeon/Torch.glb');
    world.add(instancePlacements(torchGltf.scene, [
      { x: PEN_FENCE.gateMinX - 0.3, z: PEN_FENCE.maxZ - 0.1, ry: 0.4 },
      { x: PEN_FENCE.gateMaxX + 0.3, z: PEN_FENCE.maxZ - 0.1, ry: -0.4 },
    ], { castShadow: false }));
  }
}

// Called from `setupRoomExtras` (js/main.js) in place of the old orbit loop,
// Den only. `onRowFilled(key)` mirrors `spawnSettlers`'s `onGrowIn` — the
// narration singleton lives in js/main.js, not here.
export async function spawnPupPen(world, onRowFilled) {
  if (world.roomId !== 'den') return;
  // truthy filter, not a bare `Object.keys`: a harness (or a future reset)
  // that ever writes `state.flags.pups[id] = false` must not be counted as
  // rescued — the old orbit loop's `Object.keys` alone would have been.
  const rescued = Object.keys(state.flags.pups).filter((id) => state.flags.pups[id]);
  const n = rescued.length;
  const awake = penTurn(rescued);

  // --- THE FENCE: people blocked, pups not (pups carry no collider at all,
  // the same rule Biscuit and every grazing herd already follow) ----------
  const F = PEN_FENCE;
  world.addBox(F.minX - 0.3, F.minX, F.minZ, F.maxZ);
  world.addBox(F.maxX, F.maxX + 0.3, F.minZ, F.maxZ);
  world.addBox(F.minX, F.maxX, F.minZ - 0.3, F.minZ);
  world.addBox(F.minX, F.gateMinX, F.maxZ, F.maxZ + 0.3);
  world.addBox(F.gateMaxX, F.maxX, F.maxZ, F.maxZ + 0.3);

  // stump.glb measures 0.357 x 0.266 x 0.371 at scale 1 (probed 2026-09-09,
  // same probe-modelsize.mjs check that caught v3.127's oversized hut, this
  // time the opposite mistake) — the campfire seats elsewhere in this room
  // use it near that native size because a seat is SUPPOSED to be small.
  // A fence marker needs to actually be seen: 2.2x brings a post to roughly
  // 0.6-0.8u, a small round waymarker rather than a picket, which is what
  // the collider boxes below are for anyway — these only have to be visible
  // enough that a child reads "something marks this edge."
  const stumpGltf = await loadGLB('./assets/env/stump.glb');
  const posts = [];
  for (let x = F.minX + 0.2; x <= F.maxX - 0.2; x += 1.6) posts.push([x, F.minZ + 0.15]);
  for (let x = F.minX + 0.2; x <= F.maxX - 0.2; x += 1.6) {
    if (x > F.gateMinX - 0.5 && x < F.gateMaxX + 0.5) continue;
    posts.push([x, F.maxZ - 0.15]);
  }
  for (let z = F.minZ + 1.0; z < F.maxZ - 0.3; z += 1.3) {
    posts.push([F.minX + 0.15, z]); posts.push([F.maxX - 0.15, z]);
  }
  world.add(instancePlacements(stumpGltf.scene, posts.map(([x, z]) => ({
    x, z, ry: (x + z) * 0.6, sx: 1.8, sy: 2.2, sz: 1.8,
  })), { castShadow: false, materialTints: {
    grass: 0x7a5c3a, dirt: 0x7a5c3a, colormap: 0x7a5c3a,
    // stump.glb's own name for its trunk material (js/rooms.js's tree tint
    // uses the same key) — missing here left the posts' main surface
    // un-tinted and hard to pick out from the grass in a contact sheet.
    woodBark: 0x6a4c30,
  } }));

  const kit = await loadVillageKit();

  // --- THE TROUGH, and the group "come eat" call --------------------------
  // Trough_1_A measures 3.25u long at scale 1 (tools/probe-modelsize.mjs-style
  // check, 2026-09-09) — sized for the Village's 20+u-wide districts, not an
  // 8.8-wide pen. 0.5 brings it to 1.6u, rotated across the lane rather than
  // along its depth.
  placeOne(world, kit.trough, 'trough', TROUGH.x, TROUGH.z, 0.5, Math.PI / 2, 0xffffff);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.92, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(TROUGH.x, 0.05, TROUGH.z);
  world.add(ring);
  world.markers.troughRing = { x: TROUGH.x, z: TROUGH.z, r: 0.85 };

  // --- THE BEDS: one only for a pup that is actually home. An empty gap in
  // the row is the whole indicator (§3.1's "the field is the counter"),
  // never a number. ---------------------------------------------------
  for (const key of PEN_KEYS) {
    const anchor = PEN_ROW_POS[key];
    const ids = Object.keys(PUP_HOME).filter((id) => PUP_HOME[id] === key);
    const home = ids.every((id) => state.flags.pups[id]);
    ids.forEach((id, i) => {
      if (!state.flags.pups[id]) return;
      placeOne(world, kit.sack, 'sack', anchor.x + (i - 1) * 0.8, anchor.z, 0.6, i * 0.9,
        PEN_COAT[key]);
    });
    if (home && ids.length && !WS.get('pen', 'row_' + key)) {
      WS.set('pen', 'row_' + key, true);
      if (onRowFilled) onRowFilled(key);
    }
  }

  await penGrowth(world, kit, n);

  // Beds and posts land after the room's own build-time `flattenStatic()`
  // pass (js/restoration.js's own settler furniture hit this first, v3.127)
  // — a second call merges same-tint beds and the whole post ring into a
  // handful of draws instead of one each.
  flattenStatic(world);

  // --- THE SIX AWAKE PUPS ---------------------------------------------
  if (!awake.length) return;
  const wolfGltf = await loadGLB('./assets/chars/wolf.gltf');
  const herd = [];
  for (let i = 0; i < awake.length; i++) {
    const id = awake[i];
    const spot = PEN_SPOTS[i];
    const model = prepareCharacter(SkeletonUtils.clone(wolfGltf.scene));
    model.scale.setScalar(0.16);
    model.position.set(spot.x, 0, spot.z);
    model.traverse((m) => {
      if (!m.isMesh) return;
      // small clutter, no shadow (the same rule flattenStatic's own
      // shadowCullBelow applies to static props) — `prepareCharacter`
      // leaves the biggest skinned part casting one, but at scale 0.16 a
      // shadow this small was never going to read as one anyway.
      m.castShadow = false;
      // wolf.gltf is FOUR skinned parts (Main, Main_Light, Nose, Eyes_Black)
      // and skinned meshes never merge (js/batch.js) — six of them at full
      // detail measured 10 draw calls over the Den's own ceiling with every
      // spirit-light and villager also present, the true worst case
      // verify-den's own scan had never actually exercised before this
      // slice (nothing ever set a pup count there). Hiding all three
      // detail parts and keeping only Main brings a pup to its cheapest
      // possible cost, one draw — a handful of polygons at 0.16 scale from
      // the game's fixed camera is not where this room's budget belongs.
      // Hidden HERE ONLY: the field's own uncaught pups and a healed
      // region's herd (never more than four, `herdMaxFor`) render at full
      // detail, where the cost was already priced in.
      if (m.material.name !== 'Main') { m.visible = false; return; }
      m.material = m.material.clone();
      m.material.color.setHex(PEN_COAT[PUP_HOME[id]] || 0xb08a5a);
    });
    world.add(model);
    world.keepLoose(model);
    const mixer = new THREE.AnimationMixer(model);
    const clips = {};
    for (const name of ['Idle', 'Idle_2_HeadLow', 'Eating', 'Walk', 'Gallop', 'Gallop_Jump', 'Jump_ToIdle']) {
      const c = wolfGltf.animations.find((a) => a.name === name);
      if (c) clips[name] = mixer.clipAction(c);
    }
    herd.push({
      model, mixer, clips, current: null, canPet: true, petCooldown: 0,
      home: { x: spot.x, z: spot.z }, target: null,
      state: 'graze', waitT: 0.5 + Math.random() * 3, rnd: Math.random,
    });
  }
  world.grazers = herd;
  world.updateGrazers = (dt, t, player) => {
    if (world.markers.troughRing) {
      const ringM = world.markers.troughRing;
      const inRing = (player.root.position.x - ringM.x) ** 2
        + (player.root.position.z - ringM.z) ** 2 < ringM.r * ringM.r;
      if (inRing && !world._penFedNow) {
        world._penFedNow = true;
        audio.play('pup-chime', { volume: 0.6, rate: 0.9 });
        world.grazers.forEach((a, i) => {
          if (a.state === 'pet') return;
          a.state = 'eat'; a.eatT = 2.4;
          const ang = (i / world.grazers.length) * Math.PI * 2;
          a.eatSpot = { x: TROUGH.x + Math.cos(ang) * 0.5, z: TROUGH.z + Math.sin(ang) * 0.5 };
        });
      } else if (!inRing) world._penFedNow = false;
    }
    updateHerd(world, dt, player);
  };
}
