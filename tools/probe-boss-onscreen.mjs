// IS THE TELL ON THE SCREEN AT ALL?
//
// COMBAT-SPEC's readability law puts the tell on the BODY, which quietly
// assumes the body is in frame. The view is 3/4 top-down, so a tall boss's
// head climbs toward the top edge — and the boss health bar lives up there.
// A boss that rears (Aria's sea dragon) can put the most legible half of its
// wind-up behind the HUD without anything failing.
//
// So it is measured, by NDC projection, the same way Boreal's dive bounds
// were: the top of the boss's box, projected, as a percentage down the
// screen. Negative means above the top edge. Written when Aria changed body
// on 2026-09-05, and the answer then was that she idles at -1.2% and peaks
// at -3.2% — the same band as the Shadowgrip's -1.4/-1.4, which is region
// one and has shipped for months. This is a RULER, not a pass/fail suite:
// what it is for is comparing a new body against the ones already in the
// game before deciding a `stands` number by eye.
import { launch } from './wk-drive.mjs';
const wk = await launch({ timescale: 1 });
await wk.newGame('NDC2');
const ROOMS = [['le', 'Shadowgrip'], ['tgl', 'Sylva'], ['scr', 'Aria'], ['ddp', 'Meri']];
console.log('boss         idle%   windup-peak%   (negative = above the screen)');
for (const [room, name] of ROOMS) {
  await wk.jump(room, ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'moonlight']);
  const r = await wk.page.evaluate(async () => {
    const THREE = await import('three');
    const g = window.__game;
    const b = g.world.boss;
    if (!b) return null;
    const o = b.model || b.root;
    b.hp = b.maxHp;
    g.player.root.position.set(b.x, g.player.root.position.y, b.z + 3.4);
    g.player.iframes = 99999;
    const settle = (n) => new Promise((res) => { let i = 0;
      const step = () => (++i > n ? res() : requestAnimationFrame(step));
      requestAnimationFrame(step); });
    const topPct = () => {
      const bb = new THREE.Box3().setFromObject(o);
      const t = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
      return +(((1 - t.project(g.camera).y) / 2) * 100).toFixed(1);
    };
    await settle(90);
    const idle = topPct();
    // drive the swipe wind-up and sample through it
    b.action = 'windup'; b.actionT = 0; b._setAnim && b._setAnim('attack');
    let peak = 99;
    for (let i = 0; i < 70; i++) { await settle(2); peak = Math.min(peak, topPct()); }
    return { idle, peak };
  });
  console.log(`${name.padEnd(12)} ${r ? String(r.idle).padStart(5) : ' ?'} ${r ? String(r.peak).padStart(12) : ''}`);
}
await wk.b.close();
