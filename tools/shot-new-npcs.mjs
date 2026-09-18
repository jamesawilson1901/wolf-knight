// One-off screenshot pass for the three commissioned NPC bodies (Tam the
// Wayfarer, the Den merchant, the Village Square's witch) — NOT a verify
// suite, not part of any gate.
import { launch } from './wk-drive.mjs';

const wk = await launch({ timescale: 1, evidenceDir: '/tmp/new-npc-shots' });
await wk.newGame('NPCSHOT');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

async function look(room, x, z, lookX, lookZ, label, setup) {
  // Flags that gate whether an NPC's post is even offered (bossDefeated,
  // grimmFreed, growthStage facts) must be set BEFORE the room builds, not
  // after — a room reads them once at build time, so setting them post-jump
  // just describes a world the room never saw.
  if (setup) await wk.page.evaluate(setup);
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

// TAM — le, after the boss falls, viewed from the side (not through the
// shrine's own sightline, where he and the player overlapped in an earlier
// draft of this shot)
await look('le', 6, 4, 6, 8, 'tam-wayfarer-le', () => {
  window.__game.state.flags.bossDefeated = true;
});

// THE MERCHANT — the Den, by his cart
await look('den', 5.9, -1.5, 5.9, -3.7, 'merchant-den');

// THE WITCH — the Village Square, once village growth stage >= 1
await look('ysq', 9, -1, 9, -4, 'witch-square', async () => {
  const { WS } = await import('/js/worldstate.js');
  WS.set('village', 'restored', true);
});

console.log('screenshots saved under /tmp/new-npc-shots');
await wk.b.close();
