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

export const MAX_HEARTS = 5;

// Wolf tints from the casting sheet (ASSETS.md)
const WOLF_TINTS = {
  dark_wolf: { main: 0x4a3b6b, eyes: 0x9fb8ff },
  fire_wolf: { main: 0xff5a2b, eyes: 0xffd27a },
};

const FORM_DEFS = {
  knight: {
    speed: 4.6,
    clips: { idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A' },
  },
  dark_wolf: {
    speed: 5.2,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2' },
  },
  fire_wolf: {
    speed: 5.2,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2' },
  },
};

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
    this.hearts = MAX_HEARTS;
    this.maxHearts = MAX_HEARTS;
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
    const [knight, movement, general, wolf] = await Promise.all([
      loadGLB('./assets/chars/knight.glb'),
      loadGLB('./assets/anims/rig-medium-movement-basic.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
      loadGLB('./assets/chars/wolf.gltf'),
    ]);

    // Knight: KayKit model + rig-library clips (bind by matching bone names)
    const knightModel = prepareCharacter(knight.scene);
    knightModel.scale.setScalar(0.5);
    this._addForm('knight', knightModel, [...movement.animations, ...general.animations]);

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

    for (const f of Object.values(this.forms)) f.model.visible = false;
    state.form = name;
    const f = this.forms[name];
    f.model.visible = true;
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

    this._play('howl', 0.12, { once: true });
    this._current = 'howl';
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

    // See in the dark: the wolf lamp breathes on in dark zones.
    const dark = world.darknessAt(this.root.position.x, this.root.position.z);
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
