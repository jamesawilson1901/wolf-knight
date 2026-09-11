// WHICH WOLF?, driven end to end — the second game on the shared harness
// (js/minigame.js), and the first that is choice-based rather than
// tap-anywhere (js/mg-quiz.js). Mirrors tools/verify-minigame.mjs's own
// structure and rigor; the parts that differ are exactly the parts that
// differ in the game — several positioned cards instead of one big tap
// layer, and a picture-matching round instead of a catch.
import { launchBrowser } from './launch.mjs';

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
await page.fill('#t-name', 'QUIZ');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
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
check('the Den builds', await go('den'));

const frames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);

// same baseline discipline as verify-minigame.mjs: same spot, camera settled,
// median of five samples — see that file's own long comment for why
const REST = { x: -6, z: 0 };
const restCalls = () => page.evaluate(async (p) => {
  const g = window.__game;
  const wait = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
  g.player.root.position.set(p.x, 0, p.z);
  await wait(60);
  const s = [];
  for (let i = 0; i < 5; i++) { s.push(g.renderer.info.render.calls); await wait(12); }
  s.sort((a, b) => a - b);
  return { children: g.world.root.children.length, calls: s[2], samples: s };
}, REST);
const baseline = await restCalls();

// walk to the ring the way a child does (tools/probe-freespot.mjs's own spot)
await page.evaluate(() => { window.__game.player.root.position.set(-2, 0, -7); });
await frames(8);
// the demo's own board only appears once the harness's demo clock passes
// 0.3s (js/mg-quiz.js's `_demoStarted` guard) — wait for the real cards
// rather than a fixed frame count, which is exactly the flake this avoids
await page.waitForFunction(() => {
  const row = document.getElementById('mgq-row');
  return row && row.children.length >= 2;
}, null, { timeout: 5000 });
const opened = await page.evaluate(() => ({
  active: window.__game.world.harness.active,
  phase: window.__game.world.harness.phase,
  hud: getComputedStyle(document.getElementById('mg-hud')).display !== 'none',
  demo: getComputedStyle(document.getElementById('mg-demo')).display !== 'none',
  cue: getComputedStyle(document.getElementById('mgq-cue')).display !== 'none',
  cards: document.getElementById('mgq-row').children.length,
}));
check('walking into the ring opens the game', opened.active === true, opened);
check('a first-time player is shown the demo', opened.phase === 'demo', opened);
check('the cue and at least two cards are up', opened.cue && opened.cards >= 2, opened);

await page.locator('#mg-tap').dispatchEvent('pointerdown');
await frames(4);
const skipped = await page.evaluate(() => ({
  phase: window.__game.world.harness.phase,
  demo: getComputedStyle(document.getElementById('mg-demo')).display !== 'none',
}));
check('a tap on the shared layer skips the demo into play', skipped.phase === 'play', skipped);
check('and the demo card leaves the screen with it', skipped.demo === false, skipped);

const hudDown = await page.evaluate(() => ['hearts', 'potions', 'btn-attack', 'mg-chip']
  .map((id) => document.getElementById(id))
  .filter((n) => n && getComputedStyle(n).display !== 'none')
  .map((n) => n.id));
check('the world HUD stands down for a round', hudDown.length === 0, { stillUp: hudDown });

// EVERY CARD IS A CONTROL A CHILD AIMS AT, so it gets the same 44px floor
// verify-minigame.mjs already holds the exit and results buttons to.
const cardBoxes = await page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const boxes = Array.from(document.querySelectorAll('.mgq-card')).map((c) => c.getBoundingClientRect());
  return {
    offscreen: boxes.filter((b) => b.x < 0 || b.y < 0 || b.x + b.width > vw || b.y + b.height > vh).length,
    tooSmall: boxes.filter((b) => b.width < 44 || b.height < 44).length,
    n: boxes.length,
  };
});
check('every card is fully on screen and over the 44px floor', cardBoxes.offscreen === 0 && cardBoxes.tooSmall === 0, cardBoxes);

// §2: EVERY GAME IS WINNABLE BY MASHING. Tap every card in the row once —
// order-independent, no need to know which one is the target ahead of time —
// and exactly one of them should score and advance the round.
const mashRound = async () => {
  const before = +(await page.locator('#mg-score').textContent());
  const cardEls = await page.locator('.mgq-card').all();
  const formsBefore = await page.evaluate(() => Array.from(document.querySelectorAll('.mgq-card')).map((c) => c.dataset.form));
  for (const c of cardEls) {
    await c.dispatchEvent('pointerdown');
    await frames(2);
  }
  // the correct-card pause (CORRECT_PAUSE) before the next round is built
  await frames(20);
  const after = +(await page.locator('#mg-score').textContent());
  const formsAfter = await page.evaluate(() => Array.from(document.querySelectorAll('.mgq-card')).map((c) => c.dataset.form));
  return { before, after, formsBefore, formsAfter };
};
const r1 = await mashRound();
check('mashing every card scores exactly one point per round', r1.after === r1.before + 1, r1);
const r2 = await mashRound();
check('a second round follows the first, and also mashes to a win', r2.after === r2.before + 1, r2);

