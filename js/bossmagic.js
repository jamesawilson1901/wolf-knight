// BOSS MAGIC — the shared kit that makes each boss fight its own fight.
//
// Dad, 2026-10-02: "Boss fights all feel too similar... add magic attacks to
// some, magic shield bubbles, fire magic, knock back magic, magic that makes
// you get stuck in the weakest wolf form against that boss for a period of
// time." Every boss shared the same three moves (swipe, charge, pounce) and the
// same answer to each, so learning one taught all seven. The line-up he picked
// is in design/COMBAT-SPEC.md "Boss magic"; this file is the vocabulary those
// picks are built from, owned one-per-boss (`new BossMagic(world, owner)`) and
// ticked by the boss itself.
//
// THE RULES EVERY PIECE KEEPS (the same page dad signed off):
//   * a tell of at least a second before anything can hurt (LAW 1, boss floor
//     0.9s) — the caster's own pose plus the floor mark, never one alone;
//   * danger is RED or PURPLE, never gold (LAW 5: gold means act here);
//   * every move has an answer a five-year-old can see: step off the circle,
//     raise the shield, jump the ring, jump to snap the vine;
//   * a shove never lands Kael in lava, a pit or deep water — each step of it
//     is checked and it simply stops short;
//   * the Binding only lands if its orb touches Kael, lasts 6s (3s in Gentle),
//     and is never saved — `state.curseLock` is not in js/save.js's field list,
//     and every room load clears it.
//
// Everything here is FX and light — sprites, flat marks, a glass sphere — the
// same allowance as the spirit shrines. No creature is built in code: the
// grave "hands" are a burst of bone light out of the floor, not a hand mesh.
// Every object goes into the room through world.add, so a room teardown takes
// whatever a fight left behind with it; textures are SHARED for the session.

import * as THREE from 'three';
import { SHARED } from './assets.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { juice } from './juice.js';
import { FORM_ELEMENT } from './player.js';

const RED = 0xff3a2a;
export const CURSE_SECS = 6;          // the Binding, Cozy and Brave
export const CURSE_SECS_GENTLE = 3;   // ...and in Gentle

const FX_URLS = {
  flare: './assets/fx/flare.png', gleam: './assets/fx/gleam.png',
  fire: './assets/fx/fire.png', spark: './assets/fx/spark.png', streak: './assets/fx/streak.png',
};
let fxTex = null;
function tex() {
  if (fxTex) return fxTex;
  fxTex = {};
  const loader = new THREE.TextureLoader();
  for (const [k, url] of Object.entries(FX_URLS)) {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    SHARED.add(t);
    fxTex[k] = t;
  }
  return fxTex;
}

// The wolf that carries an element (FORM_ELEMENT read backwards), preferring
// the one Kael is already in — the Binding locks the form a boss shrugs off.
export function formForElement(element) {
  if (FORM_ELEMENT[state.form] === element) return state.form;
  for (const f of state.formsUnlocked) if (FORM_ELEMENT[f] === element) return f;
  return null;
}

export class BossMagic {
  constructor(world, owner = null) {
    this.world = world;
    this.owner = owner;
    this.orbs = [];
    this.circles = [];
    this.rings = [];
    this.vines = [];
    this.fires = [];
    this.bubble = null;
    this.curse = null;
    this._fx = [];
    this._snareFx = null;
    this.stats = { orbsBlocked: 0, orbsReflected: 0, hits: 0, shoves: 0, snaps: 0, pops: 0, binds: 0 };
  }

  get deck() { return (this.world.deckY || 0); }

  // Is anything of this boss's still in the air or on the floor?
  get busy() {
    return this.orbs.length + this.circles.length + this.rings.length
      + this.vines.length + this.fires.length > 0;
  }

  // ---- shared drawing -----------------------------------------------------

