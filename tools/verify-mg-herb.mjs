// HERB MATCH, driven end to end (js/mg-herb.js) on the shared harness. Same
// shape as verify-mg-howl.mjs; every tap is a real pointerdown on a card.
// What it proves: every herb is dealt exactly twice and no two herbs share a
// shape, a pair stays up, a miss turns back, a cleared board pays and is
// dealt again, and nothing is left behind.
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
await page.fill('#t-name', 'HERB');
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
const RING = { x: -6, z: 0.5 };
const hasRing = () => page.evaluate(() => (window.__game.world.denGames || []).some((g) => g.id === 'herb'));

// 1. LOCKED below Tier 3 (nine rescues)
await page.evaluate(() => { const r = {}; for (let i = 0; i < 8; i++) r['f' + i] = 1; window.__game.state.flags.rescued = r; });
check('the Den builds', await go('den'));
check('eight rescues (Tier 2): no Herb Match ring yet', !(await hasRing()));
await page.evaluate(() => { window.__game.state.flags.rescued.f8 = 1; });
await go('g1');
check('nine rescues (Tier 3): the Den has a Herb Match ring', (await go('den')) && await hasRing());

// the draw-call baseline, the verify-minigame discipline (creatures hidden)
const REST = { x: -6, z: 0 };
const restCalls = () => restCallsAt(page, REST);
const baseline = await restCalls();

// 2. walk in, skip the demo
await page.evaluate((r) => { window.__game.player.root.position.set(r.x, 0, r.z); }, RING);
await frames(8);
const opened = await page.evaluate(() => ({ active: window.__game.world.harness.active, phase: window.__game.world.harness.phase }));
check('walking into the ring opens Herb Match', opened.active, opened);
if (opened.phase === 'demo') await page.locator('#mg-tap').dispatchEvent('pointerdown');
await frames(3);

const board = () => page.evaluate(() => {
  const game = window.__game.world.harness._live;
  return { boards: game.boards, cards: game.cards.map((c) => ({ herb: c.herb, up: c.up, done: c.done })),
    boxes: [...document.querySelectorAll('.mgm-card')].map((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.top)]; }) };
});
let bd = await board();
const counts = {};
for (const c of bd.cards) counts[c.herb] = (counts[c.herb] || 0) + 1;
check('a Wolf board is eight cards, every herb exactly twice, all face down',
  bd.cards.length === 8 && Object.values(counts).every((n) => n === 2) && bd.cards.every((c) => !c.up && !c.done), counts);
check('every card is on screen and clears the 44px floor',
  bd.boxes.every(([w, h, x, y]) => w >= 44 && h >= 44 && x >= 0 && y >= 40 && x + w <= 740 && y + h <= 360), bd.boxes);
const shapes = await page.evaluate(async () => {
  // each herb's own picture: no two herbs may draw the same silhouette
  const sig = (herb) => { const c = document.querySelector(`.mgm-card[data-herb="${herb}"] canvas`);
    const d = c.getContext('2d').getImageData(0, 0, 64, 64).data; let s = ''; for (let i = 3; i < d.length; i += 4 * 37) s += d[i] > 40 ? '1' : '0'; return s; };
  const herbs = [...new Set([...document.querySelectorAll('.mgm-card')].map((n) => n.dataset.herb))];
  return herbs.map(sig);
});
check('no two herbs share a silhouette (shape, not only colour)', new Set(shapes).size === shapes.length, { n: shapes.length });

const tap = (i) => page.locator('.mgm-card').nth(i).dispatchEvent('pointerdown');
const score = () => page.evaluate(() => Number(document.getElementById('mg-score').textContent));

// 3. a miss turns back, scores nothing
const a0 = 0, b0 = bd.cards.findIndex((c, i) => i > 0 && c.herb !== bd.cards[0].herb);
const sc0 = await score();
await tap(a0); await tap(b0);
await frames(2);
const mid = await board();
await page.waitForFunction(() => window.__game.world.harness._live.cards.every((c) => !c.up || c.done), null, { timeout: 5000 }).catch(() => {});
const back = await board();
check('two different herbs show, then turn back, scoring nothing', mid.cards[a0].up && mid.cards[b0].up
  && !back.cards[a0].up && !back.cards[b0].up && (await score()) === sc0, { mid: [mid.cards[a0], mid.cards[b0]], back: [back.cards[a0], back.cards[b0]] });

// 4. a pair stays up: +1
const pairOf = (i) => bd.cards.findIndex((c, j) => j !== i && c.herb === bd.cards[i].herb);
await tap(a0); await tap(pairOf(a0));
await frames(3);
const sc1 = await score();
const after = await board();
check('a matching pair stays face up and scores 1', after.cards[a0].done && after.cards[pairOf(a0)].done && sc1 === sc0 + 1, { sc0, sc1 });

// 5. clear the board: +3 and a fresh deal
const dealtBefore = (await board()).boards;
for (let i = 0; i < bd.cards.length; i++) {
  const cur = await board();
  if (cur.cards[i].done) continue;
  const j = pairOf(i);
  await tap(i); await tap(j);
  await frames(2);
}
const sc2 = await score();
check('clearing the board pays every pair plus 3', sc2 === sc1 + (bd.cards.length / 2 - 1) + 3, { sc1, sc2 });
await page.waitForFunction((n) => window.__game.world.harness._live.boards > n, dealtBefore, { timeout: 6000 }).catch(() => {});
const fresh = await board();
check('...and a fresh board is dealt, all face down', fresh.boards > dealtBefore && fresh.cards.every((c) => !c.up && !c.done), { before: dealtBefore, boards: fresh.boards });

// 6. the clock, results
await page.evaluate(() => { window.__game.world.harness.update(99, 0); });
await frames(3);
const res = await page.evaluate(() => ({ phase: window.__game.world.harness.phase, best: (window.__game.state.minigames.herb || {}).best }));
check('the clock ends on the results card, with a personal best', res.phase === 'results' && res.best > 0, res);

// 7. out
await page.locator('#mg-leave').dispatchEvent('pointerdown');
await frames(4);
check('the grid leaves the screen', await page.evaluate(() => !document.getElementById('mgm-grid')));
await page.evaluate(() => { window.__game.player.root.position.set(-6, 0, 0); });
const final = await restCalls();
check('leaving leaves nothing in the room', final.children === baseline.children, { before: baseline.children, after: final.children });
check('draw calls return to where they started (exact)', final.calls === baseline.calls, { before: baseline.calls, after: final.calls });

check('no page errors', !errors.some((e) => e.startsWith('PAGEERROR')), errors.filter((e) => e.startsWith('PAGEERROR')).slice(0, 3));
console.log(errors.length ? `\n✗ FAIL — ${errors.length}` : '\n✓ PASS — Herb Match: pairs by shape and colour, every board winnable, nothing left behind');
await b.close();
process.exit(errors.length ? 1 : 0);
