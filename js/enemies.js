// Enemies — per design/COMBAT-SPEC.md. Forgiving and readable: slow grunts,
// ~1-second telegraphs on anything that lunges, puff-of-smoke deaths.
// Shades and Ember Moths are code-built shadow creatures (ASSETS.md casting
// sheet); the Shadow Hound is the Quaternius wolf tinted near-black.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';

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

class Enemy {
  constructor(world, x, z, { hp, radius }) {
    this.world = world;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    world.add(this.root);
    this.hp = hp;
    this.radius = radius;
    this.dead = false;
    this._flash = 0;
    this._flashMats = [];
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  takeDamage(n) {
    if (this.dead) return;
    this.hp -= n;
    this._flash = 0.14;
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    smokePuff(this.world, this.x, 0.5, this.z, this.puffTint || 0x5a4d66);
    this.world.root.remove(this.root);
  }

  contact(player, dmg = 1) {
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const rr = this.radius + 0.32;
    if (dx * dx + dz * dz < rr * rr) player.hurt(dmg);
  }

  flashUpdate(dt) {
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
// Shade — slow dark wisp, contact damage, teaches basic melee
// ---------------------------------------------------------------------------

export class Shade extends Enemy {
  constructor(world, x, z) {
    super(world, x, z, { hp: 2, radius: 0.34 });
    this.puffTint = 0x4a3f5c;

    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 1),
      new THREE.MeshStandardMaterial({
        color: 0x120d1c, transparent: true, opacity: 0.88, roughness: 1,
        emissive: 0x2a1b3a, emissiveIntensity: 0.35,
      })
    );
    body.position.y = 0.45;
    this.root.add(body);
    this.body = body;

    // ember flecks drifting around the wisp
    this.flecks = [];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a3a, emissiveIntensity: 2 })
      );
      this.root.add(f);
      this.flecks.push(f);
    }
    this.registerFlashMats(this.root);
    this._seed = x * 3.1 + z * 1.7;
  }

  update(dt, t, player) {
    if (this.dead) return;
    const dx = player.root.position.x - this.x;
    const dz = player.root.position.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 7 && d > 0.01) {
      const speed = 1.15;
      const nx = this.x + (dx / d) * speed * dt;
      const nz = this.z + (dz / d) * speed * dt;
      const solved = this.world.resolveCircle(nx, nz, this.radius);
      this.root.position.x = solved.x;
      this.root.position.z = solved.z;
    }
    this.body.position.y = 0.45 + Math.sin(t * 2.1 + this._seed) * 0.08;
    this.body.scale.setScalar(1 + Math.sin(t * 3.3 + this._seed) * 0.07);
    this.flecks.forEach((f, i) => {
      const a = t * 1.3 + i * 2.1 + this._seed;
      f.position.set(Math.cos(a) * 0.4, 0.5 + Math.sin(a * 1.7) * 0.2, Math.sin(a) * 0.4);
    });
    this.contact(player);
    this.flashUpdate(dt);
  }
}

// ---------------------------------------------------------------------------
// Ember Moth — hovers, glows ~0.8s, then dives in a straight line
// ---------------------------------------------------------------------------

