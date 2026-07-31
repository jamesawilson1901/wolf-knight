// Enemies — per design/COMBAT-SPEC.md. Forgiving and readable: slow grunts,
// ~1-second telegraphs on anything that lunges, puff-of-smoke deaths.
// Shades and Ember Moths are code-built shadow creatures (ASSETS.md casting
// sheet); the Shadow Hound is the Quaternius wolf tinted near-black.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { audio } from './audio.js';
import { grantXp, XP_VALUES, bumpCounter, enemyScale } from './progress.js';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { juice } from './juice.js';

// ---------------------------------------------------------------------------
// Death puff: a harmless burst of smoke
// ---------------------------------------------------------------------------

function smokePuff(world, x, y, z, tint = 0x5a4d66) {
  const bits = [];
  const mat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.85, depthWrite: false });
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + (i % 3) * 0.05, 0), mat.clone());
    const a = (i / 8) * Math.PI * 2 + 0.4;
    m.position.set(x, y + 0.15 * (i % 3), z);
    m.userData.v = new THREE.Vector3(Math.cos(a) * (1 + (i % 2)), 1.4 + (i % 3) * 0.5, Math.sin(a) * (1 + ((i + 1) % 2)));
    world.add(m);
    bits.push(m);
  }
  let life = 0.65;
  world.onAnimate((t, dt) => {
    if (life <= 0) return;
    life -= dt;
    for (const m of bits) {
      m.position.addScaledVector(m.userData.v, dt);
      m.userData.v.y -= dt * 2.2;
      m.scale.multiplyScalar(1 + dt * 2.4);
      m.material.opacity = Math.max(0, 0.85 * (life / 0.65));
    }
    if (life <= 0) for (const m of bits) world.root.remove(m);
  });
}

// ---------------------------------------------------------------------------
// Base enemy
// ---------------------------------------------------------------------------

// Elemental traits (design/GAME-CONTRACT.md): every family has a WEAKNESS
// that takes 1.5x; ARMORED bone takes half from steel (the knight's sword)
// but 1.35x from anything magical (bolts, wolf bites, wolf specials).
// Grimm's shadow-things fear Luna's MOON; old bones fear FIRE.
const TRAITS = {
  Shade: { weakness: 'moon' },
  Moth: { weakness: 'moon' },
  Hound: { weakness: 'moon' },
  Slime: { weakness: 'fire' },
  Bat: { weakness: 'fire' },
  SkeletonMinion: { weakness: 'fire', armored: true },
  SkeletonRogue: { weakness: 'fire', armored: true },
  BoneWarden: { weakness: 'fire', armored: true },
};

class Enemy {
  constructor(world, x, z, { hp, radius }) {
    this.world = world;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    world.add(this.root);
    // gentle level scaling on hp (behaviors carry real difficulty).
    // 🌸 Gentle profiles skip the playtest hp bonus.
    const bonus = state.settings.easy ? 0 : CONFIG.DIFFICULTY.ENEMY_HP_BONUS;
    this.hp = Math.round((hp + bonus) * enemyScale() * 2) / 2;
    this.maxHp = this.hp;
    this.radius = radius;
    this.dead = false;
    this.stunned = 0;
    this._flash = 0;
    this._flashMats = [];
    const tr = TRAITS[this.constructor.name] || {};
    this.weakness = tr.weakness || null;
    this.armored = !!tr.armored;
  }

