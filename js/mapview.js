// THE MAP SCREEN — a real map a five-year-old can read without reading.
//
// Dad, 2026-09-26: "The whole map is confusing to me as an adult. A child has
// no chance of understanding. It needs to be a real map and when things are
// marked to come back later, actually have to be marked on the map."
//
// What a child sees, from pictures alone:
//   * every room as a coloured tile in its district colour, where it really is
//     (js/maplayout.js lays the world out from the doors), joined by paths;
//   * Kael's own face on a gold pin over the room he is standing in, and the
//     map opens centred on it;
//   * rooms walked through are solid; rooms seen through a doorway (or the road
//     ahead of a freed region) are faint; everything else is fog;
//   * every come-back-later place he has walked near wears the face of the
//     wolf that opens it — dim while he does not have that wolf, gold and
//     bouncing once he does — and is gone once it is open;
//   * a star on the arena of every guardian freed, a house on the Den.
// Room and region names are there, small, for a grown-up.
//
// Touch-first: drag to pan, pinch (or + / −) to zoom, the wolf button snaps
// back to "you are here". A tap on a place you can travel to lifts a gold GO
// button over it — a second, deliberate tap travels — so a child panning
// round with a finger can never be whisked away by accident.
//
// SVG in a paused overlay: ~180 small nodes at most, redrawn only on open.

import { state } from './state.js';
import { FORM_META } from './ui.js';
import { PORTRAITS } from './titlescene.js';
import { ownsForm } from './mapdata.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 60;                 // px per grid cell at zoom 1
const MIN_S = 0.2, MAX_S = 2.2;
// Tile half-size by room kind: a big island reads as a PLACE, a choke or a
// stair as the path stone between two places.
const HALF = { island: 24, arena: 26, hub: 25, pocket: 17, shrine: 17, choke: 12, stair: 12, gate: 12 };

