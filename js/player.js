// Kael — the player. Phase 1: knight form only, idle/walk/run, flat-plane
// movement with collision, lava damage with i-frames (no knockback).

import * as THREE from 'three';
import { loadGLB, prepareCharacter } from './assets.js';

const KNIGHT_SCALE = 0.5;   // KayKit knight is ~2.5 units tall raw → ~1.27 in-world
const BODY_RADIUS = 0.32;
const WALK_SPEED = 4.6;     // units/sec at full joystick deflection
const TURN_SPEED = 12;      // rad/sec toward move heading
const RUN_THRESHOLD = 0.62; // joystick deflection where walk anim becomes run
const IFRAME_TIME = 1.0;    // seconds of invincibility after a hit
const LAVA_TICK = 1.0;      // re-damage interval while standing in lava

export const MAX_HEARTS = 5;

export class Player {
  constructor() {
    this.root = new THREE.Group(); // world position (feet at y=0)
    this.hearts = MAX_HEARTS;
    this.maxHearts = MAX_HEARTS;
    this.iframes = 0;
    this.speed = 0;
    this.onDamaged = null; // (hearts) => void, wired by main.js
    this.onDefeated = null;
    this._mixer = null;
    this._actions = {};
    this._current = null;
    this._meshes = [];
  }

  async load() {
    const [knight, movement, general] = await Promise.all([
      loadGLB('./assets/chars/knight.glb'),
      loadGLB('./assets/anims/rig-medium-movement-basic.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
    ]);

    this.model = prepareCharacter(knight.scene);
    this.model.scale.setScalar(KNIGHT_SCALE);
    this.root.add(this.model);
    this.model.traverse((n) => { if (n.isMesh) this._meshes.push(n); });

    // KayKit ships animations as separate rig libraries whose track names
    // match the character skeleton — clips apply directly to the knight.
    this._mixer = new THREE.AnimationMixer(this.model);
    const clips = [...movement.animations, ...general.animations];
    const need = { idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A' };
    for (const [state, clipName] of Object.entries(need)) {
      const clip = clips.find((c) => c.name === clipName);
      if (!clip) throw new Error(`Missing animation clip: ${clipName}`);
      this._actions[state] = this._mixer.clipAction(clip);
    }
    this._play('idle');
  }

  _play(name, fade = 0.18) {
    if (this._current === name) return;
    const next = this._actions[name];
    if (!next) return;
    next.reset().play();
    if (this._current) this._actions[this._current].crossFadeTo(next, fade, false);
    this._current = name;
  }

  place(x, z, angle = 0) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = angle;
  }

  update(dt, input, world) {
    const move = input.getMove();
    const mag = Math.hypot(move.x, move.z);
    this.speed = mag * WALK_SPEED;

    if (mag > 0.01) {
      // Advance on the XZ plane, then resolve collisions (slide along walls).
      const nx = this.root.position.x + move.x * this.speed * dt;
      const nz = this.root.position.z + move.z * this.speed * dt;
      const solved = world.resolveCircle(nx, nz, BODY_RADIUS);
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;

      // Face the direction of travel (shortest-arc smooth turn).
      const target = Math.atan2(move.x, move.z);
      let delta = target - this.root.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.root.rotation.y += THREE.MathUtils.clamp(delta, -TURN_SPEED * dt, TURN_SPEED * dt);

      this._play(mag > RUN_THRESHOLD ? 'run' : 'walk');
    } else {
      this._play('idle');
    }

    // Lava hurts: 1 heart per touch, ~1s of i-frames, no knockback — the kid
    // just walks out. i-frames also cover ordinary enemy hits later.
    if (this.iframes > 0) this.iframes -= dt;
    if (world.inLava(this.root.position.x, this.root.position.z) && this.iframes <= 0) {
      this.damage(1);
      this.iframes = Math.max(IFRAME_TIME, LAVA_TICK);
    }

    // Damage feedback: quick red flicker while invincible.
    const flicker = this.iframes > 0 && Math.sin(this.iframes * 30) > 0;
    for (const m of this._meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (!mat.emissive) continue;
        mat.emissive.setHex(flicker ? 0xff2a1a : 0x000000);
        mat.emissiveIntensity = flicker ? 0.55 : 0;
      }
    }

    this._mixer.update(dt);
  }

  damage(n) {
    this.hearts = Math.max(0, this.hearts - n);
    if (this.onDamaged) this.onDamaged(this.hearts);
    if (this.hearts === 0 && this.onDefeated) this.onDefeated();
  }

  healFull() {
    this.hearts = this.maxHearts;
    if (this.onDamaged) this.onDamaged(this.hearts);
  }
}
