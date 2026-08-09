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

    // NO FAKE FICTION. The first version had the stick fly in from the far edge
    // of the frame with nobody standing there to throw it — a stick coming out
    // of empty grass. Kael throws it himself: out, off the ground, and back to
    // his hands, which is one continuous arc a child can follow and which puts
    // the catch where they are already looking.
    this.hand = { x: area.x, z: area.z - 0.5 };

    // The stick. A stick is a stick; the no-code-built-creatures law is about
    // creatures, and this is a piece of wood. (There is no bone or stick in the
    // vendored packs — closest is a log stack — so nothing is being substituted
    // silently here, there is simply nothing to substitute.)
    //
    // It is big and PALE on purpose. The first version was 0.72u of dark brown
    // and read as a speck against the den's grass in a screenshot: the one
    // object the entire game is about was the hardest thing on screen to see.
    const stick = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.17, 0.17),
      new THREE.MeshStandardMaterial({ color: 0xdcc08a, roughness: 1 })
    );
    stick.castShadow = true;
    // start it in his hands, not at the world origin — otherwise the first
    // frame of a round shows a stick lying in the middle of the den
    stick.position.set(this.hand.x, 0.9, this.hand.z);
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

  // where the throw lands out in the meadow. `reach` is how far it goes, and
  // that is what a perfect catch buys: more game, not a bigger number.
  _far() {
    const a = this.area;
    const lean = (this.throwN % 2 ? 1 : -1) * Math.min(2.2, this.reach * 0.3);
    return { x: a.x + lean, z: a.z - Math.min(a.ahead - 1.0, this.reach) };
  }

  // where it comes back to: just in front of the child, so the moment that
  // matters happens at arm's length and not across the room
  _catchPoint() {
    const a = this.area;
    return { x: a.x + (this.throwN % 2 ? 0.5 : -0.5), z: a.z - 1.3 };
  }

  start() { this._throw(); }

  _throw() {
    this.throwN++;
    this.state = 'out';
    this.t = 0;
    this.a = { ...this.hand };
    this.b = this._far();
    const dist = Math.hypot(this.b.x - this.a.x, this.b.z - this.a.z);
    this.flight = Math.max(0.45, (0.20 + dist * 0.10) / this.speed);
    this.spin = 8 + this.reach;
    this.ring.material.opacity = 0;
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

  // one hop of the arc, shared by the way out and the way back
  _arc(a, b, k, height) {
    const s = this.stick;
    s.position.x = a.x + (b.x - a.x) * k;
    s.position.z = a.z + (b.z - a.z) * k;
    s.position.y = 0.3 + Math.sin(k * Math.PI) * height;
    s.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  }

  update(dt) {
    this.t += dt;
    const s = this.stick, r = this.ring;
    s.rotation.z += this.spin * dt;

    // OUT — Kael throws. Nothing to do but watch it go.
    if (this.state === 'out') {
      const k = Math.min(1, this.t / this.flight);
      this._arc(this.a, this.b, k, 1.4 + this.reach * 0.14);
      if (k >= 1) {
        this.state = 'back';
        this.t = 0;
        this.a = { ...this.b };
        this.b = this._catchPoint();
        const dist = Math.hypot(this.b.x - this.a.x, this.b.z - this.a.z);
        this.flight = Math.max(0.45, (0.20 + dist * 0.10) / this.speed);
        audio.play('whoosh', { volume: 0.35, rate: 0.95, vary: 0.08 });
      }
      return 0;
    }

    // BACK — it bounces off the grass and comes home. THE POSE NEVER LIES: the
    // ring is at the catch point the whole way in and reaches its smallest
    // exactly as the stick arrives, never before.
    if (this.state === 'back') {
      const k = Math.min(1, this.t / this.flight);
      this._arc(this.a, this.b, k, 1.1);
      r.position.set(this.b.x, 0.045, this.b.z);
      r.material.opacity = 0.3 + k * 0.5;
      r.scale.setScalar(1 + (1 - k) * 2.4);
      if (k >= 1) {
        this.state = 'catchable';
        this.t = 0;
        // the window opens ON arrival and lasts exactly a parry
        this.perfectAt = CATCH_WINDOW * 0.5;
        audio.play('ui-click', { volume: 0.45, rate: 1.5 });
      }
      return 0;
    }

    if (this.state === 'catchable') {
      // it hangs at the child's hands for one parry's worth of time
      const k = this.t / CATCH_WINDOW;
      s.position.y = 0.3 + Math.sin(Math.min(1, k) * Math.PI) * 0.5;
      r.scale.setScalar(1 + Math.max(0, k) * 0.7);
      r.material.opacity = 0.85 * (1 - Math.min(1, k));
      if (this.t >= CATCH_WINDOW) {
        // MISSED, and missing costs nothing but distance — the next throw is a
        // little shorter, and it goes again. There is no fail state (§2).
        this.state = 'dropped';
        this.t = 0;
        this.reach = Math.max(3.0, this.reach - 0.5);
        r.material.opacity = 0;
      }
      return 0;
    }

    // CAUGHT or DROPPED — either way the stick ends up back in his hands and
    // goes out again. Caught is quick and clean; dropped takes a moment longer,
    // which is the only thing missing costs.
    if (this.state === 'caught' || this.state === 'dropped') {
      const pause = this.state === 'caught' ? 0.3 : 0.55;
      const k = Math.min(1, this.t / pause);
      if (this.state === 'dropped') s.position.y = Math.max(0.14, s.position.y - dt * 3.4);
      s.position.x += (this.hand.x - s.position.x) * Math.min(1, dt * 8);
      s.position.z += (this.hand.z - s.position.z) * Math.min(1, dt * 8);
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
