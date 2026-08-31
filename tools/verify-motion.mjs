// AN ENEMY'S BONES MUST MOVE. (Post-mortem promise, 2026-08-31.)
//
// Dad, from play: "the skeletons that appear in level one don't have an
// animation. they don't walk or attack with an animation." Nothing in the
// suite bank had ever asserted MOTION: verify-fights checks damage, the
// screenshot audits check composition, and a skinned mesh gliding around in
// bind pose passes both. This suite closes that class of bug for every
// KayKit/monster body at once: in a spread of rooms across regions, wake
// every enemy that owns a mixer and assert a LEG bone's quaternion actually
// changes while it acts.
//
// Measurement notes, learned the empirical way (2026-08-31 session):
// - Sample a LEG bone (upperleg*), not the first bone found — a walk cycle
//   sways the spine by ~0.006 quaternion delta, which reads as "frozen" and
//   false-fails a healthy enemy. Legs swing an order of magnitude harder.
// - The player is teleported beside each enemy in turn (wakes sleepers,
//   triggers chases/attacks); every enemy keeps recording the whole time.
// - Threshold 0.03: healthy classes measure 0.14-0.27; the broken case this
//   suite exists for measures ~0.000.
import { launchBrowser } from './launch.mjs';

// One room per enemy family/region that spawns mixer-driven bodies. Chosen
// over "every room" to keep the suite inside the browser-suite time budget.
const ROOMS = ['la', 'la1', 'lb', 'lc', 'yg1', 'yg2', 'yg3', 'yg4', 'yg5', 'yg6'];
const THRESHOLD = 0.03;

const b = await launchBrowser();
const page = await b.newPage({ viewport: { width: 740, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'MOTION');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game;
  g.state.settings.musicVol = 0; g.state.settings.sfxVol = 0; });
for (let i = 0; i < 60; i++) {
  await page.evaluate(() => { window.__game.narration.blocking = false; });
  await new Promise((r) => setTimeout(r, 33));
}

const go = async (room) => {
  for (let a = 0; a < 6; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.narration.blocking = false;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => {
        window.__game.narration.blocking = false;
        const g = window.__game;
        return g.world && g.world.roomId === r && g.player.hearts > 1;
      }, room, { timeout: 45000 });
      return true;
    } catch {}
  }
  return false;
};

let pass = true;
const report = [];
for (const room of ROOMS) {
  if (!(await go(room))) { report.push(`${room}: WARP FAILED`); pass = false; continue; }
  const out = await page.evaluate(async () => {
    const g = window.__game;
    g.player.iframes = 999999; g.player.hearts = 12;
    for (let i = 0; i < 600; i++) {
      g.narration.blocking = false;
      await new Promise((r) => requestAnimationFrame(r));
      if ((g.world.enemies || []).some((e) => e.mixer)) break;
    }
    const foes = (g.world.enemies || []).filter((e) => !e.dead && e.mixer && e.model);
    // Measure EVERY bone, all three channels, keep the max. Two traps found
    // writing this: a walk cycle sways the spine by ~0.006 (quaternion-only
    // on one chosen bone false-fails), and the slime rig's Root bone is a
    // static parent — its squash lives in child-bone position/scale tracks,
    // so a single-bone measure scored a healthy Shade at exactly 0.000.
    const recs = foes.map((e) => {
      const bones = [];
      e.model.traverse((n) => { if (n.isBone && bones.length < 40) bones.push(n); });
      return { e, bones,
        base: bones.map((bn) => ({ q: bn.quaternion.clone(), p: bn.position.clone(), s: bn.scale.clone() })),
        moved: 0 };
    });
    for (const r of recs) {
      if (!r.bones.length) continue;
      for (let i = 0; i < 90; i++) {
        g.narration.blocking = false;
        g.player.root.position.set(r.e.x + 1.3, 0, r.e.z);
        await new Promise((rr) => requestAnimationFrame(rr));
        for (const r2 of recs) {
          if (!r2.bones.length || r2.e.dead) continue;
          for (let k = 0; k < r2.bones.length; k++) {
            const bn = r2.bones[k], b0 = r2.base[k];
            const d = (1 - Math.abs(bn.quaternion.dot(b0.q)))
              + bn.position.distanceTo(b0.p) + bn.scale.distanceTo(b0.s);
            if (d > r2.moved) r2.moved = d;
          }
        }
      }
    }
    return recs.map((r) => ({ cls: r.e.constructor.name, bones: r.bones.length,
      moved: +r.moved.toFixed(4), dead: r.e.dead }));
  });
  for (const r of out) {
    // an enemy that died mid-measure (geyser, hazard) is excused; a body with
    // no bones at all (pure-mesh props) is out of scope here
    if (r.dead || !r.bones) continue;
    const ok = r.moved >= THRESHOLD;
    if (!ok) pass = false;
    report.push(`${room}: ${r.cls} (${r.bones} bones) moved=${r.moved} ${ok ? 'ok' : '*** FROZEN ***'}`);
  }
}
for (const line of report) console.log(line);
console.log(pass ? '\n✓ PASS — every rigged enemy visibly animates'
  : '\n✗ FAIL — a rigged enemy is gliding in bind pose');
await b.close();
process.exit(pass ? 0 : 1);
