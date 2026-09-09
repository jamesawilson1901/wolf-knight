// THE WAY ONWARD, for every room in the game.
//
// This exists because the thing that told a lost child where to go had rotted
// without anyone noticing. `guideTarget()` in main.js was a hand-written switch
// over room ids, and every id in it was a RETIRED room: r1, r2, k1, e1, w1…
// Five of the seven regions a child actually plays had no entry at all, so Pip
// never ran, and the two that did were the old rooms nobody visits.
//
// A hand-kept list of room ids rots every time a level is rebuilt, and this one
// rotted twice. So the guide no longer stores POSITIONS — it stores which room
// is next, and asks the room itself where that door is. Move a door and the
// guide follows it; rebuild a level and only this table changes.
//
// A pocket's way onward is the room it loops back to: a child who wandered into
// a side room and got stuck should be shown the way OUT of it, not deeper.
import { state } from './state.js';
import { WS } from './worldstate.js';
import { growthStage } from './restoration.js';

const ONWARD = {
  // --- Ember Hollow: a string of pearls, always north ---------------------
  la: 'lg1', lg1: 'lb', lb: 'lg2', lg2: 'lc', lc: 'lg3', lg3: 'ld',
  ld: 'lg4', lg4: 'le',
  la1: 'la', lb1: 'lb', lb2: 'lb', lc1: 'lc', ld1: 'ld',
  // The Ash Vault (§2.4): Ember's first dungeon, off `la`'s own cracked wall.
  lv1: 'la', lv2: 'lv3', lv3: 'lv2',

  // --- Stoneroot: a hub and three spokes. `vh` is a function, below -------
  vga: 'va1', va1: 'va2', va2: 'va3', va3: 'vh',
  vgb: 'vb1', vb1: 'vb2', vb2: 'vb3', vb3: 'vh',
  vgc: 'vc1', vc1: 'vc2', vc2: 'vc3', vc3: 'vh',
  vap: 'va2', vbp: 'vb2', vcp: 'vc2',

  // --- The Wild Woods: a ring ---------------------------------------------
  t1a: 't1b', t1b: 'tc1', tc1: 't2a', t2a: 't2b', t2b: 'tsh', tsh: 'tc2',
  tc2: 't3a', t3a: 't3b', t3b: 'tkn', tkn: 'tc3', tc3: 't4a', t4a: 't4b',
  t4b: 'tc4', tc4: 'tgl',
  t1p: 't1b', t2p: 't2b', t3p: 't3b', t4p: 't4b',
  // The Frozen Spring (§2.3): Wild Woods' own dungeon, off t1b's ice spring.
  tf1: 't1b', tf2: 'tf3', tf3: 'tf2',

  // --- Frostpeak: still the old build, and still played --------------------
  f1: 'f2', f2: 'f3', f3: 'f4', f4: 'f5',
  f1b: 'f1', f2b: 'f2',
  // --- The roads between regions (levelNight, levelGreen, levelMarket): two
  // rooms each, one way on.
  n1: 'n2', n2: 'vh',
  g1: 'g2', g2: 't1a',
  q1: 'q2', q2: 's1a',
  // ...and the last three, 2026-09-08. Each hangs off the arena it leaves, so
  // the guide arrow leads out of a won boss room onto the road rather than
  // stopping dead there — the arenas had no NEXT entry at all before this.
  tgl: 'c1', c1: 'c2', c2: 'f1',
  scr: 'p1', p1: 'p2', p2: 'd1a',
  ddp: 'h1', h1: 'h2', h2: 'x1',

  // --- Stormreach: a switchback -------------------------------------------
  s1a: 's1b', s1b: 'sc1', sc1: 's2a', s2a: 's2b', s2b: 'ssh', ssh: 'sc2',
  sc2: 's3a', s3a: 's3b', s3b: 'svn', svn: 'sc3', sc3: 's4a', s4a: 's4b',
  s4b: 'sc4', sc4: 'scr',
  s1p: 's1b', s2p: 's2a', s3p: 's3a', s4p: 's4b',

  // --- The Sunken Vale: a lagoon that becomes a hub ------------------------
  d1a: 'd1b', d1b: 'dg1', dg1: 'd2a', d2a: 'd2b', d2b: 'dsh', dsh: 'dg2',
  dg2: 'd3a', d3a: 'd3b', d3b: 'dtp', dtp: 'dg3', dg3: 'd4a', d4a: 'd4b',
  d4b: 'dg4', dg4: 'ddp',
  d1p: 'd1b', d2p: 'd2a', d3p: 'd3a', d4p: 'd4b',

  // --- The Shadow Court: a hub with four wings. `xh` is a function --------
  x1: 'xsh', xsh: 'xh', xst: 'xth',
  xa1: 'xa2', xa2: 'xa3', xa3: 'xh',
  xr1: 'xr2', xr2: 'xr3', xr3: 'xh',
  xg1: 'xg2', xg2: 'xg3', xg3: 'xh',
  xm1: 'xm2', xm2: 'xm3', xm3: 'xh',
  xp1: 'xh', xp2: 'xh',

  // --- The Village: two streets between the square and the districts. The
  // square and both streets answer as functions below (which guardian still
  // stands decides the way on); the pockets loop back to their street.
  yg1: 'yhs', yg2: 'yhs', yg3: 'yhs',
  yg4: 'ylw', yg5: 'ylw', yg6: 'ylw',
  yrw: 'ysq',

  // --- The Moonlit Spire: a climb with two trials off the middle of it. `m2`
  // answers as a function below (which sigil is still dark decides the way on).
  m1: 'm2',
  ma: 'm2', mb: 'm2',
};