const el = (tag, attrs = {}, parent = null) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const hex = (t) => '#' + (t == null ? 0x888888 : t).toString(16).padStart(6, '0');
// Labels are authored SHOUTING for the greybox signs, with the level's spoke
// letter in front ("A · THE ASHFALL"); the map speaks quietly and drops it.
export const prettyName = (t) => String(t || '').replace(/^[A-Z0-9]{1,3} · /, '')
  .replace(/\S+/g, (w) => /^[A-Z0-9'’]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w)
  .replace(/(?<=\S )(Of|The|And)\b/g, (m) => m.toLowerCase());

// A wolf in a coin: a disc in `bg`, the real portrait over it (js/
// titlescene.js — full-body, so it is drawn larger than the coin and cropped
// to it), and the form's own element picture on a little badge, because at
// thumb size the wolf's COLOUR does the telling and the badge settles it.
// Before the portraits have rendered, the element picture alone.
function coin(defs, parent, form, r, bg, { badge = true } = {}) {
  const meta = FORM_META[form];
  const icon = (meta && meta.icon) || '❓';
  el('circle', { r, fill: bg, class: 'mv-coin' }, parent);
  const src = form && PORTRAITS[form];
  if (src) {
    const id = 'mv-clip-' + r;
    if (!defs.querySelector('#' + id)) {
      const c = el('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, defs);
      el('circle', { cx: 0, cy: 0, r: r - 1 }, c);
    }
    const z = form === 'knight' ? 1.25 : 1.7;
    el('image', { href: src, x: -r * z, y: -r * z * 0.92, width: 2 * r * z, height: 2 * r * z,
      'clip-path': `url(#${id})`, preserveAspectRatio: 'xMidYMid meet', class: 'mv-face' }, parent);
    if (badge && form !== 'knight') {
      el('circle', { cx: r * 0.78, cy: r * 0.78, r: r * 0.55, class: 'mv-badge' }, parent);
      const t = el('text', { x: r * 0.78, y: r * 0.78 + r * 0.25, 'text-anchor': 'middle',
        'font-size': r * 0.7, class: 'mv-badge-ic' }, parent);
      t.textContent = icon;
    }
  } else {
    const t = el('text', { x: 0, y: r * 0.36, 'text-anchor': 'middle', 'font-size': r * 1.05, class: 'mv-face' }, parent);
    t.textContent = icon;
  }
}
// A form's colour, lifted towards white so a dark wolf reads on it.
const pale = (hexStr, k = 0.55) => {
  const n = parseInt(String(hexStr || '#b9a88a').slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * k);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
};

export function renderMap(root, model, { onTravel, closeBtn }) {
  root.innerHTML = '';
  root.classList.add('map-screen');
  const stage = document.createElement('div');
  stage.className = 'map-stage';
  root.appendChild(stage);
  const svg = el('svg', { class: 'map-svg' }, stage);
  const defs = el('defs', {}, svg);
  const world = el('g', { class: 'map-world' }, svg);
  const gEdges = el('g', { class: 'map-edges' }, world);
  const gTiles = el('g', { class: 'map-tiles' }, world);
  const gMarks = el('g', { class: 'map-marks' }, world);   // above every tile: a mark pokes over its edge
  const gTop = el('g', { class: 'map-top' }, world);

  const byId = new Map(model.tiles.map((t) => [t.id, t]));
  const cx = (t) => t.x * CELL, cy = (t) => t.y * CELL;

  // ---- paths --------------------------------------------------------------
  for (const e of model.edges) {
    const a = byId.get(e.a), b = byId.get(e.b);
    el('line', { x1: cx(a), y1: cy(a), x2: cx(b), y2: cy(b),
      class: 'map-path' + (e.walked ? ' walked' : '') }, gEdges);
  }

  // ---- region names (small, for a grown-up) -------------------------------
  for (const r of model.regions) {
    const t = el('text', { x: r.x * CELL, y: r.y * CELL - CELL * 0.62, 'text-anchor': 'middle',
      class: 'map-region-name' + (r.done ? ' done' : '') }, gTop);
    t.textContent = r.name;
  }

  // ---- rooms --------------------------------------------------------------
  let hereTile = null;
  for (const t of model.tiles) {
    const h = HALF[t.kind] || 17;
    const g = el('g', {
      class: ['map-tile', t.travel || t.here ? 'map-room' : '', t.visited ? 'visited' : 'known',
        t.here ? 'here' : '', t.dungeon ? 'dungeon' : ''].filter(Boolean).join(' '),
      transform: `translate(${cx(t)} ${cy(t)})`,
      'data-room': t.id, 'data-rooms': t.id,
    }, gTiles);
    // the thumb target is the whole cell, whatever the size of the tile
    el('rect', { x: -CELL / 2, y: -CELL / 2, width: CELL, height: CELL, class: 'map-hit' }, g);
    if (t.here) el('rect', { x: -h - 7, y: -h - 7, width: 2 * h + 14, height: 2 * h + 14,
      rx: h * 0.5 + 6, class: 'map-here-ring mv-pulse' }, g);
    // an opaque floor under every tile, so a faint (not yet walked) room
    // reads as a ghost of itself rather than a window onto the path beneath
    el('rect', { x: -h, y: -h, width: 2 * h, height: 2 * h, rx: Math.min(10, h * 0.45), class: 'map-floor' }, g);
    el('rect', { x: -h, y: -h, width: 2 * h, height: 2 * h, rx: Math.min(10, h * 0.45),
      fill: hex(t.tint), class: 'map-shape' }, g);
    if (t.den) {
      const d = el('text', { x: 0, y: 8, 'text-anchor': 'middle', 'font-size': 22, class: 'map-glyph' }, g);
      d.textContent = '🏠';
    }
    if (t.dungeon) {
      // a dungeon's way in: a dark arch on the tile
      el('path', { d: 'M-7 8 V-1 A7 7 0 0 1 7 -1 V8 Z', class: 'map-arch' }, g);
    }
    if (t.star) {
      const s = el('text', { x: 0, y: 7, 'text-anchor': 'middle', 'font-size': 20, class: 'map-glyph map-star' }, g);
      s.textContent = '⭐';
    }
    const nm = el('text', { x: 0, y: h + 11, 'text-anchor': 'middle', class: 'map-name' }, g);
    nm.textContent = prettyName(t.label);
    // COME-BACK-LATER MARKS, on the tile's top-right corner (fanning left
    // when a room holds more than one). "Not yet" is a quiet grey ring and a
    // shaded coin — never the wolf's own colour as a ring, because Earth's is
    // gold (= act here) and Fire's is red (= danger). "Now!" is the gold ring,
    // a bounce and a sparkle.
    t.marks.forEach((m, i) => {
      const can = ownsForm(m.form);
      const r = can ? 15 : 13;
      const mx = h - 2 - i * (2 * r + 2);
      const my = -h + 1;
      const mg = el('g', { transform: `translate(${cx(t) + mx} ${cy(t) + my})`,
        class: 'map-mark' + (can ? ' can' : ' later'), 'data-mark': m.key, 'data-room': t.id,
        'data-form': m.form || '' }, gMarks);
      const inner = el('g', { class: can ? 'mv-bounce' : 'mv-breathe' }, mg);
      const col = (FORM_META[m.form] && FORM_META[m.form].color) || '#b9a88a';
      el('circle', { r: r + 3, class: 'map-mark-halo' }, inner);
      if (m.form) coin(defs, inner, m.form, r, can ? pale(col, 0.45) : pale(col, 0.25));
      else {
        el('circle', { r, class: 'mv-coin', fill: '#3a3050' }, inner);
        const e2 = el('text', { x: 0, y: r * 0.38, 'text-anchor': 'middle', 'font-size': r * 1.05 }, inner);
        e2.textContent = m.icon || '❓';
      }
      if (!can) el('circle', { r, class: 'map-mark-shade' }, inner);
      el('circle', { r, class: 'map-mark-rim' }, inner);
      if (can) {
        const sp = el('text', { x: r - 1, y: -r + 3, 'font-size': 12, class: 'map-spark' }, inner);
        sp.textContent = '✨';
      }
    });
    if (t.here) hereTile = t;
  }

  // ---- you are here: Kael's own face on a gold pin -------------------------
  // Standing ON the tile, not floating above it: a pin over the room drew
  // Kael across the name of the room north of him.
  if (hereTile) {
    const h = HALF[hereTile.kind] || 17;
    const r = Math.max(13, Math.min(19, h - 4));
    const pin = el('g', { class: 'map-you', transform: `translate(${cx(hereTile)} ${cy(hereTile)})` }, gTop);
    const bob = el('g', { class: 'mv-bob' }, pin);
    el('circle', { r: r + 3, class: 'map-you-disc' }, bob);
    coin(defs, bob, state.form, r, '#ffe9c8', { badge: false });
  }

  // ---- the controls (HTML, over the map) ----------------------------------
  const tools = document.createElement('div');
  tools.className = 'map-tools';
  const tool = (cls, html, fn) => {
    const b = document.createElement('div');
    b.className = 'map-tool ui ' + cls;
    b.innerHTML = html;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); fn(); });
    tools.appendChild(b);
    return b;
  };
  root.appendChild(tools);
  const bubble = document.createElement('div');
  bubble.className = 'map-bubble';
  root.appendChild(bubble);

  // ---- pan & zoom ---------------------------------------------------------
  const W = () => stage.clientWidth || window.innerWidth;
  const H = () => stage.clientHeight || window.innerHeight;
  const xs = model.tiles.map(cx), ys = model.tiles.map(cy);
  const box = { x0: Math.min(...xs, 0), x1: Math.max(...xs, 0), y0: Math.min(...ys, 0), y1: Math.max(...ys, 0) };
  const view = { s: 1, tx: 0, ty: 0 };
  const apply = () => {
    // never let the whole map slide off: some of it always stays in view
    const w = W(), hh = H();
    view.tx = Math.min(w * 0.8 - box.x0 * view.s, Math.max(w * 0.2 - box.x1 * view.s, view.tx));
    view.ty = Math.min(hh * 0.8 - box.y0 * view.s, Math.max(hh * 0.2 - box.y1 * view.s, view.ty));
    world.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.s})`);
    svg.classList.toggle('far', view.s < 0.62);
    placeBubble();
  };
  const zoomAt = (f, px, py) => {
    const s = Math.min(MAX_S, Math.max(MIN_S, view.s * f));
    view.tx = px - (px - view.tx) * (s / view.s);
    view.ty = py - (py - view.ty) * (s / view.s);
    view.s = s;
    apply();
  };
  const centreOn = (t) => {
    view.tx = W() / 2 - cx(t) * view.s;
    view.ty = H() / 2 - cy(t) * view.s;
    apply();
  };

  // ---- tap → the GO bubble -------------------------------------------------
  let picked = null;
  function placeBubble() {
    if (!picked) { bubble.style.display = 'none'; return; }
    const t = picked;
    const x = view.tx + cx(t) * view.s, y = view.ty + cy(t) * view.s;
    bubble.style.display = 'flex';
    // keep GO on screen: under the tile when there is no room above it, and
    // never past either edge
    bubble.classList.toggle('below', y < 120);
    bubble.style.left = Math.max(60, Math.min(W() - 60, x)) + 'px';
    bubble.style.top = y + 'px';
  }
  const pick = (t) => {
    picked = t;
    bubble.innerHTML = '';
    bubble.dataset.room = t ? t.id : '';
    if (!t) { placeBubble(); return; }
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = prettyName(t.label);
    bubble.appendChild(nm);
    if (t.travel) {
      const go = document.createElement('div');
      go.className = 'map-go ui';
      go.dataset.room = t.id;
      go.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><path d="M5 11h9.2l-3.6-3.6L12 6l6 6-6 6-1.4-1.4 3.6-3.6H5z"/></svg>';
      go.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTravel(t.id); });
      bubble.appendChild(go);
    }
    placeBubble();
  };

  const pts = new Map();
  let drag = null, pinch = null;
  svg.addEventListener('pointerdown', (e) => {
    try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const tileEl = e.target.closest && e.target.closest('.map-tile');
      drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false,
        tile: tileEl ? byId.get(tileEl.dataset.room) : null };
      pinch = null;
    } else if (pts.size === 2) {
      const [p, q] = [...pts.values()];
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, s: view.s, tx: view.tx, ty: view.ty,
        mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
      if (drag) drag.moved = true;
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect();
    if (pinch && pts.size >= 2) {
      const [p, q] = [...pts.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      const s = Math.min(MAX_S, Math.max(MIN_S, pinch.s * d / pinch.d));
      const mx = pinch.mx - r.left, my = pinch.my - r.top;
      view.tx = mx - (mx - pinch.tx) * (s / pinch.s) + ((p.x + q.x) / 2 - pinch.mx);
      view.ty = my - (my - pinch.ty) * (s / pinch.s) + ((p.y + q.y) / 2 - pinch.my);
      view.s = s;
      apply();
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 9) drag.moved = true;
      if (drag.moved) { view.tx = drag.tx + dx; view.ty = drag.ty + dy; apply(); }
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      if (drag && !drag.moved) pick(drag.tile && drag.tile !== picked ? drag.tile : null);
      drag = null; pinch = null;
    } else if (pts.size === 1) {
      // one finger lifted from a pinch: carry on panning from here, no tap
      const [p] = [...pts.values()];
      drag = { x: p.x, y: p.y, tx: view.tx, ty: view.ty, moved: true, tile: null };
      pinch = null;
    }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  tool('map-zoom-in', '<span>+</span>', () => zoomAt(1.3, W() / 2, H() / 2));
  tool('map-zoom-out', '<span>−</span>', () => zoomAt(1 / 1.3, W() / 2, H() / 2));
  const me = tool('map-me', '', () => { if (hereTile) { view.s = Math.max(view.s, 0.9); centreOn(hereTile); } });
  const meFace = PORTRAITS[state.form];
  me.innerHTML = meFace ? `<img src="${meFace}" alt="" draggable="false">`
    : `<span>${(FORM_META[state.form] && FORM_META[state.form].icon) || '🐺'}</span>`;

  // the way out — last child, as every panel's Done button is
  root.appendChild(closeBtn);

  // Open centred on Kael. The stage has its size once it is on screen; the
  // caller shows the panel first, then calls the returned `ready`.
  return {
    ready() {
      if (hereTile) centreOn(hereTile);
      else { view.tx = W() / 2; view.ty = H() / 2; apply(); }
    },
    view,
  };
}
