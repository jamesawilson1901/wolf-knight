// WHICH WOLF? — a picture-matching quiz on the shared harness
// (js/minigame.js), Tier 1's own "no reading" answer to a written trivia
// game. The reference asked for a Trivia Quiz; the game's own hard rule
// (design/DEN-MINIGAMES.md §2 — "No reading required. Rules are taught by
// demonstration… icons, colour and audio only") rules out written questions
// and answers outright, so this asks the same kind of thing a different way:
// a glowing element badge as the CUE, a row of real wolf portraits as the
// ANSWERS, tap the one that matches. No word is ever shown or spoken.
//
// A CHOICE-BASED GAME ON A TAP-ANYWHERE HARNESS. §2's "one tap, anywhere"
// idiom fits a reflex game like Fetch, where there is only ever one thing to
// hit. A quiz needs several distinct, positioned targets, so this game
// builds its own small DOM overlay (a cue badge + a row of portrait cards)
// in init() and tears it down in teardown() — exactly the way Fetch builds
// and tears down its own THREE props in ctx.world. The harness's `#mg-tap`
// layer is untouched: this game simply never implements tap(), and every
// card sits above it in z-order with its own pointerdown listener. Scored
// taps are reported back through update()'s return value (the same channel
// Fetch's own update() already uses for its non-tap frames), so the
// contract needed no change at all.
//
// REAL PORTRAITS, NOT EMOJI. js/ui.js's own 2026-09-08 note explains why the
// form badge stopped showing 🌩️ next to this game's own low-poly art: an
// emoji reads worst on exactly the controls a child aims at. A quiz card is
// a control a child aims at, so it wears the same real portrait
// (js/titlescene.js's PORTRAITS, built once at boot for the profile picker
// and badge) rather than a second emoji rendering of the same idea.
//
// EVERY GAME IS WINNABLE BY MASHING (§2). A wrong card costs nothing but a
// shake and a beat — no penalty, no lockout — so tapping every card in turn
// always finds the right one eventually. Skill (recognising the cue) makes
// it faster, which is what raises the score.

import { state } from './state.js';
import { audio } from './audio.js';
import { bumpCounter } from './progress.js';
import { PORTRAITS } from './titlescene.js';
import { FORM_META } from './ui.js';

// how long a correct card stays lit before the next round, and how long a
// wrong one shakes — both driven from update(dt), never setTimeout, so nothing
// can fire after teardown has already pulled the DOM out from under it
const CORRECT_PAUSE = 0.45;
const SHAKE_TIME = 0.3;

export const QUIZ = {
  id: 'quiz',
  icon: '🧠',
  seconds: 36,
  // §6 — cosmetic pools are dad's content call, not mine to invent (same
  // stance FETCH.rewards already takes). Empty means every win takes the
  // "pool exhausted" branch, which pays its own score bonus.
  rewards: [],
  make(ctx) { return new Quiz(ctx); },
};

class Quiz {
  constructor(ctx) {
    this.ctx = ctx;
    this.band = ctx.band;
    this.rand = ctx.rand;
    this.target = null;
    this._pending = 0;
    this._locked = false;
    this._nextIn = 0;
    this._demoStarted = false;
    this._shaking = [];
  }

  init() {
    this.cue = document.createElement('div');
    this.cue.id = 'mgq-cue';
    document.body.appendChild(this.cue);
    this.row = document.createElement('div');
    this.row.id = 'mgq-row';
    document.body.appendChild(this.row);
  }

  start() { this._newRound(); }

  // §3.3: band changes how many cards are on screen, never how many taps it
  // takes to solve one — more cards means more scanning, not a harder pass
  // condition, the same way Howl Echo's sequence grows without ever locking
  // a child out.
  _choiceCount() {
    if (this.band === 'cub') return 2;
    if (this.band === 'alpha') return 4;
    return 3;
  }

  _newRound() {
    const pool = state.formsUnlocked;
    const rand = this.rand;
    const target = pool[Math.floor(rand() * pool.length) % pool.length];
    const others = pool.filter((f) => f !== target)
      .map((f) => [rand(), f]).sort((a, b) => a[0] - b[0]).map(([, f]) => f);
    const n = Math.min(pool.length, this._choiceCount());
    const order = [target, ...others.slice(0, n - 1)]
      .map((f) => [rand(), f]).sort((a, b) => a[0] - b[0]).map(([, f]) => f);
    this.target = target;
    this._paintCue(target);
    this._paintChoices(order);
    audio.play('ui-click', { volume: 0.35, rate: 1.6 });
  }

  _paintCue(form) {
    const meta = FORM_META[form] || { icon: '❓', color: '#ffffff' };
    this.cue.textContent = meta.icon;
    this.cue.style.borderColor = meta.color;
  }

  _paintChoices(order) {
    this.row.innerHTML = '';
    for (const form of order) {
      const meta = FORM_META[form] || { icon: '❓' };
      const img = PORTRAITS[form];
      const card = document.createElement('div');
      card.className = 'mgq-card';
      card.dataset.form = form;
      // PORTRAITS renders in the background right after boot (js/main.js);
      // for the handful of frames before it is ready — or if a form somehow
      // has none — the same emoji ui.js itself falls back to stands in, so a
      // card is never blank.
      card.innerHTML = img ? `<img src="${img}" alt="">` : `<span class="mgq-fallback">${meta.icon}</span>`;
      card.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this._choose(form, card);
      });
      this.row.appendChild(card);
    }
  }

  _choose(form, card) {
    if (this._locked) return;                 // one tap counts per round
    if (form === this.target) {
      this._locked = true;
      card.classList.add('right');
      this._pending += 1;
      this._nextIn = CORRECT_PAUSE;
      audio.play('chest-open', { volume: 0.8, rate: 1.2 });
    } else {
      card.classList.add('wrong');
      this._shaking.push({ card, t: 0 });
      audio.play('ui-click', { volume: 0.45, rate: 0.8 });
    }
  }

  update(dt) {
    const gained = this._pending;
    this._pending = 0;
    if (this._nextIn > 0) {
      this._nextIn -= dt;
      if (this._nextIn <= 0) { this._locked = false; this._newRound(); }
    }
    if (this._shaking.length) {
      for (const s of this._shaking) s.t += dt;
      const done = this._shaking.filter((s) => s.t >= SHAKE_TIME);
      for (const s of done) s.card.classList.remove('wrong');
      this._shaking = this._shaking.filter((s) => s.t < SHAKE_TIME);
    }
    return gained;
  }

  // the demo (§3.2): the real board, shown once, with the correct card lit
  // near the end rather than tapped for the child — nothing here scores, so
  // it cannot be mistaken for the first round of the timed play that follows
  demo(dt, t, elapsed) {
    if (!this._demoStarted && elapsed > 0.3) { this._demoStarted = true; this._newRound(); }
    if (this._demoStarted && elapsed > 2.2 && this.row) {
      for (const card of this.row.children) {
        if (card.dataset.form === this.target) card.classList.add('right');
      }
    }
  }

  end() {
    bumpCounter('gameQuiz');
    return { score: undefined };   // the harness already has the tally
  }

  // §3.4 — zero residue. Both DOM nodes this game made, and nothing else:
  // there is no THREE prop and no world.keepLoose entry to release.
  teardown() {
    if (this.row) { this.row.remove(); this.row = null; }
    if (this.cue) { this.cue.remove(); this.cue = null; }
    this._shaking = [];
  }
}
