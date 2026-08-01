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

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { WS } from './worldstate.js';

const VILLAGERS = [
  { id: 'wren', file: './assets/chars/rogue_hooded.glb', x: -5.0, z: 3.2, ry: 0.7,
    when: () => true },
  { id: 'rook', file: './assets/chars/ranger.glb', x: 5.3, z: -1.4, ry: -2.2,
    when: () => WS.get('ember', 'restored') },
  { id: 'bram', file: './assets/chars/barbarian.glb', x: 3.9, z: 3.6, ry: -2.7,
    when: () => WS.get('stone', 'restored') },
];

const FACE_RANGE = 3.2;   // u — a villager turns to greet Kael inside this
const FACE_TURN = 5;      // rad/s of the greeting turn

// Biscuit's rounds: sniff-stops between these spots (clear of all furniture)
const DOG_STOPS = [
  [1.9, 2.3], [-1.6, 0.5], [0.8, -1.8], [-3.0, 0.2], [2.6, 0.6],
];

export async function spawnDenNpcs(world) {
  const rigAnims = (await loadGLB('./assets/anims/rig-medium-general.glb')).animations;
  const npcs = [];

  for (const def of VILLAGERS) {
    if (!def.when()) continue;
    const gltf = await loadGLB(def.file);
    const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    model.scale.setScalar(0.5);
    model.position.set(def.x, 0, def.z);
    model.rotation.y = def.ry;
    world.add(model);
    world.addCircle(def.x, def.z, 0.35); // solid — kids can't walk through friends

    const mixer = new THREE.AnimationMixer(model);
    const idle = mixer.clipAction(rigAnims.find((c) => c.name === 'Idle_A'));
    idle.play();
    // an occasional little gesture keeps them alive without a word
    const gestureClip = rigAnims.find((c) => c.name === (def.id === 'bram' ? 'Interact' : 'Idle_B'));
    const gesture = gestureClip ? mixer.clipAction(gestureClip) : null;
    if (gesture) {
      gesture.setLoop(THREE.LoopOnce);
      mixer.addEventListener('finished', (e) => {
        if (e.action !== gesture) return;
        idle.reset().play();
        gesture.crossFadeTo(idle, 0.3, false);
      });
    }

    npcs.push({
      id: def.id, model, mixer, homeRy: def.ry, x: def.x, z: def.z,
      gesture, idle, gestureIn: 5 + Math.random() * 6,
    });
    world.markers[def.id + 'Spot'] = { x: def.x, z: def.z };
  }

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

  world.npcs = npcs;
  world.updateNpcs = (dt, t, player) => updateNpcs(world, dt, t, player);
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
