// Overlay menus: inventory (equip gear), the Den shop, perk picks, the
// region map, and the sticker book. All icon-first, big targets, and every
// action gives audio + visual feedback.

import { state, regionCleared } from './state.js';
import { audio } from './audio.js';
import { WEAPONS, SHIELDS, ARMOURS, shopStock, nextShopTier, ownsGear, addGear } from './items.js';
import { PERKS, perkChoices, applyPerk, STICKERS, bumpCounter } from './progress.js';
import { persist } from './save.js';

const $ = (id) => document.getElementById(id);

export class Menus {
  constructor({ player, onPauseGame, onResumeGame, onTravel }) {
    this.player = player;
    this.onPauseGame = onPauseGame;
    this.onResumeGame = onResumeGame;
    this.onTravel = onTravel;
    this._perkResolve = null;

    $('inv-btn').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.play('ui-click', { volume: 0.7 });
      this.toggleInventory();
    });
    $('map-btn').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.showMap();
    });
    $('sticker-btn').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.showStickers();
    });
  }

  _close(panel) {
    $(panel).style.display = 'none';
    this.onResumeGame();
  }

  _open(panel) {
    for (const p of ['inv-menu', 'shop-menu', 'map-menu', 'sticker-menu']) {
      $(p).style.display = p === panel ? 'flex' : 'none';
    }
    this.onPauseGame();
  }

  _closeBtn(panel) {
    const b = document.createElement('div');
    b.className = 'menu-btn ui';
    b.textContent = '✓ Done';
    b.addEventListener('pointerdown', () => {
      audio.play('ui-click', { volume: 0.7 });
      this._close(panel);
    });
    return b;
  }

  // ---- Inventory: tap gear to equip -------------------------------------
  toggleInventory() {
    const el = $('inv-menu');
    if (el.style.display === 'flex') return this._close('inv-menu');
    this.renderInventory();
    this._open('inv-menu');
  }

  renderInventory() {
    const el = $('inv-menu');
    el.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = '🎒 Your Gear';
    el.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'grid';
    const addCard = (id, def, kind) => {
      const equipped = state.inventory.equipped[kind] === id;
      const card = document.createElement('div');
      card.className = 'item-card ui' + (equipped ? ' equipped' : '');
      card.innerHTML = `<div class="ic">${def.icon}</div><div class="nm">${def.name}</div>
        <div>${statLine(id, def, kind)}</div><div>${equipped ? '✅ Equipped' : 'Tap to equip'}</div>`;
      card.addEventListener('pointerdown', async () => {
        state.inventory.equipped[kind] = id;
        audio.play('form-switch', { volume: 0.8 });
        await this.player.equipGear();
        persist();
        this.renderInventory();
      });
      grid.appendChild(card);
    };
    for (const id of state.inventory.gear) {
      if (WEAPONS[id]) addCard(id, WEAPONS[id], 'weapon');
      if (SHIELDS[id]) addCard(id, SHIELDS[id], 'shield');
    }
    // ARMOUR sits in the same grid on the same rule — tap it and Kael changes
    // colour on the spot. `armours` arrived after some profiles were written, so
    // it is defaulted rather than assumed (js/save.js).
    for (const id of (state.inventory.armours || ['plain'])) {
      if (ARMOURS[id]) addCard(id, ARMOURS[id], 'armour');
    }
    el.appendChild(grid);

    const foot = document.createElement('div');
    foot.style.cssText = 'font-size:16px;color:#ffd76a;font-weight:800';
    foot.textContent = `🔸 ${state.shards} shards · 🧪 ${state.potions} potions · 🐺 pups ${Object.keys(state.flags.pups).length}/${regionCleared('wildwoods') ? 12 : regionCleared('stoneroot') ? 9 : regionCleared('ember') ? 6 : 3}`;
    el.appendChild(foot);
    el.appendChild(this._closeBtn('inv-menu'));
  }

  // ---- Shop --------------------------------------------------------------
  showShop() {
    const el = $('shop-menu');
    el.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = '🛒 Moonlit Trading Post';
    el.appendChild(h);
    const shardLine = document.createElement('div');
    shardLine.style.cssText = 'font-size:18px;color:#ffd76a;font-weight:800';
    shardLine.textContent = `You have 🔸 ${state.shards}`;
    el.appendChild(shardLine);

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const s of shopStock()) {
      const def = s.kind === 'potion' ? s
        : s.kind === 'weapon' ? WEAPONS[s.id]
        : s.kind === 'armour' ? ARMOURS[s.id] : SHIELDS[s.id];
      if (!def) continue;                                  // a stock line naming nothing
      // ARMOUR lives in its own owned-list, so "sold" is a different question
      // for it than for a weapon.
      const owned = s.kind === 'armour'
        ? (state.inventory.armours || ['plain']).includes(s.id) : ownsGear(s.id);
      if (s.kind !== 'potion' && owned) continue;          // sold
      const afford = state.shards >= s.price;
      const full = s.kind === 'potion' && state.potions >= 3;
      const card = document.createElement('div');
      card.className = 'item-card ui' + (!afford || full ? ' cant' : '');
      card.innerHTML = `<div class="ic">${def.icon}</div><div class="nm">${def.name}</div>
        <div>${def.blurb || statLine(s.id, def, s.kind)}</div>
        <div class="price">🔸 ${s.price}${full ? ' (bag full)' : ''}</div>`;
      card.addEventListener('pointerdown', async () => {
        if (!afford || full) { audio.play('parry', { volume: 0.3, rate: 0.5 }); return; }
        state.shards -= s.price;
        bumpCounter('purchases');
        audio.play('pup-chime', { volume: 0.9 });
        if (s.kind === 'potion') {
          state.potions = Math.min(3, state.potions + 1);
          if (this.player.onPotionsChanged) this.player.onPotionsChanged();
        } else if (s.kind === 'armour') {
          state.inventory.armours = state.inventory.armours || ['plain'];
          if (!state.inventory.armours.includes(s.id)) state.inventory.armours.push(s.id);
          state.inventory.equipped.armour = s.id;
          this.player.equipArmour();
        } else {
          addGear(s.id);
          state.inventory.equipped[s.kind] = s.id; // auto-equip new toys
          await this.player.equipGear();
        }
        persist();
        this.showShop(); // re-render
        if (this.onHudChanged) this.onHudChanged();
      });
      grid.appendChild(card);
    }
    // THE NEXT RUNG, PROMISED. A shop that quietly grows is a shop a child
    // stops checking; one card says what is coming and what heals it, so the
    // Trading Post is a reason to come home rather than a menu. It is a
    // promise, not a quest marker: it names the region, never the route.
    const next = nextShopTier();
    if (next) {
      const soon = document.createElement('div');
      soon.className = 'item-card shop-teaser locked';
      soon.innerHTML = `<div class="ic">📦</div><div class="nm">New stock</div>
        <div>Maren is off gathering — back ${next.blurb}.</div>`;
      grid.appendChild(soon);
    }
    el.appendChild(grid);
    el.appendChild(this._closeBtn('shop-menu'));
    this._open('shop-menu');
  }

  // ---- Perk pick (blocks until chosen) -----------------------------------
  showPerkPick(level) {
    const el = $('perk-menu');
    el.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = `⭐ Level ${level}! Pick a power:`;
    el.appendChild(h);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:18px';
    for (const perk of perkChoices(level)) {
      const card = document.createElement('div');
      card.className = 'perk-card ui';
      card.innerHTML = `<div class="ic">${perk.icon}</div><div class="nm">${perk.name}</div><div>${perk.blurb}</div>`;
      card.addEventListener('pointerdown', () => {
        applyPerk(perk.id);
        audio.play('checkpoint', { volume: 0.9, rate: 1.2 });
        persist();
        el.style.display = 'none';
        this.onResumeGame();
      });
      row.appendChild(card);
    }
    el.appendChild(row);
    el.style.display = 'flex';
    this.onPauseGame();
  }

  // ---- Fast travel (Luna's moonstone in the Den) -------------------------
  showTravel() {
    const el = $('map-menu');
    el.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = '🌙 Luna’s Moonstone';
    el.appendChild(h);
    const blurb = document.createElement('div');
    blurb.style.cssText = 'font-size:15px;opacity:.85';
    blurb.textContent = 'Where shall we go, Kael?';
    el.appendChild(blurb);
    const row = document.createElement('div');
    row.className = 'map-rooms';
    const spots = [
      // ALWAYS AVAILABLE — the moonstone is what a child taps to get home
      // and spend shards without walking the whole way back. It was missing
      // entirely: every region the moonstone could reach OUT to, none of
      // them could reach back to the Den.
      { room: 'den', name: 'The Den', icon: '🏡' },
      { room: 'r1', name: 'Ember Hollow', icon: '🔥' },
      ...(regionCleared('ember') ? [{ room: 'e1', name: 'Stoneroot Caverns', icon: '⛰️' }] : []),
      ...(regionCleared('stoneroot') ? [{ room: 'w1', name: 'Wild Woods', icon: '🌲' }] : []),
      ...(regionCleared('wildwoods') ? [{ room: 'f1', name: 'Frostpeak', icon: '🏔️' }] : []),
      // The cliffs open on the same rule as every region before them: the
      // moonstone can carry you back to a place you have already reached.
      ...(state.flags.borealDefeated ? [{ room: 's1a', name: 'Stormreach Cliffs', icon: '🌩️' }] : []),
      ...(state.flags.ariaDefeated ? [{ room: 'd1a', name: 'The Sunken Vale', icon: '🌊' }] : []),
      ...(state.flags.meriDefeated ? [{ room: 'x1', name: 'The Shadow Court', icon: '🌑' }] : []),
      // The Village opens the same moment its Den door does — no separate
      // "cleared" gate, since nothing about reaching it is sequential.
      ...(state.flags.grimmFreed ? [{ room: 'ysq', name: 'The Village', icon: '🏘️' }] : []),
    ];
    for (const s of spots) {
      const d = document.createElement('div');
      d.className = 'map-room';
      d.style.cursor = 'pointer';
      d.innerHTML = `<div style="font-size:26px">${s.icon}</div><div>${s.name}</div>`;
      d.addEventListener('pointerdown', () => {
        audio.play('ui-click', { volume: 0.8 });
        this._close('map-menu');
        if (this.onTravel) this.onTravel(s.room);
      });
      row.appendChild(d);
    }
    el.appendChild(row);
    el.appendChild(this._closeBtn('map-menu'));
    this._open('map-menu');
  }

  // ---- Map ---------------------------------------------------------------
  showMap() {
    const el = $('map-menu');
    el.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = '🗺️ The Kingdom';
    el.appendChild(h);

    const addRegion = (title, rooms) => {
      const t = document.createElement('div');
      t.style.cssText = 'font-size:15px;opacity:.85;margin:4px 0 2px';
      t.textContent = title;
      el.appendChild(t);
      const row = document.createElement('div');
      row.className = 'map-rooms';
      rooms.forEach((r, i) => {
        if (i > 0) {
          const link = document.createElement('div');
          link.className = 'map-link';
          row.appendChild(link);
        }
        const d = document.createElement('div');
        d.className = 'map-room' + (state.room === r.id ? ' here' : '');
        d.innerHTML = `<div>${r.name}</div><div class="icons">${r.icons}</div>${state.room === r.id ? '<div>⭐ You are here</div>' : ''}`;
        row.appendChild(d);
      });
      el.appendChild(row);
    };

    addRegion('🔥 Ember Hollow', [
      { id: 'den', name: 'Moonlit Den', icons: '🛒🐺' },
      { id: 'r1', name: 'Hollow Entrance', icons: '🐺▨' },
      { id: 'r1b', name: 'Ash Warrens', icons: '🕳️🌑' },
      { id: 'r2', name: 'Ember Causeway', icons: '⛲🐺' },
      { id: 'r2b', name: 'Cinder Bridges', icons: '🌉🗝️' },
      { id: 'k1', name: 'The Kiln', icons: '🌋🚪' },
      { id: 'r3', name: 'Heart of the Hollow', icons: state.flags.bossDefeated ? '🔥✓' : '👁️' },
    ]);
    if (regionCleared('ember') || state.region === 'stoneroot') {
      // The real Stoneroot: the Great Vault hub and its three spokes, then the
      // Warden's Crypt. Room ids match the live rooms (js/level2.js) so "⭐ You
      // are here" lights up — the retired e1/e2/e3 ids never matched anything.
      addRegion('⛰️ Stoneroot Caverns', [
        { id: 'vh', name: 'The Great Vault', icons: '🏛️🔦' },
        { id: 'va3', name: 'Petra’s Shrine', icons: '🔥🕯️' },
        { id: 'vb3', name: 'The Bone Quarry', icons: '💀🔔' },
        { id: 'vc3', name: 'The Sunken Stair', icons: '💧🪵' },
        { id: 'vz', name: 'Warden’s Crypt', icons: state.flags.wardenDefeated ? '🪨✓' : '💀' },
      ]);
    }
    // the mystery log: promises the world made ("we'll come back")
    const mys = Object.entries(state.flags.mysteries || {}).filter(([, v]) => !v.found);
    if (mys.length) {
      const mt = document.createElement('div');
      mt.style.cssText = 'font-size:15px;opacity:.85;margin-top:6px';
      mt.textContent = '❓ Mysteries';
      el.appendChild(mt);
      const row = document.createElement('div');
      row.className = 'map-rooms';
      for (const [, v] of mys) {
        const d = document.createElement('div');
        d.className = 'map-room';
        d.innerHTML = `<div style="font-size:24px">${v.icon}</div><div>???</div>`;
        d.title = v.label;
        row.appendChild(d);
      }
      el.appendChild(row);
    }
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:14px;opacity:.8';
    hint.textContent = 'More regions will appear as Kael frees them…';
    el.appendChild(hint);
    el.appendChild(this._closeBtn('map-menu'));
    this._open('map-menu');
  }

  // ---- Sticker book ------------------------------------------------------
  showStickers() {
    const el = $('sticker-menu');
    el.innerHTML = '';
    const owned = Object.keys(state.stickers).length;
    const h = document.createElement('h2');
    h.textContent = `📒 Sticker Book (${owned}/${STICKERS.length})`;
    el.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const s of STICKERS) {
      const has = !!state.stickers[s.id];
      const d = document.createElement('div');
      d.className = 'sticker' + (has ? ' owned' : '');
      d.innerHTML = `<div class="ic">${s.icon}</div><div>${has ? s.name : '???'}</div>`;
      grid.appendChild(d);
    }
    el.appendChild(grid);
    el.appendChild(this._closeBtn('sticker-menu'));
    this._open('sticker-menu');
  }
}

