// MINING & WOODCUTTING (design/MINING.md) — without the tool, standing next
// to a node does nothing at all; with it, proximity alone starts the channel
// (no attack input), three ticks deplete it, the right material lands in
// state.inventory.materials, walking out of range resets progress, and a
// depleted node is gone for the rest of that visit but present again on the
// next room build. Ticked via direct world.updateNodes() calls in one
// synchronous evaluate rather than waiting on real animation frames — this
// session's own established lesson: the real render loop's own
// !transitioning/!narration.blocking gates can add real wall-clock delay for
// reasons unrelated to the mechanic under test.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('MINEPROBE');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

await wk.page.evaluate(() => window.__wkJump('lc', ['knight']));
await wk.page.waitForFunction(() => window.__wk.room === 'lc' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });

// 1. the room really has both nodes, seeded from world.markers.rockSpots/treeSpots.
const seeded = await wk.page.evaluate(() => {
  const w = window.__game.world;
  return { count: (w.nodes || []).length, kinds: (w.nodes || []).map((n) => n.kind) };
});
check('lc seeds exactly one rock and one tree node',
  seeded.count === 2 && seeded.kinds.includes('rock') && seeded.kinds.includes('tree'), seeded);

// 2. WITHOUT the tool, standing right on top of a rock does nothing at all —
// no channel progress, no hp loss, no material — for many ticks.
const noTool = await wk.page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const rock = w.nodes.find((n) => n.kind === 'rock');
  g.player.root.position.x = rock.x; g.player.root.position.z = rock.z;
  const before = { ore: g.state.inventory.materials.ore || 0, hp: rock.hp };
  for (let i = 0; i < 20; i++) w.updateNodes(0.7, 0, g.player);
  return { before, after: { ore: g.state.inventory.materials.ore || 0, hp: rock.hp },
    channelT: rock.channelT };
});
check('without owning the pickaxe, standing on the rock for many ticks does nothing',
  noTool.before.hp === noTool.after.hp && noTool.before.ore === noTool.after.ore
    && noTool.channelT === 0, noTool);

// 3. WITH the pickaxe, proximity alone (no attack input) channels automatically:
// three 0.7s ticks deplete the rock and pay out ore.
const mined = await wk.page.evaluate(async () => {
  const items = await import('/js/items.js');
  const g = window.__game;
  const w = g.world;
  items.addGear('pickaxe');
  const rock = w.nodes.find((n) => n.kind === 'rock');
  g.player.root.position.x = rock.x; g.player.root.position.z = rock.z;
  const beforeOre = g.state.inventory.materials.ore || 0;
  w.updateNodes(0.7, 0, g.player);
  const afterOne = { hp: rock.hp, depleted: rock.depleted };
  w.updateNodes(0.7, 0, g.player);
  const afterTwo = { hp: rock.hp, depleted: rock.depleted };
  w.updateNodes(0.7, 0, g.player);
  const afterThree = { hp: rock.hp, depleted: rock.depleted };
  // stand on the drop and let the shared drop-collection system pick it up.
  const drop = w.drops.find((d) => !d.taken);
  if (drop) { g.player.root.position.x = drop.x; g.player.root.position.z = drop.z; w.updateEnemies(0.016, 0, g.player); }
  return { beforeOre, afterOne, afterTwo, afterThree,
    afterOre: g.state.inventory.materials.ore || 0, lockTime: g.player.lockTime };
});
check('one channel tick lands one hit (hp 3->2), not yet depleted',
  mined.afterOne.hp === 2 && !mined.afterOne.depleted, mined);
check('two channel ticks land two hits (hp 3->1)', mined.afterTwo.hp === 1, mined);
check('the third channel tick depletes the rock', mined.afterThree.hp <= 0 && mined.afterThree.depleted, mined);
check('the depleted rock paid out one ore, collected into materials', mined.afterOre === mined.beforeOre + 1, mined);
check('channeling held the player in place via lockTime (the same field a real swing uses)',
  mined.lockTime > 0, mined);

