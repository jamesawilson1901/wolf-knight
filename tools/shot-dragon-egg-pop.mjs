// One-off screenshot for the new dragon-egg pickup model (design/DRAGON-EGGS.md
// v2 asset swap) — NOT a verify suite. Walks up to the real 'le' fire-egg
// chest (js/level1.js: le_dragon_egg at -6,9) and captures the real pop.
import { launch } from './wk-drive.mjs';

const wk = await launch({ timescale: 1, evidenceDir: '/tmp/dragon-egg-pop-shots' });
await wk.newGame('EGGPOPSHOT');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

await wk.page.evaluate(() => { window.__game.state.flags.bossDefeated = true; });
await wk.page.evaluate(() => window.__wkJump('le'));
await wk.page.waitForFunction(() => window.__wk.room === 'le' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, { timeout: 60000 });
await wk.page.evaluate(() => {
  const m = window.__game.world.markers;
  delete m.travelSpot; delete m.shopSpot;
});

// Teleport right next to the dragon-egg chest (-6,9) and snap the camera the
// same way shot-dragoneggs.mjs does (no exposed snapCamera(), so replicate
// its maths from the live camera offset).
await wk.page.evaluate(() => {
  const g = window.__game;
  const off = g.camera.position.clone().sub(g.player.root.position);
  g.player.root.position.set(-6, 0, 8);
  g.camera.position.copy(g.player.root.position).add(off);
  g.camera.lookAt(-6, 0.6, 9);
});
await wk.page.waitForTimeout(200);
await wk.page.evaluate(() => {
  const g = window.__game;
  if (g.narration.speaking) g.narration.skip();
});

// Walk the player onto the chest so the real per-frame updateChests() loop
// opens it for real (same trigger a child's own controller input would fire).
await wk.page.evaluate(() => { window.__game.player.root.position.set(-6, 0, 9); });
await wk.page.waitForTimeout(600);
// Drain any narration the open itself fired so it doesn't freeze the pop.
await wk.page.evaluate(() => {
  const g = window.__game;
  if (g.narration.speaking) g.narration.skip();
});
await wk.page.waitForTimeout(900);
// Hide toast/sticker chrome so the pop itself is what's in frame, matching
// shot-dragoneggs.mjs's own precedent for a clean asset shot.
await wk.page.evaluate(() => {
  for (const id of ['big-toast', 'caption']) {
    const el = document.getElementById(id) || document.querySelector('.' + id);
    if (el) el.style.display = 'none';
  }
  document.querySelectorAll('.sticker-toast, .toast').forEach((el) => { el.style.display = 'none'; });
});
await wk.page.waitForTimeout(100);
await wk.shot('dragon-egg-pop-le');

// Find the actual popped item mesh in the scene (js/loot.js's
// animateItemPop() gives it an arc/bounce, so it can land noticeably off
// the chest's own coordinates) instead of guessing a fixed camera target.
const eggPos = await wk.page.evaluate(() => {
  const g = window.__game;
  let found = null;
  g.world.root.traverse((n) => {
    if (found) return;
    if (n.isGroup && n.children.length === 1 && n.children[0].isGroup) {
      // the holder group animateItemPop() creates around the popped model
      const inner = n.children[0];
      let hasMesh = false;
      inner.traverse((c) => { if (c.isMesh) hasMesh = true; });
      if (hasMesh && n.position.y > 0.3 && n.position.y < 3) found = n;
    }
  });
  return found ? { x: found.position.x, y: found.position.y, z: found.position.z } : null;
});
console.log('egg pop position:', eggPos);

if (eggPos) {
  // The real per-frame loop lerps camera.position toward a player-relative
  // goal every frame (js/main.js snapCamera()/camGoal), so a manual
  // camera.position.set() here gets overwritten within a couple of frames.
  // Move the PLAYER next to the egg instead and let the real follow-camera
  // catch up, same as any real close-up in this game would happen.
  await wk.page.evaluate(({ x, z }) => {
    window.__game.player.root.position.set(x, 0, z + 1.1);
  }, eggPos);
  await wk.page.waitForTimeout(250);
  await wk.shot('dragon-egg-pop-le-closeup');
}

console.log('screenshot saved under /tmp/dragon-egg-pop-shots');
await wk.b.close();
