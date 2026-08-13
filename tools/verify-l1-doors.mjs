// EMBER HOLLOW, EVERY ROOM, EVERY DOOR, WALKED.
//
// Dad, on v3.47.3, in a Level 1 room with two shadows still alive in it:
// "unable to go through doors in this room."
//
// That may be the encounter seal doing exactly its job — a room with foes in it
// shuts until they are beaten — or it may be the seal failing to LIFT, which
// would be a child locked in a room forever. The difference is the whole
// question, and no existing suite asks it: verify-level1 checks the region's
// shape, verify-seal proves the mechanism on one room, and verify-playthrough
// clears enemies before it walks.
//
// So this walks Ember Hollow the way a child does. For every room:
//   * is it sealed, and is it sealed for a REASON (foes present, not exempt)?
//   * while sealed, is every doorway solid and silent — a lock, not a hole?
//   * when the last foe falls, does the seal lift on its own?
//   * and can Kael then WALK through every single door and arrive somewhere?
//
// The last one is the one that matters. A door that opens but does not take you
// anywhere is what dad is describing, and it can only be found by going through.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// Ember Hollow in play order: the spine, its pockets, and its four gates.
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
  // A CHILD'S KIT AT THIS POINT IN THE GAME, not a debug loadout. Ember Hollow
  // is played as the Knight and the Dark Wolf and nothing else — giving the
  // test every form would let it solve doors a real player cannot.
  g.state.formsUnlocked = ['knight', 'dark_wolf'];
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
const wire = async () => page.evaluate(() => {
  const g = window.__game;
  if (g.input.__wired) return true;
  const real = g.input.getMove.bind(g.input);
  g.input.getMove = () => (window.__stick ? { x: window.__stick.x, z: window.__stick.z } : real());
  g.input.__wired = true;
  return true;
});
await wire();

// Walk at a door from three metres inside the room, holding the stick, counting
// the same clamped step js/main.js counts.
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

console.log('\n── 1. which rooms shut, and do they shut for a reason ──');
const state = {};
for (const room of L1) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  state[room] = await page.evaluate(() => {
    const w = window.__game.world, m = w.markers || {};
    return {
      sealed: !!w.sealed,
      foes: (w.enemies || []).filter((e) => !e.dead && !e.scenery && e.takeStun).length,
      doors: (w.doors || []).map((d) => d.to),
      exempt: !!(m.restSpot || m.sparkSpot || m.shrineSpot)
        || (w.doors || []).some((d) => d.to === 'den'),
    };
  });
  const s = state[room];
  console.log(`  ${room.padEnd(5)} sealed=${s.sealed ? 'Y' : 'n'} foes=${s.foes} doors=${s.doors.join(',')}${s.exempt ? '  [exempt]' : ''}`);
}
for (const room of L1) {
  const s = state[room];
  if (!s) continue;
  if (s.sealed) check(`${room} is only shut because there is a fight in it`, s.foes >= 2 && !s.exempt, s);
  if (s.exempt) check(`${room} is exempt and therefore open`, s.sealed === false, s);
}
check('the first room of the game never shuts', state.la && state.la.sealed === false, state.la);

console.log('\n── 2. a shut room is a lock, not a hole ─────────────');
for (const room of L1) {
  const s = state[room];
  if (!s || !s.sealed) continue;
  if (!(await go(room))) continue;
  const d = await page.evaluate(() => {
    const w = window.__game.world;
    return (w.doors || []).map((x) => {
      const cx = (x.minX + x.maxX) / 2, cz = (x.minZ + x.maxZ) / 2;
      const p = w.resolveCircle(cx, cz, 0.12);
      return { to: x.to, solid: Math.hypot(p.x - cx, p.z - cz) > 0.01, fires: !!w.doorAt(cx, cz) };
    });
  });
  check(`${room}: while shut, every doorway stops you and none fire`,
    d.every((x) => x.solid && !x.fires), { room, d });
}

console.log('\n── 3. beating the room opens it, on its own ─────────');
for (const room of L1) {
  const s = state[room];
  if (!s || !s.sealed) continue;
  if (!(await go(room))) continue;
  const lifted = await page.evaluate(async () => {
    const g = window.__game, w = g.world;
    for (const e of (w.enemies || [])) if (!e.scenery && e.takeStun) e.dead = true;
    for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
    return { sealed: !!w.sealed };
  });
  check(`${room}: the way out opens when the last shadow falls`, lifted.sealed === false, { room, ...lifted });
}

console.log('\n── 4. and then every door can be WALKED through ──────');
let legs = 0;
for (const room of L1) {
  const s = state[room];
  if (!s) continue;
  for (let i = 0; i < s.doors.length; i++) {
    if (!(await go(room))) break;
    // clear the room first: this section asks whether the door WORKS, not
    // whether the seal works — section 2 already asked that.
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

console.log('\n── 5. and nothing threw while any of that happened ───');
check('no errors anywhere in Ember Hollow', pageErrors.length === 0, pageErrors.slice(0, 5));

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : '\nALL CLEAN — every door in Ember Hollow opens, shuts for a reason, and can be walked through.');
await b.close();
process.exit(errors.length ? 1 : 0);
