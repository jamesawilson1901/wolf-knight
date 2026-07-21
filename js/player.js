// Kael — the player. Phase 3: forms. Knight + Dark Wolf playable, Fire Wolf
// locked until the boss. One Quaternius wolf model serves every wolf form via
// per-form material tints (design/ASSETS.md casting sheet).

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { state } from './state.js';
import { audio } from './audio.js';

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
    clips: {
      idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A',
      attack: 'Melee_1H_Attack_Slice_Diagonal', ranged: 'Throw',
      block: 'Melee_Blocking', jump: 'Jump_Idle',
    },
    attack: { lock: 0.55, hitAt: 0.3, range: 2.0, dmg: 1 },
    boltColor: 0xbfe3ff,
  },
  dark_wolf: {
    speed: 5.2,
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack',
      ranged: 'Attack', block: 'Idle_2_HeadLow', jump: 'Gallop_Jump',
    },
    attack: { lock: 0.45, hitAt: 0.24, range: 1.7, dmg: 1 },
    boltColor: 0xb08aff,
  },
  fire_wolf: {
    speed: 5.2,
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack',
      ranged: 'Attack', block: 'Idle_2_HeadLow', jump: 'Gallop_Jump',
    },
    attack: { lock: 0.45, hitAt: 0.24, range: 1.7, dmg: 1 },
    boltColor: 0xffab4a,
  },
};
const ATTACK_ARC_COS = Math.cos(THREE.MathUtils.degToRad(70)); // ±70° swing

