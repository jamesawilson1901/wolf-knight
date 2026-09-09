// Den villagers — real faces for the home base (GAME-CONTRACT: "the
// settlement has characterful NPCs"). Every villager is a REAL pack model
// (KayKit Adventurers share the Knight's Rig_Medium skeleton, so the
// rig-library clips bind by bone name). The den GROWS as regions heal:
//
//   Wren  (hooded wanderer) — by the far tent from minute one; trades rumors
//   Rook  (the ranger)      — arrives once Ember Hollow is freed
//   Bram  (the old miner)   — climbs up from his cavern camp once the stone
//                             sings again (same Bram as the e1 camp voice)
//   Biscuit (husky)         — the den dog, trotting her rounds since forever
//
// Villagers idle, breathe an occasional gesture, and turn to face Kael when
// he walks up (main calls world.updateNpcs(dt, t, player) each frame).
//
// TAM THE WAYFARER lives down at the bottom of this file. He is the same
// machinery — a pack model, the shared rig clips, the greeting turn — standing
// somewhere other than the Den.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { WS } from './worldstate.js';
import { state } from './state.js';
import { villageCleared } from './levelVillage.js';

// BLIND-STRIP LAW (v3.20): the camera looks north over the den's south wall,
// which hides a ~2u band of floor in front of it. Wren (z 3.2) and Bram
// (z 3.6) both stood inside that band — measured, not guessed — so a kid
// walking up to them saw a wall. Both pulled north into open ground.
const VILLAGERS = [
  { id: 'wren', file: './assets/chars/rogue_hooded.glb', x: -6.4, z: 1.8, ry: 0.7,
    when: () => true },
  { id: 'rook', file: './assets/chars/ranger.glb', x: 8.0, z: -1.8, ry: -2.2,
    when: () => WS.get('ember', 'restored') },
  { id: 'bram', file: './assets/chars/barbarian.glb', x: 2.6, z: 3.6, ry: -2.7,
    when: () => WS.get('stone', 'restored') },
];

const FACE_RANGE = 3.2;   // u — a villager turns to greet Kael inside this
const FACE_TURN = 5;      // rad/s of the greeting turn

// Biscuit's rounds: sniff-stops between these spots (clear of all furniture)
// Biscuit's rounds. Spread across the rebuilt Den (24 x 18) rather than the
// five units of it that used to exist — a dog that patrols a two-metre square
// is not patrolling, it is pacing.
const DOG_STOPS = [
  [2.6, 2.8], [-2.4, 0.2], [1.2, -3.4], [-5.2, -1.6], [4.4, 0.4], [-1.0, 4.2],
];

// ONE LIST, ONE TICK, WHOEVER FILLS IT. The Den used to own `world.npcs` and
// `world.updateNpcs` outright, assigned at the end of spawnDenNpcs — so a
// second spawner in the same room would have had its people silently dropped,
// and a spawner in any OTHER room would have had nobody ticking it at all.
// Both callers go through here instead, so the order they run in cannot
// matter.
export function npcList(world) {
  if (!world.npcs) {
    world.npcs = [];
    world.updateNpcs = (dt, t, player) => updateNpcs(world, dt, t, player);
  }
  return world.npcs;
}

// The body every person in this file is made of: a pack model on the shared
// Rig_Medium skeleton, idling, with an optional gesture on a timer. Callers
// add the collider, the marker and whatever the character carries.
export function characterNpc(world, { model, id, x, z, ry, rigAnims, gestureName }) {
  model.position.set(x, 0, z);
  model.rotation.y = ry;
  world.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const idle = mixer.clipAction(rigAnims.find((c) => c.name === 'Idle_A'));
  idle.play();
  // an occasional little gesture keeps them alive without a word
  const gestureClip = gestureName ? rigAnims.find((c) => c.name === gestureName) : null;
  const gesture = gestureClip ? mixer.clipAction(gestureClip) : null;
  if (gesture) {
    gesture.setLoop(THREE.LoopOnce);
    mixer.addEventListener('finished', (e) => {
      if (e.action !== gesture) return;
      idle.reset().play();
      gesture.crossFadeTo(idle, 0.3, false);
    });
  }

  const npc = { id, model, mixer, homeRy: ry, x, z, gesture, idle,
    gestureIn: 5 + Math.random() * 6 };
  npcList(world).push(npc);
  return npc;
}

