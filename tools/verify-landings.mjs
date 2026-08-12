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
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const ROOMS = ['la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3', 'ld', 'ld1', 'lg4', 'le', 'vh', 'vga', 'va1', 'va2', 'vap', 'va3', 'vgb', 'vb1', 'vb2', 'vbp', 'vb3', 'vgc', 'vc1', 'vc2', 'vcp', 'vc3', 'vz', 't1a', 't1b', 't1p', 'tc1', 't2a', 't2b', 't2p', 'tsh', 'tc2', 't3a', 't3b', 't3p', 'tkn', 'tc3', 't4a', 't4b', 't4p', 'tc4', 'tgl', 's1a', 's1b', 's1p', 'sc1', 's2a', 's2b', 's2p', 'ssh', 'sc2', 's3a', 's3b', 's3p', 'svn', 'sc3', 's4a', 's4b', 's4p', 'sc4', 'scr', 'd1a', 'd1b', 'd1p', 'dg1', 'd2a', 'd2b', 'd2p', 'dsh', 'dg2', 'd3a', 'd3b', 'd3p', 'dtp', 'dg3', 'd4a', 'd4b', 'd4p', 'dg4', 'dlg', 'ddp', 'x1', 'xsh', 'xh', 'xa1', 'xa2', 'xa3', 'xr1', 'xr2', 'xr3', 'xg1', 'xg2', 'xg3', 'xm1', 'xm2', 'xm3', 'xp1', 'xp2', 'xst', 'xth'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
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
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
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

console.log(errors.length ? `\n${errors.length} PROBLEM(S)` : '\nALL CLEAN — every door puts you down in the room, clear of every other door.');
await b.close();
process.exit(errors.length ? 1 : 0);
