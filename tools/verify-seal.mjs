// A LOCKED ROOM HAS TO BE MADE OF SOMETHING.
//
// Dad, on v3.47.1: "door ways don't take you to the next room in the level.
// they just let you wonder around in the black nothing."
//
// He was walking out of a room the encounter seal had shut. A doorway is a HOLE
// in the wall — there is no collider in an opening, because the door trigger is
// what catches a child standing in it. doorAt() returns null while a room is
// sealed, so the seal did not lock the room: it removed the only thing guarding
// the gap, and a five-year-old walked off the edge of the world.
//
// The seal now puts a real box in each opening. This proves three things that
// have to be true together, because any two of them without the third is the
// bug again:
//
//   1. a sealed room CANNOT be walked out of, at any door;
//   2. clearing it opens every one of those doors;
//   3. and a room that never sealed was never blocked in the first place.
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
await page.fill('#t-name', 'SEAL');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
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

// Stand a body ON the middle of a doorway and ask the world where it ends up.
// This is the collision code the player runs, at the player's own radius — not
// a re-implementation of it, which would prove nothing about the game.
const doorPush = () => page.evaluate(() => {
  const g = window.__game, w = g.world;
  return (w.doors || []).map((d) => {
    const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
    const out = w.resolveCircle(cx, cz, 0.12);
    return { to: d.to, cx: +cx.toFixed(2), cz: +cz.toFixed(2),
      moved: +Math.hypot(out.x - cx, out.z - cz).toFixed(2),
      trigger: !!w.doorAt(cx, cz) };
  });
});

// ...and then walk there for real, holding the stick, because a body pushed out
// of a box in one step can still tunnel through it over many.
const wired = await page.evaluate(() => {
  const g = window.__game;
  if (!g.input || !g.input.getMove) return false;
  const real = g.input.getMove.bind(g.input);
  g.input.getMove = () => (window.__stick ? { x: window.__stick.x, z: window.__stick.z } : real());
  return true;
});
check('the test can drive the real stick', wired === true);

// SIMULATED seconds, the way verify-storm learned to count them: js/main.js
// clamps its step to Math.min(realDt, 0.05), so wall-clock here measures the
// CPU rather than the game.
const walkAt = (door, secs = 2.2) => page.evaluate(async (a) => {
  const g = window.__game, w = g.world;
  const d = w.doors[a.i];
  const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
  // start three metres inside the room, on the line through the opening
  const inx = Math.sign(0 - cx) || 0, inz = Math.sign(0 - cz) || 0;
  const sx = cx + inx * 3, sz = cz + inz * 3;
  g.player.root.position.set(sx, g.player.root.position.y, sz);
  g.player._vel.x = 0; g.player._vel.z = 0;
  const room0 = g.state.room;
  const len = Math.hypot(cx - sx, cz - sz) || 1;
  window.__stick = { x: (cx - sx) / len, z: (cz - sz) / len };
  let simmed = 0, last = performance.now(), guard = 0;
  while (simmed < a.secs && guard++ < 1200) {
    g.player.iframes = 9999;
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    simmed += Math.min((now - last) / 1000, 0.05);
    last = now;
    if (g.state.room !== room0) break;
  }
  window.__stick = null;
  return { to: d.to, left: g.state.room !== room0, now: g.state.room,
    px: +g.player.root.position.x.toFixed(2), pz: +g.player.root.position.z.toFixed(2),
    doorX: +cx.toFixed(2), doorZ: +cz.toFixed(2) };
}, { i: door, secs });

// A room that seals: two or more foes, no camp, no shrine, no way home to the
// Den. `lb` is the third room of Ember Hollow and has shut in every probe run.
const ROOM = process.argv[2] || 'lb';

console.log('\n── 1. the room shuts ─────────────────────────────────');
check('the room builds', await go(ROOM));
const armed = await page.evaluate(() => ({
  sealed: !!window.__game.world.sealed,
  foes: (window.__game.world.enemies || []).filter((e) => !e.dead && !e.scenery && e.takeStun).length,
  doors: (window.__game.world.doors || []).length,
}));
check('it armed its encounter', armed.sealed === true, armed);
check('...with foes in it and doors to leave by', armed.foes >= 2 && armed.doors >= 1, armed);

console.log('\n── 2. and while it is shut, no door is a hole ────────');
const shut = await doorPush();
check('every doorway pushes a body back out', shut.every((d) => d.moved > 0), shut);
check('and no door will fire while sealed', shut.every((d) => !d.trigger), shut);

for (let i = 0; i < armed.doors; i++) {
  const w = await walkAt(i);
  check(`walking flat at the ${w.to} door does not leave the room`, w.left === false, w);
}

console.log('\n── 3. clearing it opens every one of them ────────────');
const cleared = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  for (const e of (w.enemies || [])) if (!e.scenery && e.takeStun) e.dead = true;
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
  return { sealed: !!w.sealed };
});
check('the seal lifts when the last foe falls', cleared.sealed === false, cleared);
const open = await doorPush();
check('every doorway is walkable again', open.every((d) => d.moved === 0), open);
check('...and every door will fire', open.every((d) => d.trigger), open);

const outp = await walkAt(0, 3.0);
check('and walking at a door now takes you to the next room',
  outp.left === true && outp.now !== ROOM, outp);

console.log('\n── 4. a room that never sealed was never blocked ─────');
// `la` holds the way home to the Den and is exempt by design.
check('the Den-facing room builds', await go('la'));
const la = await page.evaluate(() => ({ sealed: !!window.__game.world.sealed }));
check('it does not seal', la.sealed === false, la);
const laDoors = await doorPush();
check('and none of its doorways block', laDoors.every((d) => d.moved === 0), laDoors);

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
