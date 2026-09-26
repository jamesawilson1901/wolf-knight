// WHAT THE MAP KNOWS — where Kael has been, and every "come back later" place
// the child has seen.
//
// Dad, 2026-09-26: "when things are marked to come back later, actually have
// to be marked on the map." The game toasted "🗺️ Added to the map: ???" at
// every promise gate for months and the map never drew a single one. This file
// is the record that makes the toast true, and the model the map screen draws
// (js/mapview.js) — no DOM here, so it stays cheap and checkable.
//
// Two save fields, both additive (js/save.js):
//   state.flags.visited   room id -> true, stamped by loadRoom on every arrival.
//                         `null` means a save written before this existed: it
//                         is seeded once from the progress it already records.
//   state.flags.mapMarks  'room:gateId' -> { room, id, system, region, form, gone? }
//                         one per promise gate the child has walked near. Its
//                         OPEN state is never stored: it is asked of the same
//                         flag the gate itself is built from, so a mark can
//                         never claim a wall is shut after it has been broken.

import { state, regionOf, resolveRoom } from './state.js';
import { registeredRooms, districtTint } from './districts.js';
import { WS } from './worldstate.js';
import { villageCleared } from './levelVillage.js';
import { DOORS } from './mapgraph.js';
import { layoutWorld } from './maplayout.js';

// The world in walk order. `open` is the thing that has to be true before a
// child can have set foot there — the spine of a region shows (faint) once the
// one before it is beaten, never before. `done` is its guardian freed.
// (Moved here from js/menus.js with the map rebuild; the rules are unchanged.)
const F = () => state.flags;
export const AREAS = [
  { key: 'den',          name: 'The Moonlit Den',    open: () => true },
  { key: 'ember_hollow', name: 'Ember Hollow',       open: () => true,                 done: () => F().bossDefeated },
  { key: 'night_road',   name: 'The Night Road',     open: () => F().bossDefeated },
  { key: 'stoneroot',    name: 'Stoneroot Caverns',  open: () => F().bossDefeated,     done: () => F().wardenDefeated },
  { key: 'greenway',     name: 'The Greenway',       open: () => F().wardenDefeated },
  { key: 'wildwoods',    name: 'The Wild Woods',     open: () => F().wardenDefeated,   done: () => F().sylvaDefeated },
  { key: 'coldclimb',    name: 'The Cold Climb',     open: () => F().sylvaDefeated },
  { key: 'frostpeak',    name: 'Frostpeak',          open: () => F().sylvaDefeated,    done: () => F().borealDefeated },
  { key: 'market',       name: 'The Drowned Market', open: () => F().borealDefeated },
  { key: 'stormreach',   name: 'Stormreach Cliffs',  open: () => F().borealDefeated,   done: () => F().ariaDefeated },
  { key: 'plunge',       name: 'The Plunge',         open: () => F().ariaDefeated },
  { key: 'sunkenvale',   name: 'The Sunken Vale',    open: () => F().ariaDefeated,     done: () => F().meriDefeated },
  { key: 'hollowroad',   name: 'The Hollow Road',    open: () => F().meriDefeated },
  { key: 'shadowcourt',  name: 'The Shadow Court',   open: () => F().meriDefeated,     done: () => F().grimmFreed },
  { key: 'village',      name: 'The Village',        open: () => F().grimmFreed,       done: () => villageCleared() },
  { key: 'spire',        name: 'The Moonlit Spire',  open: () => villageCleared() },
];
const AREA = Object.fromEntries(AREAS.map((a) => [a.key, a]));

// DUNGEON MOUTHS (design/WIDER-WORLD.md §5.3), keyed by the entrance room a
// branch hangs off. `open()` is the SAME flag the branch's own structural gap
// in the entrance room's shell reads (js/level1.js buildLa's `vaultOpen`,
// js/level3.js buildT1b's `springOpen`) — the map can never show a way in that
// is not actually there yet.
export const DUNGEON_MOUTHS = {
  la: { first: 'lv1', open: () => !!state.flags.cracked.l1_crack_gate },
  t1b: { first: 'tf1', open: () => !!WS.get('wild3', 'ice_l3_spring_ice') },
};

