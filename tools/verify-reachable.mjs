// CAN THE PLAYER ACTUALLY REACH EVERY DOOR?
//
// Ember Hollow shipped with its boss unreachable. The Forge Heart — the Kiln's
// hero prop — lays a 5.2-radius collider at (0, -8); the north wall is at
// z = -13 and the door gap spans x ±1.2, so the collider plugged the doorway.
// A child could walk to the great forge and no further, and the only way on in
// the whole region was behind it.
//
// Every suite was green. verify-level1 proved the rooms build and that the door
// GRAPH has no dead ends. verify-route walked the spine but PLACED the player
// on each door trigger, which teleports straight past the very collider that
// was the bug. Graph connectivity is not physical reachability, and the gap
// between them is where a progression blocker lives.
//
// So: flood-fill the walkable floor from each room's spawn and assert every
// door has reachable floor in front of it. This is the check that would have
// caught it, and it runs over every room in the game.
//
// SOLIDITY IS resolveCircle, NOT blocked(). The first version of this file used
// world.blocked(), which reads as the obvious choice and is not: blocked() is
// the BUILD-TIME keep-clear register — "may a prop be placed here" — and it
// pads every doorway by 2.6u precisely to keep props away from it. Using it
// here reported all 218 doors in the game as sealed. resolveCircle() is what
// the player actually obeys: a point is solid if it pushes you out of it.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'REACH');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  // Every form and flag on, so gates that are MEANT to be shut are open and
  // only genuine geometry can fail this. A locked promise gate is design; a
  // hero prop sitting on the doorway is not.
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});

// The same room list verify-density walks — kept here literally rather than
// imported, so this file has no opinion about that one's internals.
const ROOMS = ['la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3', 'ld', 'ld1', 'lg4', 'le', 'vh', 'vga', 'va1', 'va2', 'vap', 'va3', 'vgb', 'vb1', 'vb2', 'vbp', 'vb3', 'vgc', 'vc1', 'vc2', 'vcp', 'vc3', 'vz', 't1a', 't1b', 't1p', 'tc1', 't2a', 't2b', 't2p', 'tsh', 'tc2', 't3a', 't3b', 't3p', 'tkn', 'tc3', 't4a', 't4b', 't4p', 'tc4', 'tgl', 's1a', 's1b', 's1p', 'sc1', 's2a', 's2b', 's2p', 'ssh', 'sc2', 's3a', 's3b', 's3p', 'svn', 'sc3', 's4a', 's4b', 's4p', 'sc4', 'scr', 'd1a', 'd1b', 'd1p', 'dg1', 'd2a', 'd2b', 'd2p', 'dsh', 'dg2', 'd3a', 'd3b', 'd3p', 'dtp', 'dg3', 'd4a', 'd4b', 'd4p', 'dg4', 'dlg', 'ddp', 'x1', 'xsh', 'xh', 'xa1', 'xa2', 'xa3', 'xr1', 'xr2', 'xr3', 'xg1', 'xg2', 'xg3', 'xm1', 'xm2', 'xm3', 'xp1', 'xp2', 'xst', 'xth'];
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

// Flood-fill the floor the player can actually stand on, starting at the spawn.
const STEP = 0.5, R = 0.32, LIMIT = 40, NEAR = 1.75;
const reachReport = async () => page.evaluate(([step, rad, limit, near]) => {
  const w = window.__game.world;
  const sp = w.spawn || { x: 0, z: 0 };
  // A point is solid if the real collision resolver moves you off it.
  const solid = (x, z) => {
    const s = w.resolveCircle(x, z, rad);
    return Math.abs(s.x - x) > 1e-6 || Math.abs(s.z - z) > 1e-6;
  };
  const ci = (v) => Math.round(v / step);
  const key = (i, j) => i + ',' + j;
  // BOUND THE FILL TO THE ROOM. Outside the walls there are no colliders at
  // all, so an unbounded fill escapes through one open doorway, flows around
  // the outside of the building and declares every other doorway reachable —
  // from the wrong side. shell() records the room's real extent for this.
  const half = { x: w.halfW || limit, z: w.halfD || limit };
  const inside = (x, z) => Math.abs(x) <= half.x + 0.01 && Math.abs(z) <= half.z + 0.01;
  const seen = new Set();
  const stack = [[ci(sp.x), ci(sp.z)]];
  seen.add(key(stack[0][0], stack[0][1]));
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (Math.abs(ni * step) > limit || Math.abs(nj * step) > limit) continue;
      if (!inside(ni * step, nj * step)) continue;
      const k = key(ni, nj);
      if (seen.has(k) || solid(ni * step, nj * step)) continue;
      seen.add(k); stack.push([ni, nj]);
    }
  }
  // The door TRIGGER box sits in the wall plane and partly outside the room, so
  // it is not itself standable. What matters is the doorway: open floor close
  // to the door's centre that the player can actually walk to from the spawn.
  const doors = (w.doors || []).map((d) => {
    const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
    let open = 0, reachable = 0;
    for (let x = cx - near; x <= cx + near + 1e-6; x += step) {
      for (let z = cz - near; z <= cz + near + 1e-6; z += step) {
        if (!inside(x, z) || solid(x, z)) continue;
        open++;
        if (seen.has(key(ci(x), ci(z)))) reachable++;
      }
    }
    // AND WHERE YOU LAND ON THE OTHER SIDE.
    //
    // A door carries an `entry`: the exact spot the player is put down in the
    // room it leads to. Nothing had ever checked one. Moving the Stone Titan
    // 1.5u to make room for the vault's pool slid its collider over the point
    // where Stoneroot's third shortcut drops you — so a child taking that
    // shortcut arrived INSIDE the statue, and the walk to the crypt door failed
    // with "no walkable floor reaches the doorway" because the walk began in
    // solid rock. Every other suite was green: the door worked, the doorway was
    // clear, the room was reachable, and the landing spot was inside a prop.
    const e = d.entry;
    return { to: d.to, open, reachable, x: +cx.toFixed(1), z: +cz.toFixed(1),
      entry: e ? { x: e.x, z: e.z } : null };
  });
  return { spawn: sp, cells: seen.size, doors,
    // measured in the room this fill belongs to, keyed by the door that leads
    // here from elsewhere — the caller matches them up
    landing: (w.doors || []).map((d) => d.to) };
}, [STEP, R, LIMIT, NEAR]);

