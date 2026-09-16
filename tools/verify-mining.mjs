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

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — mining/woodcutting channels, gates by tool, pays out, cancels on distance, respawns on rebuild');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
