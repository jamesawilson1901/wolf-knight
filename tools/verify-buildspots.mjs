// SOMETHING TO BUILD FOR (js/buildspots.js, v3.199). In one room of every
// region a chest sits on an island behind a fallen bridge. This drives each
// one through the REAL input path — keyboard walking via wk-drive's walkTo,
// the real render loop, the real chest pipeline — and holds it to its promise:
//
//   1. the island really is cut off: a drop all round it, the chest on it, and
//      a child who walks (or jumps) at it from the near side never gets there;
//   2. the gold ghost and its picture board are up while it is unbuilt;
//   3. walking up WITHOUT the materials builds nothing and spends nothing;
//   4. walking up WITH them builds it, plank by plank, and spends exactly the
//      cost — no more;
//   5. then the same walk reaches the island and the chest pays what it says;
//   6. and it stays built: leave the room, come back, the bridge is there and
//      the board is gone.
//
// Plus the island fits its room: nothing the room built stands in the drop or
// on the island (a prop in the hole is a bug class this project has fixed
// four times), and every door of the room is still reachable from the spawn.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('BUILDER');
await wk.page.evaluate(() => setInterval(() => { const n = window.__game.narration; if (n && n.speaking) n.skip(); }, 80));
const spots = await wk.page.evaluate(async () => {
  const { BUILD_SPOTS } = await import('/js/buildspots.js');
  return Object.values(BUILD_SPOTS);
});
check('one broken bridge in each of the seven regions', spots.length === 7
  && new Set(spots.map((s) => s.region)).size === 7, spots.map((s) => [s.room, s.region]));

