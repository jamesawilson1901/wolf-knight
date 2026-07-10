// HTML/CSS overlay UI. Phase 3: radial form picker (press-and-hold), special
// button with cooldown ring, active-form badge. Big targets, icon-first —
// built for small thumbs.

import { state } from './state.js';

const FORM_META = {
  knight: { icon: '⚔️', label: 'Knight', color: '#8f9bb0' },
  dark_wolf: { icon: '🌙', label: 'Dark Wolf', color: '#6b56a8' },
  fire_wolf: { icon: '🔥', label: 'Fire Wolf', color: '#ff5a2b' },
};
const FORM_ORDER = ['knight', 'dark_wolf', 'fire_wolf'];
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
      const locked = !state.formsUnlocked.includes(id);
      const angle = -Math.PI / 2 + (i - 1) * (Math.PI / 2.6);
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
    const hasSpecial = state.form === 'dark_wolf' || state.form === 'fire_wolf';
    this.specialBtn.style.display = hasSpecial ? 'flex' : 'none';
    this.specialIcon.textContent = state.form === 'fire_wolf' ? '🔥' : '🌙';
  }

  update(player) {
    if (this.specialBtn.style.display === 'none') return;
    const frac = Math.max(0, player.specialCooldown) / player.specialMax;
    const deg = Math.round(frac * 360);
    this.specialRing.style.background =
      `conic-gradient(rgba(20,14,28,.85) 0deg ${deg}deg, rgba(255,255,255,.28) ${deg}deg 360deg)`;
    this.specialBtn.classList.toggle('ready', frac <= 0);
  }
}
