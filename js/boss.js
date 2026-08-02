// The Shadowgrip — Ember Hollow's boss, per design/COMBAT-SPEC.md.
// v3.18 (dad's playtest law): NO tentacles, NO phase machinery — the boss is
// simply a GIANT shadow wolf that fights exactly like the little shadow
// hounds, with a lot more health and a harder bite. Same telegraph language
// the kids already learned: deep crouch + eyes flare + claws scraping dust =
// a charge is coming (dodge/roll it); a close-up snarl windup = a paw swipe
// (block or parry it with the shield). After every charge it collapses,
// tired, under a gold act-here ring. Always hittable — every swing counts.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepareCharacter } from './assets.js';
import { smokePuff } from './enemies.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { juice } from './juice.js';

const MAX_HP = 20;        // "a lot more health" — the little hounds have 3
const HIT_CAP = 3;        // any single strike caps at 3 (surges stay strong, never trivial)
const ATTACK_DMG = 1.5;   // "his attack is more" — hounds hit for 1

class Hittable {
  // Minimal enemy-shaped adapter so sword arcs / bolts / the Blood Moon land.
  constructor(x, z, radius, onHit) {
    this.x = x; this.z = z;
    this.radius = radius;
    this.dead = false;
    this._onHit = onHit;
  }
  takeDamage(n) { if (!this.dead) this._onHit(Math.min(n, HIT_CAP)); }
  update() {}
}

