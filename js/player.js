// Kael — the player. Phase 3: forms. Knight + Dark Wolf playable, Fire Wolf
// locked until the boss. One Quaternius wolf model serves every wolf form via
// per-form material tints (design/ASSETS.md casting sheet).

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { weaponDef, shieldDef } from './items.js';

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
const STOMP_COOLDOWN = 8;       // Earth Wolf stone-stomp
const STOMP_RADIUS = 3.2;
const STOMP_STUN = 2.5;

export const MAX_HEARTS = 5;
const WOLF_SCALE = 0.56; // wolf forms loom larger than the knight — the beast is the power form

// Wolf tints from the casting sheet (ASSETS.md)
const WOLF_TINTS = {
  dark_wolf: { main: 0x4a3b6b, eyes: 0x9fb8ff },
  fire_wolf: { main: 0xff5a2b, eyes: 0xffd27a },
  earth_wolf: { main: 0x8b6b3d, eyes: 0xffe9a8 },
};

const FORM_DEFS = {
  knight: {
    speed: 4.6,
    clips: {
      idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A',
      attack: 'Melee_1H_Attack_Slice_Diagonal', attack2: 'Melee_1H_Attack_Stab',
      ranged: 'Throw', block: 'Melee_Blocking', jump: 'Jump_Idle',
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
  earth_wolf: {
    speed: 4.9, // steady like the mountain — hits harder, runs a touch slower
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack',
      ranged: 'Attack', block: 'Idle_2_HeadLow', jump: 'Gallop_Jump',
    },
    attack: { lock: 0.5, hitAt: 0.26, range: 1.7, dmg: 1.5 },
    boltColor: 0xd8b06a,
  },
};
const ATTACK_ARC_COS = Math.cos(THREE.MathUtils.degToRad(70)); // ±70° swing
// Thrust (2nd tap of the combo): narrow and long — a poke, not a sweep
const THRUST_ARC_COS = Math.cos(THREE.MathUtils.degToRad(32));
const THRUST_RANGE_BONUS = 0.55;
const THRUST_DMG_MULT = 1.3;
const COMBO_WINDOW = 0.7;   // s after a slash ends in which a tap thrusts

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

// Elemental aura geometry (shared across the few meshes that use it)
const FLAME_GEO = new THREE.ConeGeometry(0.13, 0.4, 6);
const CHIP_GEO = new THREE.DodecahedronGeometry(0.11, 0);

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
    this.onPotionsChanged = null;
    this.onHitConnected = null;  // melee landed → main triggers hit-stop
    this.buffs = { star: 0, fury: 0, feather: 0, magnet: 0 }; // timed power-ups
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

    // Hand bones for equippable gear (GLTFLoader strips dots: handslot.r →
    // handslotr). The equipped weapon/shield models mount here.
    this._handR = null;
    this._handL = null;
    knightModel.traverse((node) => {
      if (node.name === 'handslotr') this._handR = node;
      if (node.name === 'handslotl') this._handL = node;
    });
    await this.equipGear();

    // Wolves: ONE Quaternius model, cloned per form, tinted per casting sheet
    for (const formName of ['dark_wolf', 'fire_wolf', 'earth_wolf']) {
      const model = prepareCharacter(tintWolf(SkeletonUtils.clone(wolf.scene), WOLF_TINTS[formName]));
      model.scale.setScalar(WOLF_SCALE);
      this._addForm(formName, model, wolf.animations);
    }

    this._buildAuras();
    this.setForm(state.form, { silent: true });
  }

  // Each wolf form wears its element: flames lick off the Fire Wolf, violet
  // lightning crackles around the Dark Wolf, stone chips orbit the Earth
  // Wolf. Auras live on the player root (not the scaled model) and only the
  // active form's aura is visible. Cheap on purpose — a handful of meshes.
  _buildAuras() {
    // FIRE — licks of flame rising along the spine + a flickering warm light
    {
      const aura = new THREE.Group();
      const flames = [];
      for (let i = 0; i < 7; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xffd75a : 0xffa03a, transparent: true, opacity: 0.9, depthWrite: false,
        });
        const m = new THREE.Mesh(FLAME_GEO, mat);
        aura.add(m);
        flames.push({ m, phase: i / 7, x: ((i % 3) - 1) * 0.17, z: 0.4 - i * 0.13 });
      }
      const light = new THREE.PointLight(0xff7a3a, 1.3, 4.5, 1.8);
      light.position.set(0, 0.8, 0);
      aura.add(light);
      aura.visible = false;
      this.root.add(aura);
      this.forms.fire_wolf.aura = aura;
      this.forms.fire_wolf.auraData = { kind: 'fire', flames, light };
    }
    // DARK — short-lived jagged arcs of violet lightning
    {
      const aura = new THREE.Group();
      const bolts = [];
      for (let i = 0; i < 6; i++) {
        const geo = new THREE.BufferGeometry().setFromPoints(
          [new THREE.Vector3(), new THREE.Vector3(0.1, 0.1, 0.1)]
        );
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0xc7a8ff, transparent: true, opacity: 1,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        line.visible = false;
        aura.add(line);
        bolts.push({ line, timer: 0.1 + i * 0.22 });
      }
      const zap = new THREE.PointLight(0x9a6bff, 0, 4, 1.8);
      zap.position.set(0, 0.8, 0);
      aura.add(zap);
      aura.visible = false;
      this.root.add(aura);
      this.forms.dark_wolf.aura = aura;
      this.forms.dark_wolf.auraData = { kind: 'dark', bolts, zap };
    }
    // EARTH — slow-orbiting stone chips
    {
      const aura = new THREE.Group();
      const chipMat = new THREE.MeshStandardMaterial({ color: 0x94886f, roughness: 1 });
      const chips = [];
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(CHIP_GEO, chipMat);
        aura.add(c);
        chips.push(c);
      }
      aura.visible = false;
      this.root.add(aura);
      this.forms.earth_wolf.aura = aura;
      this.forms.earth_wolf.auraData = { kind: 'earth', chips };
    }
  }

  _updateAura(dt) {
    const f = this.form;
    if (!f.aura || !f.aura.visible) return;
    const d = f.auraData;
    const t = this._time;
    if (d.kind === 'fire') {
      for (const fl of d.flames) {
        const cyc = (t * 0.85 + fl.phase) % 1;
        fl.m.position.set(
          fl.x + Math.sin(t * 3 + fl.phase * 9) * 0.06,
          0.65 + cyc * 0.95,
          fl.z
        );
        const s = (1 - cyc) * 1.1 + 0.2;
        fl.m.scale.set(s, s * 1.35, s);
        fl.m.material.opacity = 0.85 * (1 - cyc);
      }
      d.light.intensity = 1.15 + Math.sin(t * 11) * 0.35;
    } else if (d.kind === 'dark') {
      for (const b of d.bolts) {
        b.timer -= dt;
        if (b.timer > 0) continue;
        if (b.line.visible) {
          b.line.visible = false;
          b.timer = 0.15 + Math.random() * 0.45;
        } else {
          // strike: a fresh jagged arc hugging the body
          b.line.visible = true;
          b.timer = 0.1 + Math.random() * 0.1;
          const a = Math.random() * Math.PI * 2;
          const pts = [];
          let px = Math.cos(a) * 0.25, py = 0.45 + Math.random() * 0.6, pz = Math.sin(a) * 0.25;
          pts.push(new THREE.Vector3(px, py, pz));
          for (let k = 0; k < 4; k++) {
            px += Math.cos(a) * 0.16 + (Math.random() - 0.5) * 0.16;
            py += (Math.random() - 0.5) * 0.3;
            pz += Math.sin(a) * 0.16 + (Math.random() - 0.5) * 0.16;
            pts.push(new THREE.Vector3(px, py, pz));
          }
          b.line.geometry.setFromPoints(pts);
        }
      }
      d.zap.intensity = d.bolts.some((b) => b.line.visible) ? 1.6 : 0;
    } else if (d.kind === 'earth') {
      d.chips.forEach((c, i) => {
        const a = t * 0.8 + i * (Math.PI * 2 / d.chips.length);
        c.position.set(Math.cos(a) * 0.68, 0.5 + Math.sin(t * 2.1 + i * 1.7) * 0.16, Math.sin(a) * 0.68);
        c.rotation.x = t * (1.1 + i * 0.2);
        c.rotation.y = t * 0.9 + i;
      });
    }
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

  // Mount the equipped weapon + shield on the knight's hands (call after any
  // equipment change). Models are shared from the loader cache, so each mount
  // uses a clone.
  async equipGear() {
    if (!this._handR) return;
    const [w, s] = await Promise.all([loadGLB(weaponDef().file), loadGLB(shieldDef().file)]);
    this._handR.clear();
    this._handL.clear();
    this._handR.add(prepareCharacter(w.scene.clone()));
    this._handL.add(prepareCharacter(s.scene.clone()));
  }

  // Potions live in run state so they persist with the save.
  get potions() { return state.potions; }
  set potions(v) { state.potions = v; }

  setForm(name, { silent = false } = {}) {
    if (!this.forms[name]) return false;
    if (!state.formsUnlocked.includes(name)) return false;
    if (state.form === name && !silent) return true;

    for (const ff of Object.values(this.forms)) {
      ff.model.visible = false;
      if (ff.aura) ff.aura.visible = false;
    }
    state.form = name;
    const f = this.forms[name];
    f.model.visible = true;
    if (f.aura) f.aura.visible = true;
    const cdMult = 1 - 0.15 * (state.perks.cooldown || 0);
    const baseCd = { fire_wolf: SLAM_COOLDOWN, earth_wolf: STOMP_COOLDOWN }[name] || BLOOD_MOON_COOLDOWN;
    this.specialMax = baseCd * cdMult;
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

  // The knight's melee numbers come from the equipped weapon + sword perks;
  // wolves use their natural bite. Fury triples everything briefly.
  attackConfig() {
    const base = this.form.def.attack;
    let cfg;
    if (state.form === 'knight') {
      const w = weaponDef();
      cfg = { lock: w.lock, hitAt: Math.min(0.3, w.lock * 0.55), range: w.range, dmg: w.dmg };
    } else {
      cfg = { ...base };
    }
    cfg.dmg += (state.perks.sword || 0) * 0.25;
    if (this.buffs.fury > 0) cfg.dmg *= 3;
    return cfg;
  }

  // Tap-attack: sword swing (Knight) or bite (wolf forms), melee arc ahead.
  // A second tap right after a slash becomes a THRUST — a straight stab with
  // longer reach and a narrower hit arc (slash the crowd, poke the one).
  tryAttack(world) {
    if (this.lockTime > 0 || this.defending) return false;
    const cfg = this.attackConfig();
    const thrust = !!this.form.actions.attack2 &&
      this._comboUntil !== undefined && this._time < this._comboUntil;
    if (thrust) {
      this._playOnce('attack2');
      this.lockTime = cfg.lock * 0.95;
      this._pendingHit = {
        timer: cfg.hitAt * 0.85,
        range: cfg.range + THRUST_RANGE_BONUS,
        dmg: cfg.dmg * THRUST_DMG_MULT,
        arcCos: THRUST_ARC_COS,
      };
      this._comboUntil = 0; // slash again to re-open the combo
      audio.play('sword-swing2', { volume: 0.85, rate: 1.25 });
    } else {
      this._playOnce('attack');
      this.lockTime = cfg.lock;
      this._pendingHit = { timer: cfg.hitAt, range: cfg.range, dmg: cfg.dmg };
      this._comboUntil = this._time + cfg.lock + COMBO_WINDOW;
      audio.play(Math.random() < 0.5 ? 'sword-swing' : 'sword-swing2', { volume: 0.8 });
    }
    return true;
  }

  _applyPendingHit(dt, world) {
    if (!this._pendingHit) return;
    this._pendingHit.timer -= dt;
    if (this._pendingHit.timer > 0) return;
    const { range, dmg, arcCos } = this._pendingHit;
    this._pendingHit = null;
    if (!world.enemies) return;
    const fx = Math.sin(this.root.rotation.y);
    const fz = Math.cos(this.root.rotation.y);
    let connected = false;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const dx = e.x - this.root.position.x;
      const dz = e.z - this.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.radius) continue;
      if (d > 0.2 && (dx * fx + dz * fz) / d < (arcCos !== undefined ? arcCos : ATTACK_ARC_COS)) continue;
      e.takeDamage(dmg);
      audio.play('hit', { volume: 0.9 });
      connected = true;
    }
    if (connected && this.onHitConnected) this.onHitConnected(); // hit-stop
  }

  boltDamage(target) {
    const perk = (state.perks.bolt || 0) * 0.25;
    let dmg = (target && target.flying ? 1 : 0.5) + perk;
    if (this.buffs.fury > 0) dmg *= 3;
    return dmg;
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
      // enemies — bolts are the moths' natural counter: full damage vs
      // flyers, chip damage vs grounded enemies (the sword's job)
      if (!gone && world.enemies) {
        for (const e of world.enemies) {
          if (e.dead) continue;
          const dx = e.x - px, dz = e.z - pz;
          if (dx * dx + dz * dz < (e.radius + 0.25) * (e.radius + 0.25)) {
            e.takeDamage(this.boltDamage(e));
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
    const maxJumps = this.buffs.feather > 0 ? 3 : 2; // feather = triple jump
    if (this.airY <= 0 && this.jumpsUsed === 0) {
      this.airV = JUMP_V;
      this.jumpsUsed = 1;
      this._play('jump', 0.08);
      return true;
    }
    if (this.airY > 0 && this.jumpsUsed >= 1 && this.jumpsUsed < maxJumps) {
      this.airV = DOUBLE_JUMP_V;
      this.jumpsUsed++;
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
    if (this.buffs.star > 0) return; // starlight makes Kael untouchable
    // Cozy mode (default) halves incoming hits; the rubber-band does the
    // same after repeated defeats at one checkpoint. Both round to halves.
    let soften = 1;
    if (!state.settings.brave) soften *= 0.5;
    if (this.softenDamage) soften *= 0.5;
    n = Math.max(0.5, Math.round(n * soften * 2) / 2);
    if (this.defending && !source.pierceDefend) {
      const sinceRaise = this._time - this.defendStart;
      if (sinceRaise <= PARRY_WINDOW + shieldDef().parryBonus) {
        // PARRY: no damage, attacker dazed
        audio.play('parry', { volume: 1 });
        this.iframes = 0.6;
        if (source.attacker && source.attacker.takeStun) source.attacker.takeStun(PARRY_STUN);
        if (this.onParry) this.onParry(source.attacker);
        return;
      }
      audio.play('parry', { volume: 0.45, rate: 0.7 }); // dull block clank
      this.damage(shieldDef().blunt);
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
    if (state.form === 'earth_wolf') return this.tryStoneStomp(effects, world);
    return false;
  }

  // Earth Wolf stone-stomp: a quake that dazes grounded enemies and smashes
  // cracked rock piles (the Stoneroot region verb).
  tryStoneStomp(effects, world) {
    if (state.form !== 'earth_wolf') return false;
    if (this.specialCooldown > 0 || this.lockTime > 0) return false;
    this._playOnce('attack');
    this.lockTime = 0.5;
    const { x, z } = { x: this.root.position.x, z: this.root.position.z };
    effects.groundSlam(this.root.position.clone(), 0xd8b06a);
    effects.shake(0.3, 0.35);
    audio.play('slam', { rate: 0.75 });
    if (world.enemies) {
      for (const e of world.enemies) {
        if (e.dead || e.flying) continue;
        const dx = e.x - x, dz = e.z - z;
        if (dx * dx + dz * dz > STOMP_RADIUS * STOMP_RADIUS) continue;
        e.takeDamage(2);
        if (e.takeStun) e.takeStun(STOMP_STUN);
      }
    }
    if (world.crackAt(x, z, SLAM_BURN_RADIUS) > 0) audio.play('slam', { volume: 0.9, rate: 1.3 });
    this.specialCooldown = this.specialMax;
    return true;
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
      f.model.scale.setScalar((state.form === 'knight' ? 0.5 : WOLF_SCALE) * s);
    }

    this._applyPendingHit(dt, world);
    this._updateProjectiles(dt, world);
    this._updateAura(dt); // before the lock-time early return — auras never freeze

    // timed power-up buffs tick down
    for (const k of Object.keys(this.buffs)) {
      if (this.buffs[k] > 0) this.buffs[k] -= dt;
    }

    // jump physics (Y is visual-only; collisions stay on the XZ plane)
    if (this.airY > 0 || this.airV > 0) {
      this.airY += this.airV * dt;
      this.airV -= GRAVITY * (this.buffs.feather > 0 ? 0.7 : 1) * dt;
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
    let speedMult = (this.defending ? DEFEND_SPEED_MULT : 1) * (1 + (state.perks.speed || 0) * 0.05);
    if (this.buffs.star > 0) speedMult *= 1.4;
    const speed = mag * f.def.speed * speedMult;

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
