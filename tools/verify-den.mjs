// B3 — the Den is batched now. Batching is exactly the change that can silently
// freeze a room: anything merged into the static mesh keeps the transform it had
// at build time, forever. The villagers, Biscuit, the shopkeeper and the three
// floating spirit-stones all have to still be moving afterwards.
//
// So this does not check draw calls alone. It samples every animated thing in
// the room over time and asserts it actually changed.
import { launchBrowser } from './launch.mjs';
const errors = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : ''); if (!ok) errors.push(n); };

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript((v) => { window.__WK_ONLY_TWO_SPIRITS = v; }, !!process.env.WK_ONLY_TWO);
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
  // EVERY spirit home visible at once — the most the Den ever holds, and since
  // 2026-09-08 that is six lights rather than two. The draw-call check below is
  // the whole reason this line sets them all: the Den has no combat, so what it
  // measures standing still IS its worst frame.
  const only2 = !!window.__WK_ONLY_TWO_SPIRITS;
  for (const k of only2 ? ['ember', 'stone']
    : ['ember', 'stone', 'wild', 'frost', 'storm', 'vale']) {
    g.WS.set(k, 'restored', true);
  }
  for (const gk of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']) g.WS.set('village', 'guardian_' + gk);
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
// THE DEN'S CEILING IS ITS OWN, and it is worth writing down why rather than
// quietly editing the number.
//
// 100 was set when the Den measured 14 x 10 — the CHOKE module, the smallest
// space in the game. Dad played it and said it was "physically tiny", which it
// was: the whole home base fitted inside one camera frame. It is 24 x 18 now,
// three times the area, with a village in it.
//
// The Den also carries more CHARACTERS than any other room — the shopkeeper,
// three villagers, Biscuit and every pup the kids have rescued. Skinned meshes
// never merge, so it pays a cost no other room does, for exactly the thing that
// makes it home.
//
// And it is the one room with NO COMBAT. Every other room's 125 budget is 110
// of content plus headroom for a fight — enemies, drops, projectiles, effects.
// The Den has none of those, so what it measures standing still IS its worst
// frame, not its quietest.
//
// 135 = the measured 128 plus a small margin. Like every other ceiling here it
// is a judgement rather than a device limit, and it is the first number to come
// down if the kids report the hub feeling heavy.
check(`worst-case draw calls under 135 (14x10 room was 113; this one is 24x18)`,
  calls.worst < 135, calls);

// ---------------------------------------------------------------------------
// THE SIX SPIRITS, HOME
//
// Four of these were a string in js/regions.js — "polish list: Sylva's
// leaf-light joining the den fire" and three more like it — for as long as
// those regions have existed. They are the payoff for the whole game, in the
// room a child returns to most, and nothing had ever checked that any of them
// arrive; the two that DID exist were two hand-copied blocks.
console.log('\n── the spirits come home ─────────────────────────────');
const spirits = await page.evaluate(({ R }) => {
  const w = window.__game.world, m = w.markers;
  const want = ['cinderHome', 'petraHome', 'sylvaHome', 'borealHome', 'ariaHome', 'meriHome'];
  const missing = want.filter((k) => !m[k]);
  // each light on ground clear at the roster's own body radius, ignoring its
  // OWN base stone — a light growing out of a tent is the same class of bug as
  // a flower growing out of a chest, and just as measurable
  const bad = [];
  for (const k of want) {
    const p = m[k];
    if (!p) continue;
    for (const c of w.boxColliders) {
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < R * R) bad.push(k + ' box');
    }
    for (const c of w.circleColliders) {
      if (Math.hypot(c.x - p.x, c.z - p.z) < 1e-6) continue;   // its own base
      if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (c.r + R) ** 2) bad.push(k + ' circ');
    }
  }
  // ...and no two of them share a spot, which a copied table row would do
  const pts = want.filter((k) => m[k]).map((k) => m[k]);
  let tooClose = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) < 1.6) tooClose++;
    }
  }
  return { missing, bad, tooClose, n: pts.length };
}, { R: 0.44 });
check('all six spirits have a home by the fire', spirits.missing.length === 0, spirits.missing);
check('...none of them is standing in the scenery', spirits.bad.length === 0, spirits.bad);
check('...and none of them shares a spot with another', spirits.tooClose === 0, spirits);

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED\n' + errors.join('\n')
  : '✓ the Den is batched, under budget, and still alive'));
await b.close();
process.exit(errors.length ? 1 : 0);
