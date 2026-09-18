// One-off screenshot pass for the new Tavern/Forge/Mill/Monument models
// (design/DEN-REBUILD.md v1.1) — NOT a verify suite. Not part of any gate.
import { launch } from './wk-drive.mjs';

const wk = await launch({ timescale: 1, evidenceDir: '/tmp/dentown-shots' });
await wk.newGame('DENTOWNSHOT');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

await wk.page.evaluate(() => window.__wkJump('dr'));
await wk.page.waitForFunction(() => window.__wk.room === 'dr' && !window.__wk.gates.transitioning,
  { timeout: 60000 });
await wk.page.evaluate(() => {
  const m = window.__game.world.markers;
  delete m.travelSpot; delete m.shopSpot;
});

async function snap(x, z, lookX, lookZ, label) {
  await wk.page.evaluate(({ x, z, lookX, lookZ }) => {
    const g = window.__game;
    const off = g.camera.position.clone().sub(g.player.root.position);
    g.player.root.position.set(x, 0, z);
    g.camera.position.copy(g.player.root.position).add(off);
    g.camera.lookAt(lookX, 0.6, lookZ);
    if (g.narration.speaking) g.narration.skip();
  }, { x, z, lookX, lookZ });
  await wk.page.waitForTimeout(250);
  await wk.shot(label);
}

// WIDE SHOT — all three buildings, unrestored (ruin tint), from the middle.
await snap(0, -1, 0, -1, 'dr-unrestored-wide');

// Restore all three for real (spend real materials) and let the monument
// appear, then re-shoot the same wide angle plus a close pass on each.
await wk.page.evaluate(() => {
  const g = window.__game;
  const mats = g.state.inventory.materials || (g.state.inventory.materials = {});
  for (const id of ['ore', 'wood', 'crystal']) mats[id] = 999;
});
const { restoreAll } = await wk.page.evaluate(async () => {
  const d = await import('/js/denRebuild.js');
  const ok = ['tavern', 'forge', 'mill'].map((id) => d.restore(id));
  return { restoreAll: ok };
});
console.log('restore results:', restoreAll);
// Force a fresh room build so the just-restored tints (and the monument,
// which only spawns when all three are true) are reflected — matching
// DEN-REBUILD.md's own documented "next visit reflects the change" contract
// rather than a live re-tint mid-visit. Re-jumping to the SAME room id
// rebuilds it fresh, the same pattern tools/shot-dragoneggs.mjs already uses.
await wk.page.evaluate(() => window.__wkJump('dr'));
await wk.page.waitForFunction(() => window.__wk.room === 'dr' && !window.__wk.gates.transitioning,
  { timeout: 60000 });
await wk.page.evaluate(() => {
  const m = window.__game.world.markers;
  delete m.travelSpot; delete m.shopSpot;
});

await snap(0, -1, 0, -1, 'dr-restored-wide');
await snap(-5.6, -7.5, -5.6, -3.4, 'dr-tavern-close');
await snap(-5.6, 7.5, -5.6, 3.4, 'dr-forge-close');
await snap(1.5, -8, 1.5, -4.2, 'dr-mill-close');
await snap(0, 3.5, 0, 0.5, 'dr-monument-close');

console.log('screenshots saved under /tmp/dentown-shots');
await wk.b.close();
