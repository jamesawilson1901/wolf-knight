// Kael — the player. Phase 3: forms. Knight + Dark Wolf playable, Fire Wolf
// locked until the boss. One Quaternius wolf model serves every wolf form via
// per-form material tints (design/ASSETS.md casting sheet).

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { weaponDef, shieldDef } from './items.js';
import { CONFIG } from './config.js';
import { juice } from './juice.js';

const BODY_RADIUS = 0.32;
const TURN_SPEED = CONFIG.TURN_SPEED;
const RUN_THRESHOLD = 0.62;
const IFRAME_TIME = 1.0;
const LAVA_TICK = 1.0;
const SPIN_COOLDOWN = 6;        // Knight whirlwind spin (all-around sweep)
const SPIN_RANGE = 2.3;
const SPIN_DMG_MULT = 1.2;
const SPIN_TIMESCALE = 1.7;     // clip playback speed — a whip-fast blur (playtest)
const SLAM_COOLDOWN = 7;        // Fire Wolf ground-slam
const SLAM_RADIUS = 3.0;
const STOMP_COOLDOWN = 8;       // Earth Wolf stone-stomp
const STOMP_RADIUS = 3.2;
const STOMP_STUN = 2.5;
const VINE_COOLDOWN = 7;        // Verdant Wolf vine-lash (forward line + cuts brambles)
const VINE_RANGE = 3.8;         // how far the whip reaches
const VINE_HALFWIDTH = 0.9;     // corridor half-width the lash sweeps
const VINE_DMG = 1.5;
const VINE_SNARE = 2.6;       // a square-on lash HOLDS, it does not just tangle
const FROST_COOLDOWN = 7;       // Frost Wolf breath (cone: shatters ice, freezes foes)
const FROST_RANGE = 3.6;
const FROST_CONE_DEG = 40;
const FROST_DMG = 1;
const FROST_FREEZE = 2.2;       // seconds a frozen enemy stands helpless

export const MAX_HEARTS = 5;
const WOLF_SCALE = 0.56; // wolf forms loom larger than the knight — the beast is the power form

// Wolf tints from the casting sheet (ASSETS.md)
export const WOLF_TINTS = {
  dark_wolf: { main: 0x4a3b6b, eyes: 0x9fb8ff },
  fire_wolf: { main: 0xff5a2b, eyes: 0xffd27a },
  earth_wolf: { main: 0x8b6b3d, eyes: 0xffe9a8 },
  verdant_wolf: { main: 0x6fae4a, eyes: 0xd8ffb0 }, // Sylva's gift (region 3)
  frost_wolf: { main: 0x9be3ff, eyes: 0xeaffff },   // Boreal's gift (region 4)
};

// FORM IDENTITY fields (data-driven so the seven later wolves slot in):
//   turnMult  — facing turn-rate multiplier
//   hurtMult  — incoming damage multiplier (>1 = fragile, applied BEFORE
//               the kid-difficulty softening so Gentle still protects)
//   stepIn    — u of forward drive during a bite (the hunter presses in)
//   lunge     — tap attack while the stick is pushed = a dash-bite
//   senses    — hidden things (burnables, cracked rock, chests) shimmer
//   shield    — may raise the shield (the Knight's tool; wolves dodge)
const FORM_DEFS = {
  knight: {
    speed: 4.6,
    shield: true,
    clips: {
      idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A',
      attack: 'Melee_1H_Attack_Slice_Diagonal', attack2: 'Melee_1H_Attack_Stab',
      ranged: 'Throw', block: 'Melee_Blocking', jump: 'Jump_Idle',
      // the WHIRLWIND — a true 360° body spin. NOT 'Melee_2H_Attack_Spin':
      // that clip is 2.4s with 0.6s of dead wind-up, so at our 0.75s lock it
      // was cut before the body ever turned ("Kael just stands there" bug).
      special: 'Melee_2H_Attack_Spinning',
    },
    attack: { lock: 0.55, hitAt: 0.3, range: 2.0, dmg: 1 },
    boltColor: 0xbfe3ff, rangedKind: 'spark',   // classic dart: one target
  },
  dark_wolf: {
    // THE FAST FRAGILE HUNTER: outruns everything, turns on a claw, bites in
    // quick chains — and pays for every mistake (+30% damage taken).
    speed: CONFIG.FORMS.DARK_SPEED,
    turnMult: CONFIG.FORMS.DARK_TURN_MULT,
    hurtMult: CONFIG.FORMS.DARK_HURT_MULT,
    stepIn: 0.5, lunge: true, senses: true,
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack',
      ranged: 'Attack', block: 'Idle_2_HeadLow', jump: 'Gallop_Jump',
    },
    attack: { lock: 0.34, hitAt: 0.19, range: 1.7, dmg: 1 },
    boltColor: 0xb08aff, rangedKind: 'pierce',  // moon crescent: flies THROUGH foes
  },
  fire_wolf: {
    speed: 5.2,
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack',
      ranged: 'Attack', block: 'Idle_2_HeadLow', jump: 'Gallop_Jump',
    },
    attack: { lock: 0.45, hitAt: 0.24, range: 1.7, dmg: 1 },
    boltColor: 0xffab4a, rangedKind: 'breath',  // FIRE BREATH: a cone of flame
  },
  earth_wolf: {
    speed: 4.9, // steady like the mountain — hits harder, runs a touch slower
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack',
      ranged: 'Attack', block: 'Idle_2_HeadLow', jump: 'Gallop_Jump',
    },
    attack: { lock: 0.5, hitAt: 0.26, range: 1.7, dmg: 1.5 },
    boltColor: 0xd8b06a, rangedKind: 'rock',    // lobbed stone: slow, heavy, dazes
  },
  verdant_wolf: {
    speed: 5.4, // quick between the trees — the forest runs with her gift
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack',
      ranged: 'Attack', block: 'Idle_2_HeadLow', jump: 'Gallop_Jump',
    },
    attack: { lock: 0.42, hitAt: 0.22, range: 1.7, dmg: 1 },
    boltColor: 0x8fdc6a, rangedKind: 'thorn',   // thrown thorn: chips + ROOTS
  },
  frost_wolf: {
    // sure-footed on the ice where everything else slides
    speed: 5.0,
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Gallop', howl: 'Idle_2', attack: 'Attack',
      ranged: 'Attack', block: 'Idle_2_HeadLow', jump: 'Gallop_Jump',
    },
    attack: { lock: 0.44, hitAt: 0.23, range: 1.7, dmg: 1.2 },
    boltColor: 0xbfefff, rangedKind: 'shard',   // ice shard: chips + slows
  },
};
// What ELEMENT each form's strikes carry (enemy weaknesses key off this;
// 'steel' is the only non-magical element — armored bone shrugs it off)
const FORM_ELEMENT = { knight: 'steel', dark_wolf: 'moon', fire_wolf: 'fire', earth_wolf: 'earth', verdant_wolf: 'verdant', frost_wolf: 'frost' };
const BOLT_ELEMENT = { spark: 'spark', pierce: 'moon', ember: 'fire', rock: 'earth', breath: 'fire', thorn: 'verdant', shard: 'frost' };

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