// Ranged bolt / defend / parry / jump / potion tuning
const RANGED_COOLDOWN = 1.1;
const RANGED_SPEED = 11;
const RANGED_RANGE = 7.5;
const PARRY_WINDOW = 0.3;   // shield raised this recently = perfect parry
const PARRY_STUN = 2.2;     // seconds stunnable enemies stay dazed
const DEFEND_SPEED_MULT = 0.35;
const JUMP_V = 6.8;
const DOUBLE_JUMP_V = 8.2;  // second press mid-air jumps higher
const GRAVITY = 21;
const AIRBORNE_DODGE_Y = 0.35; // above this, ground attacks miss
export const MAX_POTIONS = 3;
const POTION_HEAL = 3;

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
    this.rangedCooldown = 0;
    this.defending = false;
    this.defendStart = -99;      // timestamp (game time) shield was raised
    this.airY = 0;               // visual jump height (gameplay stays on XZ)
    this.airV = 0;
    this.jumpsUsed = 0;
    this.potions = 2;
    this.onPotionsChanged = null;
    this.onParry = null;
    this._projectiles = [];
    this._time = 0;
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
      audio.play('form-switch', { volume: 0.9 });
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
    if (this.lockTime > 0 || this.defending) return false;
    const cfg = this.form.def.attack;
    this._playOnce('attack');
    this.lockTime = cfg.lock;
    this._pendingHit = { timer: cfg.hitAt, range: cfg.range, dmg: cfg.dmg };
    audio.play(Math.random() < 0.5 ? 'sword-swing' : 'sword-swing2', { volume: 0.8 });
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
      audio.play('hit', { volume: 0.9 });
    }
  }

  // Ranged bolt: a glowing dart thrown ahead (Knight `Throw` clip; wolves
  // flick their attack). Available from minute one in every form.
  tryRanged(world) {
    if (this.lockTime > 0 || this.rangedCooldown > 0 || this.defending) return false;
    const f = this.form;
    this._playOnce('ranged');
    this.lockTime = 0.35;
    this.rangedCooldown = RANGED_COOLDOWN;
    audio.play('throw', { volume: 0.8 });

    const bolt = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: f.def.boltColor, emissiveIntensity: 2.6, roughness: 1,
      })
    );
    bolt.scale.z = 2.4;
    const dir = { x: Math.sin(this.root.rotation.y), z: Math.cos(this.root.rotation.y) };
    bolt.position.set(this.root.position.x + dir.x * 0.5, 0.85, this.root.position.z + dir.z * 0.5);
    bolt.rotation.y = this.root.rotation.y;
    world.root.add(bolt);
    this._projectiles.push({ mesh: bolt, dir, traveled: 0, world });
    return true;
  }

  _updateProjectiles(dt, world) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      const step = RANGED_SPEED * dt;
      p.mesh.position.x += p.dir.x * step;
      p.mesh.position.z += p.dir.z * step;
      p.mesh.rotation.x += dt * 14;
      p.traveled += step;
      const px = p.mesh.position.x, pz = p.mesh.position.z;
      let gone = p.traveled > RANGED_RANGE;
      // walls stop bolts
      const solved = world.resolveCircle(px, pz, 0.12);
      if (Math.hypot(solved.x - px, solved.z - pz) > 0.01) gone = true;
      // enemies
      if (!gone && world.enemies) {
        for (const e of world.enemies) {
          if (e.dead) continue;
          const dx = e.x - px, dz = e.z - pz;
          if (dx * dx + dz * dz < (e.radius + 0.25) * (e.radius + 0.25)) {
            e.takeDamage(1);
            audio.play('hit', { volume: 0.8 });
            gone = true;
            break;
          }
        }
      }
      if (gone) {
        p.world.root.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this._projectiles.splice(i, 1);
      }
    }
  }

  // Jump (visual Y arc; gameplay stays flat). Second press mid-air = a
  // higher double jump. While airborne, ground attacks miss.
  tryJump() {
    if (this.lockTime > 0 || this.defending) return false;
    if (this.airY <= 0 && this.jumpsUsed === 0) {
      this.airV = JUMP_V;
      this.jumpsUsed = 1;
      this._play('jump', 0.08);
      return true;
    }
    if (this.airY > 0 && this.jumpsUsed === 1) {
      this.airV = DOUBLE_JUMP_V;
      this.jumpsUsed = 2;
      audio.play('form-switch', { volume: 0.5, rate: 1.6 }); // whoosh
      return true;
    }
    return false;
  }

  get airborne() { return this.airY > AIRBORNE_DODGE_Y; }

  // Drink a potion (tap the HUD flask or press H).
  tryPotion() {
    if (this.potions <= 0 || this.hearts >= this.maxHearts) return false;
    this.potions--;
    this.hearts = Math.min(this.maxHearts, this.hearts + POTION_HEAL);
    audio.play('potion', { volume: 0.9 });
    audio.play('pup-chime', { volume: 0.5, rate: 1.4 });
    if (this.onDamaged) this.onDamaged(this.hearts); // refresh hearts HUD
    if (this.onPotionsChanged) this.onPotionsChanged(this.potions);
    return true;
  }

  addPotion() {
    if (this.potions >= MAX_POTIONS) return false;
    this.potions++;
    audio.play('pup-chime', { volume: 0.6 });
    if (this.onPotionsChanged) this.onPotionsChanged(this.potions);
    return true;
  }

  // Damage funnel. source: {groundAttack, attacker, pierceDefend}
  // - airborne dodges ground attacks entirely
  // - defend blunts a hit to half a heart; a fresh raise (parry window)
  //   negates it and stuns stunnable attackers
  hurt(n, source = {}) {
    if (this.iframes > 0) return;
    if (source.groundAttack && this.airborne) return; // jumped clean over it
    if (this.defending && !source.pierceDefend) {
      const sinceRaise = this._time - this.defendStart;
      if (sinceRaise <= PARRY_WINDOW) {
        // PARRY: no damage, attacker dazed
        audio.play('parry', { volume: 1 });
        this.iframes = 0.6;
        if (source.attacker && source.attacker.takeStun) source.attacker.takeStun(PARRY_STUN);
        if (this.onParry) this.onParry(source.attacker);
        return;
      }
      audio.play('parry', { volume: 0.45, rate: 0.7 }); // dull block clank
      this.damage(0.5);
      this.iframes = IFRAME_TIME;
      return;
    }
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
    audio.play('slam');
    if (world.damageEnemiesAt) world.damageEnemiesAt(x, z, SLAM_RADIUS, 2);
    if (world.burnAt(x, z, SLAM_BURN_RADIUS) > 0) audio.play('burn');
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
        audio.play('moon-impact');
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
    this._time += dt;
    if (this.specialCooldown > 0) this.specialCooldown -= dt;
    if (this.rangedCooldown > 0) this.rangedCooldown -= dt;
    if (this._popTime > 0) {
      this._popTime -= dt;
      const p = 1 - Math.max(0, this._popTime) / 0.22;
      const s = 0.6 + 0.4 * (1 - (1 - p) * (1 - p));
      f.model.scale.setScalar((state.form === 'knight' ? 0.5 : 0.35) * s);
    }

    this._applyPendingHit(dt, world);
    this._updateProjectiles(dt, world);

    // jump physics (Y is visual-only; collisions stay on the XZ plane)
    if (this.airY > 0 || this.airV > 0) {
      this.airY += this.airV * dt;
      this.airV -= GRAVITY * dt;
      if (this.airY <= 0) {
        this.airY = 0;
        this.airV = 0;
        this.jumpsUsed = 0;
      }
      this.root.position.y = this.airY;
    }

    // shield state: track raise time for the parry window
    const wantDefend = input.defending && this.lockTime <= 0 && this.airY <= 0;
    if (wantDefend && !this.defending) this.defendStart = this._time;
    this.defending = wantDefend;

    if (this.lockTime > 0) {
      this.lockTime -= dt;
      f.mixer.update(dt);
      this._hazards(dt, world);
      return;
    }

    const move = input.getMove();
    const mag = Math.hypot(move.x, move.z);
    const speed = mag * f.def.speed * (this.defending ? DEFEND_SPEED_MULT : 1);

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
    }

    if (this.airY > 0) this._play('jump', 0.1);
    else if (this.defending) this._play('block', 0.12);
    else if (mag > 0.01) this._play(mag > RUN_THRESHOLD ? 'run' : 'walk');
    else this._play('idle');

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
    // Fire ignores shields — but a well-timed jump clears small lava gaps.
    if (!this.airborne &&
        world.hazardAt(this.root.position.x, this.root.position.z) && this.iframes <= 0) {
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
    audio.play('hurt', { volume: 0.9 });
    if (this.onDamaged) this.onDamaged(this.hearts);
    if (this.hearts === 0 && this.onDefeated) this.onDefeated();
  }

  healFull() {
    this.hearts = this.maxHearts;
    if (this.onDamaged) this.onDamaged(this.hearts);
  }

  clearProjectiles() {
    for (const p of this._projectiles) {
      p.world.root.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this._projectiles = [];
  }
}