// The Den and its outer camp have no level table, so they are named here.
const UNTABLED = {
  den: { id: 'den', label: 'The Moonlit Den', kind: 'island', spine: true, tint: 0x6f8a4e },
  dr:  { id: 'dr', label: 'The Outer Camp', kind: 'pocket', spine: false, tint: 0x4f7a3c },
};

// The map's own region key: the Den is its own place, not Ember's first room.
export function mapRegion(id) {
  return id === 'den' || id === 'dr' ? 'den' : regionOf(id);
}

// Every room the map can draw, in authoring order.
export function mapRooms() {
  const out = [UNTABLED.den, UNTABLED.dr];
  for (const r of registeredRooms()) out.push({ ...r, tint: r.tint != null ? r.tint : districtTint(r.id) });
  return out;
}

// Positions, computed once per session (the room set is fixed once the level
// modules have loaded, which is before any menu can open).
let layoutCache = null;
export function mapLayout() {
  const rooms = mapRooms();
  if (layoutCache && layoutCache.n === rooms.length) return layoutCache.pos;
  const pos = layoutWorld(DOORS, rooms.map((r) => ({ id: r.id, region: mapRegion(r.id) })),
    AREAS.map((a) => a.key));
  layoutCache = { n: rooms.length, pos };
  return pos;
}

// ---------------------------------------------------------------------------
// VISITED
//
// A save from before this existed (visited === null) still shows the child
// the world they have already walked: every spine room of every region they
// have got past, and the spine of the region they are in up to where they are.
export function ensureVisited() {
  if (state.flags.visited && typeof state.flags.visited === 'object') return state.flags.visited;
  const v = {};
  const here = resolveRoom(state.room || '');
  const hereRegion = mapRegion(here);
  const all = mapRooms();
  for (const A of AREAS) {
    const spine = all.filter((r) => r.spine && mapRegion(r.id) === A.key);
    if (A.key === hereRegion) {
      for (const r of spine) { if (r.id === here) break; v[r.id] = true; }
      break;
    }
    if (A.open()) for (const r of spine) v[r.id] = true;
  }
  v.den = true;
  if (here) v[here] = true;
  state.flags.visited = v;
  return v;
}

export function markVisited(id) {
  ensureVisited()[id] = true;
}

// ---------------------------------------------------------------------------
// COME-BACK-LATER MARKS
//
// Which wolf opens a gate is a fact about its SYSTEM, not its colour: every
// `shatter` gate in the game — "FROZEN", "FLOODED" and "DARK" alike — breaks
// to the Frost Wolf's breath (player.js is the one caller of shatterAt), and
// the one `none` gate (Stormreach's sea cave) is water that opens by wading.
export const SYSTEM_FORM = {
  crack: 'earth_wolf', burn: 'fire_wolf', melt: 'fire_wolf',
  cut: 'verdant_wolf', shatter: 'frost_wolf', none: 'tide_wolf',
};

export function gateOpened(g) {
  const f = state.flags;
  switch (g.system) {
    case 'crack': return !!(f.cracked && f.cracked[g.id]);
    case 'burn': return !!(f.burned && f.burned[g.id]);
    case 'cut': return !!WS.get(g.region, 'cut_' + g.id);
    case 'shatter': return !!WS.get(g.region, 'ice_' + g.id);
    case 'melt': return !!WS.get(g.region, 'melt_' + g.id);
    default: return !!g.gone;
  }
}

function marks() {
  if (!state.flags.mapMarks || typeof state.flags.mapMarks !== 'object') state.flags.mapMarks = {};
  return state.flags.mapMarks;
}

// The child has come near a gate: it goes on the map. Returns true the first
// time only. A gate already open, or one the child can already open while
// standing at it, is still recorded — the map shows the second kind bright.
export function seeMapGate(g, room) {
  const M = marks();
  const key = room + ':' + g.id;
  if (M[key]) return false;
  if (gateOpened(g)) return false;
  M[key] = { room, id: g.id, system: g.system, region: g.region || null,
    form: g.form || SYSTEM_FORM[g.system] || null };
  return true;
}

