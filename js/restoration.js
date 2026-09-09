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

function pupsHomeFor(key) {
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
const HEARTH_SOLID = new Set(['hearth', 'hut']);

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
