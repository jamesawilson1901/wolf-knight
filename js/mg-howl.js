// HOWL ECHO — a Tier 1 game on the shared harness (js/minigame.js).
//
// design/DEN-MINIGAMES.md §4: *"Simon-says. The den fire flashes an element
// colour and plays that element's howl; the child repeats the sequence by
// tapping the matching element. Sequence grows by one each round. Colour AND
// howl together, so colour-blind and audio-off both still work."*
//
// THE BLOCKER (§7, "CC0 wolf howl x7: Missing") is answered without a file.
// The game already synthesises a howl in code — audio.howl(), two saws through
// moving formant filters and a breath of noise (design/FX.md) — so each
// element howls at its own NOTE: one voice, six pitches, nothing to license.
//
// AND SHAPE, NOT ONLY COLOUR. Each pad is the element's colour AND its own
// silhouette (a flame, a snowflake-diamond, a leaf...), so a child who cannot
// tell two colours apart can still tell two shapes apart. Colour, shape and
// note all agree, every time.
//
// Nothing here can be failed (§2). A wrong pad shakes and the same sequence
// plays again; getting it right grows it by one. The round ends on the clock.

import { audio } from './audio.js';
import { elementColor, juice } from './juice.js';

// one row per element: its note (as a howl rate) and its shape
const ELEMENTS = [
  { el: 'fire', rate: 0.84, shape: 'flame' },
  { el: 'frost', rate: 0.94, shape: 'diamond' },
  { el: 'verdant', rate: 1.06, shape: 'leaf' },
  { el: 'storm', rate: 1.19, shape: 'bolt' },
  { el: 'tide', rate: 1.33, shape: 'drop' },
  { el: 'earth', rate: 0.75, shape: 'square' },
];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// the silhouette, drawn into a 64x64 canvas (js/matIcons.js's own way)
function drawShape(ctx, shape, col) {
  ctx.fillStyle = col;
  ctx.strokeStyle = 'rgba(20,14,24,.9)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (shape === 'flame') {
    ctx.moveTo(32, 6); ctx.bezierCurveTo(46, 22, 54, 34, 48, 46); ctx.bezierCurveTo(44, 56, 20, 58, 16, 46);
    ctx.bezierCurveTo(12, 34, 22, 30, 24, 20); ctx.bezierCurveTo(28, 28, 32, 26, 32, 6);
  } else if (shape === 'diamond') {
    ctx.moveTo(32, 4); ctx.lineTo(56, 32); ctx.lineTo(32, 60); ctx.lineTo(8, 32);
  } else if (shape === 'leaf') {
    ctx.moveTo(10, 54); ctx.bezierCurveTo(8, 20, 30, 8, 56, 8); ctx.bezierCurveTo(56, 34, 44, 56, 10, 54);
  } else if (shape === 'bolt') {
    ctx.moveTo(36, 4); ctx.lineTo(14, 36); ctx.lineTo(30, 36); ctx.lineTo(24, 60); ctx.lineTo(50, 24); ctx.lineTo(34, 24);
  } else if (shape === 'drop') {
    ctx.moveTo(32, 4); ctx.bezierCurveTo(44, 24, 54, 34, 54, 42); ctx.arc(32, 42, 22, 0, Math.PI);
    ctx.bezierCurveTo(10, 34, 20, 24, 32, 4);
  } else {
    ctx.rect(10, 10, 44, 44);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export const HOWL = {
  id: 'howl',
  icon: '🐺',
  seconds: 45,
  rewards: [],
  make(ctx) { return new HowlEcho(ctx); },
};

class HowlEcho {
  constructor(ctx) {
    this.ctx = ctx;
    this.rand = ctx.rand;
    this.seq = [];
    this.pos = 0;           // how far through the sequence the child is
    this.phase = 'idle';    // play | listen | pause
    this.t = 0;
    this.step = 0;
    this._pending = 0;
    this._shaking = [];
  }

  init({ world, bands, band }) {
    this.world = world;
    this.gap = 0.95 / bands.speed;              // time between notes as they play
    const n = band === 'cub' ? 3 : band === 'alpha' ? 5 : 4;
    // which elements this round uses, in a shuffled order
    this.pads = ELEMENTS.map((e) => [this.rand(), e]).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, e]) => e);

    // THE FIRE IS THE SINGER: the den's hearth flashes each note's colour
    // (its own light and flame, borrowed for the round and given back)
    const cp = (world.checkpoints || []).find((c) => c.id === 'cp_den');
    if (cp) {
      this.fire = { x: cp.x, z: cp.z, light: cp.light, flame: cp.flame,
        col: cp.light.color.getHex(), em: cp.flame.material.emissive.getHex() };
    }

    this.row = document.createElement('div');
    this.row.id = 'mgh-row';
    document.body.appendChild(this.row);
    this.padEls = this.pads.map((p, i) => {
      const card = document.createElement('div');
      card.className = 'mgq-card mgh-pad';
      card.dataset.el = p.el;
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      drawShape(c.getContext('2d'), p.shape, hex(elementColor(p.el)));
      card.appendChild(c);
      card.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._press(i); });
      this.row.appendChild(card);
      return card;
    });
  }

  start() {
    this.seq = [];
    this._grow();
  }

  _grow() {
    this.seq.push(Math.floor(this.rand() * this.pads.length) % this.pads.length);
    this._play();
  }

  _play() {
    this.phase = 'play';
    this.step = 0;
    this.t = -0.5;          // a breath before the first note
    this.pos = 0;
  }

  // one note: the pad lights, the fire flashes, the element howls
  _sound(i, playback) {
    const p = this.pads[i];
    const card = this.padEls[i];
    card.classList.add('lit');
    setTimeout(() => card && card.classList.remove('lit'), Math.min(600, this.gap * 700));
    if (this.fire) {
      this.fire.light.color.setHex(elementColor(p.el));
      this.fire.flame.material.emissive.setHex(elementColor(p.el));
      this._fireBack = 0.6;
      // ...and a flare of that colour over the hearth: the flame alone is a
      // few pixels from the play camera, and the note has to be SEEN there
      juice.flare(this.fire.x, 0.9, this.fire.z, elementColor(p.el));
    }
    audio.howl({ volume: playback ? 0.6 : 0.45, rate: p.rate, len: 0.32 });
  }

  _press(i) {
    if (this.phase !== 'listen') return;
    if (i === this.seq[this.pos]) {
      this._sound(i, false);
      this.pos++;
      if (this.pos >= this.seq.length) {
        // THE WHOLE SEQUENCE: as many points as it was long, and it grows
        this._pending += this.seq.length;
        this.phase = 'pause';
        this.t = 0;
        this._afterPause = 'grow';
        audio.play('chest-open', { volume: 0.6, rate: 1.2 });
      }
    } else {
      // wrong pad: a shake, and the SAME sequence again — never a lockout
      const card = this.padEls[i];
      card.classList.add('wrong');
      this._shaking.push({ card, t: 0 });
      audio.play('ui-click', { volume: 0.45, rate: 0.8 });
      this.phase = 'pause';
      this.t = 0;
      this._afterPause = 'replay';
    }
  }

  update(dt) {
    this.t += dt;
    if (this._fireBack !== undefined) {
      this._fireBack -= dt;
      if (this._fireBack <= 0 && this.fire) {
        this._fireBack = undefined;
        this.fire.light.color.setHex(this.fire.col);
        this.fire.flame.material.emissive.setHex(this.fire.em);
      }
    }
    if (this.phase === 'play' && this.t >= 0) {
      if (this.t >= this.step * this.gap) {
        if (this.step < this.seq.length) { this._sound(this.seq[this.step], true); this.step++; }
        else if (this.t >= this.step * this.gap + 0.2) { this.phase = 'listen'; this.pos = 0; }
      }
    } else if (this.phase === 'pause' && this.t >= 0.8) {
      if (this._afterPause === 'grow') this._grow(); else this._play();
    }
    if (this._shaking.length) {
      for (const s of this._shaking) s.t += dt;
      for (const s of this._shaking.filter((q) => q.t >= 0.32)) s.card.classList.remove('wrong');
      this._shaking = this._shaking.filter((q) => q.t < 0.32);
    }
    const got = this._pending;
    this._pending = 0;
    return got;
  }

  // §3.2's demo: one note plays, and its pad is pressed for the child
  demo(dt, t, elapsed) {
    if (!this._demoStarted && elapsed > 0.3) { this._demoStarted = true; this.start(); }
    if (this._demoStarted) this.update(dt);
    if (this.phase === 'listen' && !this._demoPressed) { this._demoPressed = true; this._press(this.seq[0]); this._pending = 0; }
  }

  end() { return { score: undefined }; }

  teardown() {
    if (this.fire) {
      this.fire.light.color.setHex(this.fire.col);
      this.fire.flame.material.emissive.setHex(this.fire.em);
    }
    if (this.row) { this.row.remove(); this.row = null; }
    this.padEls = [];
    this._shaking = [];
  }
}
