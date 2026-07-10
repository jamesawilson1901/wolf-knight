// Pip the fox — Kael's talking guide — and the lost wolf pups.
// Pip follows Kael everywhere and sparkles when a hidden pup is near
// (design/STORY-BIBLE.md). Pups are the ONE wolf model scaled small; touching
// one rescues it; all 3 grant a permanent extra heart.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { state } from './state.js';
import { audio } from './audio.js';

const PIP_SCALE = 0.22;
const PUP_SCALE = 0.16;      // "wolf scaled to ~45%" of Kael's wolf (0.35)
const FOLLOW_DIST = 1.5;     // Pip keeps this distance behind Kael
const SPARKLE_RANGE = 4.5;   // pup proximity that makes Pip sparkle

export class Pip {
  constructor() {
    this.root = new THREE.Group();
    this._sparkles = [];
    this._sparkleT = 0;
    this.sparkling = false;
  }

  async load() {
    const fox = await loadGLB('./assets/chars/fox.gltf');
    this.model = prepareCharacter(SkeletonUtils.clone(fox.scene));
    this.model.scale.setScalar(PIP_SCALE);
    this.root.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [key, name] of Object.entries({ idle: 'Idle', walk: 'Walk', run: 'Gallop' })) {
      this.actions[key] = this.mixer.clipAction(fox.animations.find((c) => c.name === name));
    }
    this._current = null;
    this._play('idle');

    // a small pool of sparkle stars, recycled
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), mat.clone());
      s.userData.phase = (i / 7) * Math.PI * 2;
      this.root.add(s);
      this._sparkles.push(s);
    }
  }

  _play(name, fade = 0.18) {
    if (this._current === name) return;
    const next = this.actions[name];
    next.reset().play();
    if (this._current) this.actions[this._current].crossFadeTo(next, fade, false);
    this._current = name;
  }

  place(x, z, angle = 0) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = angle;
  }

  update(dt, t, player, world) {
    // Follow: stay ~FOLLOW_DIST behind Kael; trot or sprint to catch up.
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.root.position.x;
    const dz = pz - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d > FOLLOW_DIST) {
      const speed = d > 4 ? 6.2 : 3.4;
      const step = Math.min(d - FOLLOW_DIST * 0.8, speed * dt);
      this.root.position.x += (dx / d) * step;
      this.root.position.z += (dz / d) * step;
      this.root.rotation.y = Math.atan2(dx, dz);
      this._play(d > 4 ? 'run' : 'walk');
    } else {
      this._play('idle');
      // face where Kael faces, loosely
      if (this.sparkling) this.root.rotation.y += dt * 2.5; // excited spin-ish
    }

    // Sparkle when an uncollected pup is near
    this.sparkling = false;
    if (world.pups) {
      for (const pup of world.pups) {
        if (pup.collected) continue;
        const sd = Math.hypot(pup.x - this.root.position.x, pup.z - this.root.position.z);
        if (sd < SPARKLE_RANGE) { this.sparkling = true; break; }
      }
    }
    this._sparkleT += dt;
    for (const s of this._sparkles) {
      const a = this._sparkleT * 2.2 + s.userData.phase;
      s.position.set(Math.cos(a) * 0.42, 0.55 + Math.sin(a * 1.6) * 0.28, Math.sin(a) * 0.42);
      s.rotation.y = a * 3;
      const want = this.sparkling ? 0.95 : 0;
      s.material.opacity += (want - s.material.opacity) * Math.min(1, dt * 6);
      s.scale.setScalar(this.sparkling ? 1 + 0.4 * Math.sin(a * 4) : 1);
    }

    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Pups
// ---------------------------------------------------------------------------

class Pup {
  constructor(world, id, x, z, wolfGltf) {
    this.world = world;
    this.id = id;
    this.x = x; this.z = z;
    this.collected = false;

    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    world.add(this.root);

    this.model = prepareCharacter(SkeletonUtils.clone(wolfGltf.scene));
    this.model.scale.setScalar(PUP_SCALE);
    this.root.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    const idle = wolfGltf.animations.find((c) => c.name === 'Idle_2_HeadLow'); // sad little pup
    this.mixer.clipAction(idle).play();
    this._seed = x + z;
  }

  update(dt, t, player, onCollected) {
    if (this.collected) return;
    this.root.rotation.y = Math.sin(t * 0.6 + this._seed) * 0.6;
    this.mixer.update(dt);

    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    if (dx * dx + dz * dz < 0.85 * 0.85) {
      this.collected = true;
      state.flags.pups[this.id] = true;
      audio.play('pup-chime');
      // rescue burst: golden stars fly up
      const bits = [];
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.07, 0),
          new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 1 })
        );
        const a = (i / 10) * Math.PI * 2;
        m.position.set(this.x, 0.4, this.z);
        m.userData.v = new THREE.Vector3(Math.cos(a) * 1.4, 2.6 + (i % 3) * 0.6, Math.sin(a) * 1.4);
        this.world.add(m);
        bits.push(m);
      }
      let life = 0.8;
      this.world.onAnimate((tt, ddt) => {
        if (life <= 0) return;
        life -= ddt;
        for (const m of bits) {
          m.position.addScaledVector(m.userData.v, ddt);
          m.userData.v.y -= ddt * 4;
          m.rotation.y += ddt * 9;
          m.material.opacity = Math.max(0, life / 0.8);
        }
        if (life <= 0) for (const m of bits) this.world.root.remove(m);
      });
      this.world.root.remove(this.root);
      onCollected(this.id);
    }
  }
}

export async function spawnPups(world, onCollected) {
  world.pups = [];
  const wolfGltf = await loadGLB('./assets/chars/wolf.gltf');
  const spots = [
    ['pup1', world.markers.pup1Spot],
    ['pup2', world.markers.pup2Spot],
    ['pup3', world.markers.pup3Spot],
  ];
  for (const [id, spot] of spots) {
    if (!spot || state.flags.pups[id]) continue;
    // Pup #3 hides behind the burnable — only reachable (and only spawned
    // visible) once the way is open, but spawning it always is fine: the
    // burnable's collider guards it until burned.
    world.pups.push(new Pup(world, id, spot.x, spot.z, wolfGltf));
  }
  world.updatePups = (dt, t, player) => {
    for (const p of world.pups) p.update(dt, t, player, onCollected);
  };
}
