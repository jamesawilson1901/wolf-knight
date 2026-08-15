// RUN-3 STEP-0 PROBE — the harness-prep verifications, one session:
//   1. timescale clamp: 3 passes through, 9 clamps to 4, 0.5 still works (ladder)
//   2. dev-off page: window.__wk absent, no errors (quick inertness read)
//   3. real-frame size at the new 740x360 viewport (calibrates FLAT_KB)
//   4. wardenHp save→reload round-trip (v3.49 additive save parity, approved)
//   5. measured game-speed at 3x (game seconds per wall second)
import { launch } from './wk-drive.mjs';
import { statSync } from 'fs';

const d = await launch({ evidenceDir: 'test-evidence/run3-step0', timescale: 3 });
const out = (k, v) => console.log(`${k}: ${v}`);

await d.newGame('STEP0');
out('timescale (3 requested)', await d.wk('timescale'));

// game-speed at 3x: player._time only advances when the world truly ticks
const t0 = await d.page.evaluate(() => window.__game.player._time);
await d.page.waitForTimeout(8000);
const t1 = await d.page.evaluate(() => window.__game.player._time);
out('game-speed at 3x (game s / wall s)', ((t1 - t0) / 8).toFixed(2));

// flat-frame calibration: what does a REAL frame weigh at 740x360?
await d.page.waitForTimeout(1200);
const p = 'test-evidence/run3-step0/calib.png';
await d.page.screenshot({ path: p });
out('real-frame KB at 740x360', (statSync(p).size / 1024).toFixed(0));

// wardenHp round-trip: wound him in memory, persist, reload, continue, read
await d.page.evaluate(() => { const g = window.__game; g.state.flags.wardenHp = 7; g.persist(); });
out('wardenHp in localStorage', await d.page.evaluate(() => {
  const g = window.__game;
  return JSON.parse(localStorage.getItem('wolfknight:save:' + g.state.profileId)).flags.wardenHp;
}));

async function cont(q, ready) {
  await d.page.goto(`http://localhost:8901/index.html${q}`, { waitUntil: 'load' });
  await d.page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
  await d.page.locator('.profile-btn:not(.new)').first().dispatchEvent('pointerdown');
  await d.page.waitForSelector('#t-continue', { state: 'visible', timeout: 10000 });
  await d.page.locator('#t-continue').dispatchEvent('pointerdown');
  await d.page.waitForFunction(ready, null, { timeout: 90000 });
}

await cont('?dev=1', () => window.__wk && window.__wk.room);
out('wardenHp after reload+continue', await d.page.evaluate(() => window.__game.state.flags.wardenHp));

await cont('?dev=1&timescale=9', () => window.__wk && window.__wk.room);
out('clamp: 9 requested ->', await d.wk('timescale'));

await cont('?dev=1&timescale=0.5', () => window.__wk && window.__wk.room);
out('ladder rung: 0.5 requested ->', await d.wk('timescale'));

await cont('', () => window.__game && window.__game.player && window.__game.player._time > 0);
out('dev-off: typeof window.__wk', await d.page.evaluate(() => typeof window.__wk));

out('page errors', JSON.stringify(d.errors));
await d.close();