// 4. walking out of range mid-channel resets progress — proximity IS the cancel.
// (owns axe_b already, granted here so this check exercises the distance
// cancel in isolation rather than tripping the "no tool" branch instead.)
const cancelled = await wk.page.evaluate(async () => {
  const items = await import('/js/items.js');
  const g = window.__game;
  const w = g.world;
  items.addGear('axe_b');
  const tree = w.nodes.find((n) => n.kind === 'tree');
  g.player.root.position.x = tree.x; g.player.root.position.z = tree.z;
  w.updateNodes(0.4, 0, g.player); // partial progress, no hit yet (SWING_EVERY=0.7)
  const midChannel = tree.channelT;
  g.player.root.position.x = tree.x + 50; g.player.root.position.z = tree.z; // well outside RANGE
  w.updateNodes(0.4, 0, g.player);
  return { midChannel, afterWalkAway: tree.channelT, hp: tree.hp };
});
check('partial channel progress accrues before a hit lands', cancelled.midChannel > 0, cancelled);
check('walking out of range resets channel progress to 0 with no hit taken',
  cancelled.afterWalkAway === 0 && cancelled.hp === 3, cancelled);

// 5. the SAME tree, now with axe_b (already-shipping Woodcutter Axe) owned,
// depletes and pays wood exactly like the rock paid ore.
const chopped = await wk.page.evaluate(async () => {
  const items = await import('/js/items.js');
  const g = window.__game;
  const w = g.world;
  items.addGear('axe_b');
  const tree = w.nodes.find((n) => n.kind === 'tree');
  g.player.root.position.x = tree.x; g.player.root.position.z = tree.z;
  const beforeWood = g.state.inventory.materials.wood || 0;
  for (let i = 0; i < 3; i++) w.updateNodes(0.7, 0, g.player);
  const drop = w.drops.find((d) => !d.taken);
  if (drop) { g.player.root.position.x = drop.x; g.player.root.position.z = drop.z; w.updateEnemies(0.016, 0, g.player); }
  return { depleted: tree.depleted, beforeWood, afterWood: g.state.inventory.materials.wood || 0 };
});
check('owning axe_b, the tree depletes the same way the rock did', chopped.depleted, chopped);
check('the depleted tree paid out one wood', chopped.afterWood === chopped.beforeWood + 1, chopped);

// 6. a depleted node is gone for the rest of THIS visit...
const stillGone = await wk.page.evaluate(() => {
  const w = window.__game.world;
  const rock = w.nodes.find((n) => n.kind === 'rock');
  return { depleted: rock.depleted, sceneHas: w.root.children.includes(rock.root) };
});
check('the depleted rock stays depleted and off-scene for the rest of this visit',
  stillGone.depleted && !stillGone.sceneHas, stillGone);

// ...but present again on the NEXT room build (the same "always there to
// farm" law v3.170 already gave every enemy — no persisted depletion state).
await wk.page.evaluate(() => window.__wkJump('lg2', ['knight']));
await wk.page.waitForFunction(() => window.__wk.room === 'lg2' && !window.__wk.gates.transitioning,
  null, { timeout: 60000 });
