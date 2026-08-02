// Visual effects. Phase 3: the Blood Moon ultimate + camera shake.
// Effects are self-contained updaters: main.js calls effects.update(dt) and
// adds effects.shakeOffset to the camera each frame.

import * as THREE from 'three';
import { juice } from './juice.js';

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
    this._shakeStrength = Math.max(this._shakeStrength, strength);
    this._shakeTime = Math.max(this._shakeTime, time);
  }

  hitStop(t = 0.07) {
    this.hitStopTime = Math.max(this.hitStopTime, t);
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

  // Fire Wolf ground-slam: radial shockwave ring + emissive flash.
  groundSlam(pos, color = 0xff7a2a) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.95, 36),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.07, pos.z);
    const flash = new THREE.PointLight(0xff8a3a, 18, 12, 1.7);
    flash.position.set(pos.x, 1.0, pos.z);
    this.scene.add(ring, flash);
    this.shake(0.3, 0.35);

    let elapsed = 0;
    const DURATION = 0.55;
    this._active.push((dt) => {
      elapsed += dt;
      const f = Math.min(1, elapsed / DURATION);
      const s = 1 + f * 3.2;
      ring.scale.set(s, s, 1);
      ring.material.opacity = 0.95 * (1 - f);
      flash.intensity = 18 * (1 - f);
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
        wash.intensity = f * 2.2;
        moon.position.y = 0.4 + e * 6.2;
        moonLight.position.copy(moon.position);
        moonLight.intensity = f * 14;
        this.zoom = Math.max(this.zoom, f * 0.85); // the camera leans in
      } else if (elapsed < RISE + HOLD) {
        wash.intensity = 2.2;
        moonLight.intensity = 14;
        this.zoom = Math.max(this.zoom, 0.85);
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
        moonLight.intensity = 14 + f * 10;
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
          this.groundSlam({ x: ix, z: iz }, 0xff3a4a);
          this.shake(0.55, 0.5);
          this.hitStop(0.09);
          for (let i = 0; i < 3; i++) {
            juice.burst(ix, 0.4 + i * 0.5, iz, i === 1 ? 0xffd76a : 0xff3a4a, 12);
          }
          crash.onImpact(ix, iz);
        }
        const f = Math.min(1, (elapsed - RISE - HOLD - (crash ? DIVE : 0)) / FADE);
        this.zoom = Math.max(this.zoom, 0.85 * (1 - f)); // release the lean
        moon.material.emissiveIntensity = 2.4 * (1 - f);
        moonLight.intensity = 20 * (1 - f);
        wash.intensity = 2.2 * (1 - f);
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
