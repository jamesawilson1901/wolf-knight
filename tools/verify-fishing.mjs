// FISHING, WALKED. design/WIDER-WORLD.md §3.4's own minigame (js/mg-fish.js,
// v3.167): are all three hosts (s1a, d1a, q1) standing on real water with a
// clear footprint, does stepping onto a ring open the harness, does casting
// cost nothing, does the hook window actually open and score, does a round
// end with a species won, and does exiting leave zero residue.
import { launchBrowser } from './launch.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'FISHING');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});

const SPOTS = [
  { room: 's1a', x: -6, z: 10 },
  { room: 'd1a', x: -8, z: 9 },
  { room: 'q1', x: 3, z: -5 },
];

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

for (const spot of SPOTS) {
  if (!(await go(spot.room))) { check(`${spot.room} builds`, false); continue; }
  const info = await page.evaluate(([x, z]) => {
    const w = window.__game.world;
    const push = (() => { const s = w.resolveCircle(x, z, 0.78); return Math.hypot(s.x - x, s.z - z); })();
    // find the ring itself (a THREE.Mesh with RingGeometry we just added) near (x,z)
    let ringFound = false;
    w.root.traverse((n) => {
      if (n.isMesh && n.geometry && n.geometry.type === 'RingGeometry') {
        if (Math.hypot(n.position.x - x, n.position.z - z) < 0.5) ringFound = true;
      }
    });
    return { push, ringFound, hasUpdateMinigames: typeof w.updateMinigames === 'function' };
  }, [spot.x, spot.z]);
  check(`${spot.room} ring installed at (${spot.x},${spot.z})`, info.ringFound, info);
  check(`${spot.room} host spot is clear (no collider push)`, info.push < 1e-6, info);
}

// Full flow smoke test at s1a — walk to the ring, open it, cast, wait for a
// bite, hook it, run the clock out, and confirm a clean teardown.
if (await go('s1a')) {
  await page.evaluate(() => {
    const g = window.__game;
    // a fresh profile has never played, so opening would show the 3.5s demo
    // first — recorded here as already-played so this test drives the real
    // tap path instead of the demo's own self-playing one.
    (g.state.minigames || (g.state.minigames = {})).fish = { best: 0, won: [], plays: 1 };
    g.player.root.position.set(-6, 0, 10);
    g.player.x = -6; g.player.z = 10;
  });
  await page.waitForTimeout(300);
  // NOTE: the chip and the open happen in the SAME updateMinigames() call —
  // stepping onto the ring auto-opens the game the instant `nearRing` is
  // true, the same one-frame-then-gone chip behaviour Fetch's own host
  // already has (js/minigames.js makeFetchHost). There is no separate
  // "chip showing, not yet opened" state to catch from outside.
  const opened = await page.evaluate(() => {
    const g = window.__game;
    g.world.updateMinigames(0.016, 0, g.player);
    return { active: g.world.harness.active, phase: g.world.harness.phase };
  });
  check('stepping onto the ring opens the fishing harness in play (demo skipped)',
    opened.active && opened.phase === 'play', opened);

  const cast = await page.evaluate(() => {
    const g = window.__game;
    g.world.harness._onTap(new Event('pointerdown'));
    return document.getElementById('mg-score').textContent;
  });
  check('first tap casts (no score yet)', cast === '0', { cast });

  // drive real frames through out(0.55s) → bite(0.6-1.5s, RANDOM) →
  // closing(0.9s), tapping every step along the way — the window is only
  // 0.3s wide and its start floats with the random bite delay, so a single
  // fixed-time tap is a coin flip; mashing throughout is exactly what §2
  // promises a five-year-old gets away with, and it is what actually proves
  // the window opens at all rather than proving one lucky guess.
  const hook = await page.evaluate(() => {
    const g = window.__game;
    const h = g.world.harness;
    let t = 0;
    for (let i = 0; i < 100; i++) {
      h.update(0.05, t);
      t += 0.05;
      h._onTap(new Event('pointerdown'));
    }
    return { score: document.getElementById('mg-score').textContent };
  });
  check('mashing through the cast/bite/window cycle scores a hook', hook.score === '1' || hook.score === '2', hook);

  // run the clock out (40s) and confirm the results screen + reward pool
  const finished = await page.evaluate(() => {
    const g = window.__game;
    const h = g.world.harness;
    let t = 3;
    for (let i = 0; i < 900; i++) { h.update(0.05, t); t += 0.05; }   // ~45s
    return {
      phase: h.phase,
      resultsShown: document.getElementById('mg-results').style.display !== 'none',
      won: (g.state.minigames.fish.won || []).slice(),
      plays: g.state.minigames.fish.plays,
    };
  });
  check('the round ends on the results screen with a species won',
    finished.phase === 'results' && finished.resultsShown && finished.won.length >= 1, finished);

  const residue = await page.evaluate(() => {
    const g = window.__game;
    g.world.harness.exit();
    return { residue: g.world.harness.residue(g.world), active: g.world.harness.active };
  });
  check('exiting tears down with zero residue (harness.residue)', residue.residue === 0 && !residue.active, residue);
}

console.log('\nERRORS', JSON.stringify(errs.slice(0, 10)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS');
await b.close();
process.exit(errs.length ? 1 : 0);
