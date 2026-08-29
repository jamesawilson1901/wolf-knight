// YOU CANNOT SPRINT THROUGH A FIGHT FOR FREE — AND NO DOOR IS EVER LOCKED.
//
// Dad, overruling the encounter seal: "I wanted not to be able to cross the
// room without being attacked at all. I wanted enemies to be able to close in
// quicker or more enemies or ranged attacks. don't force the player by locking
// them in the room until all enemies are defeated. terranigma and Zelda never
// did that."
//
// That is two testable promises, and this suite is both of them:
//
//   1. DOORS ARE ALWAYS OPEN. In every room, with every enemy alive, every
//      door without a puzzle/boss condition fires. The lock must never come
//      back by accident.
//
//   2. THE CROSSING COSTS. In every room with a real fight in it, a child who
//      holds the stick straight through — no fighting, no dodging, no shield —
//      takes at least one hit before they reach the far door. The Knight, at
//      walking speed, on default difficulty. A skilled child who weaves and
//      times it can still get through clean; a bored straight line cannot.
//
// The sprint is the real input path (the stick), real seconds are simulated
// seconds (js/main.js clamps its step to 0.05), and the hits are the real
// hurt() path with iframes ticking normally.
import { launchBrowser } from './launch.mjs';
import { allRooms } from './all-rooms.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// Every room, so promise 1 is game-wide. Promise 2 applies where a fight lives.
// Name rooms on the command line to iterate on just those.
const ONLY = process.argv.slice(2);

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'GAUNT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
// EVERY ROOM THE GAME ROUTES TO, ASKED OF THE GAME (tools/all-rooms.mjs).
// This was a literal array and had never heard of the Village's ten rooms, the
// Spire's five, or the three shortcut rooms in the Wild Woods and Stormreach.
// The registry cannot be wrong about which rooms exist; LEGACY there names the
// rooms still deliberately left out, and why.
const ROOMS = await allRooms(page);
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
  const real = g.input.getMove.bind(g.input);
  g.input.getMove = () => (window.__stick ? { x: window.__stick.x, z: window.__stick.z } : real());
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

console.log('── 1. every non-boss door fires with every enemy alive ──');
const fights = [];
let doorsChecked = 0;
for (const room of (ONLY.length ? ONLY : ROOMS)) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const r = await page.evaluate(() => {
    const g = window.__game, w = g.world, m = w.markers || {};
    const foes = (w.enemies || []).filter((e) => !e.dead && !e.scenery && e.takeStun).length;
    const doors = (w.doors || []).map((d) => {
      const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
      return { to: d.to, gated: !!(d.when && !d.when()), fires: !!w.doorAt(cx, cz),
        cx, cz };
    });
    return { foes, doors, boss: !!w.boss || !!w.warden,
      camp: !!(m.restSpot || m.sparkSpot || m.shrineSpot) };
  });
  doorsChecked += r.doors.length;
  const shut = r.doors.filter((d) => !d.gated && !d.fires);
  if (shut.length) check(`${room}: every ungated door fires mid-fight`, false, { room, shut });
  if (r.foes >= 2 && !r.boss && !r.camp) fights.push({ room, foes: r.foes, doors: r.doors });
}
check(`all ungated doors fire with enemies alive (${doorsChecked} doors)`,
  !errors.some((e) => e.includes('fires mid-fight')));

console.log(`\n── 2. the crossing costs (${fights.length} fight rooms) ──`);
// Hold the stick from just inside the entry door straight at the farthest
// door. Knight form, default difficulty, shield down, no attacks.
for (const f of fights) {
  if (!(await go(f.room))) continue;
  const r = await page.evaluate(async () => {
    const g = window.__game, w = g.world;
    g.state.form = 'knight';
    const mids = (w.doors || []).map((d) => ({ to: d.to,
      x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 }));
    if (mids.length < 2) return { skip: 'one door' };
    // the longest through-line in the room
    let A = mids[0], B = mids[1], best = -1;
    for (const a of mids) for (const c of mids) {
      const dd = Math.hypot(a.x - c.x, a.z - c.z);
      if (dd > best) { best = dd; A = a; B = c; }
    }
    // start just inside door A
    const inA = Math.hypot(A.x, A.z) || 1;
    g.player.root.position.set(A.x - (A.x / inA) * 1.2, g.player.root.position.y, A.z - (A.z / inA) * 1.2);
    g.player._vel.x = 0; g.player._vel.z = 0;
    g.player.iframes = 0;
    g.player.hearts = 12; g.player.maxHearts = 12;   // survive the whole lesson
    const h0 = g.player.hearts;
    const room0 = g.state.room;
    let simmed = 0, last = performance.now(), guard = 0;
    while (simmed < 14 && guard++ < 3000) {
      const dx = B.x - g.player.root.position.x, dz = B.z - g.player.root.position.z;
      const dd = Math.hypot(dx, dz) || 1;
      window.__stick = { x: dx / dd, z: dz / dd };
      await new Promise((res) => requestAnimationFrame(res));
      const now = performance.now();
      simmed += Math.min((now - last) / 1000, 0.05);
      last = now;
      if (g.state.room !== room0) break;                       // made it out
      if (g.player.hearts < h0 && g.state.roomChanged !== room0) { /* keep walking */ }
    }
    window.__stick = null;
    return { from: A.to, to: B.to, len: +best.toFixed(1),
      hits: +(h0 - g.player.hearts).toFixed(1),
      out: g.state.room !== room0, secs: +simmed.toFixed(1) };
  });
  if (r.skip) { console.log(`· ${f.room} — ${r.skip}`); continue; }
  check(`${f.room}: a blind sprint takes a hit (${f.foes} foes, ${r.len}u line)`,
    r.hits > 0, { room: f.room, ...r });
}

console.log('\n── 3. nothing threw ──────────────────────────────────');
check('no errors while the whole game was crossed at a run', pageErrors.length === 0, pageErrors.slice(0, 5));

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : '\nALL CLEAN — no door ever locks, and no fight can be sprinted through for free.');
await b.close();
process.exit(errors.length ? 1 : 0);