export async function spawnDenNpcs(world) {
  const rigAnims = (await loadGLB('./assets/anims/rig-medium-general.glb')).animations;

  for (const def of VILLAGERS) {
    if (!def.when()) continue;
    const gltf = await loadGLB(def.file);
    const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    model.scale.setScalar(0.5);
    world.addCircle(def.x, def.z, 0.35); // solid — kids can't walk through friends
    characterNpc(world, {
      model, id: def.id, x: def.x, z: def.z, ry: def.ry, rigAnims,
      gestureName: def.id === 'bram' ? 'Interact' : 'Idle_B',
    });
    world.markers[def.id + 'Spot'] = { x: def.x, z: def.z };
  }

  // TAM keeps the moonstone company. Same offer, a face to hear it from.
  await spawnWayfarer(world, WAYFARER_POSTS.den, rigAnims);

  // Biscuit the den dog — her own model, her own little life
  {
    const gltf = await loadGLB('./assets/chars/husky.gltf');
    const dog = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    dog.scale.setScalar(0.38);
    const start = DOG_STOPS[0];
    dog.position.set(start[0], 0, start[1]);
    world.add(dog);
    const mixer = new THREE.AnimationMixer(dog);
    const clips = {};
    for (const name of ['Idle', 'Walk', 'Eating']) {
      const c = gltf.animations.find((a) => a.name === name);
      if (c) clips[name] = mixer.clipAction(c);
    }
    world.dog = {
      model: dog, mixer, clips, current: null, stop: 0,
      state: 'sniff', waitT: 1.5 + Math.random() * 2,
    };
    world.markers.dogSpot = { x: start[0], z: start[1] };
  }
}

function playDog(dog, name, fade = 0.25) {
  const next = dog.clips[name];
  if (!next || dog.current === next) return;
  next.reset().play();
  if (dog.current) dog.current.crossFadeTo(next, fade, false);
  dog.current = next;
}

function updateNpcs(world, dt, t, player) {
  const px = player.root.position.x, pz = player.root.position.z;

  for (const n of world.npcs) {
    n.mixer.update(dt);
    // greet: turn toward Kael when he's close, drift home when he leaves
    const dx = px - n.x, dz = pz - n.z;
    const near = dx * dx + dz * dz < FACE_RANGE * FACE_RANGE;
    const want = near ? Math.atan2(dx, dz) : n.homeRy;
    let delta = want - n.model.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    n.model.rotation.y += THREE.MathUtils.clamp(delta, -FACE_TURN * dt, FACE_TURN * dt);
    // the occasional gesture (skipped mid-greeting so it never looks rude)
    n.gestureIn -= dt;
    if (n.gestureIn <= 0 && n.gesture && !near) {
      n.gestureIn = 7 + Math.random() * 8;
      n.gesture.reset().play();
      n.idle.crossFadeTo(n.gesture, 0.3, false);
    }
  }

  // Biscuit: trot to the next sniff-spot, sniff (or snack), repeat. If Kael
  // comes close mid-sniff she looks his way — dogs always know.
  const d = world.dog;
  if (!d) return;
  d.mixer.update(dt);
  const pos = d.model.position;
  if (d.state === 'walk') {
    const target = DOG_STOPS[d.stop];
    const tx = target[0] - pos.x, tz = target[1] - pos.z;
    const dist = Math.hypot(tx, tz);
    if (dist < 0.15) {
      d.state = 'sniff';
      d.waitT = 2 + Math.random() * 3;
      playDog(d, Math.random() < 0.35 ? 'Eating' : 'Idle');
    } else {
      playDog(d, 'Walk');
      const speed = 1.25;
      pos.x += (tx / dist) * speed * dt;
      pos.z += (tz / dist) * speed * dt;
      const want = Math.atan2(tx, tz);
      let delta = want - d.model.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      d.model.rotation.y += THREE.MathUtils.clamp(delta, -6 * dt, 6 * dt);
    }
  } else {
    d.waitT -= dt;
    // Kael nearby? she turns her head (whole body — cheap and cute)
    const dx = px - pos.x, dz = pz - pos.z;
    if (dx * dx + dz * dz < 4) {
      const want = Math.atan2(dx, dz);
      let delta = want - d.model.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      d.model.rotation.y += THREE.MathUtils.clamp(delta, -4 * dt, 4 * dt);
    }
    if (d.waitT <= 0) {
      d.stop = (d.stop + Math.ceil(Math.random() * 2)) % DOG_STOPS.length;
      d.state = 'walk';
    }
  }
  world.markers.dogSpot.x = pos.x;
  world.markers.dogSpot.z = pos.z;
}

