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

class Juice {
  constructor() {
    this.effects = null;
    this.weightBoost = 0;
    this._cursor = 0;
    this._points = null;
  }

  init(scene, effects) {
    this.effects = effects;
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
    this._points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
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
    this.buzz(t.buzz);
  }

  // Kael TOOK a hit — gentler on screen, stronger in the hand.
  onHurt(x, y, z) {
    if (!this.effects) return;
    this.effects.shake(0.12, 0.18);
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
  }
}

export const juice = new Juice();