export class Shadowgrip {
  constructor(world, x, z, wolfGltf) {
    this.world = world;
    this.x = x; this.z = z;
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    world.add(this.root);

    this.maxHp = MAX_HP;
    // dying never resets the duel: the wounds Kael landed are REMEMBERED
    // (state.flags.bossHp, additive save field). Old saves that reached the
    // legacy "phase 2/3" get the same courtesy.
    const legacy = state.flags.bossProgress >= 2 ? MAX_HP * 0.6 : MAX_HP;
    this.coreHp = Math.min(state.flags.bossHp || legacy, MAX_HP);
    this.defeated = false;
    this.onDefeated = null;

    // --- the boss body: the same Quaternius wolf as Kael's forms and the
    // hounds, ~2.3x their size, near-black with violet eyes.
    this.core = new THREE.Group();
    const wolf = prepareCharacter(SkeletonUtils.clone(wolfGltf.scene));
    wolf.scale.setScalar(1.3);
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
    if (!this.eyeMat) {
      this.eyeMat = new THREE.MeshStandardMaterial({ emissive: 0xb9a8ff, emissiveIntensity: 1.2 });
    }
    this.core.add(wolf);
    this.dragon = wolf; // legacy name kept: the boss's body
    this.mixer = new THREE.AnimationMixer(wolf);
    const clip = (name) => wolfGltf.animations.find((c) => c.name === name);
    this.flyAction = clip('Idle') ? this.mixer.clipAction(clip('Idle')) : null;
    if (this.flyAction) this.flyAction.play();
    this.walkAction = clip('Walk') ? this.mixer.clipAction(clip('Walk')) : null;
    this.runAction = clip('Gallop') ? this.mixer.clipAction(clip('Gallop')) : null;
    this.attackAction = clip('Attack') ? this.mixer.clipAction(clip('Attack')) : null;
    if (this.attackAction) this.attackAction.setLoop(THREE.LoopOnce);
    // THE COLLAPSE: the Death clip plays and HOLDS while the wolf lies tired
    this.collapseAction = clip('Death') ? this.mixer.clipAction(clip('Death')) : null;
    if (this.collapseAction) {
      this.collapseAction.setLoop(THREE.LoopOnce);
      this.collapseAction.clampWhenFinished = true;
    }
    this._anim = 'idle';
    this.core.position.set(0, 0, -1.4); // starts just behind the caged light
    this.root.add(this.core);

    // --- caged Cinder: the weak warm ember the wolf is guarding ---
    this.cinder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 1),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb25a, emissiveIntensity: 1.6, roughness: 1 })
    );
    this.cinder.position.y = 1.1;
    this.root.add(this.cinder);
    this.cinderLight = new THREE.PointLight(0xffb25a, 3.5, 8, 1.9);
    this.cinderLight.position.set(0, 1.3, 0);
    this.root.add(this.cinderLight);
    // a dark shell smothers the light; it thins as the wolf weakens —
    // the fight's progress is readable in the room itself
    this.cageShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.52, 1),
      new THREE.MeshStandardMaterial({
        color: 0x0d0716, transparent: true, opacity: 0.8,
        emissive: 0x2a1040, emissiveIntensity: 0.4, roughness: 1,
      })
    );
    this.cageShell.position.y = 1.1;
    this.root.add(this.cageShell);

    // --- hunter state machine (hound grammar, boss size) ---
    this.action = 'prowl';   // prowl | stalk | windup | swipe | crouch | charge | tired | recover
    this.actionT = 0;
    this.attackIn = 3.2;
    this.orbitSign = 1;
    this.chargeDir = { x: 0, z: 1 };
    this.wolfOff = { x: 0, z: 0 };
    this._scrapeAcc = 0;
    this._halfHowled = this.coreHp <= MAX_HP / 2;
    // legacy fields some old saves/tests may read — inert now
    this.phase = 1;
    this.chargeState = 'rest';
    this.slamState = 'wait';

    // gold "hit it NOW" ring under the collapsed wolf (act-here law)
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

    // the wolf's body is ALWAYS a real target — like every other wolf
    this.coreHittable = new Hittable(x, z - 1.4, 1.45, (n) => this._hitCore(n));
    world.enemies.push(this.coreHittable);
    this.coreExposed = true; // legacy readers: there is no armor anymore

    // body materials for the red hurt-flash
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

    world.boss = this;
  }

  // ------------------------------------------------------------------

  _hitCore(n) {
    if (this.defeated) return;
    this.coreHp -= n;
    state.flags.bossHp = Math.max(0, this.coreHp); // wounds are remembered
    const wx = this.x + this.core.position.x, wz = this.z + this.core.position.z;
    if (this.world.onDmgNum) this.world.onDmgNum(wx, 2.2, wz, n);
    this._hurtFlash = 0.2;
    this.eyeMat.emissiveIntensity = 3;
    this._eyeFlash = 0.25;
    // the midpoint beat: at half health it howls and hunts HARDER
    if (!this._halfHowled && this.coreHp <= MAX_HP / 2) {
      this._halfHowled = true;
      audio.howl({ volume: 0.95, rate: 0.7 });
      juice.burst(wx, 1.2, wz, 0x8f6bff, 14);
    }
    if (this.coreHp <= 0) this._defeat();
  }

  // A perfect parry (or a stunning blow) staggers even the great wolf —
  // the shield is a real answer, not just a wall.
  takeStun(sec) {
    if (this.defeated || this.action === 'tired') return;
    this.action = 'recover';
    this.actionT = Math.max(1.4, sec);
    this.core.scale.y = 1;
    if (this.attackAction) this.attackAction.fadeOut(0.15);
    this._setAnim('idle');
    this.eyeMat.emissiveIntensity = 0.4;
    audio.play('parry', { volume: 0.6, rate: 0.85 });
  }

  _defeat() {
    this.defeated = true;
    state.flags.bossHp = 0;
    // DRAMATIC END: triple shockwave + spark storm + heavy shake before
    // the long dissolve (which sheds smoke and embers each frame in update)
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
    this.tiredRing.visible = false;
    this.coreHittable.dead = true;
    this._dissolveT = 1.6;

    state.flags.bossDefeated = true;
    state.flags.bossProgress = 0;
    state.flags.shortcutOpen = true;
    if (!state.formsUnlocked.includes('fire_wolf')) state.formsUnlocked.push('fire_wolf');
    if (this.onDefeated) this.onDefeated();
  }

  // ------------------------------------------------------------------

  update(dt, t, player) {
    if (this.defeated) {
      // dissolve with a long exhale: shrink, fade, free the light
      if (this._dissolveT > 0) {
        this._dissolveT -= dt;
        const f = Math.max(0, this._dissolveT / 1.6);
        this.core.scale.setScalar(f);
        this.core.position.y = (1 - f) * 1.2; // the shadow lifts away as it burns
        this._burstAcc = (this._burstAcc || 0) + dt;
        if (this._burstAcc > 0.18) {
          this._burstAcc = 0;
          const a = Math.random() * Math.PI * 2;
          const r = 0.4 + Math.random() * 1.6;
          juice.burst(this.x + Math.cos(a) * r, 0.5 + Math.random() * 1.6, this.z + Math.sin(a) * r,
            Math.random() < 0.5 ? 0xff8a3a : 0x8f6bff, 10);
          smokePuff(this.world, this.x + Math.cos(a) * r, 0.8, this.z + Math.sin(a) * r, 0x241238);
        }
        this.cageShell.visible = false;
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

    this.mixer.update(dt);
    this.dragon.position.y = 0; // paws on the ground, always

    if (this._hurtFlash > 0) {
      this._hurtFlash -= dt;
      const on = this._hurtFlash > 0;
      for (const m of this._dragonMats) {
        m.emissive.setHex(on ? 0xff2a1a : m.userData.be);
        m.emissiveIntensity = on ? 0.8 : m.userData.bi;
      }
    }
    if (this._eyeFlash > 0) {
      this._eyeFlash -= dt;
      if (this._eyeFlash <= 0) this.eyeMat.emissiveIntensity = 1.2;
    }
    // Cinder breathes; the smothering shell THINS as the wolf weakens
    this.cinder.material.emissiveIntensity = 1.4 + Math.sin(t * 2.6) * 0.3;
    const hpFrac = Math.max(0, this.coreHp) / MAX_HP;
    this.cageShell.material.opacity = 0.15 + 0.65 * hpFrac;
    this.cageShell.scale.setScalar(0.65 + 0.35 * hpFrac + Math.sin(t * 2.1) * 0.04);
    this.cageShell.position.y = 1.1 + Math.sin(t * 1.7) * 0.05;
    this.cinderLight.intensity = 3.5 + (1 - hpFrac) * 2.5;

    this._updateWolf(dt, t, player);

    // the HITBOX and the gold ring RIDE THE WOLF — you always hit the wolf,
    // wherever it stands (playtest law: a boss is a creature, never a turret)
    const wwx = this.x + this.core.position.x;
    const wwz = this.z + this.core.position.z;
    this.coreHittable.x = wwx;
    this.coreHittable.z = wwz;
    if (this.tiredRing.visible) {
      this.tiredRing.position.x = wwx;
      this.tiredRing.position.z = wwz;
      const pulse = 1 + Math.sin(t * 5) * 0.06;
      this.tiredRing.scale.set(pulse, pulse, 1);
      this.tiredRing.material.opacity = 0.6 + Math.sin(t * 5) * 0.25;
    }
  }

  // Crossfaded locomotion so the walk/gallop always match the movement.
  _setAnim(name) {
    if (this._anim === name) return;
    const map = { idle: this.flyAction, walk: this.walkAction, run: this.runAction };
    const next = map[name];
    const prev = map[this._anim];
    if (next) next.reset().fadeIn(0.2).play();
    if (prev && prev !== next) prev.fadeOut(0.2);
    this._anim = name;
  }

  // The duel: EXACTLY the little hounds' dance, scaled up.
  //   prowl  — circles Kael (walk), never a statue
  //   stalk  — trots in when it wants the close swipe
  //   windup — 0.9s snarl + coil: THE SWIPE IS COMING (shield/parry answer)
  //   swipe  — one big paw arc in front (blockable; jumping clears it)
  //   crouch — 1.0s ON-BODY charge telegraph: deep crouch, eyes FLARE,
  //            claws scrape dust — the hounds' language, boss-sized
  //   charge — a straight run THROUGH where you stood (dodge/roll answer)
  //   tired  — THE COLLAPSE after every charge: falls over under a gold
  //            ring for 2.6s — the big free-hits window
  //   recover— short pant after a swipe (also the parry-stagger state)
  _updateWolf(dt, t, player) {
    const px = player.root.position.x, pz = player.root.position.z;
    const wx = this.x + this.wolfOff.x;
    const wz = this.z - 1.4 + this.wolfOff.z;
    const dx = px - wx, dz = pz - wz;
    const d = Math.hypot(dx, dz) || 0.01;
    this.actionT -= dt;
    const enraged = this._halfHowled; // below half health it hunts harder
    const facePlayer = () => { this.core.rotation.y = Math.atan2(dx, dz); };
    const move = (mx, mz, speed) => {
      const nx = wx + mx * speed * dt, nz = wz + mz * speed * dt;
      const s = this.world.resolveCircle(nx, nz, 0.85);
      this.wolfOff.x = s.x - this.x;
      this.wolfOff.z = s.z - (this.z - 1.4);
      this.core.position.x = this.wolfOff.x;
      this.core.position.z = -1.4 + this.wolfOff.z;
    };
    const A = this.action;

    if (A === 'prowl') {
      facePlayer();
      this._setAnim('walk');
      const R = 4.0;
      const nxr = dx / d, nzr = dz / d;
      let mx = -nzr * this.orbitSign, mz = nxr * this.orbitSign; // tangent
      if (d > R + 0.8) { mx = mx * 0.4 + nxr * 0.8; mz = mz * 0.4 + nzr * 0.8; }
      else if (d < R - 1.2) { mx = mx * 0.4 - nxr * 0.8; mz = mz * 0.4 - nzr * 0.8; }
      move(mx, mz, enraged ? 2.7 : 2.1);
      this.attackIn -= dt;
      if (this.attackIn <= 0) {
        if (Math.random() < 0.35) this.orbitSign *= -1; // keep the circling fresh
        if (d < 3.2) {
          // close enough: the SWIPE (shield lesson)
          this.action = 'windup';
          this.actionT = 0.9;
          this._setAnim('idle');
          audio.play('bite', { volume: 0.6, rate: 0.42, vary: 0.05 }); // GROWL
        } else if (Math.random() < 0.4) {
          // trot in for the swipe
          this.action = 'stalk';
          this.actionT = 2.4;
        } else {
          // THE CHARGE (dodge lesson) — hound telegraph, boss-sized
          this.action = 'crouch';
          this.actionT = 1.0;
          this._scrapeAcc = 0;
          facePlayer();
          audio.play('bite', { volume: 0.9, rate: 0.5 }); // deep snarl wind-up
        }
      }
    } else if (A === 'stalk') {
      facePlayer();
      this._setAnim('run');
      move(dx / d, dz / d, enraged ? 3.6 : 3.1);
      if (d < 2.6 || this.actionT <= 0) {
        this.action = 'windup';
        this.actionT = 0.9;
        this._setAnim('idle');
        audio.play('bite', { volume: 0.6, rate: 0.42, vary: 0.05 });
      }
    } else if (A === 'windup') {
      // snarl + coil: the paw is coming — raise the shield NOW (or roll)
      facePlayer();
      const f = 1 - Math.max(0, this.actionT) / 0.9;
      this.core.scale.y = 1 - 0.22 * f;
      this.eyeMat.emissiveIntensity = 1.2 + f * 2.6;
      if (this.actionT <= 0) {
        this.core.scale.y = 1;
        const dd = Math.hypot(px - wx, pz - wz) || 0.01;
        this.chargeDir = { x: (px - wx) / dd, z: (pz - wz) / dd };
        this.action = 'swipe';
        this.actionT = 0.55;
        this._swipeHit = false;
        if (this.attackAction) this.attackAction.reset().fadeIn(0.06).play();
        audio.play('whoosh', { volume: 0.85, rate: 0.65 });
      }
    } else if (A === 'swipe') {
      facePlayer();
      if (!this._swipeHit && this.actionT <= 0.35) {
        this._swipeHit = true;
        // frontal arc: close + in front = hit. Blockable, parryable
        // (attacker passed so a perfect parry STAGGERS the wolf), and a
        // jump clears it (groundAttack).
        const cone = (dx * this.chargeDir.x + dz * this.chargeDir.z) / d;
        if (d < 2.8 && cone > 0.35) player.hurt(ATTACK_DMG, { attacker: this, groundAttack: true });
        juice.burst(wx + this.chargeDir.x * 1.6, 0.4, wz + this.chargeDir.z * 1.6, 0x8f6bff, 8);
        audio.play('slam', { volume: 0.6, rate: 1.1 });
      }
      if (this.actionT <= 0) {
        this.action = 'recover';
        this.actionT = 1.6;
        this.eyeMat.emissiveIntensity = 0.5;
      }
    } else if (A === 'crouch') {
      // ON-BODY charge telegraph — same as the little hounds: coils LOW,
      // eyes flare bright, claws scrape up dust. ~1s to get out of the lane.
      facePlayer();
      const f = 1 - Math.max(0, this.actionT) / 1.0;
      this.core.scale.y = 0.78;
      this.eyeMat.emissiveIntensity = 1.4 + f * 3.2;
      this._scrapeAcc += dt;
      if (this._scrapeAcc > 0.22) {
        this._scrapeAcc = 0;
        juice.burst(wx - (dx / d) * 0.9, 0.2, wz - (dz / d) * 0.9, 0x9a8f80, 5); // dust
      }
      if (this.actionT <= 0) {
        this.core.scale.y = 1;
        const dd = Math.hypot(px - wx, pz - wz) || 0.01;
        this.chargeDir = { x: (px - wx) / dd, z: (pz - wz) / dd };
        this.action = 'charge';
        this.actionT = 1.0;
        this._chargeDist = 0;
        this._chargeHit = false;
        if (this.runAction) this.runAction.reset().play();
        if (this.attackAction) this.attackAction.reset().fadeIn(0.06).play();
        audio.play('whoosh', { volume: 0.9, rate: 0.7 });
        audio.play('bite', { volume: 0.8, rate: 0.55 });
      }
    } else if (A === 'charge') {
      this.core.rotation.y = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      move(this.chargeDir.x, this.chargeDir.z, enraged ? 11.5 : 10.0);
      this._chargeDist += (enraged ? 11.5 : 10.0) * dt;
      if (!this._chargeHit && d < 1.4) {
        this._chargeHit = true; // one hit per charge — never a grinder
        player.hurt(ATTACK_DMG, { attacker: this, groundAttack: true });
      }
      if (this._chargeDist > 6.5 || this.actionT <= 0) {
        // THE COLLAPSE — the charge spends everything and the wolf visibly
        // FALLS OVER (Death clip, held). Slow-mo blip sells the crash and
        // stretches the window for small hands.
        this.action = 'tired';
        this.actionT = 2.6;
        if (this.runAction) this.runAction.fadeOut(0.2);
        if (this.attackAction) this.attackAction.fadeOut(0.15);
        if (this.collapseAction) {
          if (this.flyAction) this.flyAction.fadeOut(0.15);
          if (this.walkAction) this.walkAction.fadeOut(0.15);
          this.collapseAction.reset().fadeIn(0.1).play();
          this._anim = 'collapsed';
        }
        this.tiredRing.visible = true;
        juice.burst(this.x + this.core.position.x, 0.5, this.z + this.core.position.z, 0x8f6bff, 12);
        juice.burst(this.x + this.core.position.x, 0.3, this.z + this.core.position.z, 0x9a8f80, 10); // dust
        if (juice.effects) {
          juice.effects.shake(0.4, 0.5);
          if (juice.effects.slow) juice.effects.slow(0.75, 0.6);
        }
        audio.play('slam', { volume: 0.95, rate: 0.6 }); // the THUD
      }
    } else if (A === 'tired') {
      // COLLAPSED under the gold ring: eyes dim — pile the hits on
      this.eyeMat.emissiveIntensity = 0.3;
      if (this.actionT <= 0) {
        this.tiredRing.visible = false;
        if (this.collapseAction) this.collapseAction.fadeOut(0.3);
        this._anim = 'x';
        this._setAnim('idle');
        this._backToProwl();
      }
    } else if (A === 'recover') {
      // panting after the swipe (or staggered by a parry)
      facePlayer();
      this._setAnim('idle');
      if (this.actionT <= 0) this._backToProwl();
    }
  }

  _backToProwl() {
    this.action = 'prowl';
    this.eyeMat.emissiveIntensity = 1.2;
    this.attackIn = this._halfHowled ? 2.2 : 3.2;
  }
}