  _sprite(key, x, y, z, color, size, opts = {}) {
    const mat = new THREE.SpriteMaterial({ map: tex()[key], color, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.setScalar(size);
    sp.frustumCulled = false;
    this.world.add(sp);
    if (opts.life) this._fx.push({ obj: sp, mat, t: 0, size, life: opts.life, grow: opts.grow || 1,
      vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0 });
    return sp;
  }

  _flat(geo, color, opacity) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
      side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.frustumCulled = false;
    this.world.add(m);
    return m;
  }

  _drop(obj) {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }

  _num(x, y, z, text) { if (this.world.onDmgNum) this.world.onDmgNum(x, y, z, text); }

  // ---- ORBS ---------------------------------------------------------------
  // Slow glowing balls in a fan. Not a ground attack — a jump does not clear a
  // ball at chest height; stepping off its line does, and so does a raised
  // shield, which pops it (or, with `reflect`, sends it home).
  orbVolley(x, z, tx, tz, o = {}) {
    const count = o.count ?? 3, spread = o.spread ?? 0.42;
    const speed = (o.speed ?? 4.5) * (state.settings.easy ? 0.8 : 1);
    const base = Math.atan2(tz - z, tx - x);
    // out of the caster's chest, not its middle — and a breath before walls
    // count, because a boss stands where the arena's own colliders crowd it
    // (the first cut spawned inside one and every orb died on frame one)
    const sx = x + Math.cos(base) * 1.0, sz = z + Math.sin(base) * 1.0;
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread;
      const sp = this._sprite('flare', sx, 1.0, sz, o.color ?? 0xa070ff, o.size ?? 0.8);
      this.orbs.push({ sp, x: sx, z: sz, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, life: o.life ?? 4.2,
        o, reflected: false, trail: 0, grace: 0.35 });
    }
    audio.play('whoosh', { volume: 0.7, rate: 1.5 });
  }

