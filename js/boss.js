// The Shadowgrip — Ember Hollow's mini-boss, per design/COMBAT-SPEC.md.
// A code-built mass of shadow gripping Cinder: dark blob core + tendrils +
// the caged warm light. Three phases:
//   1. Sever the tendrils (telegraphed slams; stuck tendrils are vulnerable)
//   2. Strike the exposed core (+2 Shades, rotating shadow wave)
//   3. The dark grip: room goes black (Dark Wolf payoff), core opens in bursts
// Forgiving: ~1s telegraphs, never more than 2 Shades, the wave leaves a safe
// arc, defeat resets cleanly via room rebuild.

import * as THREE from 'three';
import { Shade } from './enemies.js';
import { state } from './state.js';
import { audio } from './audio.js';

const CORE_HP = 8;
const TENDRIL_HP = 2;
const BLOOD_MOON_CAP = 3; // a Blood Moon counts as 3 sword hits on boss parts

function darkMat(color = 0x0d0716, emissive = 0x2a1040, ei = 0.5) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 1 });
}

class Hittable {
  // Minimal enemy-shaped adapter so sword arcs / Blood Moon hit boss parts.
  constructor(x, z, radius, onHit) {
    this.x = x; this.z = z;
    this.radius = radius;
    this.dead = false;
    this._onHit = onHit;
  }
  takeDamage(n) { if (!this.dead) this._onHit(Math.min(n, BLOOD_MOON_CAP)); }
  update() {}
}