export class Moth extends Enemy {
  constructor(world, x, z) {
    super(world, x, z, { hp: 1, radius: 0.26 });
    this.puffTint = 0x6b4a3a;
    this.home = { x, z };

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x140d18, roughness: 1 })
    );
    this.root.add(body);

    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, 0, 0.42, 0.05, -0.18, 0.42, 0.05, 0.22,
    ]), 3));
    wingGeo.computeVertexNormals();
    this.wingMats = [];
    this.wings = [];
    for (const side of [1, -1]) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xff6a2a, emissiveIntensity: 1.1,
        side: THREE.DoubleSide, roughness: 1,
      });
      const wing = new THREE.Mesh(wingGeo, mat);
      wing.scale.x = side;
      this.root.add(wing);
      this.wings.push(wing);
      this.wingMats.push(mat);
    }
    this.registerFlashMats(this.root);

    this.state = 'hover';
    this.stateT = 0;
    this.diveDir = { x: 0, z: 0 };
    this._seed = x * 2.3 + z;
    this.root.position.y = 1.1;
  }

  update(dt, t, player) {
    if (this.dead) return;
    this.stateT += dt;
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'hover') {
      // drift gently around home
      this.root.position.x += (this.home.x + Math.sin(t * 0.9 + this._seed) * 0.8 - this.x) * dt;
      this.root.position.z += (this.home.z + Math.cos(t * 0.7 + this._seed) * 0.8 - this.z) * dt;
      this.root.position.y = 1.1 + Math.sin(t * 2.4 + this._seed) * 0.18;
      if (d < 5.2) { this.state = 'telegraph'; this.stateT = 0; }
    } else if (this.state === 'telegraph') {
      // pause + wings glow bright (~0.8s) before the dive
      const f = this.stateT / 0.8;
      for (const m of this.wingMats) m.emissiveIntensity = 1.1 + f * 2.6;
      if (this.stateT >= 0.8) {
        this.state = 'dive';
        this.stateT = 0;
        const dd = Math.max(d, 0.01);
        this.diveDir = { x: dx / dd, z: dz / dd };
        this.root.rotation.y = Math.atan2(this.diveDir.x, this.diveDir.z);
      }
    } else if (this.state === 'dive') {
      const speed = 6.5;
      this.root.position.x += this.diveDir.x * speed * dt;
      this.root.position.z += this.diveDir.z * speed * dt;
      this.root.position.y = Math.max(0.5, this.root.position.y - dt * 1.6);
      this.contact(player);
      if (this.stateT > 0.75) { this.state = 'return'; this.stateT = 0; }
    } else { // return
      for (const m of this.wingMats) m.emissiveIntensity = 1.1;
      const hx = this.home.x - this.x, hz = this.home.z - this.z;
      const hd = Math.hypot(hx, hz);
      if (hd < 0.3) { this.state = 'hover'; this.stateT = 0; }
      else {
        this.root.position.x += (hx / hd) * 2.2 * dt;
        this.root.position.z += (hz / hd) * 2.2 * dt;
        this.root.position.y = Math.min(1.1, this.root.position.y + dt);
      }
    }

    // wing flap
    const flap = Math.sin(t * (this.state === 'telegraph' ? 26 : 14)) * 0.75;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;
    if (this.state === 'hover' || this.state === 'telegraph') this.contact(player);
    this.flashUpdate(dt);
  }
}

// ---------------------------------------------------------------------------
// Shadow Hound — elite. Stalks, crouches (streak telegraph ~1s), charges.
// ---------------------------------------------------------------------------

export class Hound extends Enemy {
  constructor(world, x, z, wolfGltf) {
    super(world, x, z, { hp: 3, radius: 0.4 });
    this.puffTint = 0x241a30;

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
    this.stateT += dt;
    const px = player.root.position.x, pz = player.root.position.z;
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);

    if (this.state === 'stalk') {
      this._play('walk');
      if (d > 0.01) {
        const speed = 1.5;
        const nx = this.x + (dx / d) * speed * dt;
        const nz = this.z + (dz / d) * speed * dt;
        const solved = this.world.resolveCircle(nx, nz, this.radius);
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
      const speed = 8.5;
      const nx = this.x + this.chargeDir.x * speed * dt;
      const nz = this.z + this.chargeDir.z * speed * dt;
      const solved = this.world.resolveCircle(nx, nz, this.radius);
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
// Spawning + the shared combat query used by sword arcs and the Blood Moon
// ---------------------------------------------------------------------------

export async function spawnEnemies(world) {
  world.enemies = [];
  const wolfGltf = await loadGLB('./assets/chars/wolf.gltf');

  for (const s of world.markers.shadeSpots || []) world.enemies.push(new Shade(world, s.x, s.z));
  for (const m of world.markers.mothSpots || []) world.enemies.push(new Moth(world, m.x, m.z));
  if (world.markers.houndSpot) {
    world.enemies.push(new Hound(world, world.markers.houndSpot.x, world.markers.houndSpot.z, wolfGltf));
  }

  world.damageEnemiesAt = (x, z, r, dmg) => {
    let hits = 0;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= (r + e.radius) * (r + e.radius)) {
        e.takeDamage(dmg);
        hits++;
      }
    }
    return hits;
  };

  world.updateEnemies = (dt, t, player) => {
    for (const e of world.enemies) if (!e.dead) e.update(dt, t, player);
  };
}
