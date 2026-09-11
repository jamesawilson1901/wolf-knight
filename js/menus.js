// Overlay menus: inventory (equip gear), the Den shop, perk picks, the
// region map, and the sticker book. All icon-first, big targets, and every
// action gives audio + visual feedback.

import { state, regionCleared, regionOf } from './state.js';
import { registeredRooms, roomMeta, districtTint } from './districts.js';
import { WS } from './worldstate.js';
import { audio } from './audio.js';
import { WEAPONS, SHIELDS, ARMOURS, shopStock, nextShopTier, ownsGear, addGear } from './items.js';
import { perkChoices, applyPerk, STICKERS, bumpCounter } from './progress.js';
import { TREASURES, ownsTreasure, treasureCount } from './treasures.js';
import { persist } from './save.js';
import { villageCleared } from './levelVillage.js';
import { EquipPreview, itemThumb, meshThumb } from './equipscene.js';
import { buildPotionMesh } from './loot.js';

const $ = (id) => document.getElementById(id);

// DUNGEON MOUTHS the map can offer as a small offshoot card (design/
// WIDER-WORLD.md §5.3), keyed by the entrance room a branch hangs off —
// one entry per shipped dungeon, added as each one ships. `open()` is the
// SAME flag the branch's own structural gap in the entrance room's shell
// reads (js/level1.js buildLa's `vaultOpen`, js/level3.js buildT1b's
// `springOpen`) — a card can never promise a door that is not actually
// there yet.
const DUNGEON_MOUTHS = {
  la: { first: 'lv1', open: () => !!state.flags.cracked.l1_crack_gate },
  t1b: { first: 'tf1', open: () => !!WS.get('wild3', 'ice_l3_spring_ice') },
};

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
    foot.innerHTML = `<span class="arm-stat"><b>${state.shards}</b> coins</span>
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
    shardLine.textContent = `You have ${state.shards} coins`;
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
        <div class="price">${s.price} coins${full ? ' (bag full)' : ''}</div>`;
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

  // ---- Map (also the moonstone's fast travel, v3.137 — the tappable ------
  // cards below ARE the destination picker, so the moonstone opens this
  // same screen rather than a second emoji list of its own: design/
  // WIDER-WORLD.md §5.3.) ---------------------------------------------------
  // THE MAP READS THE GAME, NOT A LIST. Every room comes from its level's own
  // spec table via districts.js (`registeredRooms()`), grouped by the same
  // `regionOf` the music and the doors use, in the order a child walks the
  // world. The old map was a hand list two rebuilds stale: Ember's rows named
  // r1/r2/k1/r3 — retired ids `resolveRoom` redirects — so "you are here" could
  // never light in Level 1, and seven regions plus both roads were missing.
  //
  // What it shows: the SPINE of each region (the rooms on the road), plus the
  // room the child is actually standing in if that is a pocket off it. Every
  // card wears its district colour — the game's own wayfinding — and no icons.
  showMap() {
    const el = $('map-menu');
    el.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = 'The Kingdom';
    el.appendChild(h);

    const F = state.flags;
    const here = state.room;
    const hereRegion = regionOf(here);
    // The world in walk order. `open` is the thing that has to be true before
    // a child can have set foot there — a region appears on the map once the
    // one before it is beaten (or the child is standing in it), never before:
    // a five-year-old should not see eleven rows of places they cannot go.
    const AREAS = [
      { key: 'den',         name: 'The Moonlit Den',   open: () => true },
      { key: 'ember_hollow', name: 'Ember Hollow',     open: () => true,               done: () => F.bossDefeated },
      { key: 'night_road',  name: 'The Night Road',    open: () => F.bossDefeated },
      { key: 'stoneroot',   name: 'Stoneroot Caverns', open: () => F.bossDefeated,     done: () => F.wardenDefeated },
      { key: 'greenway',    name: 'The Greenway',      open: () => F.wardenDefeated },
      { key: 'wildwoods',   name: 'The Wild Woods',    open: () => F.wardenDefeated,   done: () => F.sylvaDefeated },
      // THE LAST THREE ROADS (2026-09-08). They went in as real regions with
      // their own music and their own kits, and the map never heard of them —
      // verify-map: six spine rooms built and not drawn. Each opens on the
      // boss whose arena hands onto it, exactly as the Night Road, the
      // Greenway and the Drowned Market already do above and below.
      { key: 'coldclimb',   name: 'The Cold Climb',    open: () => F.sylvaDefeated },
      { key: 'frostpeak',   name: 'Frostpeak',         open: () => F.sylvaDefeated,    done: () => F.borealDefeated },
      { key: 'market',      name: 'The Drowned Market', open: () => F.borealDefeated },
      { key: 'stormreach',  name: 'Stormreach Cliffs', open: () => F.borealDefeated,   done: () => F.ariaDefeated },
      { key: 'plunge',      name: 'The Plunge',        open: () => F.ariaDefeated },
      { key: 'sunkenvale',  name: 'The Sunken Vale',   open: () => F.ariaDefeated,     done: () => F.meriDefeated },
      { key: 'hollowroad',  name: 'The Hollow Road',   open: () => F.meriDefeated },
      { key: 'shadowcourt', name: 'The Shadow Court',  open: () => F.meriDefeated,     done: () => F.grimmFreed },
      { key: 'village',     name: 'The Village',       open: () => F.grimmFreed,       done: () => villageCleared() },
      { key: 'spire',       name: 'The Moonlit Spire', open: () => villageCleared() },
    ];

    // The Den is a single room with no level table, so it is named here. (The
    // Frostpeak block that used to sit beside it went with the rebuild —
    // js/level4.js registers its rooms like every other level.)
    const UNTABLED = {
      den: [{ id: 'den', label: 'The Moonlit Den', spine: true, tint: 0x6f8a4e }],
    };

    const all = registeredRooms();
    const roomsOf = (key) => (UNTABLED[key] || all.filter((r) => regionOf(r.id) === key));
    // Labels are authored SHOUTING for the greybox signs, with the level's own
    // spoke letter in front ("A1 · THE GLIMMERWAY"); the map speaks quietly and
    // drops the letter — it is a building code, not a place name.
    const title = (t) => t.replace(/^[A-Z0-9]{1,3} · /, '')
      .replace(/\S+/g, (w) => /^[A-Z0-9'’]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w)
      .replace(/(?<=\S )(Of|The|And)\b/g, (m) => m.toLowerCase());
    const hex = (t) => '#' + (t == null ? 0x888888 : t).toString(16).padStart(6, '0');

    for (const A of AREAS) {
      if (!A.open() && hereRegion !== A.key) continue;
      // ONE CARD PER PLACE. Levels 3, 5 and 6 build each island as two halves
      // with the same name ('1A · THORNEDGE', '1B · THORNEDGE'), which is
      // right for the greybox signs and reads as a stutter on a map. Adjacent
      // rooms with the same name fold into one card that answers to both ids.
      const rooms = [];
      for (const r of roomsOf(A.key).filter((r) => r.spine || r.id === here)) {
        const prev = rooms[rooms.length - 1];
        if (prev && title(prev.label) === title(r.label) && prev.tint === r.tint) prev.ids.push(r.id);
        else rooms.push({ ...r, ids: [r.id] });
      }
      if (!rooms.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'map-region';
      const t = document.createElement('div');
      t.className = 'map-title';
      t.textContent = A.name;
      if (A.done && A.done()) {
        const d = document.createElement('span');
        d.className = 'done';
        d.textContent = '✓ freed';
        t.appendChild(d);
      }
      wrap.appendChild(t);
      const row = document.createElement('div');
      row.className = 'map-rooms';
      rooms.forEach((r, i) => {
        if (i > 0) {
          const link = document.createElement('div');
          link.className = 'map-link';
          row.appendChild(link);
        }
        const d = document.createElement('div');
        const isHere = r.ids.includes(here);
        const dest = isHere ? here : r.ids[0];
        d.className = 'map-room' + (r.spine ? '' : ' pocket') + (isHere ? ' here' : '');
        d.dataset.room = dest;
        d.dataset.rooms = r.ids.join(' ');
        const sw = document.createElement('div');
        sw.className = 'swatch';
        sw.style.background = hex(r.tint);
        d.appendChild(sw);
        const nm = document.createElement('div');
        nm.textContent = title(r.label);
        d.appendChild(nm);
        if (isHere) {
          const you = document.createElement('div');
          you.className = 'you';
          you.textContent = 'YOU ARE HERE';
          d.appendChild(you);
        }
        // TAPPABLE (§5.3): every card on this screen is already somewhere
        // she can currently walk to on foot — that is what drew the row at
        // all, `A.open()` above or the `hereRegion` exception — so a tap is
        // never a new power, only the trip she could already make. A card
        // for where she is already standing does nothing new, so it stays
        // inert rather than replaying a load.
        if (!isHere) {
          d.style.cursor = 'pointer';
          d.addEventListener('pointerdown', () => {
            audio.play('ui-click', { volume: 0.8 });
            this._close('map-menu');
            if (this.onTravel) this.onTravel(dest);
          });
        }
        row.appendChild(d);
        // THE DUNGEON MOUTH, ONCE IT HAS ONE (§5.3): a small offshoot card,
        // never shown before the branch's own gate is actually open — she
        // must not see a row she cannot go to.
        for (const id of r.ids) {
          const mouth = DUNGEON_MOUTHS[id];
          if (!mouth || !mouth.open()) continue;
          const link = document.createElement('div');
          link.className = 'map-link';
          row.appendChild(link);
          const dd = document.createElement('div');
          dd.className = 'map-room dungeon';
          dd.style.cursor = 'pointer';
          dd.dataset.room = mouth.first;
          dd.dataset.rooms = mouth.first;
          const meta = roomMeta(mouth.first);
          const sw2 = document.createElement('div');
          sw2.className = 'swatch';
          sw2.style.background = hex(districtTint(mouth.first));
          dd.appendChild(sw2);
          const nm2 = document.createElement('div');
          nm2.textContent = meta ? title(meta.district) : mouth.first;
          dd.appendChild(nm2);
          dd.addEventListener('pointerdown', () => {
            audio.play('ui-click', { volume: 0.8 });
            this._close('map-menu');
            if (this.onTravel) this.onTravel(mouth.first);
          });
          row.appendChild(dd);
        }
      });
      wrap.appendChild(row);
      el.appendChild(wrap);
    }

    // the mystery log: promises the world made ("we'll come back")
    const mys = Object.entries(state.flags.mysteries || {}).filter(([, v]) => !v.found);
    if (mys.length) {
      const mt = document.createElement('div');
      mt.className = 'map-title';
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
    hint.className = 'map-hint';
    hint.textContent = 'More of the kingdom appears as Kael frees it…';
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

    // HEART PIECES — the exact ask (design/WIDER-WORLD.md §3.3): the picture
    // beside a 0-4 filled readout, no text. This is CURRENT STATE (how many
    // quarters of the next heart Kael is carrying), not a one-time
    // achievement, so it sits above the grid rather than as a tile in it —
    // the four hearts below already speak for themselves without a label.
    const hpRow = document.createElement('div');
    hpRow.className = 'sticker heartpiece-row';
    const hpIc = document.createElement('div');
    hpIc.className = 'ic tre-art';
    hpRow.appendChild(hpIc);
    const pips = document.createElement('div');
    pips.className = 'hp-pips';
    const held = state.inventory.heartPieces || 0;
    for (let i = 0; i < 4; i++) {
      const pip = document.createElement('span');
      pip.textContent = i < held ? '❤️' : '🤍';
      pips.appendChild(pip);
    }
    hpRow.appendChild(pips);
    el.appendChild(hpRow);
    if (this.renderer) {
      itemThumb(this.renderer, { file: './assets/loot/platformer/heart-piece.glb' })
        .then((url) => { if (url) hpIc.style.backgroundImage = `url(${url})`; })
        .catch(() => { /* keep the empty frame rather than break the screen */ });
    }

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const s of STICKERS) {
      const has = !!state.stickers[s.id];
      const d = document.createElement('div');
      d.className = 'sticker' + (has ? ' owned' : '');
      // PICTURES, NOT LETTERS (v3.132): a row with a `model` always shows its
      // thumbnail — earned or not — and the SAME CSS that already greys an
      // unearned emoji (`.sticker .ic { filter: grayscale... }`, index.html)
      // greys the picture too; only the NAME still waits for `has`.
      const icHtml = s.model ? '<div class="ic tre-art"></div>' : `<div class="ic">${s.icon}</div>`;
      d.innerHTML = `${icHtml}<div>${has ? s.name : '???'}</div>`;
      grid.appendChild(d);
      if (s.model && this.renderer) {
        itemThumb(this.renderer, { file: s.model.file, tint: s.model.tint }, s.model.pose || null)
          .then((url) => { if (url) d.querySelector('.ic').style.backgroundImage = `url(${url})`; })
          .catch(() => { /* keep the empty frame rather than break the screen */ });
      }
    }
    el.appendChild(grid);

    // WHAT YOU BROUGHT HOME. Treasures share this screen because a child
    // looking for "what have I found" comes to one place, and they are shown
    // with their REAL MODELS rather than an emoji — the same rendered-thumb
    // path the Armoury uses (js/equipscene.js), which is dad's no-emoji law
    // applied to the one screen that is entirely about collecting.
    //
    // Unfound ones are `???` exactly like unearned stickers. That is only
    // honest because TREASURES may not list a keepsake with nowhere to find it
    // (js/treasures.js rule 3, held by tools/verify-treasures.mjs) — a slot
    // that can never be filled would teach a non-reader they had missed
    // something that was never there.
    const tIds = Object.keys(TREASURES);
    if (tIds.length) {
      const th = document.createElement('h2');
      th.textContent = `Treasures (${treasureCount()}/${tIds.length})`;
      el.appendChild(th);
      const tgrid = document.createElement('div');
      tgrid.className = 'grid tre-grid';
      for (const id of tIds) {
        const t = TREASURES[id];
        const has = ownsTreasure(id);
        const d = document.createElement('div');
        d.className = 'sticker' + (has ? ' owned' : '');
        d.innerHTML = `<div class="ic tre-art"></div><div>${has ? t.name : '???'}</div>`;
        tgrid.appendChild(d);
        if (has && this.renderer) {
          // background-image on a fixed-size frame, exactly as _paintArt does
          // for gear. An <img> at height:100% grew the tile and pushed the
          // name out of the bottom of it — the first version of this shipped a
          // picture with no label, which for a non-reader is the whole point
          // of the screen missing.
          itemThumb(this.renderer, { file: t.file }, { zoom: 1.15 })
            .then((url) => { if (url) d.querySelector('.ic').style.backgroundImage = `url(${url})`; })
            .catch(() => { /* keep the empty frame rather than break the screen */ });
        }
      }
      el.appendChild(tgrid);
    }

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
