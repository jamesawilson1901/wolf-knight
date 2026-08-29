// NO DOORWAY IS EVER JUST A HOLE — now with the check that would have found five.
//
// Dad, v3.47: "door ways don't take you to the next room in the level. they
// just let you wonder around in the black nothing." probe-openholes was the
// answer, and it asks two good questions at every REGISTERED door: if the
// trigger will not fire here, is there something solid instead? and if it
// fires, is the doorway actually passable?
//
// The night the probe first saw the Village (2026-08-29) it caught five broken
// pocket exits — but it caught them by their WALLED-OFF half only. The other
// half of the same bug was five open holes at each pocket's gap, and the probe
// reported "0 open holes" while they existed, because a hole where no door was
// registered is a place no door-based sample ever visits.
//
// So this is the promoted suite (probes that find real bugs become verify-*,
// docs/TESTING.md §2), and it adds the missing third question, asked of the
// WALL rather than of the door list: walk every shell wall of every room, just
// inside the wall plane, and flag any span where a child neither hits anything
// solid nor fires any door. That is the definition of a hole into the void,
// and it needs no door to be registered to be found.
import { launchBrowser } from './launch.mjs';
import { allRooms } from './all-rooms.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'OPENHOLE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
const ROOMS = process.argv.slice(2).length ? process.argv.slice(2) : await allRooms(page);
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

// Rooms whose shells are legitimately not four sealed walls. Empty on the day
// this shipped, and that is a fact worth defending: add a room here only with
// the reason written beside it, the way verify-reachable's GATED does it.
const OPEN_BY_DESIGN = {};

// Doorways that fire while something solid stands in them ON PURPOSE: the
// legacy frost gates seal the opening with a real melting wall, but their
// addDoor calls predate `when()` so the trigger stays live behind the ice.
// The seal is the design; the live trigger behind it is legacy plumbing. If
// one of these ever shows up as an unfired hole instead, that is the gate
// FAILING TO BUILD and this list must not excuse it (it only covers walled).
const SEALED_BY_DESIGN = {
  'f2→f3': 'the Frozen Lake frost gate — melts when the braziers are lit',
  'f3→f4': 'the Windscour frost gate — opens on both lake plates',
};

const holes = [], walled = [], wallHoles = [];
for (const room of ROOMS) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const r = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    const doors = (w.doors || []).map((d) => {
      const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
      const out = w.resolveCircle(cx, cz, 0.12);
      return { to: d.to, cx: +cx.toFixed(1), cz: +cz.toFixed(1),
        fires: !!w.doorAt(cx, cz),
        gated: !!d.when && !d.when(),
        solid: Math.hypot(out.x - cx, out.z - cz) > 0.01 };
    });
    // THE WALL SWEEP. Sample each shell wall 0.1 inside its plane — inside
    // every door trigger's inner lip (they reach half-0.15), so a real doorway
    // answers "fires", a wall answers "solid", and a hole answers neither.
    const spans = [];
    if (w.halfW && w.halfD) {
      const sides = [
        { horiz: true, fixed: w.halfD - 0.1, lim: w.halfW, name: 's' },
        { horiz: true, fixed: -(w.halfD - 0.1), lim: w.halfW, name: 'n' },
        { horiz: false, fixed: w.halfW - 0.1, lim: w.halfD, name: 'e' },
        { horiz: false, fixed: -(w.halfW - 0.1), lim: w.halfD, name: 'w' },
      ];
      for (const side of sides) {
        let run = 0, runFrom = 0;
        for (let t = -side.lim + 0.5; t <= side.lim - 0.5 + 1e-6; t += 0.3) {
          const x = side.horiz ? t : side.fixed, z = side.horiz ? side.fixed : t;
          const out = w.resolveCircle(x, z, 0.32);
          const solid = Math.hypot(out.x - x, out.z - z) > 0.01;
          const fires = !!w.doorAt(x, z);
          if (!solid && !fires) { if (!run) runFrom = t; run++; }
          else {
            if (run >= 2) spans.push({ side: side.name, from: +runFrom.toFixed(1), len: +(run * 0.3).toFixed(1) });
            run = 0;
          }
        }
        if (run >= 2) spans.push({ side: side.name, from: +runFrom.toFixed(1), len: +(run * 0.3).toFixed(1) });
      }
    }
    return { doors, spans };
  });
  for (const d of r.doors) {
    // a door with an unmet when() is solid by the world's own rule — that is
    // the seal working, not a hole and not a walling-off
    if (d.gated) continue;
    if (!d.fires && !d.solid) holes.push({ room, ...d });
    if (d.fires && d.solid) {
      const sealed = SEALED_BY_DESIGN[`${room}→${d.to}`];
      if (sealed) { console.log(`· ${room} → ${d.to} — sealed by design: ${sealed}`); continue; }
      walled.push({ room, ...d });
    }
  }
  if (!OPEN_BY_DESIGN[room]) for (const sp of r.spans) wallHoles.push({ room, ...sp });
}

check('no registered doorway is an unfired hole', holes.length === 0, holes.slice(0, 6));
check('no registered doorway that fires is walled off', walled.length === 0, walled.slice(0, 6));
check('no shell wall has a span that neither blocks nor fires (the five-pocket class)',
  wallHoles.length === 0, wallHoles.slice(0, 8));
console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : `\nALL CLEAN — every wall of ${ROOMS.length} rooms either stops you or takes you somewhere.`);
await b.close();
process.exit(errors.length ? 1 : 0);
