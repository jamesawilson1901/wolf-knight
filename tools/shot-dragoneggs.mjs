// One-off screenshot pass for design/DRAGON-EGGS.md — NOT a verify suite
// (not named verify-*, so it is not part of any gate). Saves PNGs under
// /tmp for a human/Claude visual read before calling the feature done.
import { launch } from './wk-drive.mjs';

const wk = await launch({ timescale: 1, evidenceDir: '/tmp/dragoneggs-shots' });
await wk.newGame('DRAGONSHOT');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

// Only the ONE flag relevant to the room being shot — setting every
// region's boss flag at once (an earlier draft of this script) fired every
// OTHER region's own wolf-grant toast on top of the shot, burying the
// shrine under an unrelated "The Storm Wolf awakens!" banner.
async function gotoRoom(room, flag, at) {
  if (flag) await wk.page.evaluate((f) => { window.__game.state.flags[f] = true; }, flag);
  // NO forms param — passing one resets state.formsUnlocked, which
  // re-triggers that region's own wolf-grant narration/toast on every
  // visit once bossDefeated is already true. Omitting it keeps whatever
  // was already unlocked.
  await wk.page.evaluate((r) => window.__wkJump(r), room);
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  // Screenshot-only: strip any proximity trigger that would pop a menu open
  // mid-walk (e.g. `la`'s own moonstone) and freeze the world for the rest
  // of this script — not a thing any verify SUITE would ever do, since a
  // real suite exists to prove that trigger works, but this script only
  // wants a clean shot of the shrine/companion.
  await wk.page.evaluate(() => {
    const m = window.__game.world.markers;
    delete m.travelSpot; delete m.shopSpot;
  });
  if (at) {
    // A raw position write alone leaves the camera behind — it eases
    // toward the player rather than snapping, and main.js's own
    // snapCamera() (which the real per-door transition calls) is a private
    // module function, not exposed on window.__game. Real routeTo()
    // walking also turned out fragile here (ddp's own fallenColumn wedges
    // the BFS's straight-leg assumption near the shrine no matter which
    // side it approaches from). So: teleport the player, then replicate
    // snapCamera()'s own maths using ONLY what window.__game already
    // exposes — camera.position tracks player.position by a fixed offset
    // that a normal arrival lets us read straight off the live camera
    // before moving anything.
    await wk.page.evaluate(({ x, z }) => {
      const g = window.__game;
      const off = g.camera.position.clone().sub(g.player.root.position);
      g.player.root.position.set(x, 0, z);
      g.camera.position.copy(g.player.root.position).add(off);
      g.camera.lookAt(x, 0.6, z);
    }, at);
    await wk.page.waitForTimeout(200);
  }
  // Silence whatever narration/toast the arrival itself fired — this is a
  // screenshot of the SHRINE, not of the story beat, so skip any speaking
  // line and hide the toast/caption chrome before capturing.
  await wk.page.evaluate(() => {
    const g = window.__game;
    if (g.narration.speaking) g.narration.skip();
    for (const id of ['big-toast', 'caption']) {
      const el = document.getElementById(id) || document.querySelector('.' + id);
      if (el) el.style.display = 'none';
    }
  });
  await wk.page.waitForTimeout(150);
}

// FIRE — le, standing close to the shrine (6,9) so its light column is
// actually in frame (the fixed-angle camera does not follow a facing turn).
await gotoRoom('le', 'bossDefeated', { x: 6, z: 6.5 });
await wk.shot('fire-shrine-le');

// TIDE — ddp, right up against the shrine (8.5,-2) — the tide colour reads
// low-contrast against this room's own icy-blue palette from any distance
// (true of the room's own pre-existing memorial shrine too), so standing
// close is what actually shows it is there.
await gotoRoom('ddp', 'meriDefeated', { x: 8.5, z: -3.2 });
await wk.shot('tide-shrine-ddp');

// STORM — scr, standing close to (9,9).
await gotoRoom('scr', 'ariaDefeated', { x: 9, z: 6.5 });
await wk.shot('storm-shrine-scr');

// COMPANION DRAGON — hatch one, equip it, jump to an open room, and let it
// catch up to Kael in view.
await wk.page.evaluate(async () => {
  const d = await import('/js/dragonEggs.js');
  d.addEgg('fire'); d.hatchEgg('fire'); d.setEquippedDragon('fire');
});
// 'la' (Ember Hollow's own ashfall entrance) rather than the reddish Cinder
// Bridges — a warm-orange fire dragon read as almost invisible against
// lc's own lava-toned ground in an earlier draft of this shot; ashfall's
// neutral grey is real contrast.
await gotoRoom('la', null, { x: 2, z: 6 });
// let the dragon catch up into frame via the real per-frame path (this is a
// screenshot, not a suite — real frames are fine here)
await wk.page.waitForTimeout(2000);
await wk.shot('companion-dragon-following');

console.log('screenshots saved under /tmp/dragoneggs-shots');
await wk.b.close();
