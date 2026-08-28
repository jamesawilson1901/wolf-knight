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

const ONWARD = {
  // --- Ember Hollow: a string of pearls, always north ---------------------
  la: 'lg1', lg1: 'lb', lb: 'lg2', lg2: 'lc', lc: 'lg3', lg3: 'ld',
  ld: 'lg4', lg4: 'le',
  la1: 'la', lb1: 'lb', lb2: 'lb', lc1: 'lc', ld1: 'ld',

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

  // --- Frostpeak: still the old build, and still played --------------------
  f1: 'f2', f2: 'f3', f3: 'f4', f4: 'f5',
  f1b: 'f1', f2b: 'f2',

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
};

// The two hubs answer differently depending on what the child has already done.
// Both mirror what the room itself does: the Stoneroot hub only HAS the doorway
// its stage has opened, and the Court's throne stair only opens on four relics.
const HUBS = {
  vh: () => ['vga', 'vgb', 'vgc', 'vz'][Math.min(3, WS.stage('vault'))],
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