// Per frame, from main.js: every registered gate within sight of Kael.
export function noteMapGates(world, px, pz, room, r = 6.5) {
  let added = false;
  for (const g of world.mapGates || []) {
    const dx = g.x - px, dz = g.z - pz;
    if (dx * dx + dz * dz < r * r && seeMapGate(g, room)) added = true;
  }
  return added;
}

// On arrival: a mark whose gate this room no longer builds is gone (every gate
// builder returns early once opened, so absence IS opened — and it is the only
// way a `none` gate like the sea cave can ever say so).
export function reconcileRoom(world, room) {
  const present = new Set((world.mapGates || []).map((g) => g.id));
  for (const m of Object.values(marks())) {
    if (m.room !== room) continue;
    m.gone = !present.has(m.id);
  }
}

// THE ??? LOG, PLACED. A mystery (js/worldstate.js logMystery) now stamps the
// room it was logged in. Older saves did not, so the promises that existed
// then are placed by the table below — the room each PROMISES marker lives in.
// `open` is the GATE-open condition (main.js's `done` waits for the dungeon
// behind it; the map's mark should go the moment the wall does).
const MYSTERY_PLACES = {
  l1_crack:     { room: 'la',  open: () => !!state.flags.cracked.l1_crack_gate },
  l1_scorched:  { room: 'lb2', open: () => !!state.flags.burned.l1_scorched_gate },
  l2_sunken:    { room: 'vh',  open: () => !!WS.get('vault', 'drained') },
  l2_bramble:   { room: 'vc2', open: () => !!WS.get('vault', 'cut_l2_bramble_gate') },
  l3_thorn:     { room: 't1b', open: () => !!WS.get('wild3', 'cut_w3_thorn_wall') },
  l3_spring:    { room: 't1b', open: () => !!WS.get('wild3', 'ice_l3_spring_ice') },
  f1c_hearth:   { room: 'f1b', open: () => !!WS.get('frost', 'melt_f1c_hearth') },
  l3_rootwall:  { room: 't3a', open: () => !!WS.get('wild3', 'rootCut') },
  l3_greatlog:  { room: 't4a', open: () => !!WS.get('wild3', 'logDown') },
  stone_bramble: { room: 'vb1' },
  frost_spring: { room: 't1p' },
};
// The picture a mystery was logged with says which wolf it waits for.
const ICON_FORM = { '🪨': 'earth_wolf', '🔥': 'fire_wolf', '🌿': 'verdant_wolf', '🪵': 'verdant_wolf',
  '❄️': 'frost_wolf', '🌩️': 'storm_wolf', '🌀': 'storm_wolf', '🌊': 'tide_wolf', '👻': 'ghost_wolf' };

function mysteryMarks(knownRooms) {
  const out = [];
  for (const [id, v] of Object.entries(state.flags.mysteries || {})) {
    if (!v || v.found) continue;
    const place = MYSTERY_PLACES[id];
    let room = v.room || (place && place.room) || null;
    if (!room && id.startsWith('frost_ice_')) room = id.slice('frost_ice_'.length);
    if (!room || !knownRooms.has(room)) continue;
    if (place && place.open && place.open()) continue;
    out.push({ key: 'mystery:' + id, room, form: ICON_FORM[v.icon] || null, icon: v.icon || '❓', mystery: id });
  }
  return out;
}

// Everything still to come back for, per room: { room -> [mark] }. A mystery
// whose room already carries a gate mark for the same wolf IS that gate (the
// gate mark knows when the wall breaks; the mystery only when the dungeon
// behind it is cleared), so it is not drawn twice.
export function openMarks(knownRooms) {
  const byRoom = new Map();
  const push = (m) => { if (!byRoom.has(m.room)) byRoom.set(m.room, []); byRoom.get(m.room).push(m); };
  const gateForms = new Set();
  for (const [key, m] of Object.entries(marks())) {
    if (!knownRooms.has(m.room)) continue;
    gateForms.add(m.room + '|' + m.form);
    if (m.gone || gateOpened(m)) continue;
    push({ key, room: m.room, form: m.form, gate: m.id });
  }
  for (const m of mysteryMarks(knownRooms)) {
    if (m.form && gateForms.has(m.room + '|' + m.form)) continue;
    push(m);
  }
  return byRoom;
}

