// Visual effects. Phase 3: the Blood Moon ultimate + camera shake.
// Effects are self-contained updaters: main.js calls effects.update(dt) and
// adds effects.shakeOffset to the camera each frame.

import * as THREE from 'three';
import { juice } from './juice.js';
import { CONFIG } from './config.js';
import { state } from './state.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shakeOffset = new THREE.Vector3();
    this.hitStopTime = 0; // freeze-frame on solid hits (real-time seconds)
    this.zoom = 0;        // 0..1 camera punch-in (Blood Moon drama)
    this.timeScale = 1;   // <1 = the world moves through syrup (surge morph)
    this._shakeTime = 0;
    this._shakeStrength = 0;
    this._active = [];
  }

  // Camera punch-in: a quick lean toward the action that releases over dur.
  punch(amount = 0.3, dur = 0.25) {
    if (state.settings.reduceMotion) amount *= CONFIG.ACCESSIBILITY.REDUCE_MOTION_PUNCH_SCALE;
    if (amount <= 0) return;
    let elapsed = 0;
    this._active.push((dt) => {
      elapsed += dt;
      const f = Math.min(1, elapsed / dur);
      this.zoom = Math.max(this.zoom, amount * (1 - f));
      return f < 1;
    });
  }

  // Brief time-slow: world updates run at `scale` speed, easing back to 1.
  slow(scale = 0.7, dur = 0.6) {
    let elapsed = 0;
    this.timeScale = Math.min(this.timeScale, scale);
    this._active.push((dt) => {
      elapsed += dt;
      const f = Math.min(1, elapsed / dur);
      this.timeScale = scale + (1 - scale) * f * f;
      if (f >= 1) { this.timeScale = 1; return false; }
      return true;
    });
  }

  shake(strength = 0.4, time = 0.5) {
    if (state.settings.reduceMotion) strength *= CONFIG.ACCESSIBILITY.REDUCE_MOTION_SHAKE_SCALE;
    if (strength <= 0) return;
    this._shakeStrength = Math.max(this._shakeStrength, strength);
    this._shakeTime = Math.max(this._shakeTime, time);
  }

  hitStop(t = 0.07) {
    if (state.settings.reduceMotion) t *= CONFIG.ACCESSIBILITY.REDUCE_MOTION_HITSTOP_SCALE;
    this.hitStopTime = Math.max(this.hitStopTime, t);
  }

  // 1 normally; dimmed under reduce-motion for one-off light-burst flashes
  // (ground-slam impact glow, the Surge's red wash/moon glow).
  _flashScale() {
    return state.settings.reduceMotion ? CONFIG.ACCESSIBILITY.REDUCE_MOTION_FLASH_SCALE : 1;
  }

  update(dt, t) {
    if (this._shakeTime > 0) {
      this._shakeTime -= dt;
      const s = this._shakeStrength * Math.max(0, this._shakeTime) * 2;
      this.shakeOffset.set(
        Math.sin(t * 91) * s,
        Math.sin(t * 83 + 1.7) * s * 0.5,
        Math.sin(t * 77 + 4.1) * s
      );
      if (this._shakeTime <= 0) this._shakeStrength = 0;
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
    for (let i = this._active.length - 1; i >= 0; i--) {
      if (!this._active[i](dt)) this._active.splice(i, 1);
    }
  }

  // Radial shockwave ring + emissive flash. Used by every ability that hits in
  // a circle, and by the boss death ceremonies.
  //
  // C1 — `radius` IS THE ABILITY'S TRUE REACH, and the ring stops there.
  //
  // This used to grow to a fixed scale 4.2, so whatever called it drew the same
  // ~4u circle. The abilities it represents are not 4u and are not all the same
  // size, so the flourish was telling a child the wrong thing about every one of
  // them — worst on the knight's spin, whose own comment in player.js says the
  // ring "sweeps out to the spin's reach" while SPIN_RANGE is 2.3, a 74%
  // overstatement. THE POSE NEVER LIES applies to a shockwave as much as to a
  // shield: these children learn range by watching, not by reading numbers.
  //
  // NOT a room-scale problem, whatever the fix plan said. The camera is a fixed
  // world-space offset and never changes distance, so the visible ground is
  // 21.2u wide, 12.9u ahead and 4.5u behind in EVERY room — measured identically
  // in a 14x10 choke and the 36x28 hub. A ring that reads correctly in one room
  // reads correctly in all of them. Do not "scale this with room size" later.
  //
  // The growth eases OUT so the ring arrives at its true extent early and
  // lingers there while it fades, instead of still expanding as it disappears.
  // That is what makes the honest radius legible rather than merely correct.
  // `cone` makes the flourish the ability's SHAPE as well as its reach:
  // {deg, fx, fz} draws a wedge of half-angle `deg` centred on the facing
  // (fx, fz) instead of a full disc. Two abilities needed it — the frost breath
  // is a 40-degree cone and the vine-lash is a 3.8 x 0.9 corridor, and drawing
  // either as a circle told a child it reached 0.6u BEHIND them, which is the
  // one direction the fixed camera barely shows.
  //
  // Same primitive: RingGeometry takes thetaStart/thetaLength, so a wedge costs
  // no new geometry type and no extra draw call. After the -90-degree X
  // rotation that lays the ring flat, local theta 0 points at world +x and
  // theta grows toward world -z, so the facing maps to atan2(-fz, fx).
  groundSlam(pos, color = 0xff7a2a, radius = 4.0, cone = null) {
    const OUTER = 0.95;                                  // ring outer radius at scale 1
    const grow = Math.max(0.25, radius / OUTER - 1);
    const half = cone ? THREE.MathUtils.degToRad(cone.deg) : 0;
    const mid = cone ? Math.atan2(-cone.fz, cone.fx) : 0;
    const ring = new THREE.Mesh(
      cone
        ? new THREE.RingGeometry(0.5, 0.95, 24, 1, mid - half, half * 2)
        : new THREE.RingGeometry(0.5, 0.95, 36),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.07, pos.z);
    const fScale = this._flashScale();
    const flash = new THREE.PointLight(0xff8a3a, 18 * fScale, 12, 1.7);
    flash.position.set(pos.x, 1.0, pos.z);
    this.scene.add(ring, flash);
    this.shake(0.3, 0.35);

    let elapsed = 0;
    const DURATION = 0.55;
    this._active.push((dt) => {
      elapsed += dt;
      const f = Math.min(1, elapsed / DURATION);
      const e = 1 - (1 - f) * (1 - f);                    // ease out: arrive, then linger
      const s = 1 + e * grow;
      ring.scale.set(s, s, 1);
      ring.material.opacity = 0.95 * (1 - f);
      flash.intensity = 18 * fScale * (1 - f);
      if (f >= 1) {
        this.scene.remove(ring, flash);
        ring.geometry.dispose();
        ring.material.dispose();
        return false;
      }
      return true;
    });
  }

  // Victory: warm light floods the room as the shadow's hold breaks.
  warmFlood() {
    const flood = new THREE.HemisphereLight(0xffd9a0, 0x7a4a2a, 0);
    this.scene.add(flood);
    let elapsed = 0;
    this._active.push((dt) => {
      elapsed += dt;
      if (elapsed < 0.9) flood.intensity = (elapsed / 0.9) * 2.6;
      else flood.intensity = Math.max(0, 2.6 * (1 - (elapsed - 0.9) / 3.6));
      if (elapsed > 4.5) {
        this.scene.remove(flood);
        return false;
      }
      return true;
    });
  }

  // The Blood Moon Surge ceremony (~2.5s + crash): the world dims red and a
  // BLOOD MOON RISES behind Kael while he morphs and howls — then the moon
  // itself DIVES OUT OF THE SKY and CRASHES INTO the nearest enemy (playtest
  // ask: the blood moon must visibly slam down on someone). Gameplay beats
  // (morph, shockwave) live in Player._tickCeremony, timed to the same clock;
  // `crash` is { at: () => ({x,z}), onImpact: (x,z) => {} } supplied by the
  // player so the dive aims and deals damage through real game systems.
  surgeCeremony(pos, crash = null) {
    const scene = this.scene;
    const fScale = this._flashScale();
    const zScale = state.settings.reduceMotion ? CONFIG.ACCESSIBILITY.REDUCE_MOTION_PUNCH_SCALE : 1;

    // red wash over the whole scene
    const wash = new THREE.HemisphereLight(0xff2a33, 0x330a10, 0);
    scene.add(wash);

    // the moon: a huge red disc climbing the sky behind the player
    const moon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.6, 2),
      new THREE.MeshStandardMaterial({
        color: 0x1a0508, emissive: 0xff1e2e, emissiveIntensity: 2.4, roughness: 0.9,
      })
    );
    const moonLight = new THREE.PointLight(0xff2233, 0, 34, 1.5);
    moon.position.set(pos.x - 3.5, 0.4, pos.z - 9);
    moonLight.position.copy(moon.position);
    scene.add(moon, moonLight);

    const RISE = 2.2;    // the moon climbs while red floods in
    const HOLD = 0.8;    // it hangs there through the howl + shockwave
    const DIVE = 0.5;    // then PLUMMETS onto its target
    const FADE = 0.9;    // impact afterglow releases
    let elapsed = 0;
    let diveFrom = null, diveTo = null, impacted = false;
    let trailAcc = 0;

    this._active.push((dt) => {
      elapsed += dt;
      if (elapsed < RISE) {
        const f = elapsed / RISE;
        const e = 1 - (1 - f) * (1 - f); // decelerate upward
        wash.intensity = f * 2.2 * fScale;
        moon.position.y = 0.4 + e * 6.2;
        moonLight.position.copy(moon.position);
        moonLight.intensity = f * 14 * fScale;
        this.zoom = Math.max(this.zoom, f * 0.85 * zScale); // the camera leans in
      } else if (elapsed < RISE + HOLD) {
        wash.intensity = 2.2 * fScale;
        moonLight.intensity = 14 * fScale;
        this.zoom = Math.max(this.zoom, 0.85 * zScale);
      } else if (crash && elapsed < RISE + HOLD + DIVE) {
        // THE CRASH: aim once (at dive start), then scream down in a curve
        if (!diveFrom) {
          diveFrom = moon.position.clone();
          const target = crash.at();
          diveTo = new THREE.Vector3(target.x, 0.55, target.z);
        }
        const f = Math.min(1, (elapsed - RISE - HOLD) / DIVE);
        const e2 = f * f; // accelerate downward — a falling sky
        moon.position.lerpVectors(diveFrom, diveTo, e2);
        moon.scale.setScalar(1 - f * 0.45); // rushing in
        moonLight.position.copy(moon.position);
        moonLight.intensity = (14 + f * 10) * fScale;
        trailAcc += dt;
        if (trailAcc > 0.05) {
          trailAcc = 0;
          juice.burst(moon.position.x, moon.position.y, moon.position.z, 0xff3a4a, 4);
        }
      } else {
        if (crash && !impacted) {
          // IMPACT — the moon buries itself in the target
          impacted = true;
          const ix = diveTo ? diveTo.x : pos.x, iz = diveTo ? diveTo.z : pos.z;
          // 2.6 is the moon's real reach — damageEnemiesAt uses 2.4 and the
          // stun sweep 2.6 (player.js onImpact). It used to take the 4.0
          // default, so the biggest, most dramatic ring in the game was also
          // the most dishonest: it claimed two thirds more reach than it had.
          this.groundSlam({ x: ix, z: iz }, 0xff3a4a, 2.6);
          this.shake(0.55, 0.5);
          this.hitStop(0.09);
          for (let i = 0; i < 3; i++) {
            juice.burst(ix, 0.4 + i * 0.5, iz, i === 1 ? 0xffd76a : 0xff3a4a, 12);
          }
          crash.onImpact(ix, iz);
        }
        const f = Math.min(1, (elapsed - RISE - HOLD - (crash ? DIVE : 0)) / FADE);
        this.zoom = Math.max(this.zoom, 0.85 * (1 - f) * zScale); // release the lean
        moon.material.emissiveIntensity = 2.4 * (1 - f);
        moonLight.intensity = 20 * (1 - f) * fScale;
        wash.intensity = 2.2 * (1 - f) * fScale;
        moon.scale.setScalar(Math.max(0.01, 0.55 * (1 - f))); // melts into the ground
        if (f >= 1) {
          scene.remove(moon, moonLight, wash);
          moon.geometry.dispose();
          moon.material.dispose();
          return false;
        }
      }
      return true;
    });
  }
}