await wk.page.evaluate(() => window.__wkJump('lc', ['knight']));
await wk.page.waitForFunction(() => window.__wk.room === 'lc' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const rebuilt = await wk.page.evaluate(() => {
  const w = window.__game.world;
  return { count: (w.nodes || []).length, kinds: (w.nodes || []).map((n) => n.kind),
    anyDepleted: (w.nodes || []).some((n) => n.depleted) };
});
check('rebuilding the room (leaving and returning) restores both nodes fresh, none depleted',
  rebuilt.count === 2 && !rebuilt.anyDepleted, rebuilt);

// 7. THE ROLLOUT (design/MINING.md, 2026-09-16) — six more rooms each got
// their own rock/tree, most of them tinted. The MECHANIC is already proven
// end to end above and js/nodes.js's ResourceNode.update() has no
// `if (roomId === ...)` anywhere in it to make room-specific behaviour even
// possible — so every new room gets the cheap check (seeded with the right
// kind(s), x/z and tint, and standing somewhere the room's own hazard zones
// and colliders actually clear), and only two of the six (one rock, one
// tree — one of each kind, proving the mechanic really does fire from a
// non-`lc` room and a non-default tint too) get the full channel-and-deplete
// replay that checks 2-5 above already ran on `lc`.
async function gotoRoom(room) {
  await wk.page.evaluate((r) => window.__wkJump(r, ['knight']), room);
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
}

// Expected seeding per room, exactly matching design/MINING.md's table.
const EXPECTED = [
  { room: 't1a', kind: 'tree', x: 10, z: -1, tint: 0x6fae4a },
  { room: 'f1', kind: 'rock', x: 1.5, z: 7, tint: 0x9be3ff },
  { room: 's1a', kind: 'rock', x: 9, z: -2, tint: 0xc9d4ff },
  { room: 'd1a', kind: 'tree', x: 3, z: 3, tint: 0x3fb0c4 },
  { room: 'x1', kind: 'rock', x: 11, z: -8, tint: 0xe8e4ff },
  { room: 'dr', kind: 'rock', x: 6.5, z: 3, tint: undefined },
  { room: 'dr', kind: 'tree', x: 6.5, z: -3, tint: undefined },
];

// Group by room so `dr` (which carries two nodes) is only visited once.
const byRoom = [...new Set(EXPECTED.map((e) => e.room))];
for (const room of byRoom) {
  await gotoRoom(room);
  const want = EXPECTED.filter((e) => e.room === room);
  const got = await wk.page.evaluate(() => {
    const w = window.__game.world;
    // reachability, the SAME hazard/collider dump this session used to pick
    // every one of these coordinates in the first place, re-run here as an
    // assertion: no lava/deep-water/pit zone contains it, and its nearest
    // OTHER collider clears by more than a body-width (0 would be touching).
    const inLava = (x, z) => w.lavaZones.some((l) => x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ);
    const inDeepWater = (x, z) => w.waterZones.some((wz) => wz.deep && x >= wz.minX && x <= wz.maxX && z >= wz.minZ && z <= wz.maxZ);
    const inPit = (x, z) => w.pitZones.some((p) => x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ);
    return (w.nodes || []).map((n) => ({
      kind: n.kind, x: n.x, z: n.z, tint: n._tint,
      hazard: inLava(n.x, n.z) || inDeepWater(n.x, n.z) || inPit(n.x, n.z),
      nearestOtherClear: w.circleColliders
        .filter((c) => !(c.x === n.x && c.z === n.z))
        .map((c) => Math.hypot(c.x - n.x, c.z - n.z) - c.r - (n._collider ? n._collider.r : 0.5))
        .sort((a, b) => a - b)[0],
    }));
  });
  for (const w of want) {
    const g = got.find((n) => n.kind === w.kind && Math.abs(n.x - w.x) < 0.01 && Math.abs(n.z - w.z) < 0.01);
    check(`${room}: ${w.kind} seeded at (${w.x},${w.z})`, !!g, { got });
    if (g) {
      check(`${room}: ${w.kind}'s tint is ${w.tint === undefined ? 'none (untinted)' : '0x' + w.tint.toString(16)}`,
        w.tint === undefined ? g.tint === undefined : g.tint === w.tint, g);
      check(`${room}: ${w.kind}'s hazard-free (no lava/deep-water/pit at its own spot)`, !g.hazard, g);
      check(`${room}: ${w.kind} clears every other collider by more than a body-width`,
        g.nearestOtherClear === undefined || g.nearestOtherClear > 0.3, g);
    }
  }
}

// The two full-mechanic replays: f1's rock (frost-tinted), d1a's tree
// (tide-tinted) — one of each kind, each a non-default tint, each in a
// region-1-style early room rather than `lc` itself.
async function fullChannelCheck(room, kind, tool, material) {
  await gotoRoom(room);
  const r = await wk.page.evaluate(async ({ kind, tool, material }) => {
    const items = await import('/js/items.js');
    const g = window.__game;
    const w = g.world;
    items.addGear(tool);
    const node = w.nodes.find((n) => n.kind === kind);
    g.player.root.position.x = node.x; g.player.root.position.z = node.z;
    const before = g.state.inventory.materials[material] || 0;
    for (let i = 0; i < 3; i++) w.updateNodes(0.7, 0, g.player);
    const drop = w.drops.find((d) => !d.taken);
    if (drop) { g.player.root.position.x = drop.x; g.player.root.position.z = drop.z; w.updateEnemies(0.016, 0, g.player); }
    return { depleted: node.depleted, before, after: g.state.inventory.materials[material] || 0 };
  }, { kind, tool, material });
  check(`${room}: owning ${tool}, the ${kind} channels and depletes exactly like lc's own`, r.depleted, r);
  check(`${room}: the depleted ${kind} paid out one ${material}`, r.after === r.before + 1, r);
}
await fullChannelCheck('f1', 'rock', 'pickaxe', 'ore');
await fullChannelCheck('d1a', 'tree', 'axe_b', 'wood');

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — mining/woodcutting channels, gates by tool, pays out, cancels on distance, respawns on rebuild, and the full 2026-09-16 rollout seeds every new room correctly');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
