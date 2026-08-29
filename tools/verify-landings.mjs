// WHERE A DOOR PUTS YOU DOWN HAS TO BE A PLACE IN THE ROOM.
//
// verify-reachable already asks "is the landing spot on open floor" — it drops a
// body there and sees whether anything pushes it out. That check has a blind
// spot big enough to walk through: a point two metres OUTSIDE a wall has nothing
// solid at it either, so a landing that misses the room entirely reads as clean
// floor and the suite goes green.
//
// Dad, on v3.47.1: "door ways don't take you to the next room in the level. they
// just let you wonder around in the black nothing." The doorway holes were one
// cause and are fixed. This is the other half of the same sentence, and it is a
// different bug: player.place() sets a position and a rotation, full stop —
// there is no bounds test anywhere in the game, so a single wrong literal in a
// sideDoor call drops a child outside the world with no floor and no way back.
//
// Two invariants, both about the DESTINATION room:
//
//   1. THE LANDING IS INSIDE THE ROOM. Inside its half-extents, with enough
//      margin to clear the wall band.
//
//   2. THE LANDING IS NOT STANDING ON ANOTHER DOOR. Put a child down inside the
//      destination's own door trigger and the door fires on the next frame —
//      they get bounced somewhere they did not choose, usually straight back,
//      which is a room you cannot enter.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const ROOMS = ['la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3', 'ld', 'ld1', 'lg4', 'le', 'vh', 'vga', 'va1', 'va2', 'vap', 'va3', 'vgb', 'vb1', 'vb2', 'vbp', 'vb3', 'vgc', 'vc1', 'vc2', 'vcp', 'vc3', 'vz', 't1a', 't1b', 't1p', 'tc1', 't2a', 't2b', 't2p', 'tsh', 'tc2', 't3a', 't3b', 't3p', 'tkn', 'tc3', 't4a', 't4b', 't4p', 'tc4', 'tgl', 's1a', 's1b', 's1p', 'sc1', 's2a', 's2b', 's2p', 'ssh', 'sc2', 's3a', 's3b', 's3p', 'svn', 'sc3', 's4a', 's4b', 's4p', 'sc4', 'scr', 'd1a', 'd1b', 'd1p', 'dg1', 'd2a', 'd2b', 'd2p', 'dsh', 'dg2', 'd3a', 'd3b', 'd3p', 'dtp', 'dg3', 'd4a', 'd4b', 'd4p', 'dg4', 'dlg', 'ddp', 'x1', 'xsh', 'xh', 'xa1', 'xa2', 'xa3', 'xr1', 'xr2', 'xr3', 'xg1', 'xg2', 'xg3', 'xm1', 'xm2', 'xm3', 'xp1', 'xp2', 'xst', 'xth',
  // THE LIST ROTTED, EXACTLY AS ITS OWN HEADER WARNED A HAND-KEPT LIST WOULD.
  // The Village shipped ten rooms and the Spire five, and neither region was
  // ever added here — so the one check in the game that asks "does this door
  // put a child down inside a room" had no opinion at all about the Village's
  // six guardian doors, or about the stair the Square grew to the Spire.
  // Added 2026-08-29 with the Spire; both regions pass.
  'ysq', 'yhs', 'ylw', 'yg1', 'yg2', 'yg3', 'yg4', 'yg5', 'yg6', 'yrw',
  'm1', 'm2', 'ma', 'mb', 'm3'];

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'LANDING');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

// ONE PASS, EVERY ROOM: its size, its door triggers, and where its own doors say
// they put you down in someone else's room.
console.log('── reading every room once ───────────────────────────');
const rooms = {};
for (const room of ROOMS) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  rooms[room] = await page.evaluate(() => {
    const w = window.__game.world;
    return {
      halfW: w.halfW, halfD: w.halfD,
      triggers: (w.doors || []).map((d) => ({ to: d.to,
        minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: d.maxZ })),
      exits: (w.doors || []).map((d) => ({ to: d.to,
        x: d.entry && d.entry.x, z: d.entry && d.entry.z })),
    };
  });
}
console.log(`read ${Object.keys(rooms).length} rooms`);

// The wall band plus the door trigger's own inner lip. A landing this close to
// the edge is standing in the wall even when nothing pushes it.
const MARGIN = 0.8;

console.log('\n── 1. every landing is inside the room it lands in ────');
const outside = [];
for (const [from, r] of Object.entries(rooms)) {
  for (const e of r.exits) {
    const dest = rooms[e.to];
    if (!dest || e.x === undefined || e.x === null) continue;   // the den builds elsewhere
    const overX = Math.abs(e.x) - (dest.halfW - MARGIN);
    const overZ = Math.abs(e.z) - (dest.halfD - MARGIN);
    if (overX > 0 || overZ > 0) {
      outside.push({ leg: `${from} → ${e.to}`, lands: { x: e.x, z: e.z },
        room: { halfW: dest.halfW, halfD: dest.halfD },
        over: +Math.max(overX, overZ).toFixed(2) });
    }
  }
}
for (const o of outside) check(`${o.leg}: the landing is inside ${o.leg.split(' → ')[1]}`, false, o);
check('no door drops a child outside the room it opens into', outside.length === 0,
  { checked: Object.values(rooms).reduce((n, r) => n + r.exits.length, 0) });

