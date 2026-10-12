// HERB MATCH — a Tier 3 game on the shared harness (js/minigame.js).
//
// design/DEN-MINIGAMES.md §4: *"colour-and-shape memory grid. The most
// accessible game in the set; good landing spot for the youngest player.
// Shapes differ as well as colours so it is not colour-dependent."*
//
// Pairs. Tap a card and it turns over; tap a second — the same herb and both
// stay up (+1), different and both turn back after a moment. Clear the board
// for +3 and a fresh one is dealt. Nothing can be failed and a child tapping
// at random still clears boards, just slower (§2).
//
// THE §7 BLOCKER ("herb icon set x8: not sourced") is answered the way the
// material pictures were (js/matIcons.js): a herb is one plain silhouette in
// one colour, drawn on a canvas. Eight herbs, eight different SHAPES, so two
// greens never have to be told apart by their green.
//
// The board is the band (§3.3): six cards for a Cub, eight for a Wolf,
// twelve for an Alpha — more to remember, never more taps to pass.

import { audio } from './audio.js';

const HERBS = [
  { id: 'clover', col: '#4fae4a' }, { id: 'sprout', col: '#9be36a' },
  { id: 'mushroom', col: '#d8574a' }, { id: 'berry', col: '#6a5ae0' },
  { id: 'flower', col: '#f0c040' }, { id: 'leaf', col: '#2f8f6a' },
  { id: 'acorn', col: '#b07a3e' }, { id: 'cone', col: '#7a5a3a' },
];

function drawHerb(ctx, id, col) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(20,14,24,.9)';
  ctx.fillStyle = col;
  const blob = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  const stem = (x1, y1, x2, y2) => {
    ctx.save(); ctx.strokeStyle = '#4a7a2a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  };
  if (id === 'clover') {
    stem(32, 34, 32, 58);
    blob(22, 24, 11); blob(42, 24, 11); blob(32, 38, 11);
  } else if (id === 'sprout') {
    stem(32, 58, 32, 30);
    ctx.beginPath(); ctx.ellipse(20, 26, 12, 7, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(44, 26, 12, 7, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (id === 'mushroom') {
    ctx.fillStyle = '#efe4cc';
    ctx.beginPath(); ctx.rect(26, 32, 12, 24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(32, 34, 22, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const [x, y] of [[24, 24], [38, 22], [32, 30]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (id === 'berry') {
    stem(32, 8, 32, 20);
    blob(24, 30, 10); blob(40, 30, 10); blob(32, 44, 10);
  } else if (id === 'flower') {
    stem(32, 40, 32, 60);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      blob(32 + Math.cos(a) * 12, 26 + Math.sin(a) * 12, 8);
    }
    ctx.fillStyle = '#c0582a'; blob(32, 26, 6);
  } else if (id === 'leaf') {
    ctx.beginPath(); ctx.moveTo(32, 6); ctx.bezierCurveTo(56, 22, 50, 50, 32, 58);
    ctx.bezierCurveTo(14, 50, 8, 22, 32, 6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(32, 12); ctx.lineTo(32, 54); ctx.stroke();
  } else if (id === 'acorn') {
    ctx.beginPath(); ctx.ellipse(32, 38, 13, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6a4a2a';
    ctx.beginPath(); ctx.arc(32, 26, 15, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    stem(32, 10, 32, 12);
  } else {
    // a pine cone: stacked scales, a triangle in rows
    for (let r = 0; r < 4; r++) {
      const y = 12 + r * 11, w = 8 + r * 5;
      ctx.beginPath(); ctx.moveTo(32 - w, y + 10); ctx.lineTo(32, y); ctx.lineTo(32 + w, y + 10); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
}

export const HERB = {
  id: 'herb',
  icon: '🌿',
  seconds: 60,
  rewards: [],
  make(ctx) { return new HerbMatch(ctx); },
};

class HerbMatch {
  constructor(ctx) {
    this.ctx = ctx;
    this.rand = ctx.rand;
    this._pending = 0;
    this.up = [];          // cards turned over, waiting for a pair
    this.boards = 0;
  }

  init({ band }) {
    this.n = band === 'cub' ? 6 : band === 'alpha' ? 12 : 8;
    this.grid = document.createElement('div');
    this.grid.id = 'mgm-grid';
    this.grid.style.gridTemplateColumns = `repeat(${this.n === 12 ? 6 : this.n === 8 ? 4 : 3}, auto)`;
    document.body.appendChild(this.grid);
    this._deal();
  }

  _deal() {
    this.grid.innerHTML = '';
    const kinds = HERBS.map((h) => [this.rand(), h]).sort((a, b) => a[0] - b[0]).slice(0, this.n / 2).map(([, h]) => h);
    const deck = [...kinds, ...kinds].map((h) => [this.rand(), h]).sort((a, b) => a[0] - b[0]).map(([, h]) => h);
    this.cards = deck.map((h, i) => {
      const el = document.createElement('div');
      el.className = 'mgm-card';
      el.dataset.herb = h.id;
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      drawHerb(c.getContext('2d'), h.id, h.col);
      el.appendChild(c);
      const card = { el, herb: h.id, up: false, done: false, i };
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._tap(card); });
      this.grid.appendChild(el);
      return card;
    });
    this.up = [];
    this.boards++;
  }

  start() { if (this.cards.some((c) => c.up || c.done)) this._deal(); }

  _turn(card, up) {
    card.up = up;
    card.el.classList.toggle('up', up);
  }

  _tap(card) {
    if (card.done || card.up || this.up.length >= 2 || this._wait > 0) return;
    this._turn(card, true);
    this.up.push(card);
    audio.play('ui-click', { volume: 0.4, rate: 1.4 });
    if (this.up.length < 2) return;
    const [a, b] = this.up;
    if (a.herb === b.herb) {
      a.done = b.done = true;
      a.el.classList.add('done'); b.el.classList.add('done');
      this.up = [];
      this._pending += 1;
      audio.play('pup-chime', { volume: 0.8, rate: 1.1 });
      if (this.cards.every((c) => c.done)) {
        this._pending += 3;
        audio.play('chest-open', { volume: 0.7, rate: 1.2 });
        this._dealIn = 1.0;
      }
    } else {
      // not a pair: both turn back after a look
      this._wait = 0.75;
    }
  }

  update(dt) {
    if (this._wait > 0) {
      this._wait -= dt;
      if (this._wait <= 0) { for (const c of this.up) this._turn(c, false); this.up = []; }
    }
    if (this._dealIn !== undefined) {
      this._dealIn -= dt;
      if (this._dealIn <= 0) { this._dealIn = undefined; this._deal(); }
    }
    const got = this._pending;
    this._pending = 0;
    return got;
  }

  // §3.2's demo: one pair turned over for the child, so the rule is seen
  demo(dt, t, elapsed) {
    if (!this._demoDone && elapsed > 0.8) {
      this._demoDone = true;
      const a = this.cards[0], b = this.cards.find((c) => c !== a && c.herb === a.herb);
      this._tap(a); this._tap(b);
      this._pending = 0;
    }
    this.update(dt);
    this._pending = 0;
  }

  end() { return { score: undefined }; }

  teardown() {
    if (this.grid) { this.grid.remove(); this.grid = null; }
    this.cards = [];
  }
}