// The two hubs answer differently depending on what the child has already done.
// Both mirror what the room itself does: the Stoneroot hub only HAS the doorway
// its stage has opened, and the Court's throne stair only opens on four relics.
// The room a child re-enters each region through — its own hearth (§1.5's
// settler table) once one is built there, the region's own known entrance
// either way; a hearth existing is a dressing detail, not a routing one.
const HEARTH_ROOM = { ember: 'la', stone: 'vh', wild: 't1a', frost: 'f1',
  storm: 's1a', vale: 'd1a', court: 'x1' };

// EVERY ARENA'S OWN NEAREST UNFINISHED THING (§5.2), once its boss falls:
// the room holding a promise gate whose form she now owns and whose OWN
// `done()` is still false — the same rooms and flags js/main.js's own
// PROMISES table reads (51-79) — duplicated here in miniature rather than
// imported, since main.js already imports this file (nextRoom/onwardSpot)
// and importing PROMISES back would cycle. `underwaterPromise` (l2_sunken)
// is left out on purpose: nothing opens it but the ring draining on its
// own, so there is no verb for Pip to ever point a child at.
const REGION_PROMISES = {
  ember: [
    { room: 'la', form: 'earth_wolf', done: () => WS.get('ember', 'dungeon') },
    { room: 'lb2', form: 'fire_wolf', done: () => !!state.flags.burned.l1_scorched_gate },
  ],
  stone: [
    { room: 'vc2', form: 'verdant_wolf', done: () => WS.get('vault', 'cut_l2_bramble_gate') },
  ],
  wild: [
    { room: 't1b', form: 'verdant_wolf', done: () => WS.get('wild3', 'cut_w3_thorn_wall') },
    { room: 't1b', form: 'frost_wolf', done: () => WS.get('wild', 'dungeon') },
    { room: 't3a', form: 'verdant_wolf', done: () => WS.get('wild3', 'rootCut') },
    { room: 't4a', form: 'verdant_wolf', done: () => WS.get('wild3', 'logDown') },
  ],
  // frost/storm/vale carry no promise gates yet (design/WIDER-WORLD.md §2.3's
  // "later" queue) — an empty list here is silence, not a wrong answer, and
  // this table needs no edit the day one ships.
};

// A region's own hearth, but only while it still has something new to show:
// `spawnSettlers` marks `seen_N` the first time a child actually WALKS INTO
// the stage-N reveal, so "pending grow-in" is stage >= 2 (a settler exists
// at all) and that exact stage not yet seen — once seen, the hearth is just
// scenery again until growth advances further.
function pendingHearth(key) {
  const room = HEARTH_ROOM[key];
  const stage = growthStage(key);
  return room && stage >= 2 && !WS.get(key, 'seen_' + stage) ? room : null;
}

// One arena's own hub: the boss's own defeat flag gates it (never answered
// mid-fight — Tam's own law, §5), then the region's nearest unfinished
// promise, then a pending hearth reveal, then the road onward — the `xh`
// relic-scan shape, generalised.
function arenaHub(key, flag, fallback) {
  return () => {
    if (!state.flags[flag]) return null;
    for (const p of (REGION_PROMISES[key] || [])) {
      if (state.formsUnlocked.includes(p.form) && !p.done()) return p.room;
    }
    return pendingHearth(key) || fallback;
  };
}