export function tintWolf(model, tint) {
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
    this.hurtFlashT = 0;         // red flash ONLY when actually damaged —
                                 // grace iframes (room entry, respawn) don't flash
    this.lockTime = 0;           // movement lock (howl, attacks)
    this.specialCooldown = 0;
    this.specialMax = SLAM_COOLDOWN;
    this.rangedCooldown = 0;
    this.lungeCooldown = 0;      // Dark Wolf dash-bite (free while surging)
    this._dash = null;           // {t, dur, dx, dz, speed} — lunge/step-in drive
    this._queuedForm = null;     // switch requested mid-attack lands at its end
    this._ceremony = null;       // Blood Moon Surge transformation in progress
    this._surge = null;          // {t} — the surge itself
    this._preSurgeForm = null;
    this.onSurgeStart = null;    // (phase) — 'ceremony' fired at trigger
    this.onSurgeEnd = null;
    this.onFormFx = null;        // non-silent switches → main's spectacle
    this.defending = false;
    this.defendStart = -99;      // timestamp (game time) shield was raised
    this.airY = 0;               // visual jump height (gameplay stays on XZ)
    this.airV = 0;
    this.jumpsUsed = 0;
    this.onPotionsChanged = null;
    this.onHitConnected = null;  // melee landed → main triggers hit-stop
    this.buffs = { star: 0, fury: 0, feather: 0, magnet: 0 }; // timed power-ups
    this._vel = { x: 0, z: 0 };     // ramped velocity (CONFIG accel/decel)
    this._softLock = false;         // attack locks allow slow drift; specials don't
    this._queuedAttack = false;     // buffered tap from the tail of a swing
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

    // Knight: KayKit model + rig-library clips (bind by matching bone names).
    // CLONE the cached scene — never consume it. The form machine hides
    // inactive forms (visible=false), and mutating the shared cache made the
    // title/portrait knight clones inherit invisibility (blank avatar bug).
    const knightModel = prepareCharacter(SkeletonUtils.clone(knight.scene));
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
    for (const formName of ['dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf']) {
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
    // FROST — slow crystalline motes hanging in the cold air
    if (this.forms.frost_wolf) {
      const aura = new THREE.Group();
      const shardGeo = new THREE.OctahedronGeometry(0.07, 0);
      const motes = [];
      for (let i = 0; i < 6; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x000000, emissive: i % 2 ? 0xeaffff : 0x9be3ff,
          emissiveIntensity: 1.2, roughness: 1,
        });
        const m = new THREE.Mesh(shardGeo, mat);
        aura.add(m);
        motes.push({ m, phase: i / 6 });
      }
      const chill = new THREE.PointLight(0x9be3ff, 1.1, 4.2, 1.8);
      chill.position.set(0, 0.8, 0);
      aura.add(chill);
      aura.visible = false;
      this.root.add(aura);
      this.forms.frost_wolf.aura = aura;
      this.forms.frost_wolf.auraData = { kind: 'frost', motes, chill };
    }
    // VERDANT — drifting leaves spiralling gently upward
    if (this.forms.verdant_wolf) {
      const aura = new THREE.Group();
      const leafGeo = new THREE.TetrahedronGeometry(0.09, 0);
      const leaves = [];
      for (let i = 0; i < 6; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: i % 2 ? 0x8fdc6a : 0x5a9440, roughness: 1,
        });
        const m = new THREE.Mesh(leafGeo, mat);
        aura.add(m);
        leaves.push({ m, phase: i / 6 });
      }
      aura.visible = false;
      this.root.add(aura);
      this.forms.verdant_wolf.aura = aura;
      this.forms.verdant_wolf.auraData = { kind: 'verdant', leaves };
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
    } else if (d.kind === 'frost') {
      for (const mo of d.motes) {
        const a = t * 0.5 + mo.phase * Math.PI * 2;
        mo.m.position.set(Math.cos(a) * 0.6, 0.4 + Math.sin(t * 1.3 + mo.phase * 6) * 0.28, Math.sin(a) * 0.6);
        mo.m.rotation.x = t * 1.1 + mo.phase * 4;
        mo.m.rotation.y = t * 0.8;
      }
      d.chill.intensity = 1.0 + Math.sin(t * 2.2) * 0.25;
    } else if (d.kind === 'verdant') {
      for (const lf of d.leaves) {
        const cyc = (t * 0.45 + lf.phase) % 1;              // slow rising spiral
        const a = cyc * Math.PI * 2 + lf.phase * 9;
        lf.m.position.set(Math.cos(a) * (0.55 - cyc * 0.2), 0.25 + cyc * 1.1, Math.sin(a) * (0.55 - cyc * 0.2));
        lf.m.rotation.x = t * 2 + lf.phase * 5;
        lf.m.rotation.z = t * 1.4;
        lf.m.scale.setScalar(1 - cyc * 0.6);
      }
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

  // Base scale for the CURRENT form (the surge makes the wolf loom larger).
  _baseScale() {
    const s = state.form === 'knight' ? 0.5 : WOLF_SCALE;
    return this._surge ? s * CONFIG.MOON.SURGE_SCALE : s;
  }

  setForm(name, { silent = false } = {}) {
    if (!this.forms[name]) return false;
    if (!state.formsUnlocked.includes(name)) return false;
    // The surge locks Kael into the Dark Wolf until it ends.
    if (!silent && (this._surge || this._ceremony)) return false;
    if (state.form === name && !silent) return true;
    // Mid-attack: the switch QUEUES and lands the instant the swing ends —
    // taps are never eaten, but a swing is never cut in half either.
    if (!silent && this.lockTime > 0.06) {
      this._queuedForm = name;
      return true;
    }

    for (const ff of Object.values(this.forms)) {
      ff.model.visible = false;
      if (ff.aura) ff.aura.visible = false;
    }
    state.form = name;
    const f = this.forms[name];
    f.model.visible = true;
    f.model.scale.setScalar(this._baseScale());
    if (f.aura) f.aura.visible = true;
    const cdMult = 1 - 0.15 * (state.perks.cooldown || 0);
    const baseCd = { knight: SPIN_COOLDOWN, fire_wolf: SLAM_COOLDOWN, earth_wolf: STOMP_COOLDOWN, verdant_wolf: VINE_COOLDOWN, frost_wolf: FROST_COOLDOWN }[name] || SLAM_COOLDOWN;
    this.specialMax = baseCd * cdMult;
    this.specialCooldown = Math.min(this.specialCooldown, this.specialMax);
    this._current = null;
    this._play('idle', 0);
    if (!silent) {
      this._popTime = 0.22; // transform pop (scale-in)
      this.lockTime = Math.max(this.lockTime, 0.12);
      this.iframes = Math.max(this.iframes, CONFIG.SWITCH_FX.IFRAMES); // morph grace
      // per-form sting: each form ANNOUNCES itself in a different register
      const sting = { knight: 1.0, dark_wolf: 0.85, fire_wolf: 1.12, earth_wolf: 0.68 }[name] || 1;
      audio.play('form-switch', { volume: 0.9, rate: sting, vary: 0.05 });
      if (this.onFormFx) this.onFormFx(name); // burst/push/punch spectacle
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
      cfg = {
        lock: w.lock, hitAt: Math.min(0.3, w.lock * 0.55), range: w.range, dmg: w.dmg,
        // weapon STYLE (items.js): swing width, on-hit daze, strike element
        arcCos: w.arc !== undefined ? Math.cos(THREE.MathUtils.degToRad(w.arc)) : undefined,
        stun: w.stun,
        element: w.element,
      };
    } else {
      cfg = { ...base };
    }
    cfg.dmg += (state.perks.sword || 0) * 0.25;
    if (this.buffs.fury > 0) cfg.dmg *= 3;
    if (this._surge) cfg.dmg *= CONFIG.MOON.SURGE_DMG; // blood-moon bites
    return cfg;
  }

  // Tap-attack: sword swing (Knight) or bite (wolf forms), melee arc ahead.
  // A second tap right after a slash becomes a THRUST — a straight stab with
  // longer reach and a narrower hit arc (slash the crowd, poke the one).
  // DARK WOLF: tapping attack while the STICK IS PUSHED becomes a LUNGE —
  // a dash-bite that covers ground with dodge frames inside it.
  tryAttack(world, input) {
    if (this.defending) return false;
    if (this.lockTime > 0) {
      // buffer taps in the tail of the current swing instead of eating them
      if (this.lockTime <= CONFIG.BUFFER_WINDOW) this._queuedAttack = true;
      return false;
    }
    // soft lock-on: face the nearest enemy in the forward cone so taps
    // near an enemy reliably connect
    if (world && world.enemies) {
      const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
      let best = null, bestD = CONFIG.LOCKON_RANGE;
      for (const e of world.enemies) {
        if (e.dead) continue;
        const dx = e.x - this.root.position.x, dz = e.z - this.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05 || d > bestD) continue;
        if ((dx * fx + dz * fz) / d < CONFIG.LOCKON_COS) continue;
        best = e; bestD = d;
      }
      if (best) {
        this.root.rotation.y = Math.atan2(best.x - this.root.position.x, best.z - this.root.position.z);
      }
    }
    this._softLock = true;
    const cfg = this.attackConfig();

    // THE LUNGE (form identity, FORM_DEFS.lunge): stick pushed + tap = a
    // dash-bite. The soft lock-on above already aimed the dash; the bite
    // lands as the dash finishes. Brief dodge frames make it an attack AND
    // an escape — the fragile hunter's answer to standing and trading.
    const F = CONFIG.FORMS;
    if (this.form.def.lunge && input && this.lungeCooldown <= 0 &&
        this.airY <= 0 && !this._lavaBounce) {
      const mv = input.getMove();
      if (Math.hypot(mv.x, mv.z) > 0.5) {
        const dx = Math.sin(this.root.rotation.y), dz = Math.cos(this.root.rotation.y);
        this._dash = { t: 0, dur: F.LUNGE_DUR, dx, dz, speed: F.LUNGE_DIST / F.LUNGE_DUR, hop: 0.18 };
        this.iframes = Math.max(this.iframes, F.LUNGE_IFRAMES);
        this.lungeCooldown = this._surge ? 0 : F.LUNGE_COOLDOWN; // free while surging
        this.lockTime = F.LUNGE_DUR + 0.1;
        this._playOnce('attack');
        this._pendingHit = { timer: F.LUNGE_DUR * 0.8, range: cfg.range, dmg: cfg.dmg };
        this._comboUntil = this._time + this.lockTime + COMBO_WINDOW;
        audio.play('whoosh', { volume: 0.8, rate: 1.25, vary: 0.08 });
        audio.play('bite', { volume: 0.9, rate: 0.95, vary: 0.06 });
        return true;
      }
    }

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
        stun: cfg.stun, element: cfg.element,
      };
      this._comboUntil = 0; // slash again to re-open the combo
      audio.play('sword-swing2', { volume: 0.85, rate: 1.25 });
    } else {
      this._playOnce('attack');
      this.lockTime = cfg.lock;
      this._pendingHit = {
        timer: cfg.hitAt, range: cfg.range, dmg: cfg.dmg,
        arcCos: cfg.arcCos, stun: cfg.stun, element: cfg.element,
      };
      this._comboUntil = this._time + cfg.lock + COMBO_WINDOW;
      // step-in bite (FORM_DEFS.stepIn): the hunter PRESSES FORWARD as it
      // snaps — chained taps walk the wolf through a retreating target
      if (this.form.def.stepIn) {
        const dur = cfg.lock * 0.55;
        this._dash = {
          t: 0, dur,
          dx: Math.sin(this.root.rotation.y), dz: Math.cos(this.root.rotation.y),
          speed: this.form.def.stepIn / dur, hop: 0,
        };
      }
      // steel sings for the knight; wolves SNAP their jaws (per-form pitch)
      if (state.form === 'knight') {
        audio.play(Math.random() < 0.5 ? 'sword-swing' : 'sword-swing2', { volume: 0.8 });
      } else {
        const biteRate = { dark_wolf: 0.9, fire_wolf: 1.0, earth_wolf: 0.72 }[state.form] || 0.9;
        audio.play('bite', { volume: 0.85, rate: biteRate, vary: 0.08 });
      }
    }
    return true;
  }

  _applyPendingHit(dt, world) {
    if (!this._pendingHit) return;
    this._pendingHit.timer -= dt;
    if (this._pendingHit.timer > 0) return;
    const { range, dmg, arcCos, stun, element } = this._pendingHit;
    this._pendingHit = null;
    if (!world.enemies) return;
    const fx = Math.sin(this.root.rotation.y);
    const fz = Math.cos(this.root.rotation.y);
    let connected = false;
    let struck = null;
    let killed = false;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const dx = e.x - this.root.position.x;
      const dz = e.z - this.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.radius + CONFIG.HITBOX_PAD) continue; // generous hitbox
      if (d > 0.2 && (dx * fx + dz * fz) / d < (arcCos !== undefined ? arcCos : ATTACK_ARC_COS)) continue;
      e.takeDamage(dmg, element || FORM_ELEMENT[state.form] || 'steel', 'melee');
      // weapon style: the hammer leaves them DIZZY (items.js stun field)
      if (stun && !e.dead && e.takeStun && !e.flying) e.takeStun(stun);
      // surge bites STAGGER — everything reels from the blood-moon wolf
      if (this._surge && !e.dead && e.takeStun) e.takeStun(CONFIG.MOON.SURGE_STAGGER);
      audio.play('hit', { volume: 0.9, vary: 0.08 });
      connected = true;
      struck = e;
      if (!e.scenery) this._moonHit = true; // pots don't feed the moon
      if (e.dead) killed = true;
    }
    if (connected) {
      if (this._moonHit) { this._moonHit = false; this.gainMoon(CONFIG.MOON.PER_HIT); }
      if (this.onHitConnected) this.onHitConnected(struck, killed); // juice pipeline
    }
  }

  // ---- THE MOON GAUGE ----------------------------------------------------
  // Fills from landed hits, hits TAKEN and time spent in combat — pressure
  // feeds the moon (a hidden assist: a kid who is struggling reaches the
  // surge sooner). Never decays outside the surge; survives form switches,
  // room changes and save/load (state.moonGauge is persisted).

  gainMoon(amount) {
    if (this._surge || this._ceremony) return; // the surge itself owns the gauge
    const mult = 1 + CONFIG.MOON.PERK_MULT * (state.perks.cooldown || 0); // Quicker Moon
    state.moonGauge = Math.min(1, (state.moonGauge || 0) + amount * mult);
  }

  get moonFull() { return (state.moonGauge || 0) >= 1; }
  get surging() { return !!this._surge; }
  get ceremonyActive() { return !!this._ceremony; }

  // 0..1 intensity for the red screen vignette (main drives the DOM overlay).
  // Rises with the ceremony, holds through the surge, FLICKERS as the
  // 2-second warning that the blood moon is about to set.
  get surgeGlow() {
    if (this._ceremony) return Math.min(1, this._ceremony.t / 1.0) * 0.55;
    if (this._surge) {
      if (this._surge.t <= CONFIG.MOON.WARN) return Math.sin(this._surge.t * 18) > 0 ? 0.42 : 0.15;
      return 0.35;
    }
    return 0;
  }

  // THE BLOOD MOON SURGE. Trigger: tap the full moon gauge (main guards
  // narration/transitions). ~2.5s ceremony — the world dims red, a blood
  // moon rises, time bends, Kael morphs into the Dark Wolf and HOWLS, and
  // the shockwave staggers everything nearby — then ~10s of surge.
  startSurge(effects, world) {
    if (this._surge || this._ceremony) return false;
    if (!this.moonFull) return false;
    if (!state.formsUnlocked.includes('dark_wolf')) return false;
    const C = CONFIG.MOON;
    this._preSurgeForm = state.form;
    this._ceremony = { t: 0, effects, world, morphed: false };
    // the ceremony owns Kael: input locked, untouchable, movement zeroed
    this.lockTime = Math.max(this.lockTime, C.CEREMONY + 0.1);
    this._softLock = false;
    this._roll = null;
    this._dash = null;
    this._pendingHit = null;
    this._queuedAttack = false;
    this._queuedForm = null;
    this.iframes = Math.max(this.iframes, C.CEREMONY + 0.6);
    this._vel.x = 0; this._vel.z = 0;
    // The moon rises with the ceremony… then CRASHES DOWN into the nearest
    // enemy (playtest ask: the blood moon must visibly slam into someone).
    // Aim resolves at dive time so it tracks a moving fight.
    effects.surgeCeremony(this.root.position.clone(), {
      at: () => {
        let best = null, bd = 9;
        for (const e of (world.enemies || [])) {
          if (e.dead || e.scenery) continue;
          const d = Math.hypot(e.x - this.root.position.x, e.z - this.root.position.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) return { x: best.x, z: best.z };
        return { // no one to crush — the moon buries itself just ahead
          x: this.root.position.x + Math.sin(this.root.rotation.y) * 2.6,
          z: this.root.position.z + Math.cos(this.root.rotation.y) * 2.6,
        };
      },
      onImpact: (x, z) => {
        audio.play('moon-impact', { volume: 0.95, rate: 0.8 });
        audio.play('slam', { volume: 0.9, rate: 0.45 });
        if (world.damageEnemiesAt) world.damageEnemiesAt(x, z, 2.4, 2, 'moon');
        for (const e of (world.enemies || [])) {
          if (e.dead || e.scenery || !e.takeStun) continue;
          if (Math.hypot(e.x - x, e.z - z) < 2.6) e.takeStun(1.4);
        }
      },
    });
    audio.play('moon-impact', { volume: 0.55, rate: 0.55 }); // the sky answers
    if (this.onSurgeStart) this.onSurgeStart('ceremony');
    return true;
  }

  _tickCeremony(dt) {
    const c = this._ceremony;
    const C = CONFIG.MOON;
    c.t += dt;
    // the MORPH beat: time bends, the wolf takes over, the HOWL
    if (!c.morphed && c.t >= 1.0) {
      c.morphed = true;
      c.effects.slow(0.7, 0.6); // ~30% time-slow while the change happens
      this.setForm('dark_wolf', { silent: true });
      this._popTime = 0.22;
      this._playOnce('howl', 0.1);
      audio.howl({ volume: 0.9, rate: 1.15 });
      audio.play('slam', { volume: 0.7, rate: 0.35 }); // the bass under the howl
      juice.buzz(250);
    }
    if (c.t >= C.CEREMONY) {
      // SHOCKWAVE: no damage — a knockback + stagger that clears space
      const px = this.root.position.x, pz = this.root.position.z;
      // ceremony, not an attack: no hitbox to be honest about, so it keeps
      // the full-size ring. Boss death rings do the same, which is why those
      // are now visibly the biggest thing in the game.
      c.effects.groundSlam(this.root.position.clone(), 0xff3a4a, 4.0);
      c.effects.shake(0.4, 0.5);
      if (c.world && c.world.enemies) {
        for (const e of c.world.enemies) {
          if (e.dead) continue;
          const dx = e.x - px, dz = e.z - pz;
          const d = Math.hypot(dx, dz);
          if (d > C.SHOCK_RADIUS) continue;
          if (!e.takeStun || e.scenery) continue; // boss hitboxes + pots stay put
          e.takeStun(C.SHOCK_STUN);
          // enemies expose x/z as GETTERS over root.position — write the root
          if (d > 0.05 && e.root && c.world.resolveCircle) {
            const push = 1.3 * (1 - d / C.SHOCK_RADIUS) + 0.4;
            const s = c.world.resolveCircle(e.x + (dx / d) * push, e.z + (dz / d) * push, e.radius || 0.3);
            e.root.position.x = s.x;
            e.root.position.z = s.z;
          }
        }
      }
      this._ceremony = null;
      this._surge = { t: C.SURGE_DUR, trailAcc: 0 };
      juice.weightBoost = 1; // every hit lands one tier heavier
      this.form.model.scale.setScalar(this._baseScale());
      this._popTime = 0.22;
      this.lockTime = 0; // the wolf is FREE
      this._setSurgeAuraRed(true);
    }
  }

  _tickSurge(dt) {
    const s = this._surge;
    const C = CONFIG.MOON;
    s.t -= dt;
    state.moonGauge = Math.max(0, s.t / C.SURGE_DUR); // the gauge IS the timer now
    // blood regen: the surge heals ~half a heart a second
    if (this.hearts > 0 && this.hearts < this.maxHearts) {
      const before = this.hearts;
      this.hearts = Math.min(this.maxHearts, this.hearts + C.SURGE_REGEN * dt);
      if (Math.floor(before * 2) !== Math.floor(this.hearts * 2) && this.onDamaged) {
        this.onDamaged(this.hearts); // refresh hearts HUD on each half-heart
      }
    }
    // red trail — and a warning flicker in the last seconds (trail sputters)
    s.trailAcc += dt;
    const warning = s.t <= C.WARN;
    const trailGap = warning ? (Math.sin(s.t * 18) > 0 ? 0.1 : 0.5) : 0.11;
    if (s.trailAcc > trailGap) {
      s.trailAcc = 0;
      juice.burst(this.root.position.x, 0.55, this.root.position.z, 0xff3a4a, 2);
    }
    if (s.t <= 0) this._endSurge();
  }

  // The exhale: the surge releases, Kael returns to whichever form he wore.
  _endSurge() {
    if (!this._surge) return;
    this._surge = null;
    juice.weightBoost = 0;
    state.moonGauge = 0;
    this._setSurgeAuraRed(false);
    audio.play('whoosh', { volume: 0.7, rate: 0.55 }); // the long exhale
    const back = this._preSurgeForm && this._preSurgeForm !== 'dark_wolf' ? this._preSurgeForm : null;
    if (back) {
      this.setForm(back, { silent: true });
      audio.play('form-switch', { volume: 0.6, rate: 0.8 });
    } else {
      this.form.model.scale.setScalar(this._baseScale());
    }
    this._popTime = 0.22;
    this._preSurgeForm = null;
    if (this.onSurgeEnd) this.onSurgeEnd();
  }

  // Quiet teardown (death, room-respawn) — no exhale theatre, no refund.
  abortSurge() {
    if (!this._surge && !this._ceremony) return;
    this._ceremony = null;
    this._surge = null;
    juice.weightBoost = 0;
    state.moonGauge = 0;
    this._setSurgeAuraRed(false);
    const back = this._preSurgeForm;
    this._preSurgeForm = null;
    if (back && back !== state.form) this.setForm(back, { silent: true });
    else this.form.model.scale.setScalar(this._baseScale());
    if (this.onSurgeEnd) this.onSurgeEnd();
  }

  // While surging the Dark Wolf's violet lightning burns BLOOD RED.
  _setSurgeAuraRed(on) {
    const d = this.forms.dark_wolf && this.forms.dark_wolf.auraData;
    if (!d || d.kind !== 'dark') return;
    const c = on ? 0xff5a4a : 0xc7a8ff;
    for (const b of d.bolts) b.line.material.color.setHex(c);
    d.zap.color.setHex(on ? 0xff2a2a : 0x9a6bff);
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
    this._softLock = true;
    this.rangedCooldown = RANGED_COOLDOWN;
    // each form's throw SOUNDS different too, not just looks
    const kind0 = f.def.rangedKind || 'spark';
    if (kind0 === 'breath') {
      // FIRE BREATH: no projectile — a roaring cone of flame. Everything in
      // the fan takes fire damage; flames roll out as pooled particles.
      // (Braziers/burnables still need the SLAM — the verb stays sacred.)
      audio.play('burn', { volume: 0.95, rate: 1.05 });
      audio.play('growl', { volume: 0.5, rate: 0.6 }); // the beast under the flame
      const bfx = Math.sin(this.root.rotation.y), bfz = Math.cos(this.root.rotation.y);
      const CONE_COS = Math.cos(THREE.MathUtils.degToRad(38));
      const RANGE = 3.4;
      if (world && world.enemies) {
        let seared = false;
        for (const e of world.enemies) {
          if (e.dead) continue;
          const dx = e.x - this.root.position.x, dz = e.z - this.root.position.z;
          const d = Math.hypot(dx, dz);
          if (d > RANGE + e.radius) continue;
          if (d > 0.2 && (dx * bfx + dz * bfz) / d < CONE_COS) continue;
          e.takeDamage(this.boltDamage(e) + 0.5, 'fire', 'aoe');
          if (!e.scenery) seared = true;
        }
        if (seared) this.gainMoon(CONFIG.MOON.PER_BOLT);
      }
      // ...and the breath MELTS ice shells off frozen braziers (v3.21):
      // breath to melt, slam to light — two learned fire verbs, one puzzle.
      // The probe radius is clamped to its own reach so the first sample cannot
      // melt a brazier BEHIND Kael, which a flat 1.6 at 1.13u did (-0.47u).
      if (world.meltAt) {
        for (let i = 1; i <= 3; i++) {
          const reach = (RANGE * i) / 3;
          world.meltAt(this.root.position.x + bfx * reach, this.root.position.z + bfz * reach,
            Math.min(1.6, reach * 0.9));
        }
      }
      // C1 — the fire breath is the frost breath's twin (both a 38-40 degree
      // cone) and it was the only ability in the game with NO ground mark at
      // all. Same cone, same constants the hit test uses.
      // tryRanged() takes no `effects` — juice holds the reference (juice.init),
      // which is the same handle js/boss.js reaches for.
      if (juice.effects) {
        juice.effects.groundSlam({ x: this.root.position.x, z: this.root.position.z }, 0xff8a3a,
          RANGE, { deg: 38, fx: bfx, fz: bfz });
      }
      // rolling flame: three widening puffs down the cone. The spread is the
      // cone's ACTUAL half-width at each step — it used to be 0.3/0.6/0.9,
      // which drew the fan 2.4x too narrow and stopped 0.6u short of the reach.
      const TAN38 = Math.tan(THREE.MathUtils.degToRad(38));
      for (let i = 1; i <= 3; i++) {
        const reach = (RANGE * i) / 3;
        const spread = reach * TAN38;
        juice.burst(
          this.root.position.x + bfx * reach + (Math.random() * 2 - 1) * spread, 0.7,
          this.root.position.z + bfz * reach + (Math.random() * 2 - 1) * spread,
          i === 3 ? 0xffd76a : 0xff8a3a, 9);
      }
      return true;
    }
    if (kind0 === 'pierce') {
      audio.play('throw', { volume: 0.85, rate: 0.7 });
      audio.play('moon-impact', { volume: 0.18, rate: 2.4 }); // crescent shimmer
    } else if (kind0 === 'ember') {
      audio.play('throw', { volume: 0.8, rate: 1.15 });
      audio.play('burn', { volume: 0.35, rate: 1.7 });
    } else if (kind0 === 'rock') {
      audio.play('throw', { volume: 0.85, rate: 0.5 });
      audio.play('slam', { volume: 0.2, rate: 2.0 });
    } else {
      audio.play('throw', { volume: 0.8 });
    }

    // generous aim assist: snap to the nearest living enemy in a wide cone
    let aim = { x: Math.sin(this.root.rotation.y), z: Math.cos(this.root.rotation.y) };
    let target = null, bestD = RANGED_RANGE + 2.5;
    if (world && world.enemies) {
      for (const e of world.enemies) {
        if (e.dead) continue;
        const ex = e.x - this.root.position.x, ez = e.z - this.root.position.z;
        const d = Math.hypot(ex, ez);
        if (d < 0.4 || d > bestD) continue;
        if ((ex * aim.x + ez * aim.z) / d < 0.3) continue; // ~±72° cone
        target = e; bestD = d;
      }
    }
    if (target) {
      aim = { x: (target.x - this.root.position.x) / bestD, z: (target.z - this.root.position.z) / bestD };
      this.root.rotation.y = Math.atan2(aim.x, aim.z); // Kael turns to the shot
    }

    // Each form throws its OWN projectile (FORM_DEFS.rangedKind):
    // spark = dart · pierce = crescent through foes · ember = burst · rock = daze
    const kind = f.def.rangedKind || 'spark';
    const bolt = new THREE.Mesh(
      kind === 'rock' ? new THREE.DodecahedronGeometry(0.2, 0) : new THREE.OctahedronGeometry(0.13, 0),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: f.def.boltColor, emissiveIntensity: 2.6, roughness: 1,
      })
    );
    if (kind === 'pierce') bolt.scale.set(2.6, 0.55, 2.8); // WIDE flat moon crescent
    else if (kind === 'rock') bolt.scale.setScalar(1.35);  // a real chunk of stone
    else bolt.scale.z = 2.4;
    const dir = aim;
    bolt.position.set(this.root.position.x + dir.x * 0.5, 0.85, this.root.position.z + dir.z * 0.5);
    bolt.rotation.y = this.root.rotation.y;
    world.root.add(bolt);
    this._projectiles.push({ mesh: bolt, dir, traveled: 0, world, target, kind, pierced: null });
    return true;
  }

  _updateProjectiles(dt, world) {
    // Substep long frames: a fast bolt must never skip PAST a small enemy
    // between two collision checks (slow phones / heavy scenes).
    const steps = Math.max(1, Math.ceil(dt / 0.024));
    const h = dt / steps;
    for (let s = 0; s < steps && this._projectiles.length; s++) this._projStep(h, world);
  }

  _projStep(dt, world) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      // mild homing: the spark bends toward its chosen target in flight
      if (p.target && !p.target.dead) {
        const tx = p.target.x - p.mesh.position.x, tz = p.target.z - p.mesh.position.z;
        const td = Math.hypot(tx, tz);
        if (td > 0.05) {
          const blend = Math.min(1, dt * 7);
          p.dir.x += (tx / td - p.dir.x) * blend;
          p.dir.z += (tz / td - p.dir.z) * blend;
          const nl = Math.hypot(p.dir.x, p.dir.z);
          p.dir.x /= nl; p.dir.z /= nl;
          p.mesh.rotation.y = Math.atan2(p.dir.x, p.dir.z);
        }
      }
      const speed = p.kind === 'rock' ? 7.5 : p.kind === 'pierce' ? 12.5 : RANGED_SPEED;
      const step = speed * dt;
      p.mesh.position.x += p.dir.x * step;
      p.mesh.position.z += p.dir.z * step;
      p.mesh.rotation.x += dt * 14;
      p.traveled += step;
      // the rock lobs in a lazy arc; everything else flies flat
      if (p.kind === 'rock') p.mesh.position.y = 0.85 + Math.sin(Math.min(1, p.traveled / RANGED_RANGE) * Math.PI) * 0.55;
      const px = p.mesh.position.x, pz = p.mesh.position.z;
      // wolf projectiles leave a coloured trail (pooled particles — free)
      if (p.kind && p.kind !== 'spark') {
        p._trailAcc = (p._trailAcc || 0) + step;
        if (p._trailAcc > 0.4) {
          p._trailAcc = 0;
          const tc = p.kind === 'pierce' ? 0xb08aff : p.kind === 'ember' ? 0xff8a3a
            : p.kind === 'thorn' ? 0x8fdc6a : p.kind === 'shard' ? 0xbfefff : 0xd8b06a;
          juice.burst(px, p.mesh.position.y, pz, tc, 2);
        }
      }
      let gone = p.traveled > RANGED_RANGE;
      // walls stop bolts
      const solved = world.resolveCircle(px, pz, 0.12);
      if (Math.hypot(solved.x - px, solved.z - pz) > 0.01) gone = true;
      // enemies — bolts are the moths' natural counter: full damage vs
      // flyers, chip damage vs grounded enemies (the sword's job).
      // Per-form flavor: pierce sails through (up to 3), ember bursts,
      // rock hits harder and dazes.
      if (!gone && world.enemies) {
        for (const e of world.enemies) {
          if (e.dead) continue;
          if (p.pierced && p.pierced.has(e)) continue;
          const dx = e.x - px, dz = e.z - pz;
          if (dx * dx + dz * dz < (e.radius + 0.25) * (e.radius + 0.25)) {
            const elem = BOLT_ELEMENT[p.kind] || 'spark';
            if (p.kind === 'pierce') {
              e.takeDamage(this.boltDamage(e), elem, 'bolt');
              (p.pierced || (p.pierced = new Set())).add(e);
              // the blood-moon crescent HUNTS: after piercing one foe it
              // curves toward the next nearest living target (playtest ask)
              p.target = null;
              let nd = 7;
              for (const n2 of world.enemies) {
                if (n2.dead || n2.scenery || p.pierced.has(n2)) continue;
                const d2 = Math.hypot(n2.x - px, n2.z - pz);
                if (d2 < nd) { nd = d2; p.target = n2; }
              }
              audio.play('hit', { volume: 0.8, vary: 0.08 });
              juice.burst(px, 0.85, pz, 0xb08aff, 5);
              if (p.pierced.size >= 3) gone = true;
            } else if (p.kind === 'ember') {
              e.takeDamage(this.boltDamage(e), elem, 'bolt');
              if (world.damageEnemiesAt) world.damageEnemiesAt(px, pz, 1.3, 0.5, 'fire'); // the burst
              juice.burst(px, 0.85, pz, 0xff8a3a, 12);
              audio.play('burn', { volume: 0.5, rate: 1.5 });
              gone = true;
            } else if (p.kind === 'rock') {
              e.takeDamage(this.boltDamage(e) + 0.5, elem, 'bolt');
              if (e.takeStun && !e.flying) e.takeStun(0.9);
              juice.burst(px, 0.85, pz, 0xd8b06a, 8);
              audio.play('hit', { volume: 0.9, rate: 0.75 });
              gone = true;
            } else if (p.kind === 'shard') {
              // the ice shard bites cold: light damage, a lingering chill
              e.takeDamage(this.boltDamage(e), elem, 'bolt');
              if (e.takeStun && !e.flying) e.takeStun(0.8);
              juice.burst(px, 0.85, pz, 0xbfefff, 8);
              audio.play('hit', { volume: 0.8, rate: 1.35 });
              gone = true;
            } else if (p.kind === 'thorn') {
              // the thrown thorn ROOTS its target: light damage, long tangle
              e.takeDamage(this.boltDamage(e), elem, 'bolt');
              if (e.takeStun && !e.flying) e.takeStun(1.2);
              juice.burst(px, 0.85, pz, 0x8fdc6a, 7);
              audio.play('hit', { volume: 0.8, rate: 1.2 });
              gone = true;
            } else {
              e.takeDamage(this.boltDamage(e), elem, 'bolt');
              audio.play('hit', { volume: 0.8, vary: 0.08 });
              gone = true;
            }
            if (!e.scenery) this.gainMoon(CONFIG.MOON.PER_BOLT);
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
    // Form fragility (FORM_DEFS.hurtMult): the Dark Wolf pays +30% for its
    // speed. Applied BEFORE the kid-difficulty softening so Gentle still
    // protects exactly as much.
    n *= this.form.def.hurtMult || 1;
    // Cozy mode (default) halves incoming hits; the rubber-band does the
    // same after repeated defeats at one checkpoint. Both round to halves.
    let soften = 1;
    if (state.settings.easy) soften *= CONFIG.DIFFICULTY.GENTLE_SOFTEN;
    else if (!state.settings.brave) soften *= CONFIG.DIFFICULTY.COZY_SOFTEN;
    if (this.softenDamage) soften *= 0.5;
    n = Math.max(0.5, Math.round(n * soften * 2) / 2);
    if (this.defending && this.form.def.shield && !source.pierceDefend) {
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

  // Route the special button/key by form. The Dark Wolf has NO cooldown
  // special anymore — its Blood Moon is the EARNED Moon-Gauge surge (main
  // routes the trigger through its scripted-beat guards).
  trySpecial(effects, world) {
    if (state.form === 'knight') return this.trySpinAttack(effects, world);
    if (state.form === 'fire_wolf') return this.tryGroundSlam(effects, world);
    if (state.form === 'earth_wolf') return this.tryStoneStomp(effects, world);
    if (state.form === 'verdant_wolf') return this.tryVineLash(effects, world);
    if (state.form === 'frost_wolf') return this.tryFrostBreath(effects, world);
    return false;
  }

  // Verdant Wolf VINE-LASH: a living vine whips straight ahead — damages
  // everything in the corridor and CUTS bramble tangles (the region-3 verb,
  // mirrors Ember's burnables and Stoneroot's crackables).
  tryVineLash(effects, world) {
    if (state.form !== 'verdant_wolf') return false;
    if (this.specialCooldown > 0 || this.lockTime > 0) return false;
    this._playOnce('attack');
    this.lockTime = 0.5;
    this._softLock = false;
    const px = this.root.position.x, pz = this.root.position.z;
    const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
    audio.play('whoosh', { volume: 0.9, rate: 1.05 });
    audio.play('bite', { volume: 0.5, rate: 1.2 });
    // damage the corridor ahead (project onto the facing line)
    if (world.enemies) {
      for (const e of world.enemies) {
        if (e.dead) continue;
        const dx = e.x - px, dz = e.z - pz;
        const along = dx * fx + dz * fz;             // distance down the whip
        if (along < 0.2 || along > VINE_RANGE + e.radius) continue;
        const side = Math.abs(dx * fz - dz * fx);    // distance off the line
        if (side > VINE_HALFWIDTH + e.radius) continue;
        e.takeDamage(VINE_DMG, 'verdant', 'melee');
        // SNARE. A graze tangles briefly; a rope around it HOLDS. The long
        // hold is the other half of the twist — the same discovery as the
        // boulder, taught on something that fights back.
        if (!e.dead && e.takeStun && !e.flying) {
          const squareOn = side < VINE_HALFWIDTH * 0.6;
          e.takeStun(squareOn ? VINE_SNARE : 0.6);
          if (squareOn) e.snaredUntil = performance.now() + VINE_SNARE * 1000;
        }
      }
    }
    // ...and CUT any bramble tangle in reach (gates.js registers cuttables)
    const tip = { x: px + fx * VINE_RANGE * 0.75, z: pz + fz * VINE_RANGE * 0.75 };
    if (world.cutAt(tip.x, tip.z, 2.2) + world.cutAt(px + fx * 1.2, pz + fz * 1.2, 1.6) > 0) {
      if (effects && effects.punch) effects.punch(0.18, 0.2);
    }
    // ...and TETHER a boulder: the lash is a rope, so it PULLS. This is the
    // Level 3 twist, and it is a permanent part of the tool once discovered —
    // not a trick that only works in the room that taught it.
    if (world.tetherAt(tip.x, tip.z, 1.9, px, pz) > 0) {
      audio.play('gate-creak', { volume: 0.6, rate: 0.7 });
      if (effects && effects.punch) effects.punch(0.22, 0.24);
    }
    // the whip itself: a green arc of leaf-bursts down the line
    for (let i = 1; i <= 4; i++) {
      const f = i / 4;
      juice.burst(px + fx * VINE_RANGE * f, 0.5 + 0.25 * Math.sin(f * Math.PI), pz + fz * VINE_RANGE * f, 0x8fdc6a, 5);
    }
    // the lash is a 3.8 x 0.9 CORRIDOR, so it is drawn as a narrow wedge from
    // Kael's feet — atan(0.9 / 3.8) is 13 degrees — not as a disc thrown ahead
    if (effects) effects.groundSlam({ x: px, z: pz }, 0x6fae4a, VINE_RANGE,
      { deg: 13, fx, fz });
    this.specialCooldown = this.specialMax;
    return true;
  }

  // Frost Wolf FROST BREATH: a cone of rime that SHATTERS ice (the region-4
  // verb — it opens the ice-sealed spring promised back in the Wild Woods)
  // and freezes anything caught in it solid. A frozen enemy is helpless AND
  // brittle: the next hit shatters it for bonus damage, so the breath is a
  // set-up, not a kill — the same "combo your tools" lesson as the elements.
  tryFrostBreath(effects, world) {
    if (state.form !== 'frost_wolf') return false;
    if (this.specialCooldown > 0 || this.lockTime > 0) return false;
    this._playOnce('attack');
    this.lockTime = 0.5;
    this._softLock = false;
    const px = this.root.position.x, pz = this.root.position.z;
    const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
    const CONE = Math.cos(THREE.MathUtils.degToRad(FROST_CONE_DEG));
    audio.play('whoosh', { volume: 0.9, rate: 1.5 });
    audio.play('puff', { volume: 0.6, rate: 0.7 });
    if (world.enemies) {
      for (const e of world.enemies) {
        if (e.dead) continue;
        const dx = e.x - px, dz = e.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > FROST_RANGE + e.radius) continue;
        if (d > 0.2 && (dx * fx + dz * fz) / d < CONE) continue;
        e.takeDamage(FROST_DMG, 'frost', 'aoe');
        // FROZEN: held in place and brittle until it thaws
        if (!e.dead && e.takeStun) e.takeStun(FROST_FREEZE);
        if (!e.dead) e.frozen = Math.max(e.frozen || 0, FROST_FREEZE);
      }
    }
    // ...and SHATTER any ice in the cone (gates.js registers shatterables)
    if (world.shatterAt) {
      for (let i = 1; i <= 3; i++) {
        const r = (FROST_RANGE * i) / 3;
        if (world.shatterAt(px + fx * r, pz + fz * r, 1.9) > 0) {
          if (effects && effects.punch) effects.punch(0.2, 0.22);
          break;
        }
      }
    }
    // the breath itself: three widening puffs of pale rime down the cone
    for (let i = 0; i < 3; i++) {
      const reach = 0.9 + i * 0.95;
      const spread = 0.3 * (i + 1);
      juice.burst(
        px + fx * reach + (Math.random() * 2 - 1) * spread, 0.7,
        pz + fz * reach + (Math.random() * 2 - 1) * spread,
        i === 2 ? 0xeaffff : 0xbfefff, 9);
    }
    // the breath is a CONE, so draw the cone: same half-angle and same reach
    // the hit test uses, from Kael's feet
    if (effects) effects.groundSlam({ x: px, z: pz }, 0x9be3ff, FROST_RANGE,
      { deg: FROST_CONE_DEG, fx, fz });
    this.specialCooldown = this.specialMax;
    return true;
  }

  // Knight WHIRLWIND: Kael spins with his sword out and strikes everything
  // around him — the answer to being surrounded (KayKit's spin clip; the
  // rig library already ships it). Full 360° arc via arcCos -1.
  trySpinAttack(effects, world) {
    if (state.form !== 'knight') return false;
    if (this.specialCooldown > 0 || this.lockTime > 0) return false;
    this._playOnce('special', 0.06);
    // playtest (v3.18.1): "sped up significantly" — the spin whips around
    // at 1.7x, so the whole whirlwind is ~0.4s of blur instead of a lazy turn
    this.form.actions.special.setEffectiveTimeScale(SPIN_TIMESCALE);
    this.lockTime = 0.5;
    this._softLock = false;
    const cfg = this.attackConfig();
    this._pendingHit = {
      timer: 0.22,
      range: Math.max(SPIN_RANGE, cfg.range),
      dmg: cfg.dmg * SPIN_DMG_MULT,
      arcCos: -1, // the whole circle — behind him too
      stun: cfg.stun, element: cfg.element, // hammer spin = a dizzying WHAM-nado
    };
    audio.play('sword-swing', { volume: 0.9, rate: 0.85 });
    audio.play('sword-swing2', { volume: 0.8, rate: 1.2 });
    audio.play('whoosh', { volume: 0.8, rate: 0.9, vary: 0.06 });
    // UNMISSABLE: a steel-blue shockwave ring sweeps out to the spin's
    // reach + a spark ring + a camera punch (playtest: it must never
    // read as "nothing happened")
    if (effects) {
      effects.groundSlam(this.root.position.clone(), 0xbfe3ff, SPIN_RANGE);
      if (effects.punch) effects.punch(0.22, 0.22);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      juice.burst(this.root.position.x + Math.cos(a) * 1.6, 0.8,
        this.root.position.z + Math.sin(a) * 1.6, 0xbfe3ff, 3);
    }
    this.specialCooldown = this.specialMax;
    return true;
  }

  // Earth Wolf stone-stomp: a quake that dazes grounded enemies and smashes
  // cracked rock piles (the Stoneroot region verb).
  tryStoneStomp(effects, world) {
    if (state.form !== 'earth_wolf') return false;
    if (this.specialCooldown > 0 || this.lockTime > 0) return false;
    this._playOnce('attack');
    this.lockTime = 0.5;
    this._softLock = false;
    // stamped so a ROOM can react to a stomp without the player having to know
    // what a room is — the Rattle (Level 2) listens for one on its plate
    this.stompedAt = performance.now();
    const { x, z } = { x: this.root.position.x, z: this.root.position.z };
    effects.groundSlam(this.root.position.clone(), 0xd8b06a, STOMP_RADIUS);
    effects.shake(0.3, 0.35);
    audio.play('slam', { rate: 0.75 });
    if (world.enemies) {
      for (const e of world.enemies) {
        if (e.dead || e.flying) continue;
        const dx = e.x - x, dz = e.z - z;
        if (dx * dx + dz * dz > STOMP_RADIUS * STOMP_RADIUS) continue;
        // GUARD BREAK. A stomp at the feet of anything hiding behind a raised
        // shield knocks it off balance — the Bone Warden's answer, and the
        // same lesson taught earlier on the shieldlings. The mechanic already
        // fell out of "stun drops the guard"; what was missing was any way for
        // a child to LEARN it, so the break now announces itself.
        const wasGuarding = !!e.shieldUp;
        e.takeDamage(2, 'earth', 'aoe');
        if (e.takeStun) e.takeStun(STOMP_STUN);
        if (wasGuarding && !e.dead) {
          if (world.onDmgNum) world.onDmgNum(e.x, 1.6, e.z, 'GUARD BROKEN!');
          audio.play('parry', { volume: 0.8, rate: 1.5 });
          if (effects) effects.punch(0.3, 0.28);
          this.brokeGuardAt = performance.now();   // rooms may react (Level 2)
        }
      }
    }
    // STOMP_RADIUS, not SLAM_BURN_RADIUS. This cracked rock at 2.6u — the FIRE
    // wolf's constant, leaked into the earth wolf's move — while the ring and
    // the damage both said 3.2. A child stomping a cracked rock 3u away saw it
    // swept by the ring and nothing happened.
    if (world.crackAt(x, z, STOMP_RADIUS) > 0) audio.play('slam', { volume: 0.9, rate: 1.3 });
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
    this._softLock = false;
    const { x, z } = { x: this.root.position.x, z: this.root.position.z };
    effects.groundSlam(this.root.position.clone(), 0xff7a2a, SLAM_RADIUS);
    audio.play('slam');
    if (world.damageEnemiesAt) world.damageEnemiesAt(x, z, SLAM_RADIUS, 2, 'fire');
    // one ring, one number: burn and ignite now reach exactly as far as the
    // damage and the ring do. A brazier at 2.8u used to sit inside the orange
    // ring and refuse to light.
    if (world.burnAt(x, z, SLAM_RADIUS) > 0) audio.play('burn');
    if (world.igniteAt) world.igniteAt(x, z, SLAM_RADIUS);
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
    if (this.lungeCooldown > 0) this.lungeCooldown -= dt;
    // Blood Moon Surge lifecycle (ceremony beats, then the surge timer)
    if (this._ceremony) this._tickCeremony(dt);
    else if (this._surge) this._tickSurge(dt);
    if (this._popTime > 0) {
      this._popTime -= dt;
      const p = 1 - Math.max(0, this._popTime) / 0.22;
      const s = 0.6 + 0.4 * (1 - (1 - p) * (1 - p));
      f.model.scale.setScalar(this._baseScale() * s);
    }

    // in-combat trickle: enemies close by feed the gauge a little every
    // second — the hidden assist that shortens a hard fight
    if (world.enemies && (state.moonGauge || 0) < 1) {
      for (const e of world.enemies) {
        if (e.dead || e.scenery) continue; // pots are not pressure
        const dx = e.x - this.root.position.x, dz = e.z - this.root.position.z;
        if (dx * dx + dz * dz < 81) { // within 9u
          this.gainMoon(CONFIG.MOON.COMBAT_PER_S * dt);
          break;
        }
      }
    }

    // WOLF SENSES (FORM_DEFS.senses): hidden things — unburned cubbies,
    // cracked rock, unopened chests — shimmer moonlight while the Dark Wolf
    // is near. An in-world cue, never a UI marker (WORLD-DESIGN §4).
    if (f.def.senses) {
      this._senseAcc = (this._senseAcc || 0) + dt;
      if (this._senseAcc > 1.1) {
        this._senseAcc = 0;
        const R2 = CONFIG.FORMS.SENSE_RANGE * CONFIG.FORMS.SENSE_RANGE;
        const px = this.root.position.x, pz = this.root.position.z;
        const shimmer = (x, z) => {
          const dx = x - px, dz = z - pz;
          if (dx * dx + dz * dz < R2) juice.burst(x, 0.9, z, 0x9fb8ff, 2);
        };
        for (const b of world.burnables || []) if (!b.burned) shimmer(b.x, b.z);
        for (const c of world.crackables || []) if (!c.cracked) shimmer(c.x, c.z);
        for (const c of world.chests || []) if (!c.opened) shimmer(c.x, c.z);
      }
    }

    // FOOTSTEPS: cadence follows real speed; grass in the Den, stone
    // everywhere else. Wolves patter — lighter, quicker steps.
    {
      const spd = Math.hypot(this._vel.x, this._vel.z);
      if (this.airY <= 0 && !this._roll && !this._lavaBounce && !this._dash && spd > 1.2 && this.lockTime <= 0) {
        this._stepAcc = (this._stepAcc || 0) + spd * dt;
        const stride = state.form === 'knight' ? 1.4 : 1.15;
        if (this._stepAcc > stride) {
          this._stepAcc = 0;
          this._stepIdx = ((this._stepIdx || 0) + 1) % 3;
          const mat = state.room === 'den' ? 'grass' : 'stone';
          audio.play(`step-${mat}-${this._stepIdx}`, {
            volume: state.form === 'knight' ? 0.3 : 0.2,
            rate: state.form === 'knight' ? 1 : 1.25,
            vary: 0.08,
          });
        }
      } else {
        this._stepAcc = 0;
      }
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

    // Lava ouch-leap: an animated backwards arc OUT of the lava to the last
    // safe footing (set in _hazards). Overrides movement while it plays.
    if (this._lavaBounce) {
      const b = this._lavaBounce;
      b.t += dt;
      const p = Math.min(1, b.t / b.dur);
      this.root.position.x = b.fromX + (b.toX - b.fromX) * p;
      this.root.position.z = b.fromZ + (b.toZ - b.fromZ) * p;
      this.airY = Math.sin(p * Math.PI) * 0.6; // the startled hop arc
      this.root.position.y = this.airY;
      if (p >= 1) {
        this._lavaBounce = null;
        this.airY = 0;
        this.airV = 0;
        this.root.position.y = 0;
      }
    }

    // DASH DRIVE (lunge + step-in bite): a straight, collision-solved push
    // that overrides stick movement while it plays.
    if (this._dash) {
      const d = this._dash;
      d.t += dt;
      const s = world.resolveCircle(
        this.root.position.x + d.dx * d.speed * dt,
        this.root.position.z + d.dz * d.speed * dt, BODY_RADIUS);
      this.root.position.x = s.x;
      this.root.position.z = s.z;
      if (d.hop) {
        this.airY = Math.sin(Math.min(1, d.t / d.dur) * Math.PI) * d.hop;
        this.root.position.y = this.airY;
      }
      if (d.t >= d.dur) {
        this._dash = null;
        if (d.hop) { this.airY = 0; this.root.position.y = 0; }
      }
    }

    // DODGE ROLL: tapping the shield WHILE MOVING tumbles Kael in the stick
    // direction with brief i-frames. Holding it while standing still raises
    // the shield exactly as before (Knight only — wolves dodge, never hide).
    const defendPressed = input.defending && !this._defendWasHeld;
    this._defendWasHeld = input.defending;
    const mvMag = Math.hypot(input.move.x, input.move.z);
    if (defendPressed && mvMag > 0.35 && this.lockTime <= 0 && !this._roll &&
        !this._lavaBounce && this.airY <= 0) {
      const inv = 1 / mvMag;
      this._roll = { t: 0, dx: input.move.x * inv, dz: input.move.z * inv };
      this.iframes = Math.max(this.iframes, CONFIG.ROLL_IFRAMES);
      this.lockTime = CONFIG.ROLL_DUR;
      this._softLock = false;
      this.root.rotation.y = Math.atan2(this._roll.dx, this._roll.dz);
      this._playOnce('jump', 0.06);
      audio.play('whoosh', { volume: 0.75, rate: 1.1, vary: 0.1 }); // tumble
    }
    if (this._roll) {
      const r = this._roll;
      r.t += dt;
      const s = world.resolveCircle(
        this.root.position.x + r.dx * CONFIG.ROLL_SPEED * dt,
        this.root.position.z + r.dz * CONFIG.ROLL_SPEED * dt, BODY_RADIUS);
      this.root.position.x = s.x;
      this.root.position.z = s.z;
      this.airY = Math.sin(Math.min(1, r.t / CONFIG.ROLL_DUR) * Math.PI) * 0.28;
      this.root.position.y = this.airY;
      if (r.t >= CONFIG.ROLL_DUR) {
        this._roll = null;
        this.airY = 0;
        this.root.position.y = 0;
      }
    }

    // shield state: track raise time for the parry window (Knight-only —
    // FORM_DEFS.shield; a wolf holding the button simply keeps prowling)
    const wantDefend = input.defending && !!f.def.shield && this.lockTime <= 0 && this.airY <= 0;
    if (wantDefend && !this.defending) this.defendStart = this._time;
    this.defending = wantDefend;

    // locks: attacks allow reduced-speed drift; specials root Kael fully
    let locked = false;
    let lockMove = 1;
    if (this.lockTime > 0) {
      this.lockTime -= dt;
      locked = true;
      if (this.lockTime <= 0 && this._queuedForm) {
        // a switch requested mid-swing lands the instant the swing ends
        const qf = this._queuedForm;
        this._queuedForm = null;
        this.setForm(qf);
        locked = this.lockTime > 0;
      }
      if (this.lockTime <= 0 && this._queuedAttack) {
        this._queuedAttack = false;
        locked = false;
        this.tryAttack(world, input); // buffered tap fires the instant the swing ends
        locked = this.lockTime > 0;
      }
      // a live dash steers itself — stick drift must not fight it
      if (locked && (!this._softLock || this._dash)) {
        this._vel.x = 0; this._vel.z = 0;
        f.mixer.update(dt);
        this._hazards(dt, world);
        return;
      }
      if (locked) lockMove = CONFIG.ATTACK_MOVE_MULT;
    }

    const move = input.getMove();
    const mag = Math.hypot(move.x, move.z);
    let speedMult = (this.defending ? DEFEND_SPEED_MULT : 1) * (1 + (state.perks.speed || 0) * 0.05);
    if (this.buffs.star > 0) speedMult *= 1.4;
    const top = f.def.speed * speedMult * lockMove;

    // accelerate ~CONFIG.ACCEL_TIME to full, brake ~CONFIG.DECEL_TIME to stop
    const tx = move.x * top, tz = move.z * top;
    const speeding = Math.hypot(tx, tz) > Math.hypot(this._vel.x, this._vel.z);
    const rate = (f.def.speed * speedMult) / (speeding ? CONFIG.ACCEL_TIME : CONFIG.DECEL_TIME);
    let dvx = tx - this._vel.x, dvz = tz - this._vel.z;
    const dv = Math.hypot(dvx, dvz);
    const maxStep = rate * dt;
    if (dv > maxStep && dv > 1e-6) { dvx *= maxStep / dv; dvz *= maxStep / dv; }
    this._vel.x += dvx; this._vel.z += dvz;
    const vmag = Math.hypot(this._vel.x, this._vel.z);

    if (vmag > 0.02) {
      const solved = world.resolveCircle(
        this.root.position.x + this._vel.x * dt,
        this.root.position.z + this._vel.z * dt, BODY_RADIUS);
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;
    }
    // facing follows stick intent (not while a swing holds the aim)
    if (!locked && mag > 0.01) {
      const target = Math.atan2(move.x, move.z);
      let delta = target - this.root.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const turn = TURN_SPEED * (f.def.turnMult || 1); // the hunter turns on a claw
      this.root.rotation.y += THREE.MathUtils.clamp(delta, -turn * dt, turn * dt);
    }

    if (locked) {
      // keep the attack animation; just drift
    } else if (this.airY > 0) this._play('jump', 0.1);
    else if (this.defending) this._play('block', 0.12);
    else if (vmag > 0.1) this._play(vmag / Math.max(0.01, f.def.speed * speedMult) > RUN_THRESHOLD ? 'run' : 'walk');
    else this._play('idle');

    if (locked) {
      f.mixer.update(dt);
      this._hazards(dt, world);
      return;
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
    if (this.hurtFlashT > 0) this.hurtFlashT -= dt;
    const hz = world.hazardAt(this.root.position.x, this.root.position.z);
    // remember the last safe footing (used for the lava bounce-back)
    if (!hz && this.airY <= 0) {
      if (!this._lastSafe) this._lastSafe = { x: 0, z: 0 };
      this._lastSafe.x = this.root.position.x;
      this._lastSafe.z = this.root.position.z;
    }
    // Fire ignores shields — but a well-timed jump clears small lava gaps.
    // Lava is IMPASSABLE on foot: EVERY grounded touch bounces Kael back to
    // land (damage only when i-frames are down, so it can't shred a kid, but
    // the bounce always fires — you cannot walk across during i-frames).
    // Deliberate jumps still clear gaps: airborne skips this entirely.
    if (!this.airborne && hz && !this._lavaBounce) {
      if (this.iframes <= 0) {
        this.damage(1);
        this.iframes = Math.max(IFRAME_TIME, LAVA_TICK);
      }
      audio.play('burn', { volume: 0.55, rate: 1.35 }); // sizzle!
      // OUCH — leap BACKWARDS out of the lava to the last safe footing,
      // facing the lava the whole way (the classic startled Zelda bounce).
      // The arc itself plays in update() so kids SEE the jump, not a blink.
      if (this._lastSafe) {
        const s = world.resolveCircle(this._lastSafe.x, this._lastSafe.z, BODY_RADIUS);
        this._lavaBounce = {
          t: 0, dur: 0.32,
          fromX: this.root.position.x, fromZ: this.root.position.z,
          toX: s.x, toZ: s.z,
        };
        this.root.rotation.y = Math.atan2(this._lavaBounce.fromX - s.x, this._lavaBounce.fromZ - s.z);
        this._roll = null; // the ouch-leap overrides a roll in progress
        this._dash = null; // ...and any lunge/step-in
        this._vel.x = 0; this._vel.z = 0;
        this.airV = 0;
        this.jumpsUsed = 2;
        this.lockTime = Math.max(this.lockTime, 0.35); // input can't fight the leap
        this._softLock = false;
      }
    }
    const flicker = this.hurtFlashT > 0 && Math.sin(this.hurtFlashT * 30) > 0;
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
    this.hurtFlashT = 0.9;
    this.gainMoon(CONFIG.MOON.PER_HURT); // pressure feeds the moon
    audio.play('hurt', { volume: 0.9 });
    if (this.onDamaged) this.onDamaged(this.hearts);
    if (this.hearts === 0) {
      this.abortSurge(); // a fall ends the surge quietly, no refund
      if (this.onDefeated) this.onDefeated();
    }
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
