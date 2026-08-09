// THE WIND, AND THE THING THAT CROSSES IT.
//
// verify-level5 proves the twenty rooms join up. This proves the mechanic they
// are built around actually works, through the real input path, at the real
// numbers — because a gale that is merely ALMOST impassable is worse than no
// gate at all: a child batters at it for a minute, gets through by luck, and
// learns that the game's rules are a suggestion.
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
await page.fill('#t-name', 'STORMFX');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.flags.borealDefeated = true;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf'];
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

// WALK, for real seconds, holding the stick — not by teleporting the player and
// asking where they ended up. The whole question is what the movement code does
// with the wind in it.
const walk = (mx, mz, secs, from) => page.evaluate(async (a) => {
  const g = window.__game;
  if (a.from) g.player.root.position.set(a.from.x, 0, a.from.z);
  g.player._vel.x = 0; g.player._vel.z = 0;
  const start = { x: g.player.root.position.x, z: g.player.root.position.z };
  const until = performance.now() + a.secs * 1000;
  window.__stick = { x: a.mx, z: a.mz };
  while (performance.now() < until) await new Promise((r) => requestAnimationFrame(r));
  window.__stick = null;
  const end = { x: g.player.root.position.x, z: g.player.root.position.z };
  return { start, end, dx: +(end.x - start.x).toFixed(2), dz: +(end.z - start.z).toFixed(2) };
}, { mx, mz, secs, from });

// THE STICK, DRIVEN THE WAY A THUMB DRIVES IT. The override wraps the game's
// own Input.getMove rather than moving the player directly, because the whole
// question here is what the MOVEMENT code does with wind in it — and the first
// version of this file could not reach the input at all, so it measured the
// wind blowing a stationary wolf about and called that walking.
const wired = await page.evaluate(() => {
  const g = window.__game;
  if (!g.input || !g.input.getMove) return false;
  const real = g.input.getMove.bind(g.input);
  g.input.getMove = () => (window.__stick ? { x: window.__stick.x, z: window.__stick.z } : real());
  return true;
});
check('the test can drive the real stick', wired === true);

check('the Landing builds', await go('s1b'));

console.log('\n── 1. the three strengths do what they say ───────────');
// s1b's gale sits at x 9, z -6.5, pushing SOUTH (+z). Walking north INTO it
// must lose ground; walking north outside it must gain.
// The assertion is the SIGN, not the distance. Under SwiftShader the frame
// rate is a fraction of a phone's, so the metres walked in 1.6 seconds of
// wall-clock are not a number worth asserting on — but "did he end up further
// north or further south than he started" is exactly the design claim, and it
// does not care how many frames it took.
const clear = await walk(0, -1, 1.6, { x: -2, z: 4 });
check('walking north on open ground gains ground', clear.dz < -1.5, clear);

const intoGale = await walk(0, -1, 1.6, { x: 9, z: -4.6 });
check('walking north INTO a gale loses ground — it is a lock, not a slope',
  intoGale.dz > 0, intoGale);
check('...and the difference between them is the whole region',
  clear.dz < 0 && intoGale.dz > 0, { openGround: clear.dz, intoGale: intoGale.dz });

console.log('\n── 2. ...and the dash crosses it ─────────────────────');
const dashed = await page.evaluate(async () => {
  const g = window.__game;
  g.state.form = 'storm_wolf';
  g.player.setForm('storm_wolf', { silent: true });
  g.player.root.position.set(9, 0, -3.6);
  g.player.root.rotation.y = Math.PI;      // facing north (-z)
  g.player.specialCooldown = 0;
  const z0 = g.player.root.position.z;
  const fired = g.player.trySpecial(g.effects, g.world);
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  return { fired, z0: +z0.toFixed(2), z1: +g.player.root.position.z.toFixed(2) };
});
check('the thunder-dash fires as the Storm Wolf', dashed.fired === true, dashed);
check('and it carries Kael clean through the gale',
  dashed.z1 < dashed.z0 - 3.0, dashed);

console.log('\n── 3. no other form can cross ────────────────────────');
const knightTry = await page.evaluate(async () => {
  const g = window.__game;
  g.player.setForm('knight', { silent: true });
  g.player.root.position.set(9, 0, -3.6);
  g.player.root.rotation.y = Math.PI;
  g.player.specialCooldown = 0;
  const z0 = g.player.root.position.z;
  g.player.trySpecial(g.effects, g.world);
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  return { z0: +z0.toFixed(2), z1: +g.player.root.position.z.toFixed(2) };
});
check('the Knight\'s spin does not get him across', knightTry.z1 > knightTry.z0 - 3.0, knightTry);

console.log('\n── 4. the vanes turn, and the wind turns with them ────');
check('the Vanes room builds', await go('svn'));
const vanes = await page.evaluate(async () => {
  const g = window.__game;
  const v = g.world.vanes[0];
  const before = { dir: v.lane.dir, px: +v.lane.px.toFixed(1), pz: +v.lane.pz.toFixed(1) };
  v.turn();
  await new Promise((r) => requestAnimationFrame(r));
  const after = { dir: v.lane.dir, px: +v.lane.px.toFixed(1), pz: +v.lane.pz.toFixed(1) };
  return { before, after, lanes: g.world.galeLanes.length };
});
check('turning a vane turns its lane', vanes.before.dir !== vanes.after.dir, vanes);
check('...and the push vector turns with it, not just the model',
  vanes.before.px !== vanes.after.px || vanes.before.pz !== vanes.after.pz, vanes);

// FOUR TURNS COME BACK ROUND. There is no reset button in this room, so the
// only guarantee a child has that they cannot ruin it is that a vane keeps
// going: dash it enough times and it is where it started.
const round = await page.evaluate(async () => {
  const g = window.__game;
  const v = g.world.vanes[0];
  const start = v.lane.dir;
  const seen = [start];
  for (let i = 0; i < 4; i++) { v.turn(); seen.push(v.lane.dir); }
  return { start, seen, back: v.lane.dir === start };
});
check('four turns bring a vane back where it started — nothing can be ruined',
  round.back === true && new Set(round.seen).size === 4, round);

console.log('\n── 5. the puzzle can actually be solved ──────────────');
const solved = await page.evaluate(async () => {
  const g = window.__game;
  // lay every lane ALONG the walking line rather than across it
  for (const v of g.world.vanes) {
    for (let i = 0; i < 4 && Math.abs(v.lane.pz) > Math.abs(v.lane.px); i++) v.turn();
  }
  for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
  return { solved: g.world.markers.puzzleSolved,
    lanes: g.world.galeLanes.map((l) => l.dir) };
});
check('turning all three off the line opens the way', solved.solved === true, solved);

console.log('\n── 6. the weather costs one draw call, not one each ───');
const cost = await page.evaluate(async () => {
  const g = window.__game;
  const meshes = [];
  g.world.root.traverse((n) => { if (n.isMesh && n.material && n.material.blending === 2) meshes.push(n.name || '(wind)'); });
  return { lanes: g.world.galeLanes.length, additiveMeshes: meshes.length };
});
check('all the wind in a room is one mesh', cost.additiveMeshes <= 2, cost);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN.'));
await b.close();
process.exit(errors.length ? 1 : 0);
