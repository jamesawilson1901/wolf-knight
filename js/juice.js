// Juice — the ONE hit-feedback pipeline. Every solid contact routes through
// onHit() with a weight tier; the tier drives hitstop + shake + a pooled
// contact-particle burst + haptics together (numbers in CONFIG.JUICE).
// weightBoost is the future surge hook: raising it promotes every hit one
// tier globally. All particle memory is preallocated — combat allocates
// nothing.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { state } from './state.js';

const MAX_PARTS = 256;
const TIERS = ['light', 'medium', 'heavy'];

// design/FX.md, v3.174 — three real sprites (Kenney's CC0 Particle Pack)
// standing in for what used to be flat coloured squares/text call-outs. One
// shared loader: `new THREE.TextureLoader()` per texture is the ordinary
// three.js idiom, and there are only three of these for the life of the tab.
const FX_TEX = {
  spark: './assets/fx/spark.png', // the pooled hit-burst's own dot, now textured
  flare: './assets/fx/flare.png', // a weakness hit's one-off "SUPER!" sparkle
  flash: './assets/fx/flash.png', // a heavy hit's one-off impact glow
  smoke: './assets/fx/smoke.png', // an enemy's death puff (v3.202, was icosahedra)
  streak: './assets/fx/streak.png', // a dash's trail of speed lines (v3.202)
};

// ONE COLOUR PER ELEMENT, for everything that wants to say which element just
// happened: a forged blade's glow (js/forge.js), a weakness hit's flare, a
// dash's streak. It lived in forge.js; the flare was flat gold for every
// element, so "this is the one" never said WHICH one (design/FX.md).
export const ELEMENT_COLOR = { fire: 0xff7a3a, moon: 0xb08aff, frost: 0x9be3ff, earth: 0xd8b06a,
  storm: 0xfff4b0, tide: 0x4fd0e0, verdant: 0x8fdc6a, spark: 0xfff4b0 };
export function elementColor(el, fallback = 0xffe14a) {
  return ELEMENT_COLOR[el] || fallback;
}

class Juice {
  constructor() {
    this.effects = null;
    this.weightBoost = 0;
    this._cursor = 0;
    this._points = null;
    this._scene = null;
    this._oneOffs = [];
  }

