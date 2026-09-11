// HTML/CSS overlay UI. Phase 3: radial form picker (press-and-hold), special
// button with cooldown ring, active-form badge. Big targets, icon-first —
// built for small thumbs.

import { state, formsAvailable } from './state.js';
import { PORTRAITS } from './titlescene.js';

export const FORM_META = {
  knight: { icon: '⚔️', label: 'Knight', color: '#8f9bb0' },
  dark_wolf: { icon: '🌙', label: 'Dark Wolf', color: '#6b56a8' },
  fire_wolf: { icon: '🔥', label: 'Fire Wolf', color: '#ff5a2b' },
  earth_wolf: { icon: '🪨', label: 'Earth Wolf', color: '#d8b06a' },
  verdant_wolf: { icon: '🌿', label: 'Verdant Wolf', color: '#6fae4a' },
  frost_wolf: { icon: '❄️', label: 'Frost Wolf', color: '#9be3ff' },
  storm_wolf: { icon: '🌩️', label: 'Storm Wolf', color: '#c9d4ff' },
  tide_wolf: { icon: '🌊', label: 'Tide Wolf', color: '#4fd0e0' },
  ghost_wolf: { icon: '👻', label: 'Ghost Wolf', color: '#e8e4ff' },
  // THE AVATAR. Its badge is a wolf, not an element, because it is not one
  // element — and its colour is the moon-silver its body wears while the
  // seven elements do the colouring as they orbit.
  elemental_wolf: { icon: '🐺', label: 'Elemental Wolf', color: '#f2ecff' },
};
const FORM_ORDER = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf', 'elemental_wolf'];

// THE BADGE SHOWS THE ANIMAL, NOT AN EMOJI (2026-09-08).
//
// The form badge and the radial picker are the controls a child touches most,
// and they were the last place in the game showing 🌩️ and 🪨 next to its own
// low-poly art. js/titlescene.js already renders a real 3/4 portrait of every
// wolf for the profile picker — one still frame per form, cached forever, no
// download — so the badge shows THAT instead.
//
// The emoji stays as the fallback and that is not a leftover: portraits are
// rendered in the background after boot (js/main.js), so for the first second
// or so of a session there is nothing to show yet. `portraits-ready` refreshes
// whatever is on screen the moment there is.
//
// The other emoji surfaces — perk cards, the sticker book, mystery cards, map
// rows — are NOT converted, and the board item that asked for it was working
// from a wrong premise: it said the Kenney Game Icons were "already vendored
// and cleared", and only their LICENCE FILES are on disk. The pack itself is
// not in the repo and kenney.nl is not reachable from the build environment.
// Those surfaces are also the ones where an emoji is doing least harm: they
// are lists a child reads, not a control they aim at.
const formIcon = (id, meta) => (PORTRAITS[id]
  ? `<img class="form-portrait" src="${PORTRAITS[id]}" alt="${meta.label}">`
  : meta.icon);
const PICK_RADIUS = 96; // px, distance of options from the hold point

