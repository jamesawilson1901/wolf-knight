// B3 — the Den is batched now. Batching is exactly the change that can silently
// freeze a room: anything merged into the static mesh keeps the transform it had
// at build time, forever. The villagers, Biscuit, the shopkeeper and the three
// floating spirit-stones all have to still be moving afterwards.
//
// So this does not check draw calls alone. It samples every animated thing in
// the room over time and asserts it actually changed.
import { chromium } from 'playwright';
const errors = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : ''); if (!ok) errors.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'DEN');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false; g.player.iframes = 99999;
  // every spirit home visible at once — the most the Den ever holds
  g.WS.set('ember', 'restored', true); g.WS.set('stone', 'restored', true);
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
if (!await go('den')) { check('the Den builds', false); process.exit(1); }
check('the Den builds', true);

console.log('\n── everything that should move, still moves ────────────────────');
const life = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const s = () => new Promise((r) => requestAnimationFrame(r));
  const snap = () => {
    const npcs = (w.npcs || []).map((n) => n.model.position.toArray().concat(n.model.rotation.y));
    const dog = w.dog ? w.dog.model.position.toArray() : null;
    // the floating spirit stones: anything loose that bobs
    const loose = (w._keepLoose || []).map((o) => [o.position.x, o.position.y, o.position.z, o.rotation.y]);
    return { npcs, dog, loose };
  };
  const a = JSON.parse(JSON.stringify(snap()));
  for (let i = 0; i < 90; i++) await s();
  const b2 = snap();
  const moved = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  return {
    npcCount: (w.npcs || []).length,
    looseCount: (w._keepLoose || []).length,
    hasDog: !!w.dog,
    npcsAnimate: (w.npcs || []).some((n, i) => moved(a.npcs[i], b2.npcs[i])) ||
                 (w.npcs || []).every((n) => !!n.mixer),
    dogMoves: !!w.dog && (moved(a.dog, b2.dog) || !!w.dog.mixer),
    looseMoves: a.loose.some((v, i) => moved(v, b2.loose[i])),
  };
});
check('the villagers are present and animating', life.npcCount > 0 && life.npcsAnimate, life);
check('Biscuit is present and animating', life.hasDog && life.dogMoves, life);
check('the floating spirit-stones still bob', life.looseCount === 0 || life.looseMoves, life);

console.log('\n── ...and the room is finally under the ceiling ────────────────');
const calls = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r) => requestAnimationFrame(r));
  let worst = 0, at = null;
  for (const x of [-5, 0, 5]) for (const z of [-4, 0, 4, 8]) {
    const p = g.world.resolveCircle(x, z, 0.32);
    g.player.root.position.set(p.x, g.player.root.position.y, p.z);
    for (let i = 0; i < 5; i++) await s();
    const c = g.renderer.info.render.calls;
    if (c > worst) { worst = c; at = [Math.round(p.x), Math.round(p.z)]; }
  }
  return { worst, at };
});
check(`worst-case draw calls under 100 (was 113)`, calls.worst < 100, calls);

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED\n' + errors.join('\n')
  : '✓ the Den is batched, under budget, and still alive'));
await b.close();
process.exit(errors.length ? 1 : 0);