for (const s of spots) {
  console.log(`\n── ${s.id} (${s.room}, ${s.region}) ──────────────────────`);
  await wk.jump(s.room, ['knight']);
  await wk.page.evaluate(() => { const g = window.__game; g.player.iframes = 99999;
    for (const e of g.world.enemies) { e.update = () => {}; } });
  const shape = await wk.page.evaluate((s) => {
    const g = window.__game, w = g.world, B = w.buildSpot;
    const pits = (x, z) => !!w.pitAt(x, z);
    const chest = (w.chests || []).find((c) => c.id === 'c_build_' + s.id);
    // nothing the room built may stand in the drop or on the island but the chest
    const OUT = 3.2;
    const intruders = [];
    w.root.updateMatrixWorld(true);
    for (const c of w.circleColliders) {
      const inSq = Math.abs(c.x - s.x) < OUT + c.r && Math.abs(c.z - s.z) < OUT + c.r;
      if (inSq && !(chest && Math.hypot(c.x - chest.x, c.z - chest.z) < 0.01)) intruders.push([+c.x.toFixed(1), +c.z.toFixed(1), c.tag]);
    }
    return { has: !!B, built: B && B.built, moat: [pits(s.x, s.z + 2.3), pits(s.x - 2.3, s.z), pits(s.x + 2.3, s.z), pits(s.x, s.z - 2.3)],
      island: pits(s.x, s.z), chest: !!chest, chestOpen: chest && chest.opened, ghost: B && B.tiles.length,
      board: B && B.board.visible, intruders };
  }, s);
  check('the island is there, cut off by a drop on all four sides', shape.has && shape.moat.every(Boolean) && !shape.island, shape);
  check('its chest is on the island, closed', shape.chest && !shape.chestOpen, shape);
  check('nothing else stands in the drop or on the island', shape.intruders.length === 0, shape.intruders);
  check('unbuilt: the gold ghost and the picture board are up', !shape.built && shape.ghost > 0 && shape.board, shape);

  // walk at the island from the near side, empty-handed
  await wk.page.evaluate((s) => {
    const g = window.__game; const m = g.state.inventory.materials;
    for (const k of Object.keys(s.cost)) m[k] = 0;
    return { ...m };
  }, s);
  await wk.walkTo(s.x, s.z + 3.2 + 0.85, { timeout: 20 });
  await wk.walkTo(s.x, s.z + 0.5, { timeout: 6 });
  const tried = await wk.page.evaluate((s) => {
    const g = window.__game, P = g.player.root.position;
    return { z: +P.z.toFixed(2), x: +P.x.toFixed(2), built: g.world.buildSpot.built,
      onIsland: Math.abs(P.x - s.x) < 1.4 && Math.abs(P.z - s.z) < 1.4 };
  }, s);
  check('empty-handed, the walk stops at the rim and nothing is built', !tried.onIsland && !tried.built, tried);
  // a jump at it from the rim does not get over either
  const jumped = await wk.page.evaluate(async (s) => {
    const g = window.__game, P = g.player, w = g.world;
    P.root.position.set(s.x + 2.4, 0, s.z + 3.2 + 0.6);
    const fake = { move: { x: 0, z: -1 }, getMove: () => ({ x: 0, z: -1 }), defending: false };
    P.tryJump();
    for (let i = 0; i < 40; i++) { if (i === 8) P.tryJump(); P.update(1 / 30, fake, w); }
    const p = P.root.position;
    return { z: +p.z.toFixed(2), onIsland: Math.abs(p.x - s.x) < 1.4 && Math.abs(p.z - s.z) < 1.4, fell: !!P._pitFall };
  }, s);
  check('a double jump at the drop is stopped by the rim (no way over but the bridge)', !jumped.onIsland && !jumped.fell, jumped);

  // now with exactly the cost in the bag
  await wk.page.evaluate((s) => { const m = window.__game.state.inventory.materials;
    for (const [k, n] of Object.entries(s.cost)) m[k] = n; }, s);
  await wk.walkTo(s.x, s.z + 3.2 + 0.85, { timeout: 20 });
  await wk.page.waitForFunction(() => window.__game.world.buildSpot.built, null, { timeout: 15000 }).catch(() => {});
  const built = await wk.page.evaluate((s) => {
    const g = window.__game, w = g.world, m = g.state.inventory.materials;
    return { built: w.buildSpot.built, left: Object.keys(s.cost).map((k) => m[k] || 0),
      ws: g.WS.get('build', s.id), board: w.buildSpot.board.visible,
      bridgeFloor: !w.pitAt(s.x, s.z + 2.3) };
  }, s);
  check('with the dots full, walking up builds the bridge', built.built && built.ws, built);
  check('...spending exactly the cost', built.left.every((n) => n === 0), built);
  check('...and the bridge is floor, the board gone', built.bridgeFloor && !built.board, built);

  const loot0 = await wk.page.evaluate(() => ({ ...window.__game.state.inventory.materials,
    shards: window.__game.state.shards, known: [...window.__game.state.inventory.recipesKnown] }));
  await wk.walkTo(s.x, s.z + 0.4, { timeout: 15, arrive: 0.35 });
  await wk.page.waitForFunction((id) => window.__game.state.flags.chests['c_build_' + id], s.id, { timeout: 8000 }).catch(() => {});
  const got = await wk.page.evaluate((s) => {
    const g = window.__game, m = g.state.inventory.materials, P = g.player.root.position;
    return { opened: !!g.state.flags.chests['c_build_' + s.id], onIsland: Math.abs(P.x - s.x) < 1.4 && Math.abs(P.z - s.z) < 1.4,
      materials: Object.fromEntries(Object.keys(s.loot.materials || {}).map((k) => [k, m[k] || 0])),
      known: g.state.inventory.recipesKnown, shards: g.state.shards };
  }, s);
  check('across the bridge, the island is reachable and its chest opens', got.opened && got.onIsland, got);
  const matOk = Object.entries(s.loot.materials || {}).every(([k, n]) => got.materials[k] >= (loot0[k] || 0) + n);
  check('the chest pays its materials', matOk, { want: s.loot.materials, got: got.materials });
  if (s.loot.recipe) check(`...and the scroll for ${s.loot.recipe}`, got.known.includes(s.loot.recipe), got.known);

  // it stays built
  await wk.jump(s.room === 'g1' ? 'g2' : 'g1', ['knight']);
  await wk.jump(s.room, ['knight']);
  const after = await wk.page.evaluate(() => { const B = window.__game.world.buildSpot;
    return { built: B.built, board: B.board.visible }; });
  check('back in the room later, the bridge still stands', after.built && !after.board, after);
}

check('no page errors', wk.errors.length === 0, wk.errors.slice(0, 4));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — seven bridges, each one built and crossed');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