  // Grounded enemies obey lava exactly like Kael — they cannot walk in.
  // Flyers cross freely. Returns the resolved position (or "stay put").
  _moveSolved(nx, nz) {
    const s = this.world.resolveCircle(nx, nz, this.radius);
    if (!this.flying && this.world.hazardAt(s.x, s.z)) return { x: this.x, z: this.z };
    return s;
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  // A perfect parry dazes this enemy: no moving, no hurting, slow wobble.
  takeStun(sec) {
    if (this.dead) return;
    this.stunned = Math.max(this.stunned, sec);
  }

  // Returns true while stunned (callers skip their AI for the frame).
  stunUpdate(dt) {
    if (this.stunned <= 0) return false;
    this.stunned -= dt;
    this.root.rotation.y += dt * 5;              // dizzy spin
    this.root.position.y = Math.abs(Math.sin(this.stunned * 9)) * 0.06;
    if (this.stunned <= 0) this.root.position.y = 0;
    this.flashUpdate(dt);
    return true;
  }

  // element: 'steel' (knight sword) | 'spark' | 'moon' | 'fire' | 'earth'.
  // kind: 'melee' | 'bolt' | 'aoe' — some enemies react per kind (dodges).
  takeDamage(n, element = 'steel', kind = 'melee') {
    if (this.dead) return;
    let mult = 1;
    if (this.armored) {
      if (element === 'steel') {
        mult *= 0.5; // steel skitters off old bone...
        audio.play('parry', { volume: 0.3, rate: 1.5 }); // armor clank teach
      } else {
        mult *= 1.35; // ...but magic bites deep
      }
    }
    const weak = this.weakness && element === this.weakness;
    if (weak) mult *= 1.5;
    n = Math.round(n * mult * 2) / 2;
    if (n <= 0) n = 0.5;
    if (this.stunned > 0) n *= 2; // parry payoff: dizzy enemies take double
    this.hp -= n;
    this._flash = 0.14;
    this._pop = weak ? 0.2 : 0.14;    // weakness hits pop harder
    if (weak) juice.burst(this.x, 0.9, this.z, 0xffe14a, 8); // gold flare
    if (this.world.onDmgNum) this.world.onDmgNum(this.x, 0.9, this.z, n);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    grantXp(XP_VALUES[this.constructor.name] || 0);
    bumpCounter('kills');
    smokePuff(this.world, this.x, 0.5, this.z, this.puffTint || 0x5a4d66);
    audio.play('puff', { volume: 0.8 });
    // sometimes shadows leave a warm ember behind — a little half-heart heal
    const chance = this.dropChance !== undefined ? this.dropChance : 0.35;
    if (Math.random() < chance) spawnEmberDrop(this.world, this.x, this.z);
    this.world.root.remove(this.root);
  }

  contact(player, dmg = 1, { ground = true } = {}) {
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const rr = this.radius + 0.32;
    if (dx * dx + dz * dz < rr * rr) {
      player.hurt(dmg, { attacker: this, groundAttack: ground });
    }
  }

  flashUpdate(dt) {
    if (this._pop > 0) {
      this._pop -= dt;
      const f = Math.max(0, this._pop) / 0.14;
      this.root.scale.setScalar(1 + 0.28 * Math.sin(f * Math.PI));
      if (this._pop <= 0) this.root.scale.setScalar(1);
    }
    if (this._flash <= 0) return;
    this._flash -= dt;
    const on = this._flash > 0 && Math.sin(this._flash * 60) > -0.4;
    for (const m of this._flashMats) {
      m.emissive && m.emissive.setHex(on ? 0xffffff : (m.userData.baseEmissive || 0x000000));
      m.emissiveIntensity = on ? 0.9 : (m.userData.baseEmissiveIntensity || 0);
    }
  }

  registerFlashMats(root) {
    root.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) {
        if (!m.emissive) continue;
        m.userData.baseEmissive = m.emissive.getHex();
        m.userData.baseEmissiveIntensity = m.emissiveIntensity;
        this._flashMats.push(m);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Shadow Hound — elite. Stalks, crouches (streak telegraph ~1s), charges.
// ---------------------------------------------------------------------------

export class Hound extends Enemy {
  constructor(world, x, z, wolfGltf) {
    super(world, x, z, { hp: 3, radius: 0.4 });
    this.puffTint = 0x241a30;
    this.dropChance = 1; // the elite always leaves an ember

    const model = prepareCharacter(SkeletonUtils.clone(wolfGltf.scene));
    model.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (m.name === 'Eyes_Black') {
          c.emissive = new THREE.Color(0xff3a2a);
          c.emissiveIntensity = 1.4;
        } else {
          c.color.setHex(m.name === 'Main_Light' ? 0x2a2136 : 0x171021);
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    model.scale.setScalar(0.35);
    this.root.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [key, name] of Object.entries({
      walk: 'Walk', crouch: 'Idle_2_HeadLow', charge: 'Gallop', idle: 'Idle', die: 'Death',
    })) {
      const clip = wolfGltf.animations.find((c) => c.name === name);
      this.actions[key] = this.mixer.clipAction(clip);
    }
    this._current = null;
    this._play('idle');
    this.registerFlashMats(this.root);

    // charge-lane telegraph streak
    this.streak = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 6),
      new THREE.MeshBasicMaterial({ color: 0x0d0716, transparent: true, opacity: 0, depthWrite: false })
    );
    this.streak.rotation.x = -Math.PI / 2;
    this.streak.position.y = 0.05;
    world.add(this.streak);

    this.state = 'stalk';
    this.stateT = 0;
    this.chargeDir = { x: 0, z: 1 };
  }

  _play(name, fade = 0.18) {
    if (this._current === name) return;
    const next = this.actions[name];
    next.reset().play();
    if (this._current) this.actions[this._current].crossFadeTo(next, fade, false);
    this._current = name;
  }

  die() {
    this.world.root.remove(this.streak);
    super.die();
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    this.stateT += dt;
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'stalk') {
      this._play('walk');
      if (d > 0.01) {
        const speed = 1.8; // playtest bump: stalks with intent
        const nx = this.x + (dx / d) * speed * dt;
        const nz = this.z + (dz / d) * speed * dt;
        const solved = this._moveSolved(nx, nz);
        this.root.position.x = solved.x;
        this.root.position.z = solved.z;
        this.root.rotation.y = Math.atan2(dx, dz);
      }
      if (d < 4.4 && this.stateT > 1.2) {
        this.state = 'crouch';
        this.stateT = 0;
        const dd = Math.max(d, 0.01);
        this.chargeDir = { x: dx / dd, z: dz / dd };
        this.root.rotation.y = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      }
    } else if (this.state === 'crouch') {
      // ~1s telegraph: crouch low + a shadow streak shows the charge lane
      this._play('crouch', 0.1);
      this.model.scale.y = 0.35 * (1 - 0.18 * Math.min(1, this.stateT * 2));
      const f = Math.min(1, this.stateT / 1.0);
      this.streak.material.opacity = f * 0.55;
      this.streak.position.set(this.x + this.chargeDir.x * 3.2, 0.05, this.z + this.chargeDir.z * 3.2);
      this.streak.rotation.z = -Math.atan2(this.chargeDir.x, this.chargeDir.z);
      if (this.stateT >= 1.0) { this.state = 'charge'; this.stateT = 0; }
    } else if (this.state === 'charge') {
      this._play('charge', 0.08);
      this.model.scale.y = 0.35;
      this.streak.material.opacity = Math.max(0, this.streak.material.opacity - dt * 2);
      const speed = 9.6; // playtest bump: the charge should scare a little
      const nx = this.x + this.chargeDir.x * speed * dt;
      const nz = this.z + this.chargeDir.z * speed * dt;
      const solved = this._moveSolved(nx, nz);
      const blocked = Math.hypot(solved.x - nx, solved.z - nz) > 0.01;
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;
      this.contact(player);
      if (this.stateT > 0.7 || blocked) { this.state = 'recover'; this.stateT = 0; }
    } else { // recover — slow, vulnerable
      this._play('idle', 0.25);
      this.streak.material.opacity = 0;
      if (this.stateT > 1.6) { this.state = 'stalk'; this.stateT = 0; }
    }

    if (this.state !== 'charge') this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Cave Slime — Quaternius animated monster. Slow, squishy, hops after Kael
// and squelches into him. The caverns' gentle "first contact" enemy.
// ---------------------------------------------------------------------------

export class Slime extends Enemy {
  constructor(world, x, z, gltf) {
    super(world, x, z, { hp: 2, radius: 0.4 });
    this.puffTint = 0x7fc46a;
    this.aggroRange = 6.5;
    this.speed = 1.2; // playtest bump
    this.splits = true;   // cave slimes burst into two minis when smashed
    this._gltf = gltf;
    const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    model.scale.setScalar(0.26);
    this.model = model;
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [k, n] of Object.entries({
      idle: 'Armature|Slime_Idle', walk: 'Armature|Slime_Walk', attack: 'Armature|Slime_Attack',
    })) {
      const clip = gltf.animations.find((c) => c.name === n);
      if (clip) this.actions[k] = this.mixer.clipAction(clip);
    }
    this._current = null;
    this._play('idle');
    this.registerFlashMats(this.root);
    this.attackT = 0;
  }

  _play(name, fade = 0.2) {
    if (this._current === name) return;
    const next = this.actions[name];
    if (!next) return;
    next.reset().play();
    if (this._current && this.actions[this._current]) {
      this.actions[this._current].crossFadeTo(next, fade, false);
    }
    this._current = name;
  }

  die() {
    if (this.splits && !this.mini && this.world.enemies) {
      for (const off of [-0.35, 0.35]) {
        const m = new Slime(this.world, this.x + off, this.z - off, this._gltf);
        m.mini = true; m.splits = false;
        m.hp = 1; m.speed = 2.0; m.radius = 0.22; // minis nip at the heels
        m.model.scale.setScalar(0.14);
        this.world.enemies.push(m);
      }
    }
    super.die();
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < this.aggroRange && d > 0.01) {
      this._play('walk');
      const speed = this.speed;
      const solved = this._moveSolved(this.x + (dx / d) * speed * dt, this.z + (dz / d) * speed * dt);
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;
      this.root.rotation.y = Math.atan2(dx, dz);
    } else {
      this._play('idle');
    }
    this.attackT -= dt;
    if (d < 1.1 && this.attackT <= 0) {
      this.attackT = 1.8;
      const act = this.actions.attack;
      if (act) { act.reset(); act.setLoop(THREE.LoopOnce); act.play(); this._current = 'attack'; }
    }
    this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Shade — the corruption itself: a slime given shadow. Same gentle chase as
// its cave cousin, dressed in deep violet with ember eyes.
// ---------------------------------------------------------------------------

export class Shade extends Slime {
  constructor(world, x, z, gltf) {
    super(world, x, z, gltf);
    this.puffTint = 0x4a3f5c;
    this.radius = 0.34;
    this.aggroRange = 7;
    this.speed = 3.3;      // burst speed — shades move in sudden skips (playtest bump)
    this.splits = false;   // shadow, not jelly
    this.model.scale.setScalar(0.23);
    this.model.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (m.name === 'Eyes') {
          c.color.setHex(0x000000);
          c.emissive = new THREE.Color(0xff7a3a);
          c.emissiveIntensity = 1.6;
        } else {
          c.color.setHex(0x241a38);
          c.emissive = new THREE.Color(0x2a1b3a);
          c.emissiveIntensity = 0.35;
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    this._flashMats = [];
    this.registerFlashMats(this.root);
    this._lurchT = 0;
  }

  // Lurch rhythm: rest ~0.8s, then a quick 0.4s skip toward Kael. A totally
  // different read from the cave slime's steady squelch.
  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    this._lurchT -= dt;
    if (this._lurchT <= -0.8) this._lurchT = 0.4;
    if (d < this.aggroRange && d > 0.01 && this._lurchT > 0) {
      this._play('walk');
      const sv = this._moveSolved(this.x + (dx / d) * this.speed * dt, this.z + (dz / d) * this.speed * dt);
      this.root.position.x = sv.x;
      this.root.position.z = sv.z;
      this.root.rotation.y = Math.atan2(dx, dz);
    } else {
      this._play('idle');
    }
    this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Cave Bat — Quaternius animated monster. Roosts half-asleep, flutters up
// when Kael comes near, telegraphs with a fast flap, then dives. The bolt's
// natural prey (flying=true), same rhythm the Ember Moths teach.
// ---------------------------------------------------------------------------

export class Bat extends Enemy {
  constructor(world, x, z, gltf) {
    super(world, x, z, { hp: 1, radius: 0.3 });
    this.puffTint = 0x4a3f5c;
    this.flying = true;
    this.home = { x, z };
    const model = prepareCharacter(SkeletonUtils.clone(gltf.scene));
    model.scale.setScalar(0.13);
    model.position.y = -0.25; // wings pivot high on the rig — recenter
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const fly = gltf.animations.find((c) => c.name === 'BatArmature|Bat_Flying');
    this.flyAction = fly ? this.mixer.clipAction(fly) : null;
    if (this.flyAction) { this.flyAction.play(); this.flyAction.timeScale = 0.25; } // sleepy flutter
    this.registerFlashMats(this.root);
    this.state = 'roost';
    this.stateT = 0;
    this.diveDir = { x: 0, z: 0 };
    this.landsAfterDive = true; // cave bats crash-land, winded — sword window
    this.doubleDive = false;    // moths override with a second swoop
    this._seed = x * 2.3 + z;
    this.root.position.y = 1.5;
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    this.stateT += dt;
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'roost') {
      this.root.position.y = 1.5 + Math.sin(t * 1.4 + this._seed) * 0.06;
      if (d < 5) {
        this.state = 'hover';
        this.stateT = 0;
        if (this.flyAction) this.flyAction.timeScale = 1;
      }
    } else if (this.state === 'hover') {
      this.root.position.x += (this.home.x + Math.sin(t * 0.9 + this._seed) * 0.7 - this.x) * dt;
      this.root.position.z += (this.home.z + Math.cos(t * 0.7 + this._seed) * 0.7 - this.z) * dt;
      this.root.position.y = 1.4 + Math.sin(t * 2.6 + this._seed) * 0.15;
      this.root.rotation.y = Math.atan2(dx, dz);
      if (d < 4.6 && this.stateT > 1.0) { this.state = 'telegraph'; this.stateT = 0; }
    } else if (this.state === 'telegraph') {
      // fast flap + rising pitch flutter (~0.8s) before the swoop
      if (this.flyAction) this.flyAction.timeScale = 2.6;
      if (this.glowMats) {
        for (const m of this.glowMats) m.emissiveIntensity = 1.1 + (this.stateT / 0.8) * 2.4;
      }
      this.root.rotation.y = Math.atan2(dx, dz);
      if (this.stateT >= 0.8) {
        this.state = 'dive';
        this.stateT = 0;
        const dd = Math.max(d, 0.01);
        this.diveDir = { x: dx / dd, z: dz / dd };
        audio.play('form-switch', { volume: 0.4, rate: 2.0 }); // screech-whoosh
      }
    } else if (this.state === 'dive') {
      const speed = 7.2; // playtest bump: dives demand a real dodge
      this.root.position.x += this.diveDir.x * speed * dt;
      this.root.position.z += this.diveDir.z * speed * dt;
      this.root.position.y = Math.max(0.45, this.root.position.y - dt * 2.2);
      this.contact(player, 1, { ground: false });
      if (this.stateT > 0.7) {
        if (this.doubleDive && !this._didSecond) {
          this._didSecond = true;          // wheel around for a second swoop
          this.state = 'telegraph';
          this.stateT = 0.55;              // shortened re-aim
        } else if (this.landsAfterDive) {
          this._didSecond = false;
          this.state = 'grounded';         // crash-landed and winded
          this.stateT = 0;
          this.flying = false;             // sword food while grounded
        } else {
          this._didSecond = false;
          this.state = 'return';
          this.stateT = 0;
        }
      }
    } else if (this.state === 'grounded') {
      this.root.position.y = Math.max(0.14, this.root.position.y - dt * 3);
      if (this.flyAction) this.flyAction.timeScale = 0.3;
      if (this.stateT > 1.3) {
        this.state = 'return';
        this.stateT = 0;
        this.flying = true;
        if (this.flyAction) this.flyAction.timeScale = 1;
      }
    } else { // return to the roost
      if (this.flyAction) this.flyAction.timeScale = 1;
      if (this.glowMats) for (const m of this.glowMats) m.emissiveIntensity = 1.1;
      const hx = this.home.x - this.x, hz = this.home.z - this.z;
      const hd = Math.hypot(hx, hz);
      if (hd < 0.3) { this.state = 'hover'; this.stateT = 0; }
      else {
        this.root.position.x += (hx / hd) * 2.4 * dt;
        this.root.position.z += (hz / hd) * 2.4 * dt;
        this.root.position.y = Math.min(1.5, this.root.position.y + dt);
        this.root.rotation.y = Math.atan2(hx, hz);
      }
    }
    if (this.state === 'hover' || this.state === 'telegraph') this.contact(player, 1, { ground: false });
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Ember Moth — the bat given fire: dark body, ember-glow wings that burn
// brighter through the dive telegraph. Same swoop rhythm as the cave bat.
// ---------------------------------------------------------------------------

export class Moth extends Bat {
  constructor(world, x, z, gltf) {
    super(world, x, z, gltf);
    this.puffTint = 0x6b4a3a;
    this.radius = 0.26;
    this.state = 'hover'; // moths never roost — they drift near the lava
    this.landsAfterDive = false;
    this.doubleDive = true; // swoop, wheel, swoop again
    if (this.flyAction) this.flyAction.timeScale = 1;
    this.glowMats = [];
    this.root.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (m.name === 'Black') {         // the wings
          c.color.setHex(0x1a0d08);
          c.emissive = new THREE.Color(0xff6a2a);
          c.emissiveIntensity = 1.1;
          this.glowMats.push(c);
        } else if (m.name === 'Eyes') {
          c.emissive = new THREE.Color(0xffb25a);
          c.emissiveIntensity = 1.4;
        } else {
          c.color.setHex(0x140d18);
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    this._flashMats = [];
    this.registerFlashMats(this.root);
  }
}

// ---------------------------------------------------------------------------
// Stoneroot skeletons — KayKit models on the same Rig_Medium as the knight,
// so the shared animation library retargets directly. They sleep as bone
// piles and rattle awake when Kael comes close (kids get a readable "it is
// waking up" beat before any fight starts).
// ---------------------------------------------------------------------------

class SkeletonBase extends Enemy {
  constructor(world, x, z, cfg) {
    super(world, x, z, { hp: cfg.hp, radius: cfg.radius });
    this.puffTint = 0xb8b0a0; // bone dust
    const model = prepareCharacter(SkeletonUtils.clone(cfg.gltf.scene));
    model.scale.setScalar(cfg.scale);
    this.root.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [key, name] of Object.entries(cfg.clips)) {
      const clip = cfg.anims.find((c) => c.name === name);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    this._current = null;

    // gear mounts on the sanitized handslot bones (dots stripped by GLTFLoader)
    this._handR = null;
    this._handL = null;
    model.traverse((n) => {
      if (n.name === 'handslotr') this._handR = n;
      if (n.name === 'handslotl') this._handL = n;
    });

    // asleep: a still bone pile until Kael comes close
    this.state = 'sleep';
    this.stateT = 0;
    const inactive = this.actions.inactive;
    if (inactive) { inactive.play(); inactive.paused = true; }
  }

  _play(name, fade = 0.16, { once = false } = {}) {
    if (this._current === name) return;
    const next = this.actions[name];
    if (!next) return;
    next.reset();
    next.paused = false;
    if (once) { next.setLoop(THREE.LoopOnce); next.clampWhenFinished = true; }
    next.play();
    if (this._current && this.actions[this._current]) {
      this.actions[this._current].crossFadeTo(next, fade, false);
    }
    this._current = name;
  }

  mount(hand, gltf, scale = 1) {
    const bone = hand === 'r' ? this._handR : this._handL;
    if (!bone) return;
    const m = prepareCharacter(gltf.scene.clone());
    m.scale.setScalar(scale);
    bone.add(m);
  }

  die() {
    audio.play('bones', { volume: 0.8, rate: 1.2 }); // bones clatter
    super.die();
  }

  // shared awaken logic; returns true while still waking (callers wait)
  awakenUpdate(dt, d, wakeRange) {
    if (this.state === 'sleep') {
      if (d < wakeRange) {
        this.state = 'awaken';
        this.stateT = 0;
        this._play('awaken', 0.08, { once: true });
        audio.play('bones', { volume: 0.5, rate: 0.7 }); // rattle
      }
      this.mixer.update(dt);
      return true;
    }
    if (this.state === 'awaken') {
      this.stateT += dt;
      if (this.stateT >= this.awakenTime) { this.state = 'chase'; this.stateT = 0; }
      this.mixer.update(dt);
      return true;
    }
    return false;
  }

  chaseToward(dt, dx, dz, d, speed) {
    if (d < 0.01) return;
    const nx = this.x + (dx / d) * speed * dt;
    const nz = this.z + (dz / d) * speed * dt;
    const solved = this.world.resolveCircle(nx, nz, this.radius);
    this.root.position.x = solved.x;
    this.root.position.z = solved.z;
    this.root.rotation.y = Math.atan2(dx, dz);
  }
}

// Skeleton Minion — the basic shuffler. Wakes from the floor, shambles in,
// contact damage; every few seconds it lunges with a little punch.
export class SkeletonMinion extends SkeletonBase {
  constructor(world, x, z, gltf, anims) {
    super(world, x, z, {
      hp: 2, radius: 0.36, scale: 0.5, gltf, anims,
      clips: {
        inactive: 'Skeletons_Inactive_Floor_Pose', awaken: 'Skeletons_Awaken_Floor',
        walk: 'Skeletons_Walking', idle: 'Skeletons_Idle', lunge: 'Melee_Unarmed_Attack_Punch_A',
      },
    });
    this.awakenTime = 1.9;
    this.lungeTimer = 2.0;
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    if (this.awakenUpdate(dt, d, 3.4)) return;

    if (this.state === 'chase') {
      this._play('walk');
      this.chaseToward(dt, dx, dz, d, 1.5);
      this.lungeTimer -= dt;
      if (d < 1.6 && this.lungeTimer <= 0) {
        this.state = 'lunge';
        this.stateT = 0;
        this._play('lunge', 0.08, { once: true });
        const dd = Math.max(d, 0.01);
        this.lungeDir = { x: dx / dd, z: dz / dd };
      }
    } else if (this.state === 'lunge') {
      this.stateT += dt;
      if (this.stateT > 0.25 && this.stateT < 0.6) {
        this.chaseToward(dt, this.lungeDir.x, this.lungeDir.z, 1, 3.4);
      }
      if (this.stateT > 0.9) { this.state = 'chase'; this.lungeTimer = 2.4; this._current = null; }
    }
    this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// Skeleton Rogue — quick blade-dancer. Wakes standing, circles just out of
// sword reach, crouch-telegraphs (~0.7s), then dashes through. Parry or jump.
export class SkeletonRogue extends SkeletonBase {
  constructor(world, x, z, gltf, anims, bladeGltf) {
    super(world, x, z, {
      hp: 1.5, radius: 0.34, scale: 0.48, gltf, anims,
      clips: {
        inactive: 'Skeletons_Inactive_Standing_Pose', awaken: 'Skeletons_Awaken_Standing',
        walk: 'Skeletons_Walking', run: 'Running_A', idle: 'Skeletons_Idle',
        stab: 'Melee_1H_Attack_Stab', taunt: 'Skeletons_Taunt',
      },
    });
    this.awakenTime = 1.1;
    if (bladeGltf) this.mount('r', bladeGltf);
    this.orbitDir = (x + z) % 2 < 1 ? 1 : -1;
    this.dashTimer = 1.6;
    this._dodgeCd = 0; // the blade-dancer SIDESTEPS the first swing
  }

  // PREDICTABLE dodge pattern (anti-button-mash): the rogue hops aside from
  // the FIRST melee swing, then is open for 3.5s. Bolts and AoE always land;
  // a stunned rogue can't dodge. Kids learn: bait the hop, THEN strike.
  takeDamage(n, element, kind) {
    if (!this.dead && kind === 'melee' && this._dodgeCd <= 0 && this.stunned <= 0 && this.state !== 'dash') {
      this._dodgeCd = 3.5;
      const a = this.root.rotation.y + (this.orbitDir > 0 ? 1 : -1) * Math.PI / 2;
      const s = this._moveSolved(this.x + Math.sin(a) * 1.5, this.z + Math.cos(a) * 1.5);
      this.root.position.x = s.x;
      this.root.position.z = s.z;
      if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.0, this.z, 'DODGE');
      audio.play('puff', { volume: 0.5, rate: 1.7 });
      return;
    }
    super.takeDamage(n, element, kind);
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this._dodgeCd > 0) this._dodgeCd -= dt;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); return; }
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);
    if (this.awakenUpdate(dt, d, 4.2)) return;

    if (this.state === 'chase') {
      // orbit at ~2.6, closing slowly
      const tangent = { x: -dz / Math.max(d, 0.01) * this.orbitDir, z: dx / Math.max(d, 0.01) * this.orbitDir };
      const inward = d > 2.6 ? 0.8 : -0.3;
      const mx = tangent.x * 1.6 + (dx / Math.max(d, 0.01)) * inward;
      const mz = tangent.z * 1.6 + (dz / Math.max(d, 0.01)) * inward;
      const mm = Math.hypot(mx, mz);
      this._play('run');
      this.chaseToward(dt, mx / mm, mz / mm, 1, 2.3);
      this.root.rotation.y = Math.atan2(dx, dz);
      this.dashTimer -= dt;
      if (this.dashTimer <= 0 && d < 4.6) {
        this.state = 'telegraph';
        this.stateT = 0;
        this._play('idle', 0.08);
        const dd = Math.max(d, 0.01);
        this.dashDir = { x: dx / dd, z: dz / dd };
        this.root.rotation.y = Math.atan2(this.dashDir.x, this.dashDir.z);
      }
    } else if (this.state === 'telegraph') {
      // crouch low + rising hiss — the "block or jump NOW" beat
      this.stateT += dt;
      this.model.scale.y = 0.48 * (1 - 0.22 * Math.min(1, this.stateT * 2.4));
      if (this.stateT >= 0.7) {
        this.state = 'dash';
        this.stateT = 0;
        this.model.scale.y = 0.48;
        this._play('stab', 0.06, { once: true });
        audio.play('sword-swing2', { volume: 0.6, rate: 1.3 });
      }
    } else if (this.state === 'dash') {
      this.stateT += dt;
      const nx = this.x + this.dashDir.x * 7.5 * dt;
      const nz = this.z + this.dashDir.z * 7.5 * dt;
      const solved = this._moveSolved(nx, nz);
      const blocked = Math.hypot(solved.x - nx, solved.z - nz) > 0.01;
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;
      this.contact(player);
      if (this.stateT > 0.5 || blocked) { this.state = 'recover'; this.stateT = 0; this._play('idle', 0.2); }
    } else { // recover — open to punishment
      this.stateT += dt;
      if (this.stateT > 1.3) { this.state = 'chase'; this.dashTimer = 2.2 + Math.random(); }
    }

    if (this.state === 'chase' || this.state === 'telegraph') this.contact(player);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// The Bone Warden — Stoneroot's crypt guardian. A big armored skeleton with
// axe + tower shield. Two attacks, both loudly telegraphed: an overhead chop
// (parry it!) and a slow spin when Kael hugs too close. After three swings it
// wheezes — a big open punish window.
export class BoneWarden extends SkeletonBase {
  constructor(world, x, z, gltf, anims, axeGltf, shieldGltf) {
    super(world, x, z, {
      hp: 14, radius: 0.52, scale: 0.68, gltf, anims,
      clips: {
        inactive: 'Skeletons_Inactive_Standing_Pose', awaken: 'Skeletons_Awaken_Standing',
        walk: 'Skeletons_Walking', idle: 'Skeletons_Idle',
        chop: 'Melee_1H_Attack_Chop', spin: 'Melee_2H_Attack_Spin',
        taunt: 'Skeletons_Taunt', tired: 'Skeletons_Inactive_Standing_Pose',
      },
    });
    this.awakenTime = 1.3;
    this.dropChance = 1;
    if (axeGltf) this.mount('r', axeGltf);
    if (shieldGltf) this.mount('l', shieldGltf);
    this.swings = 0;
    this.attackTimer = 1.4;

    // telegraph ring shows the chop's danger zone
    this.dangerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.35, 28, 1, 0, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    this.dangerRing.rotation.x = -Math.PI / 2;
    this.dangerRing.position.y = 0.05;
    world.add(this.dangerRing);
  }

  die() {
    this.world.root.remove(this.dangerRing);
    if (this.world.onWardenDefeated) this.world.onWardenDefeated(this);
    super.die();
  }

  // The tower shield blocks everything from the front while he advances —
  // flank him, or parry the chop and punish the stun. Punish windows
  // (tired / stunned / mid-swing) take full damage.
  takeDamage(n, element, kind) {
    if (!this.dead && this.stunned <= 0 && this._pp &&
        (this.state === 'chase' || this.state === 'chop_tele' || this.state === 'spin_tele')) {
      const dx = this._pp.x - this.x, dz = this._pp.z - this.z;
      const dd = Math.hypot(dx, dz);
      const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
      if (dd > 0.05 && (dx * fx + dz * fz) / dd > 0.42) {
        audio.play('parry', { volume: 0.45, rate: 0.55 }); // clank — blocked
        this._pop = 0.1;
        this._blockedOnce = true;
        if (this.world.onDmgNum) this.world.onDmgNum(this.x, 1.2, this.z, 'BLOCKED');
        return;
      }
    }
    super.takeDamage(n, element, kind);
  }

  _swingDamage(player, arcDeg, range, dmg) {
    const px = player.root.position.x - this.x;
    const pz = player.root.position.z - this.z;
    const d = Math.hypot(px, pz);
    if (d > range) return;
    const fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y);
    if (arcDeg < 360 && d > 0.1 && (px * fx + pz * fz) / d < Math.cos(arcDeg * Math.PI / 360)) return;
    player.hurt(dmg, { attacker: this, groundAttack: true });
  }

  update(dt, t, player) {
    if (this.dead) return;
    if (this.stunUpdate(dt)) { this.mixer.update(dt); this.dangerRing.material.opacity = 0; return; }
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    this._pp = { x: player.root.position.x, z: player.root.position.z };
    if (this.awakenUpdate(dt, d, 5.2)) return;
    this.stateT += dt;

    if (this.state === 'chase') {
      this._play('walk');
      this.chaseToward(dt, dx, dz, d, 1.35);
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && d < 2.2) {
        if (this.swings >= 3) {
          this.state = 'tired';
          this.stateT = 0;
          this.swings = 0;
          this._play('tired', 0.3);
        } else if (d < 1.2) {
          this.state = 'spin_tele';
          this.stateT = 0;
          this._play('idle', 0.1);
        } else {
          this.state = 'chop_tele';
          this.stateT = 0;
          this._play('idle', 0.1);
          this.root.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else if (this.state === 'chop_tele') {
      // 0.9s: the danger arc fades in where the axe will land
      const f = Math.min(1, this.stateT / 0.9);
      this.dangerRing.position.set(this.x, 0.05, this.z);
      this.dangerRing.rotation.z = -this.root.rotation.y + Math.PI / 2 + Math.PI * 0.45;
      this.dangerRing.material.opacity = f * 0.55;
      if (this.stateT >= 0.9) {
        this.state = 'chop';
        this.stateT = 0;
        this._play('chop', 0.06, { once: true });
        audio.play('sword-swing', { volume: 0.9, rate: 0.7 });
      }
    } else if (this.state === 'chop') {
      this.dangerRing.material.opacity = Math.max(0, 0.55 - this.stateT * 2);
      if (this.stateT > 0.32 && !this._chopHit) {
        this._chopHit = true;
        this._swingDamage(player, 130, 1.9, 1.5);
        audio.play('slam', { volume: 0.5, rate: 1.4 });
      }
      if (this.stateT > 0.8) { this.state = 'chase'; this._chopHit = false; this.swings++; this.attackTimer = 1.1; }
    } else if (this.state === 'spin_tele') {
      // 1.0s: full-circle warning ring
      const f = Math.min(1, this.stateT / 1.0);
      this.dangerRing.position.set(this.x, 0.05, this.z);
      this.dangerRing.material.opacity = f * 0.55;
      this.dangerRing.scale.setScalar(1.15);
      if (this.stateT >= 1.0) {
        this.state = 'spin';
        this.stateT = 0;
        this._play('spin', 0.06, { once: true });
        audio.play('sword-swing2', { volume: 0.9, rate: 0.6 });
      }
    } else if (this.state === 'spin') {
      this.dangerRing.material.opacity = Math.max(0, 0.55 - this.stateT * 1.6);
      if (this.stateT > 0.45 && !this._spinHit) {
        this._spinHit = true;
        this._swingDamage(player, 360, 1.7, 1.5);
      }
      if (this.stateT > 1.1) {
        this.state = 'chase'; this._spinHit = false; this.dangerRing.scale.setScalar(1);
        this.swings++; this.attackTimer = 1.3;
      }
    } else if (this.state === 'tired') {
      // ~2.6s wheeze — the punish window (double damage would need a stun;
      // being wide open is reward enough for kids)
      this.root.position.y = Math.sin(this.stateT * 18) * 0.01;
      if (this.stateT > 2.6) { this.state = 'chase'; this.attackTimer = 0.8; this.root.position.y = 0; }
    }

    if (this.state === 'chase') this.contact(player, 1);
    this.flashUpdate(dt);
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------------------
// Ember drops: warm sparks fallen shadows sometimes leave behind.
// Touch one to heal half a heart (fizzles after ~12s).
// ---------------------------------------------------------------------------

function spawnEmberDrop(world, x, z) {
  if (!world.drops) world.drops = [];
  const spark = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14, 0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa04a, emissiveIntensity: 2.4, roughness: 1 })
  );
  spark.position.set(x, 0.35, z);
  world.add(spark);
  const glow = new THREE.PointLight(0xffa04a, 2.2, 4, 1.9);
  glow.position.set(x, 0.6, z);
  world.add(glow);
  world.drops.push({ x, z, spark, glow, life: 12, taken: false });
}

function updateDrops(world, dt, t, player) {
  if (!world.drops) return;
  for (const d of world.drops) {
    if (d.taken) continue;
    d.life -= dt;
    d.spark.position.y = 0.35 + Math.sin(t * 3.1 + d.x) * 0.09;
    d.spark.rotation.y = t * 2.4;
    if (d.life < 2.5) { // fizzle warning
      d.spark.visible = Math.sin(t * 14) > -0.3;
      d.glow.intensity = 1.1 + Math.sin(t * 14);
    }
    const dx = player.root.position.x - d.x;
    const dz = player.root.position.z - d.z;
    const gone = d.life <= 0;
    if (gone || dx * dx + dz * dz < 0.6 * 0.6) {
      d.taken = true;
      world.root.remove(d.spark);
      world.root.remove(d.glow);
      if (!gone) {
        audio.play('pup-chime', { volume: 0.45, rate: 1.7 });
        if (player.hearts < player.maxHearts) {
          player.hearts = Math.min(player.maxHearts, player.hearts + 0.5);
          if (player.onDamaged) player.onDamaged(player.hearts); // refresh HUD
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Spawning + the shared combat query used by sword arcs and the Blood Moon
// ---------------------------------------------------------------------------

// Solid bodies: creatures can't walk through each other, and a raised shield
// physically stops and bumps back grounded enemies. Flyers pass over walkers.
// Boss parts (Hittable) and breakables (already static colliders) stay out.
function resolveBodies(world, dt, player) {
  const solid = world.enemies.filter((e) =>
    !e.dead && e.radius &&
    e.constructor.name !== 'Hittable' && e.constructor.name !== 'Breakable');

  // enemy vs enemy: split the overlap evenly
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      if (!!a.flying !== !!b.flying) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const rr = a.radius + b.radius;
      if (d >= rr || d < 1e-4) continue;
      const push = (rr - d) / 2;
      dx /= d; dz /= d;
      a.root.position.x -= dx * push; a.root.position.z -= dz * push;
      b.root.position.x += dx * push; b.root.position.z += dz * push;
    }
  }

  const px = player.root.position.x, pz = player.root.position.z;
  for (const e of solid) {
    // shove-in-progress from a shield bump
    if (e.bump > 0) {
      const s = world.resolveCircle(e.x + e.bumpDir.x * e.bump * dt, e.z + e.bumpDir.z * e.bump * dt, e.radius);
      e.root.position.x = s.x; e.root.position.z = s.z;
      e.bump -= dt * 10;
    }
    if (e.flying) continue; // flyers dive over both body and shield
    let dx = e.x - px, dz = e.z - pz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) continue;
    dx /= d; dz /= d;
    if (player.defending) {
      // the shield is a wall: stop at arm's length and take a firm shove back
      const rr = e.radius + 0.52;
      if (d < rr) {
        const s = world.resolveCircle(e.x + dx * (rr - d + 0.06), e.z + dz * (rr - d + 0.06), e.radius);
        e.root.position.x = s.x; e.root.position.z = s.z;
        if (!(e.bump > 0)) { e.bump = 4.2; e.bumpDir = { x: dx, z: dz }; }
      }
    } else {
      // bodies never fully merge — but stay inside contact range so touch
      // damage still lands (contact triggers at radius + 0.32)
      const rr = e.radius + 0.22;
      if (d < rr) {
        const s = world.resolveCircle(e.x + dx * (rr - d), e.z + dz * (rr - d), e.radius);
        e.root.position.x = s.x; e.root.position.z = s.z;
      }
    }
  }
}

export async function spawnEnemies(world) {
  world.enemies = [];
  const wolfGltf = await loadGLB('./assets/chars/wolf.gltf');

  if ((world.markers.shadeSpots || []).length) {
    const slimeGltf = await loadGLB('./assets/chars/monsters/Slime.glb');
    for (const s of world.markers.shadeSpots) world.enemies.push(new Shade(world, s.x, s.z, slimeGltf));
  }
  if ((world.markers.mothSpots || []).length) {
    const batGltf = await loadGLB('./assets/chars/monsters/Bat.glb');
    for (const m of world.markers.mothSpots) world.enemies.push(new Moth(world, m.x, m.z, batGltf));
  }
  if (world.markers.houndSpot) {
    world.enemies.push(new Hound(world, world.markers.houndSpot.x, world.markers.houndSpot.z, wolfGltf));
  }

  // Cavern natives — Quaternius monsters, loaded only when a room asks
  const mk = world.markers;
  if (mk.slimeSpots && mk.slimeSpots.length) {
    const slimeGltf = await loadGLB('./assets/chars/monsters/Slime.glb');
    for (const s of mk.slimeSpots) world.enemies.push(new Slime(world, s.x, s.z, slimeGltf));
  }
  if (mk.batSpots && mk.batSpots.length) {
    const batGltf = await loadGLB('./assets/chars/monsters/Bat.glb');
    for (const s of mk.batSpots) world.enemies.push(new Bat(world, s.x, s.z, batGltf));
  }
  if ((mk.minionSpots && mk.minionSpots.length) || (mk.rogueSpots && mk.rogueSpots.length) || mk.wardenSpot) {
    const [special, movement, general, combat] = await Promise.all([
      loadGLB('./assets/anims/rig-medium-special.glb'),
      loadGLB('./assets/anims/rig-medium-movement-basic.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
      loadGLB('./assets/anims/rig-medium-combat-melee.glb'),
    ]);
    const anims = [...special.animations, ...movement.animations, ...general.animations, ...combat.animations];
    if (mk.minionSpots && mk.minionSpots.length) {
      const minionGltf = await loadGLB('./assets/chars/skeletons/Skeleton_Minion.glb');
      for (const s of mk.minionSpots) world.enemies.push(new SkeletonMinion(world, s.x, s.z, minionGltf, anims));
    }
    if (mk.rogueSpots && mk.rogueSpots.length) {
      const [rogueGltf, bladeGltf] = await Promise.all([
        loadGLB('./assets/chars/skeletons/Skeleton_Rogue.glb'),
        loadGLB('./assets/chars/skeletons/Skeleton_Blade.gltf'),
      ]);
      for (const s of mk.rogueSpots) world.enemies.push(new SkeletonRogue(world, s.x, s.z, rogueGltf, anims, bladeGltf));
    }
    if (mk.wardenSpot) {
      const [warriorGltf, axeGltf, shieldGltf] = await Promise.all([
        loadGLB('./assets/chars/skeletons/Skeleton_Warrior.glb'),
        loadGLB('./assets/chars/skeletons/Skeleton_Axe.gltf'),
        loadGLB('./assets/chars/skeletons/Skeleton_Shield_Large_A.gltf'),
      ]);
      world.warden = new BoneWarden(world, mk.wardenSpot.x, mk.wardenSpot.z, warriorGltf, anims, axeGltf, shieldGltf);
      world.enemies.push(world.warden);
    }
  }

  world.damageEnemiesAt = (x, z, r, dmg, element = 'steel') => {
    let hits = 0;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= (r + e.radius) * (r + e.radius)) {
        e.takeDamage(dmg, element, 'aoe');
        hits++;
      }
    }
    return hits;
  };

  world.updateEnemies = (dt, t, player) => {
    for (const e of world.enemies) if (!e.dead) e.update(dt, t, player);
    resolveBodies(world, dt, player);
    updateDrops(world, dt, t, player);
  };
}