// ---------------------------------------------------------------------------
// TAM THE WAYFARER — the way home, with a face on it
// ---------------------------------------------------------------------------
//
// Dad's ask (2026-09-07): "have an NPC appear in the room of every boss fight
// after they are defeated. when you talk to him he offers teleportation back
// to the den and all previous levels. when you talk to him in the den he
// offers the same."
//
// The MENU already existed and already had exactly those semantics —
// menus.showTravel() lists the Den plus every region whose boss flag is set
// (js/menus.js), and main.js opens it whenever the player walks inside 1.5u
// of `world.markers.travelSpot`. What was missing was a body: the only thing
// in the game that offered a ride home was a glowing rock in the Den, so a
// child who beat a boss had to walk the whole way back to find it.
//
// So Tam is the marker, standing up. He carries a splinter of the same
// moonstone the Den rock is made of, at the same colour and the same bob, and
// that shard — not any word — is what says "this is the way home". A
// five-year-old who has used the Den moonstone once has already been taught
// what the light means.
//
// HE IS A REAL PACK MODEL, TINTED (CLAUDE.md's standing rule). Every one of
// the five KayKit humanoids is already somebody: knight is Kael, mage is
// Maren, ranger is Rook, rogue_hooded is Wren, barbarian is Bram. So whoever
// he was going to be, he was going to be somebody's twin — and the hood is
// the one that reads as "walks the roads", so he is Wren's model washed
// moon-blue over its single `rogue` material. Beside her in the Den the two
// read as different people at a glance, which is the whole test.
const WAYFARER_TINT = 0x9db2e8;   // moonlight on a grey cloak
const WAYFARER_SHARD = 0xa8bcff;  // the Den moonstone's own colour (rooms.js)

// THE SETTLERS — one per healed region's hearth (design/WIDER-WORLD.md §1.5).
//
// Pure data, no closures: `key` names the region's growth key (the same one
// `js/restoration.js`'s `growthStage()` counts) and `minStage` is the number
// that has to be reached, so restoration.js can decide who to spawn without
// this file importing growthStage back — the two files would otherwise import
// each other. Body, tint and job follow the settler table exactly: four
// KayKit humanoids already voiced as somebody in the Den (Wren, Rook, Bram,
// Tam), so each settler is that same idiom — clone the one shared material
// and colour-wash it — rather than a fifth face.
//
// Coordinates are measured the same way WAYFARER_POSTS's are, below: against
// the live built room at body radius 0.44, with `tools/probe-freespot.mjs`.
export const SETTLER_POSTS = {
  la: { id: 'ember_settler', file: './assets/chars/mage.glb', x: -3, z: 7.6, ry: 2.5,
    tint: 0xd97a3a, key: 'ember', minStage: 2 },
};

