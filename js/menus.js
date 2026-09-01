// Overlay menus: inventory (equip gear), the Den shop, perk picks, the
// region map, and the sticker book. All icon-first, big targets, and every
// action gives audio + visual feedback.

import { state, regionCleared } from './state.js';
import { audio } from './audio.js';
import { WEAPONS, SHIELDS, ARMOURS, shopStock, nextShopTier, ownsGear, addGear } from './items.js';
import { PERKS, perkChoices, applyPerk, STICKERS, bumpCounter } from './progress.js';
import { persist } from './save.js';
import { villageCleared } from './levelVillage.js';
import { EquipPreview, itemThumb, meshThumb } from './equipscene.js';
import { buildPotionMesh } from './loot.js';

const $ = (id) => document.getElementById(id);

export class Menus {
  constructor({ player, onPauseGame, onResumeGame, onTravel, renderer }) {
    this.player = player;
    this.onPauseGame = onPauseGame;
    this.onResumeGame = onResumeGame;
    this.onTravel = onTravel;
    this.renderer = renderer || null;   // used to render real item art
    this.preview = null;                // the live knight, built on first open
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

  // ---- THE ARMOURY -------------------------------------------------------
  //
  // Dad, 2026-08-31: "the whole equipping thing... feels too kindergarten. it
  // should feel adventure game. even have it come up like split screen and
  // have the character on one side slowly rotating... and when you equip a
  // piece of armour or sword it change in front of you."
  //
  // So: the knight stands on the left, turning, wearing exactly what is
  // equipped, and changing the moment you choose something else. The gear
  // itself is on the right, in three named racks, drawn with REAL RENDERS of
  // the real models rather than the emoji the old grid used — which is also
  // what makes "a red axe is a red axe" true on this screen and not just in
  // his hand (js/equipscene.js).
  toggleInventory() {
    const el = $('inv-menu');
    if (el.style.display === 'flex') return this._close('inv-menu');
    this.renderInventory();
    this._open('inv-menu');
  }

  // Equipping must never rebuild the whole screen: a full re-render throws
  // away the canvas the live knight is drawn on, which killed the rotation and
  // flashed the panel every time a child tapped an axe. The preview is
  // refreshed in place and only the rack's selection marks are repainted.
  async _equip(kind, id) {
    if (state.inventory.equipped[kind] === id) return;
    state.inventory.equipped[kind] = id;
    audio.play('form-switch', { volume: 0.8 });
    await this.player.equipGear();       // the real Kael, out in the world
    if (this.preview) await this.preview.refresh();   // and the one on screen
    persist();
    this._paintRacks();
    this._paintSlots();
  }

  renderInventory() {
    const el = $('inv-menu');
    el.innerHTML = '';
    el.classList.add('armoury-panel');

    const wrap = document.createElement('div');
    wrap.className = 'armoury';

    // --- left: the knight himself ----------------------------------------
    const left = document.createElement('div');
    left.className = 'arm-left';
    const title = document.createElement('div');
    title.className = 'arm-title';
    title.textContent = 'The Armoury';
    left.appendChild(title);

    const stage = document.createElement('div');
    stage.className = 'arm-stage';
    // ONE CANVAS FOR THE LIFE OF THE SESSION. A WebGLRenderer is bound to the
    // canvas it was built on, so handing the panel a fresh <canvas> on every
    // open left the renderer drawing into a detached element — the knight
    // appeared once and every reopen after that was an empty box. The element
    // is kept and re-parented instead.
    if (!this._canvas) {
      this._canvas = document.createElement('canvas');
      this._canvas.id = 'equip-preview';
    }
    stage.appendChild(this._canvas);
    left.appendChild(stage);

    this._slots = document.createElement('div');
    this._slots.className = 'arm-slots';
    left.appendChild(this._slots);

    // --- right: the racks -------------------------------------------------
    const right = document.createElement('div');
    right.className = 'arm-right';
    this._racks = right;

    wrap.appendChild(left);
    wrap.appendChild(right);
    el.appendChild(wrap);

    const foot = document.createElement('div');
    foot.className = 'arm-foot';
    const pupTotal = regionCleared('wildwoods') ? 12 : regionCleared('stoneroot') ? 9
      : regionCleared('ember') ? 6 : 3;
    // The pup denominator is an invariant a suite checks (it must grow 3 → 6 →
    // 9 → 12 as regions fall), and it used to be read by regex out of this
    // footer's prose — so rewording the footer for the Armoury silently broke
    // verify-completion's scrape while the invariant itself was still fine.
    // The number is published as an attribute now: reword the sentence all you
    // like, the check keeps reading the same thing.
    foot.innerHTML = `<span class="arm-stat"><b>${state.shards}</b> shards</span>
      <span class="arm-stat"><b>${state.potions}</b> potions</span>
      <span class="arm-stat" data-pup-total="${pupTotal}"
        ><b>${Object.keys(state.flags.pups).length}/${pupTotal}</b> pups</span>`;
    el.appendChild(foot);
    el.appendChild(this._closeBtn('inv-menu'));

    this._paintRacks();
    this._paintSlots();

    // THE LIVE KNIGHT IS BUILT ONCE, AND ONLY BY THE MENUS THE GAME OWNS.
    //
    // `renderer` is how a Menus says "I am the real one" — the game passes its
    // renderer in, and nothing else does. A Menus built WITHOUT one is a
    // headless copy (verify-completion renders a second Menus into the real
    // #map-menu to count destinations a child would actually see), and it has
    // no business opening a second WebGL context. Building one anyway put a
    // THIRD live context in the page and killed the tab under SwiftShader —
    // the suite died with "execution context was destroyed" and took a green
    // sweep with it. The item-art paths below already guarded on `renderer`;
    // this one did not.
    if (!this.preview && this.renderer) this.preview = new EquipPreview(this._canvas);
    if (this.preview && this.preview.ok) {
      if (!this.preview.model) this.preview.load().then(() => this._paintSlots());
      else this.preview.refresh();   // reopened: show what is worn right now
    } else {
      stage.classList.add('arm-stage-flat');     // no context: the racks carry it
    }
  }

  // The three things you are wearing, under the knight.
  _paintSlots() {
    if (!this._slots) return;
    const slots = [
      ['weapon', WEAPONS[state.inventory.equipped.weapon], 'Weapon'],
      ['shield', SHIELDS[state.inventory.equipped.shield], 'Shield'],
      ['armour', ARMOURS[state.inventory.equipped.armour], 'Armour'],
    ];
    this._slots.innerHTML = '';
    for (const [kind, def, label] of slots) {
      const s = document.createElement('div');
      s.className = 'arm-slot';
      s.innerHTML = `<div class="arm-slot-label">${label}</div>
        <div class="arm-slot-name">${def ? def.name : '—'}</div>`;
      const art = document.createElement('div');
      art.className = 'arm-slot-art';
      s.insertBefore(art, s.firstChild);
      this._art(art, def, kind);
      this._slots.appendChild(s);
    }
  }

  // Real model art where there used to be an emoji. Armour has no model of its
  // own (it IS the knight's plate recoloured), so it shows its colour instead —
  // honest about what it is rather than borrowing someone else's picture.
  _art(host, def, kind) {
    if (!def) return;
    if (kind === 'armour') {
      host.classList.add('arm-swatch');
      host.style.background = def.tint
        ? `radial-gradient(circle at 34% 30%, #fff6, transparent 60%), #${def.tint.toString(16).padStart(6, '0')}`
        : 'radial-gradient(circle at 34% 30%, #fff6, transparent 60%), #b9c2cc';
      return;
    }
    if (!this.renderer || !def.file) return;
    itemThumb(this.renderer, def).then((url) => {
      if (url) host.style.backgroundImage = `url(${url})`;
    }).catch(() => { /* keep the empty frame rather than break the screen */ });
  }

  _paintRacks() {
    if (!this._racks) return;
    this._racks.innerHTML = '';
    const owned = state.inventory.gear;
    const racks = [
      ['Weapons', 'weapon', owned.filter((id) => WEAPONS[id]).map((id) => [id, WEAPONS[id]])],
      ['Shields', 'shield', owned.filter((id) => SHIELDS[id]).map((id) => [id, SHIELDS[id]])],
      // `armours` arrived after some profiles were written, so it is defaulted
      // rather than assumed (js/save.js).
      ['Armour', 'armour', (state.inventory.armours || ['plain'])
        .filter((id) => ARMOURS[id]).map((id) => [id, ARMOURS[id]])],
    ];
    for (const [label, kind, list] of racks) {
      if (!list.length) continue;
      const head = document.createElement('div');
      head.className = 'rack-head';
      head.textContent = label;
      this._racks.appendChild(head);
      for (const [id, def] of list) {
        const equipped = state.inventory.equipped[kind] === id;
        const row = document.createElement('div');
        row.className = 'rack-row ui' + (equipped ? ' on' : '');
        const art = document.createElement('div');
        art.className = 'rack-art';
        this._art(art, def, kind);
        const body = document.createElement('div');
        body.className = 'rack-body';
        body.innerHTML = `<div class="rack-name">${def.name}</div>
          <div class="rack-stats">${statBars(def, kind)}</div>
          <div class="rack-blurb">${def.blurb || ''}</div>`;
        const mark = document.createElement('div');
        mark.className = 'rack-mark';
        mark.textContent = equipped ? 'WORN' : '';
        row.appendChild(art);
        row.appendChild(body);
        row.appendChild(mark);
        row.addEventListener('pointerdown', () => this._equip(kind, id));
        this._racks.appendChild(row);
      }
    }
  }

  // ---- Shop --------------------------------------------------------------
  showShop() {
    const el = $('shop-menu');
    el.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = 'Moonlit Trading Post';
    el.appendChild(h);
    const shardLine = document.createElement('div');
    shardLine.style.cssText = 'font-size:18px;color:#ffd76a;font-weight:800';
    shardLine.textContent = `You have ${state.shards} shards`;
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
      // THE SHELF SHOWS THE THING, NOT A PICTURE OF A DIFFERENT THING. Maren's
      // stock used the same emoji the backpack used to — so the Cinder Axe was
      // a 🔥 here as well. Weapons and shields are drawn from the real model at
      // the real tint (js/equipscene.js), armour as its own colour, and only
      // the potion — which has no model, being code-built — keeps its icon.
      card.innerHTML = `<div class="ic"></div><div class="nm">${def.name}</div>
        <div>${def.blurb || statLine(s.id, def, s.kind)}</div>
        <div class="price">${s.price} shards${full ? ' (bag full)' : ''}</div>`;
      const ic = card.querySelector('.ic');
      ic.className = 'ic shop-art';
      if (s.kind === 'potion') {
        // The potion is built in code rather than loaded, so it gets the same
        // still-frame treatment through its own mesh — it is the thing Maren
        // sells most, and it was the last emoji left on the shelf.
        if (this.renderer) {
          meshThumb(this.renderer, 'potion', buildPotionMesh().group)
            .then((url) => { if (url) ic.style.backgroundImage = `url(${url})`; })
            .catch(() => { ic.className = 'ic'; ic.textContent = def.icon; });
        } else { ic.className = 'ic'; ic.textContent = def.icon; }
      } else this._art(ic, def, s.kind);
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
      soon.innerHTML = `<div class="nm">New stock</div>
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
    h.textContent = 'Luna’s Moonstone';
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
      // The Spire appears on the moonstone the moment the Village is restored
      // — the same rule as every other region: you can be carried back to a
      // place you have already been able to reach.
      ...(villageCleared() ? [{ room: 'm1', name: 'The Moonlit Spire', icon: '🌙' }] : []),
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
    h.textContent = 'The Kingdom';
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
      mt.textContent = 'Mysteries';
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

// STATS AS GAUGES, NOT EMOJI. The old rack said "💥 ♦♦♦ ⚡fast" — which reads
// as decoration to an adult and as nothing at all to a child who cannot read
// "fast". A filled bar is the one comparison that works without words: longer
// is more. Each stat is scaled against the best in its own class so the bars
// mean something relative to the rack you are looking at.
function bar(label, value, max) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return `<span class="gauge"><span class="gauge-label">${label}</span>
    <span class="gauge-track"><span class="gauge-fill" style="width:${pct}%"></span></span></span>`;
}

function statBars(def, kind) {
  if (kind === 'weapon') {
    // speed is the INVERSE of the swing lock: a short lock is a fast weapon.
    const speed = 1 - Math.min(0.9, (def.lock || 0.55) / 0.9);
    return bar('Power', def.dmg || 1, 3.4)
      + bar('Speed', speed, 1)
      + bar('Reach', def.range || 2, 2.9);
  }
  if (kind === 'shield') {
    // `blunt` is damage TAKEN through the block, so a low number is a strong
    // shield — inverted here so every bar in the game reads "longer is better".
    return bar('Block', 1 - Math.min(1, (def.blunt ?? 0.5) / 0.5) * 0.75, 1)
      + bar('Parry', def.parryBonus || 0, 0.18);
  }
  if (kind === 'armour') {
    const nimble = def.weight < 0 ? 1 : def.weight > 0.05 ? 0.25 : 0.6;
    return bar('Guard', def.soak || 0, 1.5) + bar('Nimble', nimble, 1);
  }
  return '';
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
