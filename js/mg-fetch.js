// FETCH — the first game built on the harness contract (js/minigame.js).
//
// design/DEN-MINIGAMES.md §4, Tier 1: *"a stick arcs out, tap to catch on the
// bounce. Perfect timing = longer next throw. The catch window is the same
// window as the parry, deliberately."*
//
// That last clause is the whole point of the game, so it is imported rather
// than copied: CATCH_WINDOW **is** player.js's PARRY_WINDOW. A child who learns
// to catch the stick has learned, in their hands, the exact timing that blocks
// a Bone Brute's swing. If the parry is ever retuned this follows it, which a
// duplicated 0.3 never would.
//
// It is also the cheapest game in Tier 1 to build — the spec lists its new
// assets as "None" — which is why the build order proves the contract on it.
//
// EVERY GAME IS WINNABLE BY MASHING (§2). Tapping constantly catches most
// throws, because the window is open for a third of a second and the stick
// comes back if you miss. Timing is what raises the SCORE. Nothing here can be
// failed, there is no lockout, and the round always ends on the clock.

import * as THREE from 'three';
import { audio } from './audio.js';
import { PARRY_WINDOW } from './player.js';

// THE SAME WINDOW AS THE PARRY. Not a copy of the number — the number itself.
const CATCH_WINDOW = PARRY_WINDOW;
// dead centre of the window, within this, is a PERFECT catch
const PERFECT = 0.09;

export const FETCH = {
  id: 'fetch',
  icon: '🦴',
  seconds: 32,          // §2: 30-90s. Tier 1 is the short end.
  // §6 — cosmetic pools are dad's content call, not mine to invent. The reward
  // path is built and exercised: with an empty pool every win takes the
  // "pool exhausted" branch, which pays a score bonus with its own clearly
  // different flourish so it never reads as a reward that failed to arrive.
  rewards: [],
  make(ctx) { return new Fetch(ctx); },
};

