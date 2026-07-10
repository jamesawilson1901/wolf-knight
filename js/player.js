// Kael — the player. Phase 3: forms. Knight + Dark Wolf playable, Fire Wolf
// locked until the boss. One Quaternius wolf model serves every wolf form via
// per-form material tints (design/ASSETS.md casting sheet).

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { state } from './state.js';

const BODY_RADIUS = 0.32;
const TURN_SPEED = 12;
const RUN_THRESHOLD = 0.62;
const IFRAME_TIME = 1.0;
const LAVA_TICK = 1.0;
const BLOOD_MOON_COOLDOWN = 24; // seconds
const BLOOD_MOON_RANGE = 2.4;   // impact point this far ahead of Kael
const SLAM_COOLDOWN = 7;        // Fire Wolf ground-slam
const SLAM_RADIUS = 3.0;
const SLAM_BURN_RADIUS = 2.6;

export const MAX_HEARTS = 5;

// Wolf tints from the casting sheet (ASSETS.md)
const WOLF_TINTS = {
  dark_wolf: { main: 0x4a3b6b, eyes: 0x9fb8ff },
  fire_wolf: { main: 0xff5a2b, eyes: 0xffd27a },
};

const FORM_DEFS = {
  knight: {
    speed: 4.6,
    clips: { idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A', attack: 'Melee_1H_Attack_Slice_Diagonal' },
    attack: { lock: 0.55, hitAt: 0.3, range: 1.5, dmg: 1 },
  },
  dark_wolf: {
    speed: 5.2,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack' },
    attack: { lock: 0.45, hitAt: 0.24, range: 1.3, dmg: 1 },
  },
  fire_wolf: {
    speed: 5.2,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack' },
    attack: { lock: 0.45, hitAt: 0.24, range: 1.3, dmg: 1 },
  },
};
const ATTACK_ARC_COS = Math.cos(THREE.MathUtils.degToRad(70)); // ±70° swing

function tintWolf(model, tint) {
  model.traverse((n) => {
    if (!n.isMesh) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    n.material = mats.map((m) => {
      const c = m.clone();
      if (m.name === 'Main') c.color.setHex(tint.main);
      else if (m.name === 'Main_Light') {
        c.color.setHex(tint.main);
        c.color.lerp(new THREE.Color(0xffffff), 0.3);
      } else if (m.name === 'Nose') c.color.setHex(0x14100f);
      else if (m.name === 'Eyes_Black') {
        c.emissive = new THREE.Color(tint.eyes);
        c.emissiveIntensity = 0.9;
      }
      return c;
    });
    if (n.material.length === 1) n.material = n.material[0];
  });
  return model;
}

export class Player {
  constructor() {
    this.root = new THREE.Group();
    this.maxHearts = state.maxHearts || MAX_HEARTS;
    this.hearts = this.maxHearts;
    this.iframes = 0;
    this.lockTime = 0;           // movement lock (howl, attacks)
    this.specialCooldown = 0;
    this.specialMax = BLOOD_MOON_COOLDOWN;
    this.onDamaged = null;
    this.onDefeated = null;
    this.onFormChanged = null;
    this.forms = {};             // name -> {model, mixer, actions, def}
    this._current = null;        // action name playing on the active form
    this._popTime = 0;

    // Dark Wolf "see in the dark": a moonlit lamp that rides on Kael.
    this.formLight = new THREE.PointLight(0xa8bcff, 0, 11, 1.6);
    this.formLight.position.set(0, 1.5, 0);
    this.root.add(this.formLight);
  }

  async load() {
    const [knight, movement, general, combat, wolf] = await Promise.all([
      loadGLB('./assets/chars/knight.glb'),
      loadGLB('./assets/anims/rig-medium-movement-basic.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
      loadGLB('./assets/anims/rig-medium-combat-melee.glb'),
      loadGLB('./assets/chars/wolf.gltf'),
    ]);

    // Knight: KayKit model + rig-library clips (bind by matching bone names)
    const knightModel = prepareCharacter(knight.scene);
    knightModel.scale.setScalar(0.5);
    this._addForm('knight', knightModel, [...movement.animations, ...general.animations, ...combat.animations]);

    // Wolves: ONE Quaternius model, cloned per form, tinted per casting sheet
    for (const formName of ['dark_wolf', 'fire_wolf']) {
      const model = prepareCharacter(tintWolf(SkeletonUtils.clone(wolf.scene), WOLF_TINTS[formName]));
      model.scale.setScalar(0.35);
      this._addForm(formName, model, wolf.animations);
    }

    this.setForm(state.form, { silent: true });
  }

  _addForm(name, model, clips) {
    const def = FORM_DEFS[name];
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [key, clipName] of Object.entries(def.clips)) {
      const clip = clips.find((c) => c.name === clipName);
      if (!clip) throw new Error(`Missing clip ${clipName} for ${name}`);
      actions[key] = mixer.clipAction(clip);
    }
    model.visible = false;
    this.root.add(model);
    const meshes = [];
    model.traverse((n) => { if (n.isMesh) meshes.push(n); });
    this.forms[name] = { model, mixer, actions, def, meshes };
  }

  get form() { return this.forms[state.form]; }

  setForm(name, { silent = false } = {}) {
    if (!this.forms[name]) return false;
    if (!state.formsUnlocked.includes(name)) return false;
    if (state.form === name && !silent) return true;

    for (const ff of Object.values(this.forms)) ff.model.visible = false;
    state.form = name;
    const f = this.forms[name];
    f.model.visible = true;
    this.specialMax = name === 'fire_wolf' ? SLAM_COOLDOWN : BLOOD_MOON_COOLDOWN;
    this.specialCooldown = Math.min(this.specialCooldown, this.specialMax);
    this._current = null;
    this._play('idle', 0);
    if (!silent) {
      this._popTime = 0.22; // transform pop (scale-in)
      this.lockTime = Math.max(this.lockTime, 0.12);
    }
    if (this.onFormChanged) this.onFormChanged(name);
    return true;
  }

  _play(name, fade = 0.16, { once = false } = {}) {
    const f = this.form;
    if (this._current === name) return;
    const next = f.actions[name];
    if (!next) return;
    next.reset();
    if (once) {
      next.setLoop(THREE.LoopOnce);
      next.clampWhenFinished = true;
    }
    next.play();
    if (this._current && f.actions[this._current]) {
      f.actions[this._current].crossFadeTo(next, fade, false);
    }
    this._current = name;
  }

  // Play a one-shot clip even if it is already the current action (restart).
  _playOnce(name, fade = 0.08) {
    const f = this.form;
    const act = f.actions[name];
    if (!act) return;
    act.reset();
    act.setLoop(THREE.LoopOnce);
    act.clampWhenFinished = true;
    act.play();
    if (this._current && this._current !== name && f.actions[this._current]) {
      f.actions[this._current].crossFadeTo(act, fade, false);
    }
    this._current = name;
  }

  // Tap-attack: sword swing (Knight) or bite (wolf forms), melee arc ahead.
  tryAttack(world) {
    if (this.lockTime > 0) return false;
    const cfg = this.form.def.attack;
    this._playOnce('attack');
    this.lockTime = cfg.lock;
    this._pendingHit = { timer: cfg.hitAt, range: cfg.range, dmg: cfg.dmg };
    return true;
  }

  _applyPendingHit(dt, world) {
    if (!this._pendingHit) return;
    this._pendingHit.timer -= dt;
    if (this._pendingHit.timer > 0) return;
    const { range, dmg } = this._pendingHit;
    this._pendingHit = null;
    if (!world.enemies) return;
    const fx = Math.sin(this.root.rotation.y);
    const fz = Math.cos(this.root.rotation.y);
    for (const e of world.enemies) {
      if (e.dead) continue;
      const dx = e.x - this.root.position.x;
      const dz = e.z - this.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.radius) continue;
      if (d > 0.2 && (dx * fx + dz * fz) / d < ATTACK_ARC_COS) continue;
      e.takeDamage(dmg);
    }
  }

  // Enemy contact damage (respects i-frames; no knockback).
  hurt(n) {
    if (this.iframes > 0) return;
    this.damage(n);
    this.iframes = IFRAME_TIME;
  }

  // Route the special button/key by form.
  trySpecial(effects, world) {
    if (state.form === 'dark_wolf') return this.tryBloodMoon(effects, world);
    if (state.form === 'fire_wolf') return this.tryGroundSlam(effects, world);
    return false;
  }

  // Fire Wolf ground-slam: radial shockwave, damages enemies + burns
  // scorched obstacles.
  tryGroundSlam(effects, world) {
    if (state.form !== 'fire_wolf') return false;
    if (this.specialCooldown > 0 || this.lockTime > 0) return false;
    this._playOnce('attack');
    this.lockTime = 0.5;
    const { x, z } = { x: this.root.position.x, z: this.root.position.z };
    effects.groundSlam(this.root.position.clone());
    if (world.damageEnemiesAt) world.damageEnemiesAt(x, z, SLAM_RADIUS, 2);
    world.burnAt(x, z, SLAM_BURN_RADIUS);
    this.specialCooldown = this.specialMax;
    return true;
  }

  // The Blood Moon ultimate (Dark Wolf). Returns true if it fired.
  tryBloodMoon(effects, world) {
    if (state.form !== 'dark_wolf') return false;
    if (this.specialCooldown > 0 || this.lockTime > 0) return false;

    const dir = new THREE.Vector3(
      Math.sin(this.root.rotation.y),
      0,
      Math.cos(this.root.rotation.y)
    );
    const target = this.root.position.clone().addScaledVector(dir, BLOOD_MOON_RANGE);

    this._playOnce('howl', 0.12);
    this.lockTime = 1.15; // hold the howl while the sky turns red

    effects.bloodMoon(target, {
      onImpact: () => {
        // Phase 4 wires enemy damage through this hook.
        if (world && world.damageEnemiesAt) world.damageEnemiesAt(target.x, target.z, 3.0, 99);
      },
    });
    this.specialCooldown = this.specialMax;
    return true;
  }

  place(x, z, angle = 0) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = angle;
  }

  update(dt, input, world) {
    const f = this.form;
    if (this.specialCooldown > 0) this.specialCooldown -= dt;
    if (this._popTime > 0) {
      this._popTime -= dt;
      const p = 1 - Math.max(0, this._popTime) / 0.22;
      const s = 0.6 + 0.4 * (1 - (1 - p) * (1 - p));
      f.model.scale.setScalar((state.form === 'knight' ? 0.5 : 0.35) * s);
    }

    this._applyPendingHit(dt, world);

    if (this.lockTime > 0) {
      this.lockTime -= dt;
      f.mixer.update(dt);
      this._hazards(dt, world);
      return;
    }

    const move = input.getMove();
    const mag = Math.hypot(move.x, move.z);
    const speed = mag * f.def.speed;

    if (mag > 0.01) {
      const nx = this.root.position.x + move.x * speed * dt;
      const nz = this.root.position.z + move.z * speed * dt;
      const solved = world.resolveCircle(nx, nz, BODY_RADIUS);
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;

      const target = Math.atan2(move.x, move.z);
      let delta = target - this.root.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.root.rotation.y += THREE.MathUtils.clamp(delta, -TURN_SPEED * dt, TURN_SPEED * dt);

      this._play(mag > RUN_THRESHOLD ? 'run' : 'walk');
    } else {
      this._play('idle');
    }

    this._hazards(dt, world);

    // See in the dark: the wolf lamp breathes on in dark zones (and in the
    // boss's phase-3 darkness).
    const dark = world.bossDarkness ? 1 : world.darknessAt(this.root.position.x, this.root.position.z);
    const want = state.form === 'dark_wolf' ? (dark ? 9 : 2.2) : 0;
    this.formLight.intensity += (want - this.formLight.intensity) * Math.min(1, dt * 6);

    f.mixer.update(dt);
  }

  _hazards(dt, world) {
    if (this.iframes > 0) this.iframes -= dt;
    if (world.hazardAt(this.root.position.x, this.root.position.z) && this.iframes <= 0) {
      this.damage(1);
      this.iframes = Math.max(IFRAME_TIME, LAVA_TICK);
    }
    const flicker = this.iframes > 0 && Math.sin(this.iframes * 30) > 0;
    for (const m of this.form.meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (!mat.emissive) continue;
        if (mat.name === 'Eyes_Black') continue; // keep wolf eye glow
        mat.emissive.setHex(flicker ? 0xff2a1a : 0x000000);
        mat.emissiveIntensity = flicker ? 0.55 : 0;
      }
    }
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
