// Overlay menus: inventory (equip gear), the Den shop, perk picks, the
// region map, and the sticker book. All icon-first, big targets, and every
// action gives audio + visual feedback.

import { state } from './state.js';
import { audio } from './audio.js';
import { WEAPONS, SHIELDS, SHOP_STOCK, ownsGear, addGear } from './items.js';
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
    el.appendChild(grid);

    const foot = document.createElement('div');
    foot.style.cssText = 'font-size:16px;color:#ffd76a;font-weight:800';
    foot.textContent = `🔸 ${state.shards} shards · 🧪 ${state.potions} potions · 🐺 pups ${Object.keys(state.flags.pups).length}/3`;
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
    for (const s of SHOP_STOCK) {
      const def = s.kind === 'potion' ? s : (s.kind === 'weapon' ? WEAPONS[s.id] : SHIELDS[s.id]);
      if (s.kind !== 'potion' && ownsGear(s.id)) continue; // sold
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
      { room: 'r1', name: 'Ember Hollow', icon: '🔥' },
      ...(state.spoken.region_complete ? [{ room: 'e1', name: 'Stoneroot Caverns', icon: '⛰️' }] : []),
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
      { id: 'r2', name: 'Ember Causeway', icons: '⛲🐺' },
      { id: 'r3', name: 'Heart of the Hollow', icons: state.flags.bossDefeated ? '🔥✓' : '👁️' },
    ]);
    if (state.spoken.region_complete || state.region === 'stoneroot') {
      addRegion('⛰️ Stoneroot Caverns', [
        { id: 'e1', name: 'Cavern Gate', icons: '💀🕯️' },
        { id: 'e2', name: 'The Deep Hall', icons: '🪨⚙️' },
        { id: 'e3', name: 'Warden’s Crypt', icons: state.flags.wardenDefeated ? '🪨✓' : '💀' },
      ]);
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
  return def.blurb || '';
}

// Big center toast for level-ups / stickers / power-ups
let toastTimer = null;
export function bigToast(html) {
  const el = $('big-toast');
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