// WHERE HE STANDS, AND WHAT HAS TO HAVE HAPPENED FIRST.
//
// One post per boss arena — the seven rooms in main.js's BOSS_ROOMS — plus the
// Den. `flag` is the region's boss flag (state.flags), so "after they are
// defeated" is the same question the moonstone menu itself asks and the two
// can never drift apart.
//
// EVERY COORDINATE HERE WAS MEASURED, not eyeballed: tools/probe-freespot.mjs
// against the live built room at body radius 0.44, in BOTH states each arena
// has — before the boss falls (he arrives into that room) and after it is
// rebuilt healed (he is standing there when the child walks back in). Two of
// the eight moved because of it: the Vale's throne room is dressed tighter
// than the rest, and the Glade's south-east grove reaches further out.
export const WAYFARER_POSTS = {
  le: { x: 6, z: 8, ry: -1.9, flag: 'bossDefeated' },
  vz: { x: 6, z: 8, ry: -1.9, flag: 'wardenDefeated' },
  tgl: { x: 6, z: 8.6, ry: -1.9, flag: 'sylvaDefeated' },
  f5: { x: 6, z: 8, ry: -1.9, flag: 'borealDefeated' },
  scr: { x: 6, z: 8, ry: -1.9, flag: 'ariaDefeated' },
  ddp: { x: 5, z: 8, ry: -1.9, flag: 'meriDefeated' },
  xth: { x: 6, z: 8, ry: -1.9, flag: 'grimmFreed' },
  // THE DEN POST IS DIFFERENT IN ONE WAY: he does not claim the marker. The
  // moonstone is already `travelSpot` there and it is the thing a child has
  // been taught to walk to, so he stands a pace off it — inside its own 1.5u
  // reach, so walking up to HIM opens the menu too — and leaves it alone.
  den: { x: -4.2, z: -6.8, ry: 0.5, flag: null, keepMarker: true },

  // THE LAST TWO PLACES, added 2026-09-08 on dad's word: "tam needs to be
  // added to the spire and the village."
  //
  // Neither is a boss arena, so neither has a boss flag to hang off — and the
  // moonstone menu already knows the right question for both. It offers the
  // Village the moment `grimmFreed` opens its road, and the Spire the moment
  // `villageCleared()` is true. So `when` takes a predicate where the arenas
  // take a flag name, and the Village square uses the SAME predicate as the
  // Spire stair standing in it: a square whose six guardians are still up is a
  // square being fought over, and a wayfarer offering a ride out of a fight is
  // the one thing this NPC must never be (see the arenas above).
  // He keeps the SPIRE STAIR in the square — the way onward, which is what a
  // wayfarer stands beside — and the near shore in the Spire itself, this side
  // of the void. Measured like the rest, with WK_LATE=1 so the probe answered
  // for the square at peace rather than the square being fought over.
  ysq: { x: 7, z: 8.5, ry: -2.4, flag: null, when: villageCleared },
  m1: { x: 5, z: 8, ry: -2.2, flag: null, when: villageCleared },
};

// Is Tam standing in this room right now? Rooms ask on build; the arena asks
// again the moment its boss goes down.
export function wayfarerPost(roomId) {
  const post = WAYFARER_POSTS[roomId];
  if (!post) return null;
  if (post.flag && !state.flags[post.flag]) return null;
  if (post.when && !post.when()) return null;
  return post;
}

export async function spawnWayfarer(world, post, rigAnims = null) {
  if (!post || world.wayfarer) return null;
  const anims = rigAnims
    || (await loadGLB('./assets/anims/rig-medium-general.glb')).animations;
  const gltf = await loadGLB('./assets/chars/rogue_hooded.glb');
  const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
  model.scale.setScalar(0.5);
  // ONE material (`rogue`, a texture atlas) covers the whole figure, so one
  // clone-and-multiply washes all of him and nothing else in the room.
  model.traverse((n) => {
    if (!n.isMesh) return;
    n.material = n.material.clone();
    n.material.color.setHex(WAYFARER_TINT);
  });
  world.addCircle(post.x, post.z, 0.35); // solid, like every other friend
  const npc = characterNpc(world, {
    model, id: 'tam', x: post.x, z: post.z, ry: post.ry,
    rigAnims: anims, gestureName: 'Idle_B',
  });

  // THE SHARD. Same geometry, same emissive colour and same slow bob as the
  // Den moonstone (js/rooms.js), one size down, floating at his shoulder.
  const shard = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.15, 1),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: WAYFARER_SHARD, emissiveIntensity: 2.2, roughness: 1,
    })
  );
  shard.position.set(post.x + 0.42, 1.15, post.z + 0.1);
  world.add(shard);
  world.keepLoose(shard);      // it moves, so flattenStatic must not fold it in
  const glow = new THREE.PointLight(WAYFARER_SHARD, 3.0, 6, 1.9);
  glow.position.set(post.x + 0.42, 1.35, post.z + 0.1);
  world.add(glow);
  world.onAnimate((t) => {
    shard.position.y = 1.15 + Math.sin(t * 1.8) * 0.07;
    shard.rotation.y = t * 0.9;
    glow.intensity = 2.4 + Math.sin(t * 2.7) * 0.7;
  });

  world.wayfarer = npc;
  world.markers.wayfarerSpot = { x: post.x, z: post.z };
  // In the Den the moonstone keeps the marker (see WAYFARER_POSTS.den);
  // everywhere else Tam IS the fast-travel point, which is the whole feature.
  if (!post.keepMarker) world.markers.travelSpot = { x: post.x, z: post.z };
  return npc;
}