const HUBS = {
  // le/vz/f5 carry no ONWARD row of their own — their own arena hands the
  // next room over LIVE, as a door in the room itself (verify-onward.mjs),
  // not a table entry — so the fallback here is that same room, named once
  // rather than left for a child standing there to get no answer at all.
  le: arenaHub('ember', 'bossDefeated', 'n1'),
  vz: arenaHub('stone', 'wardenDefeated', 'g1'),
  // tgl/scr/ddp already have their own ONWARD row (the last-three-roads
  // rollout, below) — read it rather than repeat it, so the two tables
  // cannot quietly disagree about where the road actually goes.
  tgl: arenaHub('wild', 'sylvaDefeated', ONWARD.tgl),
  f5: arenaHub('frost', 'borealDefeated', 'q1'),
  scr: arenaHub('storm', 'ariaDefeated', ONWARD.scr),
  ddp: arenaHub('vale', 'meriDefeated', ONWARD.ddp),
  vh: () => ['vga', 'vgb', 'vgc', 'vz'][Math.min(3, WS.stage('vault'))],
  // THE DEN, given a real place in the guide (design/WIDER-WORLD.md §5.1):
  // "go back and look" at whichever region has done the least, or — before
  // any region is even freed — the only way out that exists yet. Growth is
  // read at 5 (§1.2's five facts); a region already there has nothing left
  // to point at, so the next-lowest takes its place.
  den: () => {
    const KEYS = Object.keys(HEARTH_ROOM);
    const started = KEYS.filter((k) => WS.get(k, 'restored') && growthStage(k) < 5);
    if (!started.length) return WS.get('ember', 'restored') ? null : 'la';
    started.sort((a, b) => growthStage(a) - growthStage(b));
    return HEARTH_ROOM[started[0]];
  },
  // The Village: point at whichever street still has a standing guardian
  // behind it; inside a street, at that street's first unbeaten district.
  ysq: () => {
    const g = (k) => WS.get('village', 'guardian_' + k);
    if (!g('g1') || !g('g2') || !g('g3')) return 'yhs';
    if (!g('g4') || !g('g5') || !g('g6')) return 'ylw';
    return 'yrw';
  },
  yhs: () => {
    const g = (k) => WS.get('village', 'guardian_' + k);
    return !g('g1') ? 'yg1' : !g('g2') ? 'yg2' : !g('g3') ? 'yg3' : 'ylw';
  },
  ylw: () => {
    const g = (k) => WS.get('village', 'guardian_' + k);
    return !g('g4') ? 'yg4' : !g('g5') ? 'yg5' : !g('g6') ? 'yg6' : 'ysq';
  },
  // The Spire's hall: point at whichever trial is still undone, then up.
  m2: () => {
    if (!state.flags.plates.m_sigil_stone) return 'ma';
    if (!WS.get('spire', 'sigil_flame')) return 'mb';
    return 'm3';
  },
  xh: () => {
    const wings = [['ember', 'xa1'], ['thorn', 'xr1'], ['tide', 'xg1'], ['moon', 'xm1']];
    for (const [relic, door] of wings) if (!WS.get('court', 'relic_' + relic)) return door;
    return 'xst';
  },
};

// Which room is the way on from here. Null when there is nothing to say —
// the Den, an arena mid-fight, or a room this table has never heard of.
export function nextRoom(id = state.room) {
  const hub = HUBS[id];
  if (hub) return hub();
  return ONWARD[id] || null;
}

// Where to actually SEND Pip: the doorway, pulled back into the room so he
// stands on floor a child can follow him across rather than inside the wall.
export function onwardSpot(world, id = state.room) {
  const next = nextRoom(id);
  if (!next || !world || !world.doors) return null;
  const d = world.doors.find((x) => x.to === next);
  if (!d) return null;
  const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
  // step in along whichever axis the door sits on
  const hx = world.halfW || 16, hz = world.halfD || 13;
  const inward = Math.abs(cz) / (hz || 1) > Math.abs(cx) / (hx || 1)
    ? { x: 0, z: -Math.sign(cz) } : { x: -Math.sign(cx), z: 0 };
  // KEEP BACKING OFF UNTIL IT IS FLOOR. A doorway can have something standing
  // in front of it that the child is meant to deal with — the Ash Wing's vault
  // is a solid gate until Earth cracks it — and sending Pip to stand inside it
  // shows a child a place they cannot follow him to. Walk back along the
  // approach until there is somewhere to actually stand.
  const standable = (x, z) => {
    if (!world.resolveCircle) return true;
    const r = world.resolveCircle(x, z, 0.32);
    if (Math.abs(r.x - x) > 1e-6 || Math.abs(r.z - z) > 1e-6) return false;
    return !(world.hazardAt && world.hazardAt(x, z));
  };
  for (const back of [1.8, 2.6, 3.4, 4.2, 5.2, 6.4]) {
    const x = cx + inward.x * back, z = cz + inward.z * back;
    if (standable(x, z)) return { x, z, to: next };
  }
  return null;
}
