// Visual effects. Phase 3: the Blood Moon ultimate + camera shake.
// Effects are self-contained updaters: main.js calls effects.update(dt) and
// adds effects.shakeOffset to the camera each frame.

import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shakeOffset = new THREE.Vector3();
    this._shakeTime = 0;
    this._shakeStrength = 0;
    this._active = [];
  }

  shake(strength = 0.4, time = 0.5) {
    this._shakeStrength = Math.max(this._shakeStrength, strength);
    this._shakeTime = Math.max(this._shakeTime, time);
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
  groundSlam(pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.95, 36),
      new THREE.MeshBasicMaterial({
        color: 0xff7a2a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
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

  // The Blood Moon: Kael howls, the sky bleeds red, and a blood-red moon
  // crashes down at the target point. onImpact fires for gameplay damage.
  // Returns the total sequence duration in seconds.
  bloodMoon(target, { onImpact } = {}) {
    const scene = this.scene;

    // Red wash over the whole scene while the moon falls
    const wash = new THREE.HemisphereLight(0xff2a33, 0x330a10, 0);
    scene.add(wash);

    // The moon: a glowing red sphere + red point light, descending
    const moon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.95, 2),
      new THREE.MeshStandardMaterial({
        color: 0x1a0508, emissive: 0xff1e2e, emissiveIntensity: 2.6, roughness: 0.9,
      })
    );
    const moonLight = new THREE.PointLight(0xff2233, 0, 30, 1.6);
    moon.position.set(target.x, 16, target.z);
    moonLight.position.copy(moon.position);
    scene.add(moon, moonLight);

    // Impact ring (expands + fades after the hit)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 1.0, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff4a3a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(target.x, 0.06, target.z);
    scene.add(ring);

    const HOWL = 1.1;    // red rises while Kael howls
    const FALL = 0.9;    // the moon descends
    const AFTER = 1.0;   // ring + fadeout
    let elapsed = 0;
    let impacted = false;

    this._active.push((dt) => {
      elapsed += dt;
      if (elapsed < HOWL) {
        const f = elapsed / HOWL;
        wash.intensity = f * 2.4;
        moon.position.y = 16;
        moonLight.intensity = f * 6;
      } else if (elapsed < HOWL + FALL) {
        const f = (elapsed - HOWL) / FALL;
        const e = f * f; // accelerate downward
        moon.position.y = 16 - e * 15.1; // lands at ~0.9 (its radius)
        moonLight.position.copy(moon.position);
        moonLight.intensity = 6 + e * 16;
        wash.intensity = 2.4;
      } else {
        if (!impacted) {
          impacted = true;
          this.shake(0.5, 0.6);
          if (onImpact) onImpact();
        }
        const f = (elapsed - HOWL - FALL) / AFTER;
        // moon sinks + dims, ring expands + fades, wash releases
        moon.position.y = 0.9 - f * 1.6;
        moon.material.emissiveIntensity = 2.6 * (1 - f);
        moonLight.intensity = 22 * (1 - f);
        wash.intensity = 2.4 * (1 - f);
        const s = 1 + f * 3.4;
        ring.scale.set(s, s, 1);
        ring.material.opacity = 0.9 * (1 - f);
        if (f >= 1) {
          scene.remove(moon, moonLight, ring, wash);
          moon.geometry.dispose();
          moon.material.dispose();
          ring.geometry.dispose();
          ring.material.dispose();
          return false;
        }
      }
      return true;
    });

    return HOWL + FALL + AFTER;
  }
}