// DOORS THAT ARE MEANT TO BE SHUT.
//
// Each of these has open floor in the doorway but no walkable route to it yet,
// because a gate the child has not opened is in the way. That is design, not a
// fault — and it is listed here by name so that a NEW one has to be justified
// out loud rather than quietly lowering the bar for everything else.
const GATED = {
  'xa2→xa3': 'the Ash Wing vault — a CRACKED promise gate, opened with Earth',
  'xr2→xr3': 'the Root Wing spring — frozen shut until Frost is used on it',
  'ddp→dg4': 'the way out of the deep, which opens when the vale drains',
};

console.log('\n── every door has floor in front of it that the player can reach ──');
let checked = 0;
for (const room of ROOMS) {
  if (!(await go(room))) { check(`${room} builds`, false, { why: 'would not build' }); continue; }
  const r = await reachReport();
  for (const d of r.doors) {
    checked++;
    if (d.reachable > 0) continue;
    const gated = GATED[`${room}→${d.to}`];
    // A gate can only excuse a doorway that is physically OPEN. If the floor
    // itself is solid, something is sitting on the door and no flag will help.
    if (gated && d.open > 0) { console.log(`· ${room} → ${d.to} — shut by design: ${gated}`); continue; }
    check(`${room}: the way to ${d.to} is reachable`, false,
      { door: { x: d.x, z: d.z }, openCells: d.open, reachableCells: d.reachable,
        why: d.open === 0 ? 'the doorway is SOLID — something is sitting on it'
          : 'the doorway is open but walled off from where the player arrives' });
  }
}
check(`all ${checked} doors across ${ROOMS.length} rooms are walkable-to`, errors.length === 0);

// ── AND YOU LAND ON FLOOR AT THE OTHER END ────────────────────────────────
//
// The doorway being clear says nothing about where you are PUT DOWN in the room
// beyond it. Those two are separate numbers written in separate files, and the
// day the Stone Titan moved 1.5u to make room for the vault's pool, its collider
// swallowed the spot Stoneroot's third shortcut lands on. The door was fine. The
// doorway was fine. The room was reachable. A child taking that shortcut arrived
// inside a statue, and the only symptom was the walk to the boss failing.
console.log('\n── and every door puts you down on floor, not inside a prop ──');
const entries = new Map();          // room -> [{from, to, x, z}]
for (const room of ROOMS) {
  if (!(await go(room))) continue;
  for (const d of await page.evaluate(() => (window.__game.world.doors || [])
    .map((q) => ({ to: q.to, entry: q.entry ? { x: q.entry.x, z: q.entry.z } : null })))) {
    if (!d.entry) continue;
    if (!entries.has(d.to)) entries.set(d.to, []);
    entries.get(d.to).push({ from: room, ...d.entry });
  }
}
let landings = 0;
for (const [room, list] of entries) {
  if (!ROOMS.includes(room)) continue;   // the den and the like build elsewhere
  if (!(await go(room))) continue;
  const bad = await page.evaluate((spots) => {
    const w = window.__game.world;
    const out = [];
    for (const s of spots) {
      const r = w.resolveCircle(s.x, s.z, 0.32);
      const push = Math.hypot(r.x - s.x, r.z - s.z);
      const hazard = w.hazardAt ? !!w.hazardAt(s.x, s.z) : false;
      if (push > 1e-6 || hazard) {
        out.push({ ...s, pushedBy: +push.toFixed(2), hazard,
          to: [+r.x.toFixed(1), +r.z.toFixed(1)] });
      }
    }
    return out;
  }, list);
  landings += list.length;
  for (const bd of bad) {
    check(`${bd.from} → ${room}: you land on floor`, false,
      { landsAt: { x: bd.x, z: bd.z }, pushedTo: bd.to, by: bd.pushedBy,
        why: bd.hazard ? 'the landing spot is a hazard' : 'the landing spot is inside a collider' });
  }
}
check(`all ${landings} door landings are on open floor`,
  !errors.some((e) => e.includes('you land on floor')));

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN.'));
await b.close();
process.exit(errors.length ? 1 : 0);