console.log('\n── 2. no landing is standing on another door ─────────');
// The trigger rectangles are grown by the player's own radius, because standing
// a hair outside one and being nudged in by a single frame of movement is the
// same bug with a longer fuse.
const R = 0.35;
const onDoor = [];
for (const [from, r] of Object.entries(rooms)) {
  for (const e of r.exits) {
    const dest = rooms[e.to];
    if (!dest || e.x === undefined || e.x === null) continue;
    for (const t of dest.triggers) {
      if (e.x >= t.minX - R && e.x <= t.maxX + R && e.z >= t.minZ - R && e.z <= t.maxZ + R) {
        onDoor.push({ leg: `${from} → ${e.to}`, lands: { x: e.x, z: e.z },
          onto: `${e.to} → ${t.to}`,
          trigger: { x: [t.minX, t.maxX], z: [t.minZ, t.maxZ] } });
      }
    }
  }
}
for (const o of onDoor) check(`${o.leg}: you do not land standing on ${o.onto}`, false, o);
check('no door puts a child down inside another door', onDoor.length === 0);

console.log('\n── 3. ...and not inside a prop ───────────────────────');
// verify-reachable already asks this, and it is the check that caught the first
// repair of xh → xsh: (0, -6) is inside the room and clear of every door, and it
// is also standing inside the watcher xsh deliberately parks across the way out.
// Three questions, three different answers — but reachable takes twenty minutes
// and this takes five, so asking all three here means a wrong landing is caught
// in one pass instead of three.
// Grouped by DESTINATION, one build per room rather than one per door — the
// naive loop rebuilds a room for each of the 218 legs and turns a five-minute
// suite into half an hour.
const byDest = new Map();
for (const [from, r] of Object.entries(rooms)) {
  for (const e of r.exits) {
    if (!rooms[e.to] || e.x === undefined || e.x === null) continue;
    if (!byDest.has(e.to)) byDest.set(e.to, []);
    byDest.get(e.to).push({ from, x: e.x, z: e.z });
  }
}
const inProp = [];
for (const [dest, list] of byDest) {
  if (!(await go(dest))) continue;
  const bad = await page.evaluate((spots) => {
    const w = window.__game.world;
    return spots.map((s) => {
      const p = w.resolveCircle(s.x, s.z, 0.32);
      return { ...s, push: +Math.hypot(p.x - s.x, p.z - s.z).toFixed(2) };
    }).filter((s) => s.push > 0);
  }, list);
  for (const s of bad) inProp.push({ leg: `${s.from} → ${dest}`, lands: { x: s.x, z: s.z }, pushedBy: s.push });
}
for (const o of inProp) check(`${o.leg}: the landing is on open floor`, false, o);
check('no door puts a child down inside a prop', inProp.length === 0);

console.log('\n── 4. and you can stand in front of it without burning ─');
// THE APPROACH, NOT JUST THE ARRIVAL. Ember Hollow's lava room laid its channel
// across the full width of the room — and its east doorway sits inside that
// band, with both crossing slabs twenty metres away. A child could only reach
// that door by standing in lava, so the pocket behind it (a pup and a chest)
// could not be entered at all.
//
// verify-reachable never saw it because it checks the landing in the room you
// are GOING TO. This checks the doorway in the room you are LEAVING.
const burning = [];
for (const room of ROOMS) {
  if (!rooms[room] || !rooms[room].triggers.length) continue;
  if (!(await go(room))) continue;
  const bad = await page.evaluate(() => {
    const w = window.__game.world;
    if (!w.hazardAt) return [];
    const out = [];
    for (const d of (w.doors || [])) {
      const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
      // the doorway itself, and the metre and a half of floor in front of it
      const inx = Math.sign(-cx) || 0, inz = Math.sign(-cz) || 0;
      const pts = [[cx, cz], [cx + inx * 1.5, cz + inz * 1.5]];
      const hot = pts.filter((p) => w.hazardAt(p[0], p[1]));
      if (hot.length) out.push({ to: d.to, at: pts[0].map((n) => +n.toFixed(1)), hot: hot.length });
    }
    return out;
  });
  for (const x of bad) burning.push({ leg: `${room} → ${x.to}`, ...x });
}
for (const x of burning) check(`${x.leg}: you can stand in the doorway without burning`, false, x);
check('no doorway in the game stands in a hazard', burning.length === 0);

console.log(errors.length ? `\n${errors.length} PROBLEM(S)` : '\nALL CLEAN — every door puts you down in the room, on floor, clear of every other door, and can be reached without burning.');
await b.close();
process.exit(errors.length ? 1 : 0);
