// PUP TUG, driven end to end (js/mg-tug.js) on the shared harness. Every
// haul is a real mouse press held on the harness's #mg-tap layer and every
// rest a real release — the input a child's thumb makes. What it proves:
// holding hauls and strains the rope, letting go rests it, holding too long
// slips the rope (ground lost, nothing else), a steady rhythm pulls the pup
// over the line for the points and brings the next pup, and nothing is left
// behind — the meter, the rope, the pup, or a pointer listener.
import { launchBrowser } from './launch.mjs';
import { restCalls as restCallsAt } from './mg-rest.mjs';

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
await page.fill('#t-name', 'TUG');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.player.iframes = 999999;
  g.CONFIG.DIFFICULTY.GUIDE_IDLE_S = 1e9;
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};
const frames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);
const RING = { x: -1.4, z: 5.6 };
const hasRing = () => page.evaluate(() => (window.__game.world.denGames || []).some((g) => g.id === 'tug'));

// 1. LOCKED below Tier 3
await page.evaluate(() => { const r = {}; for (let i = 0; i < 8; i++) r['f' + i] = 1; window.__game.state.flags.rescued = r; });
check('the Den builds', await go('den'));
check('eight rescues: no Pup Tug ring yet', !(await hasRing()));
await page.evaluate(() => { window.__game.state.flags.rescued.f8 = 1; });
await go('g1');
check('nine rescues (Tier 3): the Den has a Pup Tug ring', (await go('den')) && await hasRing());

// the draw-call baseline, the verify-minigame discipline (creatures hidden)
const REST = { x: -6, z: 0 };
const restCalls = () => restCallsAt(page, REST);
const baseline = await restCalls();

// 2. walk in, skip the demo
await page.evaluate((r) => { window.__game.player.root.position.set(r.x, 0, r.z); }, RING);
await frames(8);
const opened = await page.evaluate(() => ({ active: window.__game.world.harness.active, phase: window.__game.world.harness.phase,
  meter: !!document.getElementById('mgt-meter'), game: window.__game.world.harness._live && window.__game.world.harness._live.constructor.name }));
check('walking into the ring opens Pup Tug with its strain meter', opened.active && opened.meter, opened);
if (opened.phase === 'demo') { await page.locator('#mg-tap').dispatchEvent('pointerdown'); await page.mouse.up(); }
await frames(3);

const st = () => page.evaluate(() => { const g = window.__game.world.harness._live;
  return { holding: g.holding, strain: +g.strain.toFixed(2), pos: +g.pos.toFixed(2), pupN: g.pupN, slipped: g.slipped,
    score: Number(document.getElementById('mg-score').textContent), phase: window.__game.world.harness.phase }; });
const waitFor = (fn, arg, ms = 15000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => {});

// 3. a hold hauls: the pup comes in and the strain climbs
const s0 = await st();
await page.mouse.move(370, 180);
await page.mouse.down();
await waitFor(() => window.__game.world.harness._live.strain > 0.3);
const s1 = await st();
check('holding hauls: the pup comes in and the rope strains', s1.holding && s1.pos < s0.pos && s1.strain >= 0.25, { s0, s1 });

// 4. letting go rests the rope
await page.mouse.up();
await waitFor(() => window.__game.world.harness._live.strain < 0.05);
const s2 = await st();
check('letting go: the strain falls away', !s2.holding && s2.strain < 0.05, s2);

// 5. hold too long: the rope slips — ground lost, nothing else
const before = await st();
await page.mouse.down();
await waitFor(() => window.__game.world.harness._live.slipped === true, null, 20000);
const s3 = await st();
await page.mouse.up();
check('holding too long slips the rope: the strain resets and the pup gets some ground back, no lockout',
  s3.slipped && s3.strain < 0.5 && s3.score === before.score && s3.phase === 'play', { before, s3 });

// 6. a steady rhythm wins: hold, rest, hold... until he crosses the line
const pupBefore = (await st()).pupN, scoreBefore = (await st()).score;
for (let k = 0; k < 40; k++) {
  const now = await st();
  if (now.pupN > pupBefore || now.score > scoreBefore) break;
  await page.mouse.down();
  await waitFor(() => window.__game.world.harness._live.strain > 0.6 || window.__game.world.harness._live.pupN > 0 && window.__game.world.harness._live._won > 0, null, 6000);
  await page.mouse.up();
  await waitFor(() => window.__game.world.harness._live.strain < 0.15, null, 6000);
}
await waitFor((n) => window.__game.world.harness._live.pupN > n, pupBefore, 8000);
const s4 = await st();
check('a steady haul-and-rest pulls him over the line: +3 (the rope slipped this time, so no clean bonus)',
  s4.score === scoreBefore + 3, { scoreBefore, s4 });
check('...and the next, stronger pup takes the rope', s4.pupN === pupBefore + 1 && s4.pos > 3, s4);

// 7. the clock, results
await page.evaluate(() => { window.__game.world.harness.update(99, 0); });
await frames(3);
const res = await page.evaluate(() => ({ phase: window.__game.world.harness.phase, best: (window.__game.state.minigames.tug || {}).best }));
check('the clock ends on the results card, with a personal best', res.phase === 'results' && res.best > 0, res);

// 8. out: meter gone, no listener left holding the rope, nothing in the room
await page.locator('#mg-leave').dispatchEvent('pointerdown');
await frames(4);
check('the strain meter leaves the screen', await page.evaluate(() => !document.getElementById('mgt-meter')));
await page.evaluate(() => { window.__game.player.root.position.set(-6, 0, 0); });
const final = await restCalls();
check('leaving leaves nothing in the room', final.children === baseline.children, { before: baseline.children, after: final.children });
check('draw calls return to where they started (exact)', final.calls === baseline.calls, { before: baseline.calls, after: final.calls });

check('no page errors', !errors.some((e) => e.startsWith('PAGEERROR')), errors.filter((e) => e.startsWith('PAGEERROR')).slice(0, 3));
console.log(errors.length ? `\n✗ FAIL — ${errors.length}` : '\n✓ PASS — Pup Tug: haul, rest, slip and go again, and the pup comes over the line');
await b.close();
process.exit(errors.length ? 1 : 0);