export class UI {
  constructor({ onFormPick, onSpecial }) {
    this.onFormPick = onFormPick;
    this.onSpecial = onSpecial;
    this._pickerPointer = null;
    this._options = [];

    this.picker = document.getElementById('picker');
    this.specialBtn = document.getElementById('special-btn');
    this.specialRing = document.getElementById('special-ring');
    this.specialIcon = document.getElementById('special-icon');
    this.badge = document.getElementById('form-badge');
    // The MOON GAUGE: a crescent that fills toward the Blood Moon Surge.
    // Display-only. It's only ever revealed while state.form === 'dark_wolf'
    // (see refreshBadge below), and #special-btn's onSpecial already fires
    // the surge in that form (trySpecial has no dark_wolf branch, so it
    // falls through to triggerSurge()). A second live pointerdown handler
    // here used to fire the exact same surge from the exact same tap
    // target's neighbor, i.e. a second button players didn't need.
    this.moonGauge = document.getElementById('moon-gauge');
    this.moonRing = document.getElementById('moon-ring');
    this.moonIcon = document.getElementById('moon-icon');

    this.specialBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onSpecial();
    });

    window.addEventListener('pointermove', (e) => this._pickerMove(e));
    window.addEventListener('pointerup', (e) => this._pickerUp(e));
    window.addEventListener('pointercancel', (e) => this._pickerUp(e));

    this.refreshBadge();
  }

  // ---- radial form picker ----

  openPicker(x, y, pointerId) {
    if (this._pickerPointer !== null) return;
    this._pickerPointer = pointerId === undefined ? 'keyboard' : pointerId;
    this.picker.innerHTML = '';
    this.picker.style.display = 'block';
    this._options = [];

    // clamp the ring center into the viewport
    const cx = Math.max(PICK_RADIUS + 50, Math.min(window.innerWidth - PICK_RADIUS - 50, x));
    const cy = Math.max(PICK_RADIUS + 50, Math.min(window.innerHeight - PICK_RADIUS - 30, y));

    FORM_ORDER.forEach((id, i) => {
      const meta = FORM_META[id];
      // A Trial lock greys out every form but the one you spent at this arch,
      // so the ring SHOWS the constraint rather than silently refusing taps.
      const locked = !formsAvailable().includes(id);
      // five forms fan a little tighter so the ring stays on-screen
      const spread = FORM_ORDER.length >= 6 ? 0.62 : FORM_ORDER.length >= 5 ? 0.74 : 0.92;
      const angle = -Math.PI / 2 + (i - (FORM_ORDER.length - 1) / 2) * spread;
      const ox = cx + Math.cos(angle) * PICK_RADIUS;
      const oy = cy + Math.sin(angle) * PICK_RADIUS;
      const el = document.createElement('div');
      el.className = 'pick-option' + (locked ? ' locked' : '') + (state.form === id ? ' current' : '');
      el.style.left = ox + 'px';
      el.style.top = oy + 'px';
      el.style.setProperty('--form-color', meta.color);
      el.innerHTML = `<span class="pick-icon">${locked ? '🔒' : formIcon(id, meta)}</span>`
        + `<span class="pick-label">${meta.label}</span>`;
      this.picker.appendChild(el);
      this._options.push({ id, el, x: ox, y: oy, locked });
    });
  }

  _nearestOption(x, y) {
    let best = null;
    let bestD = 88; // px hit radius
    for (const o of this._options) {
      const d = Math.hypot(x - o.x, y - o.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  _pickerMove(e) {
    if (this._pickerPointer !== e.pointerId) return;
    const near = this._nearestOption(e.clientX, e.clientY);
    for (const o of this._options) o.el.classList.toggle('hot', o === near);
  }

  _pickerUp(e) {
    if (this._pickerPointer === null) return;
    if (this._pickerPointer !== 'keyboard' && this._pickerPointer !== e.pointerId) return;
    const near = this._nearestOption(e.clientX, e.clientY);
    this.closePicker();
    if (near && !near.locked) this.onFormPick(near.id);
    else if (near && near.locked) this.onFormPick(near.id); // caller shows "locked" feedback
  }

  closePicker() {
    this._pickerPointer = null;
    this.picker.style.display = 'none';
    this.picker.innerHTML = '';
    this._options = [];
  }

  get pickerOpen() { return this._pickerPointer !== null; }

  // ---- special button + badge ----

  refreshBadge() {
    const meta = FORM_META[state.form];
    // ...and once, when the portraits finish rendering in the background, so
    // a badge drawn during the first second of a session swaps its emoji for
    // the animal instead of keeping it until the next transformation.
    if (!this._awaitingPortraits) {
      this._awaitingPortraits = true;
      window.addEventListener('portraits-ready', () => this.refreshBadge(), { once: true });
    }
    this.badge.innerHTML = formIcon(state.form, meta);
    // the rim, not the fill — see #form-badge in index.html
    this.badge.style.borderColor = meta.color;
    this.badge.style.boxShadow =
      `0 2px 8px rgba(0,0,0,.45), inset 0 0 14px ${meta.color}55`;
    // the switch FLOURISH: the badge pops with every transformation
    this.badge.classList.remove('switched');
    void this.badge.offsetWidth;
    this.badge.classList.add('switched');
    // Cooldown specials: knight (whirlwind), fire (slam), earth (stomp).
    // The Dark Wolf's Blood Moon is the EARNED gauge — its button dims.
    // The button NEVER moves or vanishes — stable layout for small thumbs.
    const hasSpecial = state.form !== 'dark_wolf'; // every form but the moon-powered wolf
    this.specialBtn.style.display = 'flex';
    this.specialBtn.classList.toggle('disabled', !hasSpecial);
    // THE SPECIAL BUTTON SAYS "POWER", AND ITS COLOUR SAYS WHICH.
    //
    // This used to swap between nine element emoji — a flame, a leaf, a
    // snowflake — which is the one thing dad asked to be rid of on this side
    // of the screen, and no icon pack has a fantasy-element set to replace
    // them with (Kenney's three icon packs were checked: arrows, fists and
    // kicks). So the glyph stays put and the COLOUR carries the element,
    // which the form badge beside it is already teaching. One shape to learn,
    // eight colours to recognise, nothing borrowed from a system font.
    // The glyph stays bright on its dark plate; the form's colour rides the
    // RIM, so which power you hold is legible without dimming the thing you
    // have to hit. (Knight's grey on plum was near-invisible when the colour
    // was on the glyph itself.)
    const sm = FORM_META[state.form];
    if (sm) {
      this.specialIcon.style.backgroundColor = '#f0e8ff';
      this.specialBtn.style.borderColor = sm.color;
    }
    // The moon gauge is the DARK WOLF's power — no other form shows the
    // button (v3.18 playtest law; the gauge still fills quietly underneath)
    this.moonGauge.classList.toggle('wolf', state.form === 'dark_wolf');
  }

  update(player) {
    // moon gauge: crescent fill; FULL pulses and waits for the tap; while
    // surging it becomes the drain timer (red)
    const g = Math.max(0, Math.min(1, state.moonGauge || 0));
    const gdeg = Math.round(g * 360);
    const surging = player.surging || player.ceremonyActive;
    // charging = moon-lavender · FULL = gold act-here · surging = red power
    const fillCol = surging ? 'rgba(255,60,60,.85)' : g >= 1 ? 'rgba(255,215,106,.9)' : 'rgba(180,150,255,.85)';
    this.moonRing.style.background =
      `conic-gradient(${fillCol} 0deg ${gdeg}deg, rgba(20,14,28,.8) ${gdeg}deg 360deg)`;
    const full = g >= 1 && !surging;
    this.moonGauge.classList.toggle('full', full);
    this.moonGauge.classList.toggle('surging', surging);
    this.moonIcon.textContent = surging ? '🔴' : full ? '🌕' : '🌙';

    if (this.specialBtn.classList.contains('disabled')) return;
    const frac = Math.max(0, player.specialCooldown) / player.specialMax;
    const deg = Math.round(frac * 360);
    this.specialRing.style.background =
      `conic-gradient(rgba(20,14,28,.85) 0deg ${deg}deg, rgba(255,255,255,.28) ${deg}deg 360deg)`;
    this.specialBtn.classList.toggle('ready', frac <= 0);
  }
}
