// THE TOP-LEFT STRIP, AND THE COIN IT COUNTS.
//
// Dad's first screenshot of the session is the level badge sitting on top of
// the coin counter. Both were positioned by a hand-measured `left` — 200 and
// 262 — chosen when the counter read "0". A child with three digits of coins
// pushes the chip to 295 and the two overlap; nothing in the suite set had
// ever measured a HUD element against its neighbour.
//
// The coin itself is dad's other number from the same message: "the coins
// should be one eighth the height of the user". So this asks the DOM where
// things actually are, at a coin count a real save reaches, and asks the
// scene how big a coin really is against the knight standing next to it.
import { launch } from './wk-drive.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};
const wk = await launch({ timescale: 1 });
await wk.newGame('HUD');
const quiet = () => wk.page.evaluate(() => { window.__game.state.settings.captions = false; window.__game.narration.skip(); });
await quiet();

const boxes = () => wk.page.evaluate(() => {
  const out = {};
  for (const id of ['shards', 'level-badge', 'buffs', 'potions', 'hearts']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    out[id] = { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) };
  }
  return out;
});
const overlaps = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

console.log('\n── 1. the counters do not sit on each other ────────────');
for (const purse of [0, 7, 148, 99999]) {
  await wk.page.evaluate((n) => { window.__game.state.shards = n;
    window.__game.renderShards(); }, purse);
  await wk.page.waitForTimeout(200);
  const b = await boxes();
  const bad = [];
  const ids = Object.keys(b);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
    if (overlaps(b[ids[i]], b[ids[j]])) bad.push(`${ids[i]}×${ids[j]}`);
  check(`with ${purse} coins nothing in the HUD overlaps anything else`, bad.length === 0, { bad, boxes: b });
}

console.log('\n── 2. no emoji in the top strip ───────────────────────');
const strip = await wk.page.evaluate(() =>
  ['shards', 'level-badge'].map((id) => (document.getElementById(id) || {}).textContent || '').join(' '));
check('the coin counter and the level badge are words and numbers only',
  !/\p{Extended_Pictographic}/u.test(strip), { strip });

console.log('\n── 3. a coin is one eighth of Kael ────────────────────');
const coin = await wk.page.evaluate(async () => {
  const THREE = await import('three');
  const g = window.__game;
  // measure the knight himself, then throw a coin and measure that
  const f = g.player.forms.knight;
  const vis = f.model.visible; f.model.visible = true;
  f.model.updateWorldMatrix(true, true);
  const kb = new THREE.Box3().setFromObject(f.model);
  f.model.visible = vis;
  const { spawnShards } = await import('/js/loot.js');
  const before = (g.world.shards || []).length;
  spawnShards(g.world, g.player.root.position.x + 4, g.player.root.position.z + 4, 3);
  const s = (g.world.shards || [])[before];
  s.mesh.updateWorldMatrix(true, true);
  const cb = new THREE.Box3().setFromObject(s.mesh);
  return { kael: +(kb.max.y - kb.min.y).toFixed(3),
    coin: +Math.max(cb.max.x - cb.min.x, cb.max.y - cb.min.y).toFixed(3),
    spin0: +s.mesh.rotation.y.toFixed(3), settled: s.settled, y: +s.y.toFixed(3) };
});
const ratio = coin.kael / coin.coin;
check('a coin stands one eighth of the knight', Math.abs(ratio - 8) < 0.5,
  { ...coin, ratio: +ratio.toFixed(2) });

console.log('\n── 4. ...and it hops out, and it spins ────────────────');
// POLL, DO NOT SLEEP. Headless on SwiftShader the game can run at two or three
// frames a second — a coin's half-second arc takes ten wall-clock seconds
// there — and a fixed wait reads "it never landed" when the truth is "the
// renderer is slow". Wait for the coin to settle, up to half a minute.
for (let i = 0; i < 60; i++) {
  if (await wk.page.evaluate(() =>
    (window.__game.world.shards || []).some((c) => !c.taken && c.settled))) break;
  await wk.page.waitForTimeout(500);
}
const landed = await wk.page.evaluate(() => {
  const s = (window.__game.world.shards || []).find((c) => !c.taken && c.settled)
    || (window.__game.world.shards || []).find((c) => !c.taken);
  return s ? { hops: s.hops || 0, settled: !!s.settled, spin: +s.mesh.rotation.y.toFixed(3) } : null;
});
check('the coin hopped and settled', !!landed && landed.hops >= 2 && landed.settled, landed);
check('the coin is spinning', !!landed && Math.abs(landed.spin - coin.spin0) > 0.5,
  { from: coin.spin0, to: landed && landed.spin });

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — the strip reads, and a coin is a coin');
process.exit(errors.length ? 1 : 0);