// run the clock out
await page.evaluate(async () => {
  const h = window.__game.world.harness;
  for (let i = 0; i < 400 && h.phase === 'play'; i++) {
    h.update(0.12, i * 0.12);
    await new Promise((r) => requestAnimationFrame(r));
  }
});
const res = await page.evaluate(() => ({
  phase: window.__game.world.harness.phase,
  shown: getComputedStyle(document.getElementById('mg-results')).display !== 'none',
  score: document.getElementById('mg-r-score').textContent,
  bonus: getComputedStyle(document.getElementById('mg-r-bonus')).display !== 'none',
  stored: JSON.parse(JSON.stringify(window.__game.state.minigames || {})),
  gameQuizCounter: window.__game.state.counters.gameQuiz,
  sticker: !!window.__game.state.stickers.game_quiz,
}));
check('the round ends on the clock, not on a failure', res.phase === 'results', { phase: res.phase });
check('the results screen appears', res.shown === true);
check('the best is stored in THIS profile', (res.stored.quiz || {}).best > 0, res.stored);
check('an empty reward pool still pays, and says so differently', res.bonus === true);
check('the first win bumps its own counter and unlocks the sticker', res.gameQuizCounter >= 1 && res.sticker === true, res);
const dropped = await page.evaluate(() => (window.__game.world.drops || []).length);
check('a round pays no shards — mini games never pay the shop', dropped === 0, { drops: dropped });

// §2: restart is one tap from the results screen
await page.locator('#mg-replay').dispatchEvent('pointerdown');
await frames(6);
const again = await page.evaluate(() => ({
  phase: window.__game.world.harness.phase,
  cue: !!document.getElementById('mgq-cue'),
}));
check('replay is one tap, skips the demo second time, and rebuilds the overlay', again.phase === 'play' && again.cue, again);

// exit
await page.locator('#mg-exit').dispatchEvent('pointerdown');
await frames(6);
check('exit is one tap and closes everything',
  (await page.evaluate(() => window.__game.world.harness.active)) === false);
const hudBack = await page.evaluate(() => ['hearts', 'potions', 'btn-attack']
  .map((id) => document.getElementById(id))
  .filter((n) => n && getComputedStyle(n).display === 'none')
  .map((n) => n.id));
check('the world HUD comes back on the way out', hudBack.length === 0, { stillHidden: hudBack });
const closedResidue = await page.evaluate(() => ({
  cue: !!document.getElementById('mgq-cue'), row: !!document.getElementById('mgq-row'),
}));
check('the quiz overlay is gone the moment the round ends', !closedResidue.cue && !closedResidue.row, closedResidue);

// --- §3.4 TEARDOWN DISCIPLINE — ten rounds, zero residue -------------------
const leak = await page.evaluate(async () => {
  const g = window.__game;
  g.player.root.position.set(-6, 0, 0);
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  const before = g.world.root.children.length;
  for (let i = 0; i < 10; i++) {
    g.player.root.position.set(-2, 0, -7);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    if (!g.world.harness.active) return { before, after: -1, failedToOpen: i };
    g.world.harness.exit();
    g.player.root.position.set(-6, 0, 0);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { before, after: g.world.root.children.length };
});
check('ten rounds leave ZERO residue in the SCENE', leak.after === leak.before, leak);
const domLeft = await page.evaluate(() => ({
  cue: document.querySelectorAll('#mgq-cue').length, row: document.querySelectorAll('#mgq-row').length,
  cards: document.querySelectorAll('.mgq-card').length,
}));
check('ten rounds leave ZERO residue in the DOM overlay', domLeft.cue === 0 && domLeft.row === 0 && domLeft.cards === 0, domLeft);

const final = await restCalls();
check('draw calls return to where they started', Math.abs(final.calls - baseline.calls) <= 3,
  { before: baseline.samples, after: final.samples });

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : '✓ Which Wolf? holds the harness contract end to end, and leaves nothing behind'));
await b.close();
process.exit(errors.length ? 1 : 0);
