// One-off close-up pass for the dragon-skeleton hints (design/DRAGON-EGGS.md)
// in la/s1a/d1a — NOT a verify suite, not part of any gate.
import { launch } from './wk-drive.mjs';

const wk = await launch({ timescale: 1, evidenceDir: '/tmp/skeleton-hint-shots' });
await wk.newGame('SKELHINTSHOT');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

async function look(room, x, z, lookX, lookZ, label) {
  await wk.page.evaluate((r) => window.__wkJump(r), room);
  await wk.page.waitForFunction((r) => window.__wk.room === r && !window.__wk.gates.transitioning,
    room, { timeout: 60000 });
  await wk.page.evaluate(() => {
    const m = window.__game.world.markers;
    delete m.travelSpot; delete m.shopSpot;
  });
  await wk.page.evaluate(({ x, z, lookX, lookZ }) => {
    const g = window.__game;
    g.player.hearts = g.player.maxHearts || 5;
    g.player.iframes = 999999;
    const off = g.camera.position.clone().sub(g.player.root.position);
    g.player.root.position.set(x, 0, z);
    g.camera.position.copy(g.player.root.position).add(off);
    g.camera.lookAt(lookX, 0.6, lookZ);
  }, { x, z, lookX, lookZ });
  // Drain whatever narration the room's own arrival fired (or a stray
  // respawn line from the harness's own teleport) so it doesn't cover the
  // shot — a screenshot pass, not a suite, so real waits are fine here.
  for (let i = 0; i < 5; i++) {
    await wk.page.waitForTimeout(200);
    await wk.page.evaluate(() => { if (window.__game.narration.speaking) window.__game.narration.skip(); });
  }
  await wk.page.evaluate(() => {
    for (const id of ['big-toast', 'caption']) {
      const el = document.getElementById(id) || document.querySelector('.' + id);
      if (el) el.style.display = 'none';
    }
  });
  await wk.page.waitForTimeout(150);
  await wk.shot(label);
}

await look('la', 9, 14, 9, 11, 'la-skeleton-close');
await look('s1a', 2, -6, 2, -9.5, 's1a-skeleton-close');
await look('d1a', 11, 5, 11, 1, 'd1a-skeleton-close');

console.log('screenshots saved under /tmp/skeleton-hint-shots');
await wk.b.close();
