// The Shadowgrip — Ember Hollow's mini-boss, per design/COMBAT-SPEC.md.
// A code-built mass of shadow gripping Cinder: dark blob core + tendrils +
// the caged warm light. Three phases:
//   1. Sever the tendrils (telegraphed slams; stuck tendrils are vulnerable)
//   2. Strike the exposed core (+2 Shades, rotating shadow wave)
//   3. The dark grip: room goes black (Dark Wolf payoff), core opens in bursts
// Forgiving: ~1s telegraphs, never more than 2 Shades, the wave leaves a safe
// arc, defeat resets cleanly via room rebuild.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepareCharacter } from './assets.js';
import { Shade, smokePuff } from './enemies.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { juice } from './juice.js';

const CORE_HP = 8;
const TENDRIL_HP = 1; // ONE clean hit rips a tendril free — a kid landing a single swing per window must always progress
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
  constructor(world, x, z, dragonGltf, slimeGltf) {
    this._slimeGltf = slimeGltf; // phase-2 Shades need the model
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

    // --- the Shadowgrip itself: a GIANT shadow wolf — a dark echo of the
    // first great wolf, looming over the caged Cinder. Same Quaternius
    // wolf as Kael's forms, ~2.9x their size (playtest: "a little smaller
    // but still intimidating"), near-black with violet eyes.
    this.core = new THREE.Group();
    const wolf = prepareCharacter(SkeletonUtils.clone(dragonGltf.scene));
    wolf.scale.setScalar(1.62); // ≈2.9 × the player wolves' 0.56
    this.eyeMat = null;
    wolf.traverse((n) => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        if (m.name === 'Eyes_Black') {
          c.emissive = new THREE.Color(0xb9a8ff);
          c.emissiveIntensity = 1.2;
          this.eyeMat = c;
        } else if (m.name === 'Nose') {
          c.color.setHex(0x0a0710);
        } else {
          if (c.color) c.color.setHex(0x161020);
          c.emissive = new THREE.Color(0x2a1040);
          c.emissiveIntensity = 0.35;
        }
        return c;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    if (!this.eyeMat) this.eyeMat = darkMat(); // safety — never null
    this.core.add(wolf);
    this.dragon = wolf; // legacy name: the boss's body
    this.mixer = new THREE.AnimationMixer(wolf);
    const idleClip = dragonGltf.animations.find((c) => c.name === 'Idle');
    const atkClip = dragonGltf.animations.find((c) => c.name === 'Attack');
    const runClip = dragonGltf.animations.find((c) => c.name === 'Gallop');
    this.flyAction = idleClip ? this.mixer.clipAction(idleClip) : null;
    if (this.flyAction) this.flyAction.play();
    this.attackAction = atkClip ? this.mixer.clipAction(atkClip) : null;
    if (this.attackAction) this.attackAction.setLoop(THREE.LoopOnce);
    this.runAction = runClip ? this.mixer.clipAction(runClip) : null;
    // COLLAPSE (the vulnerable read): the Death clip plays and HOLDS while
    // the wolf lies tired — an unmissable "it fell over, hit it now"
    const dieClip = dragonGltf.animations.find((c) => c.name === 'Death');
    this.collapseAction = dieClip ? this.mixer.clipAction(dieClip) : null;
    if (this.collapseAction) {
      this.collapseAction.setLoop(THREE.LoopOnce);
      this.collapseAction.clampWhenFinished = true;
    }
    // ...and the giant FLINCHES when a tendril is severed (phase-1 feedback)
    const flinchClip = dragonGltf.animations.find((c) => c.name === 'Idle_HitReact1');
    this.flinchAction = flinchClip ? this.mixer.clipAction(flinchClip) : null;
    if (this.flinchAction) this.flinchAction.setLoop(THREE.LoopOnce);
    this._attackT = 0;
    this.core.position.set(0, 0, -1.4); // stands guard just behind the light
    this.root.add(this.core);

    // --- THE POUNCE (phase 2 signature): crouch + red lane telegraph →
    // leap across the arena → crashes down TIRED (a big, obvious window)
    this.chargeState = 'rest';
    this.chargeTimer = 4.5;
    this.chargeDir = { x: 0, z: 1 };
    this.wolfOff = { x: 0, z: 0 }; // body offset from center while pouncing
    this.chargeStreak = new THREE.Mesh(
      new THREE.PlaneGeometry(8.0, 1.0),
      new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0, depthWrite: false })
    );
    this.chargeStreak.rotation.x = -Math.PI / 2;
    this.chargeStreak.position.y = 0.05;
    world.add(this.chargeStreak);

    // big GOLD "hit it now" ring under the collapsed wolf (act-here law)
    this.tiredRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.05, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.tiredRing.rotation.x = -Math.PI / 2;
    this.tiredRing.position.y = 0.06;
    this.tiredRing.visible = false;
    world.add(this.tiredRing);

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
    // The grip reads as a dark shell smothering Cinder's light (the same
    // "spirit in a shadow shell" language Petra uses in the crypt). Each
    // severed tendril cracks it — thinner and smaller — until phase 2
    // shatters it and the light breathes again.
    this.cageShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.52, 1),
      new THREE.MeshStandardMaterial({
        color: 0x0d0716, transparent: true, opacity: 0.8,
        emissive: 0x2a1040, emissiveIntensity: 0.4, roughness: 1,
      })
    );
    this.cageShell.position.y = 1.1;
    this.root.add(this.cageShell);

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

    // the dragon's body is always a sword target; damage lands only while
    // the core is exposed (clank feedback otherwise, so swings never feel dead)
    this.coreHittable = new Hittable(x, z, 1.45, (n) => this._hitCore(n));
    world.enemies.push(this.coreHittable);
    this.coreExposed = false;
    // collect body materials for the red hurt-flash
    this._dragonMats = [];
    this.dragon.traverse((n) => {
      if (!n.isMesh) return;
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of ms) {
        if (m === this.eyeMat || !m.emissive) continue;
        m.userData.be = m.emissive.getHex();
        m.userData.bi = m.emissiveIntensity;
        this._dragonMats.push(m);
      }
    });
    this._hurtFlash = 0;

    // THE tell: a pulsing golden ring under the dragon whenever it can be
    // hurt (same "gold glow = go" language as chests and doorways), with a
    // chime as each window opens. Guarded = no ring, ever.
    this.strikeRing = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.5, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0.7,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.strikeRing.rotation.x = -Math.PI / 2;
    this.strikeRing.position.set(x, 0.04, z);
    this.strikeRing.visible = false;
    world.add(this.strikeRing);
    // and the stuck tendril gets its own small go-ring in phase 1
    this.tendrilRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.72, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0.75,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.tendrilRing.rotation.x = -Math.PI / 2;
    this.tendrilRing.visible = false;
    world.add(this.tendrilRing);

    world.boss = this;

    // PHASE-PRESERVING RESPAWN (kid rule): dying never sends the fight back
    // to phase 1 — the rebuilt boss resumes at the phase the kid reached.
    const resume = state.flags.bossProgress || 1;
    if (resume >= 2) {
      this.severed = 3;
      this.cageShell.material.opacity = 0.8 - 3 * 0.22;
      this.cageShell.scale.setScalar(1 - 3 * 0.12);
      this._enterPhase2();
    }
    if (resume >= 3) this._enterPhase3();
  }

  // ------------------------------------------------------------------


  _hitCore(n) {
    if (this.defeated) return;
    if (!this.coreExposed) {
      // shadow armor: the blow lands but glances off — loud, readable clank
      audio.play('parry', { volume: 0.4, rate: 0.5 });
      this._eyeFlash = 0.15;
      this.eyeMat.emissiveIntensity = 1.6;
      if (this.world.onDmgNum) this.world.onDmgNum(this.x, 2.2, this.z, 'BLOCKED');
      return;
    }
    this.coreHp -= n;
    if (this.world.onDmgNum) this.world.onDmgNum(this.x, 2.2, this.z, n);
    this._hurtFlash = 0.2;
    this.eyeMat.emissiveIntensity = 3;
    this._eyeFlash = 0.25;
    if (this.coreHp <= CORE_HP - 4 && this.phase === 2) this._enterPhase3();
    if (this.coreHp <= 0) this._defeat();
  }

  _setCoreExposed(v) {
    if (this.defeated) v = false;
    if (v && !this.coreExposed) audio.play('pup-chime', { volume: 0.55, rate: 0.9 }); // window opens!
    this.coreExposed = v; // body stays hittable — exposure gates real damage
    this.strikeRing.visible = v;
  }

  _severTendril() {
    this.severed++;
    // the giant FLINCHES — severing visibly hurts it (phase-1 readability)
    if (this.flinchAction) this.flinchAction.reset().fadeIn(0.08).play();
    // the shell cracks: thinner, smaller, letting more of Cinder's light out
    this.cageShell.material.opacity = 0.8 - this.severed * 0.22;
    this.cageShell.scale.setScalar(1 - this.severed * 0.12);
    this.cinderLight.intensity = 3.5 + this.severed * 1.5;
    this._shellPop = 0.3;
    if (this.severed >= 3 && this.phase === 1) this._enterPhase2();
  }

  _enterPhase2() {
    this.phase = 2;
    this.stateT = 0;
    state.flags.bossProgress = 2; // respawns resume here
    audio.howl({ volume: 0.9, rate: 0.75 }); // the great wolf answers the severs
    this.slamState = 'wait';
    this.slamTimer = 999; // no slams in phase 2
    this.slamTendril.visible = false;
    this.telegraph.visible = false;
    this._setCoreExposed(true);
    this._burstT = 0; // phase 2 pulses too: short frequent windows
    this.cageShell.visible = false; // the grip shatters — the light is free-ish
    this.chargeTimer = 3.0; // the wolf starts hunting: first pounce soon
    this.waveActive = true;
    this.wave.material.opacity = 0.5;
    // summon exactly 2 Shades
    this.world.enemies.push(
      new Shade(this.world, this.x - 2.6, this.z + 1.4, this._slimeGltf),
      new Shade(this.world, this.x + 2.6, this.z + 1.4, this._slimeGltf)
    );
  }

  _enterPhase3() {
    this.phase = 3;
    this.stateT = 0;
    state.flags.bossProgress = 3; // respawns resume here
    audio.howl({ volume: 1, rate: 0.6 }); // deepest howl — the dark closes in
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
    // DRAMATIC END: triple shockwave + spark storm + heavy shake before
    // the long dissolve (which sheds smoke and embers each frame above)
    if (juice.effects) {
      juice.effects.shake(0.65, 1.3);
      juice.effects.hitStop(0.14);
      juice.effects.groundSlam(this.root.position.clone(), 0xff5a3a);
      setTimeout(() => juice.effects && juice.effects.groundSlam(this.root.position.clone(), 0x8f6bff), 350);
      setTimeout(() => juice.effects && juice.effects.groundSlam(this.root.position.clone(), 0xffd76a), 750);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      juice.burst(this.x + Math.cos(a) * 1.2, 0.5 + (i % 3) * 0.6, this.z + Math.sin(a) * 1.2,
        i % 2 ? 0xff8a3a : 0x8f6bff, 12);
    }
    audio.play('slam', { volume: 1, rate: 0.5 });
    audio.howl({ volume: 0.85, rate: 0.5 }); // the long dying howl
    this.chargeStreak.visible = false;
    this.tiredRing.visible = false;
    this._setCoreExposed(false);
    this.coreHittable.dead = true;
    this.strikeRing.visible = false;
    this.tendrilRing.visible = false;
    this.world.bossDarkness = false;
    this.telegraph.visible = false;
    this.slamTendril.visible = false;
    this.wave.material.opacity = 0;
    if (this.slamHittable) this.slamHittable.dead = true;
    this._dissolveT = 1.6;

    state.flags.bossDefeated = true;
    state.flags.bossProgress = 0; // the fight is over — nothing to resume
    state.flags.shortcutOpen = true;
    if (!state.formsUnlocked.includes('fire_wolf')) state.formsUnlocked.push('fire_wolf');
    if (this.onDefeated) this.onDefeated();
  }

  // ------------------------------------------------------------------

  // True when a pillar sits on the line between the core and the player —
  // hiding behind cover blocks the shadow wave.
  _behindPillar(player) {
    const pillars = this.world.markers.pillars || [];
    const ax = this.x, az = this.z;
    const bx = player.root.position.x, bz = player.root.position.z;
    const abx = bx - ax, abz = bz - az;
    const len2 = abx * abx + abz * abz;
    if (len2 < 1e-6) return false;
    for (const p of pillars) {
      const t = ((p.x - ax) * abx + (p.z - az) * abz) / len2;
      if (t < 0.1 || t > 0.95) continue; // pillar must be between, not behind
      const cx = ax + abx * t, cz = az + abz * t;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < p.r + 0.35) return true;
    }
    return false;
  }

  _updateSlams(dt, player, faster) {
    // playtest tune: windows come MORE OFTEN but each is SHORTER —
    // the fight has a faster question/answer rhythm
    const TELEGRAPH = faster ? 0.8 : 1.05;
    const STUCK = 1.7;
    const BETWEEN = faster ? 0.6 : 0.9;

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
        // the dragon lashes as its shadow strikes
        if (this.attackAction) {
          this.attackAction.reset().fadeIn(0.08).play();
          this._attackT = this.attackAction.getClip().duration;
        }
        const dx = player.root.position.x - tx, dz = player.root.position.z - tz;
        // a well-timed jump clears the slam; a shield blunts or parries it
        if (dx * dx + dz * dz < 1.0) player.hurt(1, { groundAttack: true });
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
        this.core.position.y = (1 - f) * 1.2; // the shadow lifts away as it burns
        // DRAMA: smoke and sparks tear off the dissolving shadow
        this._burstAcc = (this._burstAcc || 0) + dt;
        if (this._burstAcc > 0.18) {
          this._burstAcc = 0;
          const a = Math.random() * Math.PI * 2;
          const r = 0.4 + Math.random() * 1.6;
          juice.burst(this.x + Math.cos(a) * r, 0.5 + Math.random() * 1.6, this.z + Math.sin(a) * r,
            Math.random() < 0.5 ? 0xff8a3a : 0x8f6bff, 10);
          smokePuff(this.world, this.x + Math.cos(a) * r, 0.8, this.z + Math.sin(a) * r, 0x241238);
        }
        this.cinder.material.emissiveIntensity = 1.6 + (1 - f) * 2.2;
        this.cinderLight.intensity = 3.5 + (1 - f) * 8;
        this.cinder.position.y = 1.1 + (1 - f) * 0.7;
        if (this._dissolveT <= 0) {
          this.root.remove(this.core);
          this.root.remove(this.cageShell);
        }
      } else {
        this.cinder.position.y = 1.8 + Math.sin(t * 1.7) * 0.15;
      }
      return;
    }

    this.stateT += dt;

    // idle motion + the dragon faces the player, wings beating
    this.mixer.update(dt);
    if (this._attackT > 0) {
      this._attackT -= dt;
      if (this._attackT <= 0 && this.attackAction) this.attackAction.fadeOut(0.25);
    }
    this.dragon.position.y = -1.0 + Math.sin(t * 1.9) * 0.12;
    // strike-window rings pulse so they read as "hit me NOW"
    if (this.strikeRing.visible) {
      this.strikeRing.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
      this.strikeRing.material.opacity = 0.55 + 0.3 * Math.sin(t * 6);
    }
    const stuck = this.slamState === 'stuck' && this.phase === 1 && this.slamHittable && !this.slamHittable.dead;
    this.tendrilRing.visible = stuck;
    if (stuck) {
      this.tendrilRing.position.set(this.slamTendril.position.x, 0.05, this.slamTendril.position.z);
      this.tendrilRing.scale.setScalar(1 + Math.sin(t * 7) * 0.1);
      this.tendrilRing.material.opacity = 0.6 + 0.3 * Math.sin(t * 7);
      this.slamTendril.material.emissiveIntensity = 1.2 + Math.sin(t * 7) * 0.6;
    } else {
      this.slamTendril.material.emissiveIntensity = 0.6;
    }
    if (this._hurtFlash > 0) {
      this._hurtFlash -= dt;
      const on = this._hurtFlash > 0;
      for (const m of this._dragonMats) {
        m.emissive.setHex(on ? 0xff2a1a : m.userData.be);
        m.emissiveIntensity = on ? 0.8 : m.userData.bi;
      }
    }
    this.core.rotation.y = Math.atan2(
      player.root.position.x - this.x,
      player.root.position.z - this.z
    );
    if (this._eyeFlash > 0) {
      this._eyeFlash -= dt;
      if (this._eyeFlash <= 0) this.eyeMat.emissiveIntensity = this.coreExposed ? 1.6 : 0.7;
    }
    this.cinder.material.emissiveIntensity = 1.4 + Math.sin(t * 2.6) * 0.3;
    if (this.cageShell.visible) {
      const base = 1 - this.severed * 0.12;
      const pop = this._shellPop > 0 ? (this._shellPop -= dt, Math.sin(Math.max(0, this._shellPop) / 0.3 * Math.PI) * 0.15) : 0;
      this.cageShell.scale.setScalar(base + Math.sin(t * 2.1) * 0.04 + pop);
      this.cageShell.position.y = 1.1 + Math.sin(t * 1.7) * 0.05;
    }

    if (this.phase === 1) {
      this._updateSlams(dt, player, false);
    } else if (this.phase === 2) {
      // THE POUNCE — the wolf's signature, on a fixed readable loop:
      // rest → crouch (red lane flashes 1.0s) → leap down the lane →
      // crash, TIRED for 2.0s (the big open window) → pad back to the light.
      this.chargeTimer -= dt;
      const wolfWX = this.x + this.core.position.x;
      const wolfWZ = this.z + this.core.position.z;
      if (this.chargeState === 'rest' && this.chargeTimer <= 0) {
        this.chargeState = 'crouch';
        this.chargeTimer = 1.0;
        const cx = player.root.position.x - wolfWX, cz = player.root.position.z - wolfWZ;
        const cd = Math.hypot(cx, cz) || 1;
        this.chargeDir = { x: cx / cd, z: cz / cd };
        this.chargeStreak.position.set(wolfWX + this.chargeDir.x * 4, 0.05, wolfWZ + this.chargeDir.z * 4);
        this.chargeStreak.rotation.z = -Math.atan2(this.chargeDir.x, this.chargeDir.z) + Math.PI / 2;
        audio.play('bite', { volume: 0.9, rate: 0.5 }); // deep snarl wind-up
      } else if (this.chargeState === 'crouch') {
        this.core.scale.y = 0.8; // visibly coils down
        this.chargeStreak.material.opacity = 0.25 + 0.3 * Math.abs(Math.sin(this.chargeTimer * 18));
        if (this.chargeTimer <= 0) {
          this.chargeState = 'charge';
          this.chargeTimer = 1.0;
          this.core.scale.y = 1;
          if (this.runAction) this.runAction.reset().play();
          if (this.attackAction) this.attackAction.reset().fadeIn(0.06).play();
          audio.play('tendril-slam', { volume: 0.8, rate: 1.3 });
        }
      } else if (this.chargeState === 'charge') {
        this.chargeStreak.material.opacity = Math.max(0, this.chargeStreak.material.opacity - dt * 3);
        this.wolfOff.x += this.chargeDir.x * 10.5 * dt;
        this.wolfOff.z += this.chargeDir.z * 10.5 * dt;
        this.core.position.x = this.wolfOff.x;
        this.core.position.z = -1.4 + this.wolfOff.z;
        const pdx = player.root.position.x - (this.x + this.core.position.x);
        const pdz = player.root.position.z - (this.z + this.core.position.z);
        if (pdx * pdx + pdz * pdz < 1.6 * 1.6) player.hurt(1, { attacker: this, groundAttack: true });
        if (Math.hypot(this.wolfOff.x, this.wolfOff.z) > 6.2 || this.chargeTimer <= 0) {
          // THE COLLAPSE — the pounce spends everything and the giant wolf
          // visibly FALLS OVER (Death clip, held): the "hit it now" read is
          // the whole body, not just a ring. A breath of slow-motion sells
          // the crash and stretches the window for small hands.
          this.chargeState = 'tired';
          this.chargeTimer = 2.6;
          if (this.runAction) this.runAction.fadeOut(0.2);
          if (this.attackAction) this.attackAction.fadeOut(0.15);
          if (this.collapseAction) {
            if (this.flyAction) this.flyAction.fadeOut(0.15);
            this.collapseAction.reset().fadeIn(0.1).play();
          }
          juice.burst(this.x + this.core.position.x, 0.5, this.z + this.core.position.z, 0x8f6bff, 12);
          juice.burst(this.x + this.core.position.x, 0.3, this.z + this.core.position.z, 0x9a8f80, 10); // dust
          if (juice.effects) {
            juice.effects.shake(0.4, 0.5);
            if (juice.effects.slow) juice.effects.slow(0.75, 0.6);
          }
          audio.play('slam', { volume: 0.95, rate: 0.6 }); // the THUD
        }
      } else if (this.chargeState === 'tired') {
        // COLLAPSED: flat on the ground, eyes dim, gold ring pulsing under
        // it — force-exposed below. This IS the fight's punish window.
        this.eyeMat.emissiveIntensity = 0.3;
        this.tiredRing.visible = true;
        this.tiredRing.position.x = this.x + this.core.position.x;
        this.tiredRing.position.z = this.z + this.core.position.z;
        const pulse = 1 + Math.sin(t * 5) * 0.06;
        this.tiredRing.scale.set(pulse, pulse, 1);
        this.tiredRing.material.opacity = 0.6 + Math.sin(t * 5) * 0.25;
        if (this.chargeTimer <= 0) {
          this.chargeState = 'return';
          this.chargeTimer = 1.2;
          this.tiredRing.visible = false;
          // it hauls itself back up and pads home
          if (this.collapseAction) this.collapseAction.fadeOut(0.3);
          if (this.flyAction) this.flyAction.reset().fadeIn(0.3).play();
        }
      } else if (this.chargeState === 'return') {
        const k = Math.min(1, dt * 3);
        this.wolfOff.x += (0 - this.wolfOff.x) * k;
        this.wolfOff.z += (0 - this.wolfOff.z) * k;
        this.core.position.x = this.wolfOff.x;
        this.core.position.z = -1.4 + this.wolfOff.z;
        this.core.scale.y = 1;
        if (this.chargeTimer <= 0) {
          this.wolfOff.x = 0; this.wolfOff.z = 0;
          this.core.position.set(0, 0, -1.4);
          this.chargeState = 'rest';
          this.chargeTimer = 5.0; // next pounce on a steady, learnable beat
        }
      }
      // the core guards in a rhythm too: open while the wolf rests (1.7s
      // pulses) and WIDE open while it lies tired after a pounce
      this._burstT += dt;
      const c2 = this._burstT % 2.9;
      this._setCoreExposed(this.chargeState === 'tired' || (this.chargeState === 'rest' && c2 < 1.7));
      // rotating shadow wave — slow, always a safe arc
      this.waveAngle += dt * 0.55;
      const wx = this.x + Math.cos(this.waveAngle) * 3.4;
      const wz = this.z + Math.sin(this.waveAngle) * 3.4;
      this.wave.position.set(wx, 0.06, wz);
      this.wave.rotation.z = -this.waveAngle;
      // damage if the player stands in the sweeping bar — unless a pillar
      // stands between them and the core (cover is real)
      const px = player.root.position.x - this.x, pz = player.root.position.z - this.z;
      const pd = Math.hypot(px, pz);
      if (pd > 1.2 && pd < 6.2) {
        let da = Math.atan2(pz, px) - this.waveAngle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 0.16 && !this._behindPillar(player)) {
          player.hurt(1, { groundAttack: true });
        }
      }
    } else if (this.phase === 3) {
      this._updateSlams(dt, player, true);
      // the core opens in bursts: 1.4s open / 1.4s guarded (short + frequent)
      this._burstT += dt;
      const cycle = this._burstT % 2.8;
      const open = cycle < 1.4;
      this._setCoreExposed(open);
      this.eyeMat.emissiveIntensity = open ? 1.8 : 0.4;
      // the wolf lunges its head in when open, rears back when guarded
      this.core.position.z = open ? -0.7 : -1.8;
    }

    // keep the core hittable's position in sync
    this.coreHittable.x = this.x;
    this.coreHittable.z = this.z;
  }
}
