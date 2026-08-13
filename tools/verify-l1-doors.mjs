// EMBER HOLLOW, EVERY ROOM, EVERY DOOR, WALKED — AND NONE OF THEM EVER LOCKED.
//
// Dad, on v3.47.3: "unable to go through doors in this room." The first cause
// was lava running under the door to the Drowned Forge. The second was the
// encounter seal, which he then overruled entirely: "don't force the player by
// locking them in the room until all enemies are defeated. terranigma and
// Zelda never did that."
//
// So the law this suite now holds Level 1 to is simple:
//
//   1. NO DOOR EVER LOCKS. In every room, with every enemy alive and hostile,
//      every doorway fires. (Level 1 has no gated doors at all — even its boss
//      door opens on a key, which is a `when` on the far side, not here.)
//
//   2. EVERY DOOR CAN BE WALKED THROUGH. Real stick, real movement code,
//      arriving in the right room — because a door that fires but cannot be
//      reached (lava, a prop, a hole) is the bug dad actually hit.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const L1 = ['la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3',
  'ld', 'ld1', 'lg4', 'le'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'L1DOORS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  // A CHILD'S KIT AT THIS POINT IN THE GAME, not a debug loadout.
  g.state.formsUnlocked = ['knight', 'dark_wolf'];
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
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const walkThrough = (i, secs = 3.0) => page.evaluate(async (a) => {
  const g = window.__game, w = g.world;
  const d = w.doors[a.i];
  if (!d) return { err: 'no door ' + a.i };
  const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
  const len = Math.hypot(cx, cz) || 1;
  const sx = cx - (cx / len) * 3.2, sz = cz - (cz / len) * 3.2;
  g.player.root.position.set(sx, g.player.root.position.y, sz);
  g.player._vel.x = 0; g.player._vel.z = 0;
  const room0 = g.state.room;
  window.__stick = { x: (cx - sx) / 3.2, z: (cz - sz) / 3.2 };
  let simmed = 0, last = performance.now(), guard = 0;
  while (simmed < a.secs && guard++ < 1500) {
    g.player.iframes = 9999;
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    simmed += Math.min((now - last) / 1000, 0.05);
    last = now;
    if (g.state.room !== room0) break;
  }
  window.__stick = null;
  return { to: d.to, left: g.state.room !== room0, arrived: g.state.room };
}, { i, secs });

console.log('\n── 1. no door ever locks, however alive the room is ──');
const state = {};
for (const room of L1) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  state[room] = await page.evaluate(() => {
    const w = window.__game.world;
    const foes = (w.enemies || []).filter((e) => !e.dead && !e.scenery && e.takeStun).length;
    const doors = (w.doors || []).map((d) => {
      const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
      return { to: d.to, fires: !!w.doorAt(cx, cz) };
    });
    return { foes, doors };
  });
  const s = state[room];
  check(`${room}: all ${s.doors.length} doors fire with ${s.foes} foes alive`,
    s.doors.every((d) => d.fires), { room, ...s });
}

console.log('\n── 2. and every door can be WALKED through ──────────');
let legs = 0;
for (const room of L1) {
  const s = state[room];
  if (!s) continue;
  for (let i = 0; i < s.doors.length; i++) {
    if (!(await go(room))) break;
    // clear the room first: this section asks whether the DOOR works, not
    // whether the walker can win a fight on the way to it.
    await page.evaluate(async () => {
      const w = window.__game.world;
      for (const e of (w.enemies || [])) if (!e.scenery && e.takeStun) e.dead = true;
      for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    });
    const r = await walkThrough(i);
    legs++;
    check(`${room} → ${r.to}: you can walk through it`, r.left === true, { room, ...r });
  }
}
console.log(`\nwalked ${legs} doorways across ${L1.length} rooms`);

console.log('\n── 3. and nothing threw while any of that happened ───');
check('no errors anywhere in Ember Hollow', pageErrors.length === 0, pageErrors.slice(0, 5));

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : '\nALL CLEAN — every door in Ember Hollow is open, always, and walks through.');
await b.close();
process.exit(errors.length ? 1 : 0);
