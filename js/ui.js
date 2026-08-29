// HTML/CSS overlay UI. Phase 3: radial form picker (press-and-hold), special
// button with cooldown ring, active-form badge. Big targets, icon-first —
// built for small thumbs.

import { state } from './state.js';

const FORM_META = {
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
const PICK_RADIUS = 96; // px, distance of options from the hold point

export class UI {
  constructor({ onFormPick, onSpecial, onSurge }) {
    this.onFormPick = onFormPick;
    this.onSpecial = onSpecial;
    this.onSurge = onSurge;
    this._pickerPointer = null;
    this._options = [];

    this.picker = document.getElementById('picker');
    this.specialBtn = document.getElementById('special-btn');
    this.specialRing = document.getElementById('special-ring');
    this.specialIcon = document.getElementById('special-icon');
    this.badge = document.getElementById('form-badge');
    // The MOON GAUGE: a crescent that fills toward the Blood Moon Surge.
    // Tapping it while FULL fires the surge (from any form).
    this.moonGauge = document.getElementById('moon-gauge');
    this.moonRing = document.getElementById('moon-ring');
    this.moonIcon = document.getElementById('moon-icon');

    this.specialBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onSpecial();
    });
    this.moonGauge.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.onSurge) this.onSurge();
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
      const locked = !state.formsUnlocked.includes(id);
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
      el.innerHTML = `<span class="pick-icon">${locked ? '🔒' : meta.icon}</span><span class="pick-label">${meta.label}</span>`;
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
    this.badge.textContent = meta.icon;
    this.badge.style.background = meta.color;
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
    this.specialIcon.textContent =
      { knight: '🌀', fire_wolf: '🔥', earth_wolf: '🪨', verdant_wolf: '🌿', frost_wolf: '❄️', storm_wolf: '🌩️', tide_wolf: '🌊', ghost_wolf: '👻', elemental_wolf: '✨' }[state.form] || '🌙';
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