  init(scene, effects) {
    this.effects = effects;
    this._scene = scene;
    this._pos = new Float32Array(MAX_PARTS * 3);
    this._col = new Float32Array(MAX_PARTS * 3);
    this._vel = new Float32Array(MAX_PARTS * 3);
    this._life = new Float32Array(MAX_PARTS);
    for (let i = 0; i < MAX_PARTS; i++) this._pos[i * 3 + 1] = -99; // park dead ones
    const geo = new THREE.BufferGeometry();
    this._posAttr = new THREE.BufferAttribute(this._pos, 3).setUsage(THREE.DynamicDrawUsage);
    this._colAttr = new THREE.BufferAttribute(this._col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this._posAttr);
    geo.setAttribute('color', this._colAttr);
    const loader = new THREE.TextureLoader();
    this._tex = {};
    for (const [k, url] of Object.entries(FX_TEX)) {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      this._tex[k] = t;
    }
    this._points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
      map: this._tex.spark, alphaTest: 0.02,
    }));
    this._points.frustumCulled = false;
    this._points.visible = false;
    scene.add(this._points);
    this._tmpColor = new THREE.Color();
  }

  // A hit LANDED (by Kael or on a boss part). weight: 'light'|'medium'|'heavy'.
  onHit(weight, { x = 0, y = 0.8, z = 0, color = 0xffe9b0 } = {}) {
    if (!this.effects) return;
    const i = Math.max(0, Math.min(TIERS.length - 1, TIERS.indexOf(weight) + this.weightBoost));
    const t = CONFIG.JUICE[TIERS[i]];
    if (t.stop > 0) this.effects.hitStop(t.stop);
    if (t.shake > 0) this.effects.shake(t.shake, t.shakeT);
    this.burst(x, y, z, color, t.parts);
    if (i === TIERS.length - 1) this.flash(x, y, z); // the biggest blows read biggest
    this.buzz(t.buzz);
  }

  // Kael TOOK a hit — gentler on screen, stronger in the hand.
  onHurt(x, y, z) {
    if (!this.effects) return;
    this.effects.shake(CONFIG.JUICE.hurtShake, CONFIG.JUICE.hurtShakeT);
    this.burst(x, y, z, 0xff5a5a, 8);
    this.buzz(CONFIG.JUICE.hurtBuzz);
  }

  buzz(ms) {
    if (!ms || state.settings.sfxVol <= 0) return; // muted game = quiet hands
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* unsupported */ } }
  }

  burst(x, y, z, color, count) {
    if (!this._points) return;
    this._tmpColor.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % MAX_PARTS;
      const a = Math.random() * Math.PI * 2;
      const s = 1.4 + Math.random() * 2.2;
      this._pos[i * 3] = x;
      this._pos[i * 3 + 1] = y + Math.random() * 0.3;
      this._pos[i * 3 + 2] = z;
      this._vel[i * 3] = Math.cos(a) * s;
      this._vel[i * 3 + 1] = 1.6 + Math.random() * 2.4;
      this._vel[i * 3 + 2] = Math.sin(a) * s;
      this._col[i * 3] = this._tmpColor.r;
      this._col[i * 3 + 1] = this._tmpColor.g;
      this._col[i * 3 + 2] = this._tmpColor.b;
      this._life[i] = 0.4 + Math.random() * 0.25;
    }
  }

  // A ONE-OFF billboard flourish — a real THREE.Sprite with its own object
  // and lifecycle, unlike the pooled burst() above. Rare enough (a weakness
  // hit, a heavy blow) to afford it: unpooled but self-disposing, the same
  // reasoning js/loot.js's drop pickups already use for their own rarer pops.
  _oneOff(texKey, x, y, z, color, { size, life, grow, additive = true, opacity = 1, vel = null, rotation = 0, stretch = 1 }) {
    if (!this._scene || !this._tex) return;
    const mat = new THREE.SpriteMaterial({
      map: this._tex[texKey], color, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity, rotation,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(size, size * stretch, 1);   // `stretch` runs along the texture's own vertical
    sprite.frustumCulled = false;
    this._scene.add(sprite);
    this._oneOffs.push({ sprite, mat, t: 0, life, size, grow, opacity, vel, stretch });
  }

  // AN ENEMY'S LAST PUFF, in real smoke (design/FX.md: the pack's smoke.png
  // was sitting unused while the death puff was eight grey icosahedra). A few
  // soft clouds that rise, swell and thin out — normal blending, not additive:
  // smoke darkens what is behind it, it does not glow.
  smoke(x, y, z, tint = 0x5a4d66) {
    // lifted toward white: an enemy's own dark tint, as a cloud on a dark
    // floor, read as a smudge at the play camera's distance (the first shot)
    const col = new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.45);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      this._oneOff('smoke', x + Math.cos(a) * 0.2, y + (i % 3) * 0.12, z + Math.sin(a) * 0.2, col, {
        size: 0.85 + (i % 3) * 0.15, life: 0.75 + (i % 2) * 0.15, grow: 2.2, additive: false, opacity: 0.95,
        vel: [Math.cos(a) * 0.9, 1.3 + (i % 3) * 0.35, Math.sin(a) * 0.9], rotation: a,
      });
    }
  }

  // SPEED LINES behind a dash (design/FX.md's `streak`). Laid along the
  // direction of travel as the camera sees it: world X runs across the
  // screen, world Z runs up it (foreshortened by the 3/4 camera's pitch).
  streak(x, y, z, dx, dz, color = 0xffffff) {
    // streak.png is a VERTICAL line, so the sprite is stretched along its
    // height and turned from upright to the direction of travel
    const rot = Math.atan2(-dz * 0.65, dx) - Math.PI / 2;
    this._oneOff('streak', x, y, z, color, { size: 0.7, life: 0.3, grow: 1.1, opacity: 1, rotation: rot, stretch: 2.4 });
  }

  // A weakness hit — dad's own "make experimentation LOUD" moment, now a
  // real sparkle rather than just the pooled burst's coloured dots.
  flare(x, y, z, color = 0xffe14a) {
    this._oneOff('flare', x, y + 0.2, z, color, { size: 1.5, life: 0.35, grow: 2.4 });
  }

  // A heavy hit lands with an extra flash of light, on top of the shake/
  // hitstop onHit() already gives it — the biggest blows READ biggest.
  flash(x, y, z, color = 0xfff4d8) {
    this._oneOff('flash', x, y + 0.3, z, color, { size: 1.8, life: 0.22, grow: 1.6 });
  }

  update(dt) {
    if (!this._points) return;
    let any = false;
    for (let i = 0; i < MAX_PARTS; i++) {
      if (this._life[i] <= 0) continue;
      any = true;
      this._life[i] -= dt;
      if (this._life[i] <= 0) { this._pos[i * 3 + 1] = -99; continue; }
      this._vel[i * 3 + 1] -= 9.5 * dt;
      this._pos[i * 3] += this._vel[i * 3] * dt;
      this._pos[i * 3 + 1] += this._vel[i * 3 + 1] * dt;
      this._pos[i * 3 + 2] += this._vel[i * 3 + 2] * dt;
    }
    if (any) {
      this._posAttr.needsUpdate = true;
      this._colAttr.needsUpdate = true;
    }
    this._points.visible = any;

    if (this._oneOffs.length) {
      for (let i = this._oneOffs.length - 1; i >= 0; i--) {
        const o = this._oneOffs[i];
        o.t += dt;
        const p = Math.min(1, o.t / o.life);
        const sc = o.size * (1 + (o.grow - 1) * p);
        o.sprite.scale.set(sc, sc * o.stretch, 1);
        o.mat.opacity = o.opacity * (1 - p);
        if (o.vel) {
          o.sprite.position.x += o.vel[0] * dt;
          o.sprite.position.y += o.vel[1] * dt;
          o.sprite.position.z += o.vel[2] * dt;
          o.vel[1] -= dt * 1.2;   // the rise slows as it thins
        }
        if (p >= 1) {
          this._scene.remove(o.sprite);
          o.mat.dispose();
          this._oneOffs.splice(i, 1);
        }
      }
    }
  }
}

export const juice = new Juice();