  _tickOrbs(dt, player) {
    const P = player.root.position;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const b = this.orbs[i];
      b.life -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.sp.position.set(b.x, 1.0 + Math.sin(b.life * 7) * 0.08, b.z);
      b.sp.material.rotation += dt * 3;
      b.trail += dt;
      if (b.trail > 0.08) { b.trail = 0; juice.burst(b.x, 1.0, b.z, b.reflected ? 0xfff0c0 : (b.o.color ?? 0xa070ff), 1); }
      let gone = b.life <= 0;
      if (b.grace > 0) b.grace -= dt;
      else {
        const s = this.world.resolveCircle(b.x, b.z, 0.12);
        if (Math.hypot(s.x - b.x, s.z - b.z) > 0.01) gone = true;
      }
      if (!gone && b.reflected && b.o.target) {
        const t = b.o.target();
        if (t && Math.hypot(t.x - b.x, t.z - b.z) < (t.r || 1.0)) {
          gone = true;
          juice.burst(b.x, 1.0, b.z, 0xfff0c0, 14);
          if (b.o.onReflectHit) b.o.onReflectHit();
        }
      }
      if (!gone && !b.reflected && Math.hypot(P.x - b.x, P.z - b.z) < 0.6) {
        gone = true;
        const shield = player.defending && player.form.def && player.form.def.shield;
        if (shield) {
          this.stats.orbsBlocked++;
          audio.play('parry', { volume: 0.7, rate: 1.2 });
          if (b.o.reflect && b.o.target) {
            // BATTED BACK — the shield sends it home, quicker, in Kael's light
            const t = b.o.target();
            const d = Math.hypot(t.x - b.x, t.z - b.z) || 1;
            const sp2 = Math.hypot(b.vx, b.vz) * 1.6;
            b.vx = (t.x - b.x) / d * sp2; b.vz = (t.z - b.z) / d * sp2;
            b.reflected = true; b.life = 3; b.grace = 0.35; gone = false;
            b.sp.material.color.setHex(0xfff0c0);
            this.stats.orbsReflected++;
            this._num(P.x, 2.0, P.z, 'BACK AT YOU!');
          } else {
            juice.burst(b.x, 1.0, b.z, 0xe8e0ff, 10);
          }
          if (b.o.onBlocked) b.o.onBlocked();
        } else if (player.iframes > 0) {
          juice.burst(b.x, 1.0, b.z, b.o.color ?? 0xa070ff, 6);
        } else if (b.o.onTouch) {
          juice.burst(b.x, 1.0, b.z, b.o.color ?? 0xa070ff, 12);
          b.o.onTouch();
        } else {
          juice.burst(b.x, 1.0, b.z, b.o.color ?? 0xa070ff, 10);
          this.stats.hits++;
          player.hurt(b.o.dmg ?? 1, {});
        }
      }
      if (gone) { this._drop(b.sp); this.orbs.splice(i, 1); }
    }
  }

  // ---- CIRCLES ON THE FLOOR -------------------------------------------------
  // Red marks that fill in for the whole tell, then something comes up (grave
  // hands — a jump clears them), down (ice shards — only stepping off does) or
  // round the ankles (a snare — no damage, held until a jump frees him).
  floorCircles(spots, o = {}) {
    const tell = Math.max(1.0, o.tell ?? 1.2), r = o.radius ?? 1.0;
    for (const s of spots) {
      const fill = this._flat(new THREE.CircleGeometry(r, 28), RED, 0.12);
      const rim = this._flat(new THREE.RingGeometry(r - 0.12, r, 36), RED, 0.5);
      fill.position.set(s.x, this.deck + 0.04, s.z);
      rim.position.set(s.x, this.deck + 0.05, s.z);
      this.circles.push({ x: s.x, z: s.z, r, tell, t: 0, fill, rim, o, kind: o.kind || 'hands', done: false, shard: null });
    }
  }

  _tickCircles(dt, player) {
    const P = player.root.position;
    for (let i = this.circles.length - 1; i >= 0; i--) {
      const c = this.circles[i];
      c.t += dt;
      if (!c.done) {
        const f = Math.min(1, c.t / c.tell);
        c.fill.material.opacity = 0.12 + 0.4 * f + Math.sin(c.t * 12) * 0.05 * f;
        c.rim.material.opacity = 0.5 + 0.4 * f;
        // the shard is SEEN falling for the last half second of the tell
        if (c.kind === 'shards' && c.tell - c.t < 0.45 && !c.shard) {
          c.shard = this._sprite('gleam', c.x, 6, c.z, 0xcfefff, 1.1);
        }
        if (c.shard) c.shard.position.y = Math.max(0.5, 6 * Math.max(0, (c.tell - c.t) / 0.45));
        if (c.t >= c.tell) {
          c.done = true;
          this._drop(c.shard); c.shard = null;
          const inside = Math.hypot(P.x - c.x, P.z - c.z) < c.r + 0.25;
          if (c.kind === 'hands') {
            for (let k = 0; k < 4; k++) {
              this._sprite('streak', c.x + (Math.random() - 0.5) * c.r, 0.3, c.z + (Math.random() - 0.5) * c.r,
                0xeee6d0, 0.9, { life: 0.5, vy: 3.2, grow: 1.4 });
            }
            juice.burst(c.x, 0.3, c.z, 0xeee6d0, 14);
            audio.play('slam', { volume: 0.55, rate: 1.3 });
            if (inside && !player.airborne) { this.stats.hits++; player.hurt(c.o.dmg ?? 1, { groundAttack: true }); }
          } else if (c.kind === 'shards') {
            juice.burst(c.x, 0.4, c.z, 0xcfefff, 16);
            audio.play('parry', { volume: 0.6, rate: 1.7 });
            if (inside) { this.stats.hits++; player.hurt(c.o.dmg ?? 1, {}); }
          } else if (c.kind === 'snare') {
            juice.burst(c.x, 0.3, c.z, 0x6fcf4a, 16);
            audio.play('puff', { volume: 0.6, rate: 0.7 });
            if (inside && !player.airborne && player.snare) player.snare(c.o.hold ?? 2.5);
          }
        }
      } else {
        const f = Math.min(1, (c.t - c.tell) / 0.3);
        c.fill.material.opacity = 0.5 * (1 - f);
        c.rim.material.opacity = 0.9 * (1 - f);
        if (f >= 1) { this._drop(c.fill); this._drop(c.rim); this.circles.splice(i, 1); }
      }
    }
  }

  // ---- THE KNOCK RING ------------------------------------------------------
  // A shockwave that rolls out across the floor. Jump it and it passes under;
  // stand on it and it throws Kael away from the caster.
  knockRing(x, z, o = {}) {
    const tell = Math.max(1.0, o.tell ?? 1.0);
    const mark = this._flat(new THREE.RingGeometry(1.0, 1.35, 40), o.color ?? 0xb04aff, 0.3);
    mark.position.set(x, this.deck + 0.05, z);
    this.rings.push({ x, z, tell, t: 0, r: 0.6, mark, wave: null, hit: false, o,
      maxR: o.maxR ?? 7, speed: o.speed ?? 6 });
  }

  _tickRings(dt, player) {
    const P = player.root.position;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const g = this.rings[i];
      g.t += dt;
      if (g.t < g.tell) {
        const f = g.t / g.tell;
        g.mark.material.opacity = 0.3 + 0.5 * f;
        g.mark.scale.setScalar(1 + Math.sin(g.t * 10) * 0.06);
        continue;
      }
      if (!g.wave) {
        this._drop(g.mark); g.mark = null;
        g.wave = this._flat(new THREE.RingGeometry(0.82, 1.0, 56), g.o.color ?? 0xb04aff, 0.85);
        g.wave.position.set(g.x, this.deck + 0.15, g.z);
        audio.play('slam', { volume: 0.8, rate: 0.85 });
        if (juice.effects) juice.effects.shake(0.25, 0.3);
      }
      g.r += g.speed * dt;
      g.wave.scale.setScalar(g.r);
      g.wave.material.opacity = 0.85 * (1 - g.r / g.maxR);
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        juice.burst(g.x + Math.cos(a) * g.r, 0.2, g.z + Math.sin(a) * g.r, g.o.color ?? 0xb04aff, 1);
      }
      const d = Math.hypot(P.x - g.x, P.z - g.z);
      if (!g.hit && d > g.r - 0.55 && d < g.r + 0.25) {
        g.hit = true;
        if (player.airborne) {
          this._num(P.x, 1.8, P.z, 'JUMPED IT!');
        } else {
          const nx = (P.x - g.x) / (d || 1), nz = (P.z - g.z) / (d || 1);
          this.stats.shoves++;
          if (player.shove) player.shove(nx, nz, g.o.push ?? 3.5);
          player.hurt(g.o.dmg ?? 0.5, { groundAttack: true });
        }
      }
      if (g.r >= g.maxR) { this._drop(g.wave); this.rings.splice(i, 1); }
    }
  }

  // ---- THE VINE ------------------------------------------------------------
  // A tether creeps along the floor from the caster to Kael for the whole tell.
  // In the air when it arrives, it snaps; on the ground, it drags him in.
  vine(from, player, o = {}) {
    const tell = Math.max(1.0, o.tell ?? 1.0);
    const under = this._flat(new THREE.PlaneGeometry(1, 0.6), RED, 0.25);
    const vine = this._flat(new THREE.PlaneGeometry(1, 0.28), 0x4f9f2a, 0.95);
    under.rotation.order = 'YXZ'; vine.rotation.order = 'YXZ';
    this.vines.push({ from, tell, t: 0, under, vine, o, done: false, end: 0 });
    audio.play('growl', { volume: 0.5, rate: 0.7 });
  }

  _tickVines(dt, player) {
    const P = player.root.position;
    for (let i = this.vines.length - 1; i >= 0; i--) {
      const v = this.vines[i];
      v.t += dt;
      const f0 = v.from();
      const k = v.done ? 1 : Math.min(1, v.t / v.tell);
      const tx = f0.x + (P.x - f0.x) * k, tz = f0.z + (P.z - f0.z) * k;
      const len = Math.max(0.05, Math.hypot(tx - f0.x, tz - f0.z));
      const ang = -Math.atan2(tz - f0.z, tx - f0.x);
      for (const [m, y] of [[v.under, 0.04], [v.vine, 0.07]]) {
        m.scale.set(len, 1, 1);
        m.rotation.set(-Math.PI / 2, ang, 0);
        m.position.set((f0.x + tx) / 2, this.deck + y, (f0.z + tz) / 2);
      }
      if (Math.random() < 0.4) juice.burst(tx, 0.15, tz, 0x6fcf4a, 1);
      if (!v.done && v.t >= v.tell) {
        v.done = true;
        if (player.airborne) {
          this.stats.snaps++;
          juice.burst(P.x, 0.4, P.z, 0x6fcf4a, 18);
          audio.play('parry', { volume: 0.7, rate: 1.5 });
          this._num(P.x, 1.8, P.z, 'SNAP!');
        } else {
          const d = Math.hypot(P.x - f0.x, P.z - f0.z) || 1;
          const pull = Math.min(v.o.maxPull ?? 4.5, Math.max(0, d - (v.o.stop ?? 2.2)));
          if (pull > 0.1 && player.shove) player.shove((f0.x - P.x) / d, (f0.z - P.z) / d, pull, 0.4);
          this.stats.shoves++;
          audio.play('whoosh', { volume: 0.8, rate: 0.8 });
        }
      }
      if (v.done) {
        v.end += dt;
        v.vine.material.opacity = 0.95 * (1 - v.end / 0.4);
        v.under.material.opacity = 0.25 * (1 - v.end / 0.4);
        if (v.end >= 0.4) { this._drop(v.vine); this._drop(v.under); this.vines.splice(i, 1); }
      }
    }
  }

  // ---- THE FIRE RING -------------------------------------------------------
  // A band of fire left on the floor round the caster: red for the tell, then
  // burning for `life` seconds. Stay out of the band, or jump across it.
  fireRing(x, z, o = {}) {
    const r0 = o.r0 ?? 1.5, r1 = o.r1 ?? 2.6;
    const mark = this._flat(new THREE.RingGeometry(r0, r1, 44), RED, 0.15);
    mark.position.set(x, this.deck + 0.04, z);
    this.fires.push({ x, z, r0, r1, tell: Math.max(1.0, o.tell ?? 1.0), life: o.life ?? 3.0, t: 0, mark,
      flames: [], o });
  }

  _tickFires(dt, player) {
    const P = player.root.position;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const g = this.fires[i];
      g.t += dt;
      if (g.t < g.tell) {
        g.mark.material.opacity = 0.15 + 0.35 * (g.t / g.tell) + Math.sin(g.t * 12) * 0.05;
        continue;
      }
      if (!g.flames.length) {
        const n = 14, rm = (g.r0 + g.r1) / 2;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          g.flames.push(this._sprite('fire', g.x + Math.cos(a) * rm, 0.45, g.z + Math.sin(a) * rm, 0xffa04a, 0.9));
        }
        audio.play('burn', { volume: 0.7, rate: 0.9 });
      }
      const burnT = g.t - g.tell;
      const fade = Math.max(0, Math.min(1, (g.life - burnT) / 0.4));
      g.mark.material.opacity = 0.55 * fade;
      g.flames.forEach((fl, k) => {
        fl.scale.setScalar((0.8 + Math.sin(g.t * 9 + k) * 0.15) * (0.4 + 0.6 * fade));
        fl.material.opacity = fade;
      });
      const d = Math.hypot(P.x - g.x, P.z - g.z);
      if (d > g.r0 - 0.3 && d < g.r1 + 0.3 && !player.airborne && player.iframes <= 0 && fade > 0.5) {
        this.stats.hits++;
        player.hurt(g.o.dmg ?? 1, { groundAttack: true });
      }
      if (burnT >= g.life) {
        this._drop(g.mark);
        for (const fl of g.flames) this._drop(fl);
        this.fires.splice(i, 1);
      }
    }
  }

  // ---- THE BUBBLE ----------------------------------------------------------
  // A glass shield round the boss. While it is up every blow bounces off —
  // except the one thing it is weak to: `breaks` is an element ('fire'), or
  // 'crash' (a shield-crash out of a dive) or 'reflect' (its own orb, batted
  // back). That one thing pops it.
  raiseBubble(anchor, o = {}) {
    if (this.bubble) return;
    const r = o.radius ?? 1.6;
    const mat = new THREE.MeshBasicMaterial({ color: o.color ?? 0x8fe4ff, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
    mesh.frustumCulled = false;
    this.world.add(mesh);
    this.bubble = { anchor, mesh, mat, r, o, t: 0, wobble: 0, breaks: o.breaks || 'fire' };
    audio.play('pup-chime', { volume: 0.6, rate: 0.7 });
    const p = anchor();
    juice.burst(p.x, p.y, p.z, o.color ?? 0x8fe4ff, 14);
  }

  get bubbleUp() { return !!this.bubble; }

  // 'none' (no bubble), 'blocked' (bounced) or 'popped'.
  bubbleTest(element, kind) {
    const b = this.bubble;
    if (!b) return 'none';
    const breaks = b.breaks === element || b.breaks === kind;
    const p = b.anchor();
    if (breaks) { this.popBubble(); return 'popped'; }
    b.wobble = 0.25;
    audio.play('parry', { volume: 0.5, rate: 1.6, vary: 0.1 });
    juice.burst(p.x, p.y, p.z, b.o.color ?? 0x8fe4ff, 5);
    this._num(p.x, p.y + b.r + 0.3, p.z, 'BUBBLE!');
    return 'blocked';
  }

  popBubble() {
    const b = this.bubble;
    if (!b) return;
    const p = b.anchor();
    this.stats.pops++;
    juice.burst(p.x, p.y, p.z, b.o.color ?? 0x8fe4ff, 24);
    juice.burst(p.x, p.y, p.z, 0xffffff, 10);
    if (juice.flash) juice.flash(p.x, p.y, p.z, b.o.color ?? 0x8fe4ff);
    audio.play('parry', { volume: 1, rate: 0.6 });
    audio.play('puff', { volume: 0.8, rate: 1.3 });
    this._num(p.x, p.y + b.r + 0.4, p.z, 'POP!');
    this._drop(b.mesh);
    this.bubble = null;
    if (b.o.onPop) b.o.onPop();
  }

  _tickBubble(dt) {
    const b = this.bubble;
    if (!b) return;
    b.t += dt;
    const p = b.anchor();
    b.mesh.position.set(p.x, p.y, p.z);
    if (b.wobble > 0) b.wobble -= dt;
    const grow = Math.min(1, b.t / 0.4);
    const w = 1 + Math.sin(b.t * 2.6) * 0.03 + Math.max(0, b.wobble) * Math.sin(b.t * 40) * 0.3;
    b.mesh.scale.setScalar(grow * w);
    b.mat.opacity = (0.26 + Math.sin(b.t * 3.1) * 0.05) * grow;
  }

  // ---- THE BINDING ---------------------------------------------------------
  // Shadow-Grimm's curse: Kael is held in one wolf — the one he is armoured
  // against — and the wolf buttons lock, for CURSE_SECS. When it breaks, the
  // first switch hits extra hard (main.js's swap-in strike reads _curseBonus).
  bind(player, form) {
    if (this.curse || !form) return false;
    if (player._surge || player._ceremony) return false;      // the Blood Moon holds its own
    if (!state.formsUnlocked.includes(form)) return false;
    state.curseLock = form;
    player.setForm(form);
    const secs = state.settings.easy ? CURSE_SECS_GENTLE : CURSE_SECS;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0x8a4ad8, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.frustumCulled = false;
    this.world.add(ring);
    const links = [];
    for (let k = 0; k < 4; k++) links.push(this._sprite('spark', 0, 0, 0, 0xb08aff, 0.4));
    this.curse = { t: secs, secs, form, ring, links };
    this.stats.binds++;
    const P = player.root.position;
    juice.burst(P.x, 0.9, P.z, 0x8a4ad8, 20);
    audio.play('growl', { volume: 0.7, rate: 0.4 });
    this._num(P.x, 2.0, P.z, 'BOUND!');
    this._badge(true);
    return true;
  }

  _tickCurse(dt, player) {
    const c = this.curse;
    if (!c) return;
    c.t -= dt;
    const P = player.root.position;
    c.ring.position.set(P.x, 0.5 + Math.sin(c.t * 4) * 0.08, P.z);
    c.ring.rotation.z += dt * 1.5;
    c.links.forEach((s, k) => {
      const a = c.t * 2.2 + (k / c.links.length) * Math.PI * 2;
      s.position.set(P.x + Math.cos(a) * 0.62, 0.5 + 0.35 * Math.sin(a * 2), P.z + Math.sin(a) * 0.62);
    });
    // a Trial lock or a death can take the form away from under it — let go
    if (c.t <= 0 || state.curseLock !== c.form) this.release(player, c.t <= 0);
  }

  release(player, broke = false) {
    const c = this.curse;
    if (!c) return;
    this.curse = null;
    if (state.curseLock === c.form) state.curseLock = null;
    this._drop(c.ring);
    for (const s of c.links) this._drop(s);
    this._badge(false);
    if (broke && player) {
      player._curseBonus = true;
      const P = player.root.position;
      juice.burst(P.x, 0.9, P.z, 0xffffff, 18);
      audio.play('pup-chime', { volume: 0.8, rate: 1.2 });
      this._num(P.x, 2.0, P.z, 'FREE!');
    }
  }

  _badge(on) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('form-badge');
    if (el) el.classList.toggle('cursed', on);
  }

  // ---- the snare's look (the hold itself lives on the player) -------------
  _tickSnareFx(player) {
    const on = (player._snareT || 0) > 0;
    if (on && !this._snareFx) {
      this._snareFx = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 20),
        new THREE.MeshBasicMaterial({ color: 0x4f9f2a, transparent: true, opacity: 0.95, depthWrite: false }));
      this._snareFx.rotation.x = -Math.PI / 2;
      this._snareFx.frustumCulled = false;
      this.world.add(this._snareFx);
    }
    if (!on && this._snareFx) { this._drop(this._snareFx); this._snareFx = null; }
    if (this._snareFx) {
      const P = player.root.position;
      this._snareFx.position.set(P.x, this.deck + 0.12, P.z);
      this._snareFx.rotation.z += 0.05;
    }
  }

  _tickFx(dt) {
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const f = this._fx[i];
      f.t += dt;
      const p = Math.min(1, f.t / f.life);
      f.obj.scale.setScalar(f.size * (1 + (f.grow - 1) * p));
      f.obj.position.x += f.vx * dt; f.obj.position.y += f.vy * dt; f.obj.position.z += f.vz * dt;
      f.mat.opacity = 1 - p;
      if (p >= 1) { this._drop(f.obj); this._fx.splice(i, 1); }
    }
  }

  update(dt, player) {
    if (!player) return;
    this._tickOrbs(dt, player);
    this._tickCircles(dt, player);
    this._tickRings(dt, player);
    this._tickVines(dt, player);
    this._tickFires(dt, player);
    this._tickBubble(dt);
    this._tickCurse(dt, player);
    this._tickSnareFx(player);
    this._tickFx(dt);
  }

  // The fight is over: everything goes, the curse lets go, the snare is cut.
  clear(player) {
    for (const b of this.orbs) this._drop(b.sp);
    for (const c of this.circles) { this._drop(c.fill); this._drop(c.rim); this._drop(c.shard); }
    for (const g of this.rings) { this._drop(g.mark); this._drop(g.wave); }
    for (const v of this.vines) { this._drop(v.vine); this._drop(v.under); }
    for (const g of this.fires) { this._drop(g.mark); for (const fl of g.flames) this._drop(fl); }
    for (const f of this._fx) this._drop(f.obj);
    this.orbs = []; this.circles = []; this.rings = []; this.vines = []; this.fires = []; this._fx = [];
    if (this.bubble) { this._drop(this.bubble.mesh); this.bubble = null; }
    this.release(player, false);
    if (player) player._snareT = 0;
    if (this._snareFx) { this._drop(this._snareFx); this._snareFx = null; }
  }
}