export class Shadowgrip {
  constructor(world, x, z) {
    this.world = world;
    this.x = x; this.z = z;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    world.add(this.root);

    this.phase = 1;
    this.coreHp = CORE_HP;
    this.severed = 0;
    this.stateT = 0;
    this.slamState = 'wait'; // wait -> telegraph -> stuck
    this.slamTimer = 1.4;
    this.defeated = false;
    this.onDefeated = null;

    // --- core: dark blob + shadowy eye, hovering over the caged Cinder ---
    this.core = new THREE.Group();
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), darkMat());
    this.core.add(blob);
    this.blob = blob;
    const eyeWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x141020, emissive: 0xb9a8ff, emissiveIntensity: 0.7, roughness: 1 })
    );
    eyeWhite.position.set(0, 0.15, 0.95);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x05030a, roughness: 1 })
    );
    pupil.position.set(0, 0.15, 1.2);
    this.core.add(eyeWhite, pupil);
    this.eyeMat = eyeWhite.material;
    this.core.position.y = 2.5;
    this.root.add(this.core);

    // --- caged Cinder: weak warm ember held under the core ---
    this.cinder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb25a, emissiveIntensity: 1.6, roughness: 1 })
    );
    this.cinder.position.y = 1.1;
    this.root.add(this.cinder);
    this.cinderLight = new THREE.PointLight(0xffb25a, 3.5, 8, 1.9);
    this.cinderLight.position.set(0, 1.3, 0);
    this.root.add(this.cinderLight);

    // --- grip tendrils arcing over the ember (phase-1 cage) ---
    this.cageTendrils = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 2.6, 8), darkMat(0x0d0716, 0x1a0e2a, 0.4));
      tr.position.set(Math.cos(a) * 1.05, 1.25, Math.sin(a) * 1.05);
      tr.rotation.z = Math.cos(a) * 0.55;
      tr.rotation.x = -Math.sin(a) * 0.55;
      this.root.add(tr);
      this.cageTendrils.push(tr);
    }

    // --- slam machinery (shared meshes, world-positioned) ---
    this.telegraph = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 28),
      new THREE.MeshBasicMaterial({ color: 0x14092a, transparent: true, opacity: 0.55, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0x8f6bff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.012;
    this.telegraph.add(disc, rim);
    this.telegraph.position.y = 0.03;
    this.telegraph.visible = false;
    world.add(this.telegraph);
    this.telegraphRim = rim;

    this.slamTendril = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.34, 2.7, 8), darkMat(0x0d0716, 0x241238, 0.6));
    this.slamTendril.visible = false;
    world.add(this.slamTendril);
    this.slamHittable = null;

    // --- phase-2 rotating shadow wave ---
    this.wave = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 1.0),
      new THREE.MeshBasicMaterial({ color: 0x0a0516, transparent: true, opacity: 0, depthWrite: false })
    );
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.y = 0.06;
    world.add(this.wave);
    this.waveAngle = 0;
    this.waveActive = false;

    // core hittable (registered only while exposed)
    this.coreHittable = new Hittable(x, z, 1.35, (n) => this._hitCore(n));
    this.coreExposed = false;

    world.boss = this;
  }

  // ------------------------------------------------------------------


  _hitCore(n) {
    if (this.defeated || !this.coreExposed) return;
    this.coreHp -= n;
    this.eyeMat.emissiveIntensity = 3;
    this._eyeFlash = 0.25;
    if (this.coreHp <= CORE_HP - 4 && this.phase === 2) this._enterPhase3();
    if (this.coreHp <= 0) this._defeat();
  }

  _setCoreExposed(v) {
    if (this.defeated) v = false;
    if (v === this.coreExposed) return;
    this.coreExposed = v;
    const list = this.world.enemies;
    if (v) list.push(this.coreHittable);
    else {
      const i = list.indexOf(this.coreHittable);
      if (i >= 0) list.splice(i, 1);
    }
  }

  _severTendril() {
    this.severed++;
    const tr = this.cageTendrils[this.severed - 1];
    if (tr) tr.visible = false; // one grip arm releases per sever
    if (this.severed >= 3 && this.phase === 1) this._enterPhase2();
  }

  _enterPhase2() {
    this.phase = 2;
    this.stateT = 0;
    this.slamState = 'wait';
    this.slamTimer = 999; // no slams in phase 2
    this.slamTendril.visible = false;
    this.telegraph.visible = false;
    this._setCoreExposed(true);
    this.core.position.y = 1.7; // core sinks into reach
    this.waveActive = true;
    this.wave.material.opacity = 0.5;
    // summon exactly 2 Shades
    this.world.enemies.push(
      new Shade(this.world, this.x - 2.6, this.z + 1.4),
      new Shade(this.world, this.x + 2.6, this.z + 1.4)
    );
  }

  _enterPhase3() {
    this.phase = 3;
    this.stateT = 0;
    this.world.bossDarkness = true;  // the room goes dark — Dark Wolf time
    this.waveActive = false;
    this.wave.material.opacity = 0;
    this.slamState = 'wait';
    this.slamTimer = 1.2;
    this._burstT = 0;
    this._setCoreExposed(true);
  }

  _defeat() {
    this.defeated = true;
    this._setCoreExposed(false);
    this.world.bossDarkness = false;
    this.telegraph.visible = false;
    this.slamTendril.visible = false;
    this.wave.material.opacity = 0;
    if (this.slamHittable) this.slamHittable.dead = true;
    this._dissolveT = 1.6;

    state.flags.bossDefeated = true;
    state.flags.shortcutOpen = true;
    if (!state.formsUnlocked.includes('fire_wolf')) state.formsUnlocked.push('fire_wolf');
    if (this.onDefeated) this.onDefeated();
  }

  // ------------------------------------------------------------------

  _updateSlams(dt, player, faster) {
    const TELEGRAPH = faster ? 0.8 : 1.05;
    const STUCK = 2.0;
    const BETWEEN = faster ? 1.0 : 1.5;

    this.slamTimer -= dt;
    if (this.slamState === 'wait' && this.slamTimer <= 0) {
      // aim at the player's feet
      this.slamState = 'telegraph';
      this.slamTimer = TELEGRAPH;
      this.telegraph.position.set(player.root.position.x, 0.03, player.root.position.z);
      this.telegraph.visible = true;
    } else if (this.slamState === 'telegraph') {
      const f = 1 - Math.max(0, this.slamTimer) / TELEGRAPH;
      this.telegraphRim.material.opacity = 0.5 + 0.5 * Math.sin(f * 22);
      this.telegraph.scale.setScalar(0.6 + f * 0.4);
      if (this.slamTimer <= 0) {
        // SLAM
        this.slamState = 'stuck';
        this.slamTimer = STUCK;
        const tx = this.telegraph.position.x, tz = this.telegraph.position.z;
        this.telegraph.visible = false;
        this.slamTendril.position.set(tx, 1.35, tz);
        this.slamTendril.visible = true;
        audio.play('tendril-slam', { volume: 0.9 });
        const dx = player.root.position.x - tx, dz = player.root.position.z - tz;
        if (dx * dx + dz * dz < 1.0) player.hurt(1);
        // stuck tendril is vulnerable — only severable in phase 1
        if (this.phase === 1) {
          this.slamHittable = new Hittable(tx, tz, 0.6, (n) => {
            this.slamHittable.hp = (this.slamHittable.hp ?? TENDRIL_HP) - n;
            if (this.slamHittable.hp <= 0 && !this.slamHittable.dead) {
              this.slamHittable.dead = true;
              this.slamTendril.visible = false;
              this.slamState = 'wait';
              this.slamTimer = BETWEEN;
              this._severTendril();
            }
          });
          this.world.enemies.push(this.slamHittable);
        }
      }
    } else if (this.slamState === 'stuck') {
      if (this.slamTimer <= 0) {
        this.slamTendril.visible = false;
        if (this.slamHittable) {
          this.slamHittable.dead = true;
          this.slamHittable = null;
        }
        this.slamState = 'wait';
        this.slamTimer = BETWEEN;
      }
    }
  }

  update(dt, t, player) {
    if (this.defeated) {
      // dissolve with a long exhale: shrink, fade, free the light
      if (this._dissolveT > 0) {
        this._dissolveT -= dt;
        const f = Math.max(0, this._dissolveT / 1.6);
        this.core.scale.setScalar(f);
        this.core.position.y = 1.7 + (1 - f) * 1.4;
        for (const tr of this.cageTendrils) tr.scale.setScalar(f);
        this.cinder.material.emissiveIntensity = 1.6 + (1 - f) * 2.2;
        this.cinderLight.intensity = 3.5 + (1 - f) * 8;
        this.cinder.position.y = 1.1 + (1 - f) * 0.7;
        if (this._dissolveT <= 0) {
          this.root.remove(this.core);
          for (const tr of this.cageTendrils) this.root.remove(tr);
        }
      } else {
        this.cinder.position.y = 1.8 + Math.sin(t * 1.7) * 0.15;
      }
      return;
    }

    this.stateT += dt;

    // idle motion + eye tracks the player
    this.blob.scale.setScalar(1 + Math.sin(t * 1.9) * 0.06);
    this.core.rotation.y = Math.atan2(
      player.root.position.x - this.x,
      player.root.position.z - this.z
    );
    if (this._eyeFlash > 0) {
      this._eyeFlash -= dt;
      if (this._eyeFlash <= 0) this.eyeMat.emissiveIntensity = this.coreExposed ? 1.6 : 0.7;
    }
    this.cinder.material.emissiveIntensity = 1.4 + Math.sin(t * 2.6) * 0.3;
    for (const tr of this.cageTendrils) {
      tr.scale.y = 1 + Math.sin(t * 2.2 + tr.position.x) * 0.05;
    }

    if (this.phase === 1) {
      this._updateSlams(dt, player, false);
    } else if (this.phase === 2) {
      // rotating shadow wave — slow, always a safe arc
      this.waveAngle += dt * 0.55;
      const wx = this.x + Math.cos(this.waveAngle) * 3.4;
      const wz = this.z + Math.sin(this.waveAngle) * 3.4;
      this.wave.position.set(wx, 0.06, wz);
      this.wave.rotation.z = -this.waveAngle;
      // damage if the player stands in the sweeping bar
      const px = player.root.position.x - this.x, pz = player.root.position.z - this.z;
      const pd = Math.hypot(px, pz);
      if (pd > 1.2 && pd < 6.2) {
        let da = Math.atan2(pz, px) - this.waveAngle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 0.16) player.hurt(1);
      }
    } else if (this.phase === 3) {
      this._updateSlams(dt, player, true);
      // the core opens in bursts: 2.2s open / 2.0s guarded
      this._burstT += dt;
      const cycle = this._burstT % 4.2;
      const open = cycle < 2.2;
      this._setCoreExposed(open);
      this.eyeMat.emissiveIntensity = open ? 1.8 : 0.4;
      this.core.position.y = open ? 1.7 : 2.6;
    }

    // keep the core hittable's position in sync
    this.coreHittable.x = this.x;
    this.coreHittable.z = this.z;
  }
}