class Fetch {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.state = 'wind';
    this.t = 0;
    this.throwN = 0;
    this.reach = 4.2;        // grows with perfect catches, shrinks with misses
    this.caught = 0;
    this.window = 0;         // >0 while the stick is catchable
    this.perfectAt = 0;
  }

  init({ world, area, bands }) {
    this.world = world;
    this.area = area;
    this.speed = bands.speed;

    // The thrower stands at the far edge of the frame, ahead of the child —
    // "ahead" being -z, because the camera is a fixed offset looking that way.
    this.from = { x: area.x, z: area.z - Math.min(area.ahead - 1.5, 7.0) };

    // the stick. A stick is a stick; the no-code-built-creatures law is about
    // creatures, and this is a piece of wood.
    const stick = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.11, 0.11),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 1 })
    );
    stick.castShadow = true;
    this.stick = stick;
    this.group.add(stick);

    // THE TELEGRAPH. A ring that closes on the moment the stick is catchable,
    // in the contract's gold "act here" colour. THE POSE NEVER LIES: the ring
    // reaches its smallest exactly when the window opens, never before.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.72, 30),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    this.ring = ring;
    this.group.add(ring);

    world.add(this.group);
    world.keepLoose(this.group);
  }

  // the landing spot, a little in front of the child so the catch happens
  // where they are already looking
  _target() {
    const a = this.area;
    return { x: a.x + (this.throwN % 2 ? 0.9 : -0.9), z: a.z - 1.4 };
  }

  start() { this._throw(); }

  _throw() {
    this.throwN++;
    this.state = 'flight';
    this.t = 0;
    const to = this._target();
    this.a = { ...this.from };
    this.b = to;
    // further throws take longer, and the band scales the whole flight
    const dist = Math.hypot(to.x - this.from.x, to.z - this.from.z);
    this.flight = Math.max(0.62, (0.30 + dist * 0.11) / this.speed);
    this.spin = 8 + this.reach;
    audio.play('whoosh', { volume: 0.5, rate: 1.15, vary: 0.08 });
  }

  // the catch input. Returns points scored, which the harness adds up.
  tap() {
    if (this.state !== 'catchable') return 0;
    const off = Math.abs(this.t - this.perfectAt);
    const perfect = off <= PERFECT;
    this.caught++;
    this.state = 'caught';
    this.t = 0;
    // PERFECT TIMING = A LONGER NEXT THROW (§4). The reward for skill is more
    // game, not a bigger number bolted on.
    this.reach = Math.min(9.0, this.reach + (perfect ? 0.9 : 0.25));
    audio.play(perfect ? 'chest-open' : 'pup-chime', { volume: perfect ? 0.85 : 0.7, rate: perfect ? 1.3 : 1.0 });
    this.ring.material.opacity = 0;
    return perfect ? 2 : 1;
  }

  update(dt) {
    this.t += dt;
    const s = this.stick, r = this.ring;

    if (this.state === 'flight') {
      const k = Math.min(1, this.t / this.flight);
      s.position.x = this.a.x + (this.b.x - this.a.x) * k;
      s.position.z = this.a.z + (this.b.z - this.a.z) * k;
      s.position.y = 0.25 + Math.sin(k * Math.PI) * (1.5 + this.reach * 0.12);
      s.rotation.z += this.spin * dt;
      s.rotation.y = Math.atan2(this.b.x - this.a.x, this.b.z - this.a.z);
      // the ring closes as the stick arrives — smallest AT the catch, not before
      r.position.set(this.b.x, 0.045, this.b.z);
      r.material.opacity = 0.25 + k * 0.5;
      r.scale.setScalar(1 + (1 - k) * 2.4);
      if (k >= 1) {
        this.state = 'catchable';
        this.t = 0;
        // the window opens ON the bounce and lasts exactly a parry
        this.perfectAt = CATCH_WINDOW * 0.5;
        audio.play('ui-click', { volume: 0.45, rate: 1.5 });
      }
      return 0;
    }

    if (this.state === 'catchable') {
      // the bounce itself: one small hop, and the window is its whole arc
      const k = this.t / CATCH_WINDOW;
      s.position.y = 0.25 + Math.sin(Math.min(1, k) * Math.PI) * 0.55;
      s.rotation.z += this.spin * 0.5 * dt;
      r.scale.setScalar(1 + Math.max(0, k) * 0.7);
      r.material.opacity = 0.85 * (1 - Math.min(1, k));
      if (this.t >= CATCH_WINDOW) {
        // MISSED, and missing costs nothing but distance. The pup brings it
        // back and the next throw is a little easier. No fail state (§2).
        this.state = 'fetching';
        this.t = 0;
        this.reach = Math.max(3.0, this.reach - 0.5);
        r.material.opacity = 0;
      }
      return 0;
    }

    if (this.state === 'caught' || this.state === 'fetching') {
      // the stick travels back to the thrower, then goes again
      const back = this.state === 'caught' ? 0.42 : 0.62;
      const k = Math.min(1, this.t / back);
      s.position.x += (this.from.x - s.position.x) * Math.min(1, dt * 9);
      s.position.z += (this.from.z - s.position.z) * Math.min(1, dt * 9);
      s.position.y = 0.35 + Math.sin(k * Math.PI) * 0.9;
      s.rotation.z += this.spin * 0.35 * dt;
      if (k >= 1) this._throw();
      return 0;
    }
    return 0;
  }

  // the demo (§3.2): the harness shows this for 3.5s on a child's first ever
  // round. It is the real throw, just running before the clock starts, because
  // a demo that is not the game teaches the wrong thing.
  demo(dt, t, elapsed) {
    if (this.state === 'wind' && elapsed > 0.4) this._throw();
    if (this.state !== 'wind') this.update(dt);
    if (this.state === 'catchable') this.tap();     // it catches it for them, once
  }

  end() { return { score: undefined }; }   // the harness already has the tally

  // §3.4 — zero residue. Everything this game made, it removes.
  teardown() {
    this.group.traverse((n) => {
      if (!n.isMesh) return;
      if (n.geometry) n.geometry.dispose();
      if (n.material) n.material.dispose();
    });
    if (this.group.parent) this.group.parent.remove(this.group);
    const loose = this.world && this.world._keepLoose;
    if (loose) {
      const i = loose.indexOf(this.group);
      if (i >= 0) loose.splice(i, 1);
    }
    this.group = null; this.stick = null; this.ring = null;
  }
}