// ---------------------------------------------------------------------------
// THE MODEL THE SCREEN DRAWS.
//
//   tiles:  every room the child may see — `visited` (solid), else `known`
//           (faint): the spine of every open region, the rooms through an
//           always-there door of a visited room, and an open dungeon mouth.
//           Never-seen rooms are simply absent: fog.
//   edges:  a path between two drawn rooms. A conditional door (built only
//           once something is true) is drawn only when both ends are visited,
//           or when it is the very door that revealed the room beyond.
//   travel: the SAME rule the card map had — a spine room in an open region,
//           the Den, or an open dungeon mouth; never where she is standing.
export function mapModel() {
  const visited = ensureVisited();
  const here = resolveRoom(state.room);
  const hereRegion = mapRegion(here);
  const rooms = mapRooms();
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const pos = mapLayout();
  const areaOpen = (key) => key === hereRegion || !!(AREA[key] && AREA[key].open());
  const areaDone = (key) => !!(AREA[key] && AREA[key].done && AREA[key].done());

  const known = new Set();
  const revealEdges = new Set();
  const ekey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  for (const r of rooms) {
    if (visited[r.id] || r.id === here) known.add(r.id);
    else if (r.spine && areaOpen(mapRegion(r.id))) known.add(r.id);
  }
  for (const id of Object.keys(visited)) {
    if (!byId.has(id)) continue;
    for (const [, to, cond] of DOORS[id] || []) {
      if (!byId.has(to)) continue;
      const toRoom = byId.get(to);
      const mouth = DUNGEON_MOUTHS[id];
      const reveal = !cond
        || (mouth && mouth.first === to && mouth.open())
        // the road on, once the guardian that held it is down
        || (toRoom.spine && mapRegion(to) !== mapRegion(id) && areaDone(mapRegion(id)) && areaOpen(mapRegion(to)));
      if (reveal) { known.add(to); revealEdges.add(ekey(id, to)); }
    }
  }
  for (const [id, mouth] of Object.entries(DUNGEON_MOUTHS)) {
    if (mouth.open() && known.has(id)) { known.add(mouth.first); revealEdges.add(ekey(id, mouth.first)); }
  }

  const byRoomMarks = openMarks(known);
  const tiles = [];
  for (const id of known) {
    const r = byId.get(id);
    const p = pos.get(id);
    if (!r || !p) continue;
    const region = mapRegion(id);
    const isMouth = Object.values(DUNGEON_MOUTHS).some((m) => m.first === id && m.open());
    const travel = id !== here && (id === 'den' || isMouth || (r.spine && areaOpen(region)));
    tiles.push({
      id, x: p.x, y: p.y, label: r.label, kind: r.kind || '', spine: !!r.spine,
      tint: r.tint, region, visited: !!visited[id] || id === here, here: id === here,
      // the one room per dungeon branch its level table flags (districts.js)
      dungeon: !!r.dungeon,
      travel,
      star: r.kind === 'arena' && areaDone(region),
      den: id === 'den',
      marks: byRoomMarks.get(id) || [],
    });
  }
  const drawn = new Set(tiles.map((t) => t.id));
  const edges = [];
  const seen = new Set();
  for (const id of drawn) {
    for (const [, to, cond] of DOORS[id] || []) {
      if (!drawn.has(to)) continue;
      const k = ekey(id, to);
      if (seen.has(k)) continue;
      const both = (visited[id] || id === here) && (visited[to] || to === here);
      if (cond && !both && !revealEdges.has(k)) continue;
      // a door whose far side is never-visited reads as a road not yet walked
      seen.add(k);
      edges.push({ a: id, b: to, walked: both });
    }
  }
  const regions = [];
  for (const A of AREAS) {
    const ts = tiles.filter((t) => t.region === A.key);
    if (!ts.some((t) => t.visited)) continue;
    const minY = Math.min(...ts.map((t) => t.y));
    const top = ts.filter((t) => t.y === minY);
    regions.push({ key: A.key, name: A.name, done: areaDone(A.key),
      x: top.reduce((s, t) => s + t.x, 0) / top.length, y: minY });
  }
  return { tiles, edges, regions, here };
}

// Which wolf the child is carrying right now — the map's "can do it now".
export function ownsForm(form) {
  return !!form && state.formsUnlocked.includes(form);
}