function statLine(id, def, kind) {
  if (kind === 'weapon') {
    const speed = def.lock <= 0.4 ? '⚡fast' : def.lock >= 0.8 ? '🐢slow' : '';
    const reach = def.range >= 2.5 ? '📏long' : '';
    return `💥 ${'♦'.repeat(Math.min(6, Math.round(def.dmg * 2)))} ${speed} ${reach}`;
  }
  if (kind === 'shield') {
    return def.parryBonus > 0 ? '✨ easier parries' : def.blunt <= 0.25 ? '🛡️ super block' : '🛡️ block';
  }
  if (kind === 'armour') {
    // Said in hearts and in feet, because "soak 1.0, weight 0.08" means nothing
    // to a six-year-old. A shield count for how much it eats, and a plain word
    // for what it costs you.
    const soak = def.soak > 0 ? '🛡️'.repeat(Math.min(3, Math.round(def.soak * 2))) : '';
    const feet = def.weight > 0.05 ? '🐢 heavy' : def.weight < 0 ? '⚡ quicker' : '';
    return `${soak} ${feet}`.trim() || 'plain and honest';
  }
  return def.blurb || '';
}

// Big center toast for level-ups / stickers / power-ups.
//
// QUEUED, NOT OVERWRITTEN. Two chests opened in quick succession (real-play
// report: looked like "only one opens" — both actually opened and granted
// their loot correctly, but the second toast silently replaced the first
// one's text before a child had time to read it, so the first reward was
// never SEEN). A single shared element still shows one toast at a time —
// that's fine, a child reads one thing at a time too — but a message that
// arrives mid-display now waits its turn instead of erasing what's showing.
let toastTimer = null;
const toastQueue = [];
function showNextToast() {
  const el = $('big-toast');
  const html = toastQueue.shift();
  el.innerHTML = html;
  el.classList.add('show');
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    if (toastQueue.length) setTimeout(showNextToast, 260); // a beat between them
  }, 2200);
}
export function bigToast(html) {
  const el = $('big-toast');
  const showing = el.classList.contains('show');
  toastQueue.push(html);
  if (!showing) { clearTimeout(toastTimer); showNextToast(); }
}
