// THE DEN GROWS WITH WHO HAS COME HOME (design/DEN-MINIGAMES.md §5.3, v3.203).
//
// Two cues, both read from the save the way everything else in the Den is —
// no counter of their own (§5.1: "rescue count must not be duplicated"):
//
//   1. the HEARTH burns bigger at each rescue tier (worldstate.js unlockTier:
//      0 / 1-3 / 4-8 / 9+ rescues);
//   2. a BANNER per restored region hangs flat on the north palisade in that
//      region's element colour, and the Court's pair once Grimm is free.
//
// Each case is a real save walked into the Den through __wkJump, so the room
// is built by the same code a child's arrival runs.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const wk = await launch({ timescale: 1 });
await wk.newGame('DENGROW');
await wk.page.evaluate(() => setInterval(() => { const n = window.__game.narration; if (n && n.speaking) n.skip(); }, 80));

// set the save, leave, come home, and read the Den as built
const visit = async (setup) => {
  await wk.page.evaluate(setup);
  await wk.jump('g1', ['knight']);
  await wk.jump('den', ['knight']);
  return wk.page.evaluate(async () => {
    const g = window.__game, w = g.world;
    const { elementColor } = await import('/js/juice.js');
    const hearth = w.checkpoints.find((c) => c.id === 'cp_den');
    const B = w._denBanners;
    let cloth = null, rows = [];
    if (B) {
      B.updateMatrixWorld(true);
      const THREE = await import('three');
      const im = B.children.find((c) => c.instanceColor);
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), col = new THREE.Color();
      for (let i = 0; i < (im ? im.count : 0); i++) {
        im.getMatrixAt(i, m); p.setFromMatrixPosition(m.premultiply(im.matrixWorld));
        im.getColorAt(i, col);
        rows.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), col: col.getHex() });
      }
      const box = new THREE.Box3().setFromObject(B);
      cloth = { minY: +box.min.y.toFixed(2), maxY: +box.max.y.toFixed(2), minZ: +box.min.z.toFixed(2), maxZ: +box.max.z.toFixed(2) };
    }
    const want = {};
    for (const [k, el] of Object.entries({ ember: 'fire', stone: 'earth', wild: 'verdant', frost: 'frost', storm: 'storm', vale: 'tide', court: 'moon' })) {
      const c = new (await import('three')).Color(elementColor(el)).multiplyScalar(0.8);
      want[k] = c.getHex();
    }
    return { tier: w.denTier, grow: hearth && hearth.grow, banners: w.markers.denBanners || [], rows, cloth, want,
      halfD: 9, calls: g.renderer.info.render.calls };
  });
};

const fresh = await visit(() => {});
check('a new save: tier 0, the hearth at its small size, no banners', fresh.tier === 0 && fresh.grow === 1
  && fresh.banners.length === 0, fresh);

const one = await visit(() => { const g = window.__game; g.state.flags.rescued = { a: true }; g.WS.set('ember', 'restored'); });
check('one rescue: tier 1, the hearth burns bigger', one.tier === 1 && one.grow > fresh.grow, { tier: one.tier, grow: one.grow });
check('Ember restored: exactly one banner, Ember\'s, in fire colour', one.banners.length === 1
  && one.banners[0].key === 'ember' && one.rows.length === 1 && one.rows[0].col === one.want.ember, one);

const four = await visit(() => { const g = window.__game; g.state.flags.rescued = { a: 1, b: 1, c: 1, d: 1 }; g.WS.set('frost', 'restored'); });
check('four rescues: tier 2, bigger again', four.tier === 2 && four.grow > one.grow, { tier: four.tier, grow: four.grow });
check('Frostpeak restored too: two banners, each in its own region\'s colour', four.banners.length === 2
  && four.rows.every((r) => r.col === four.want.ember || r.col === four.want.frost)
  && new Set(four.rows.map((r) => r.col)).size === 2, four.rows);

const all = await visit(() => { const g = window.__game;
  const r = {}; for (let i = 0; i < 9; i++) r['f' + i] = true; g.state.flags.rescued = r;
  for (const k of ['stone', 'wild', 'storm', 'vale']) g.WS.set(k, 'restored');
  g.state.flags.grimmFreed = true; });
check('nine rescues: tier 3, the biggest hearth', all.tier === 3 && all.grow > four.grow, { tier: all.tier, grow: all.grow });
check('every region home and Grimm free: eight banners (six regions + the Court\'s pair)', all.banners.length === 8
  && all.rows.length === 8 && all.rows.filter((r) => r.col === all.want.court).length === 2, all.banners);
check('the banners hang FLAT on the north palisade (within a hand of its face), clear of the ground',
  all.cloth && all.cloth.minZ > -all.halfD - 0.1 && all.cloth.maxZ < -all.halfD + 0.5 && all.cloth.minY > 0.2, all.cloth);
check('no two banners share a spot, and none stands in the Village road (|x| > 1.5)',
  new Set(all.rows.map((r) => r.x)).size === 8 && all.rows.every((r) => Math.abs(r.x) > 1.5), all.rows);

// the budget, standing at the fire with everything home (where the row is in view)
const calls = await wk.page.evaluate(async () => {
  const g = window.__game; g.player.root.position.set(0, 0, -1.5);
  const wait = (n) => new Promise(async (r) => { for (let i = 0; i < n; i++) await new Promise((q) => requestAnimationFrame(q)); r(); });
  await wait(90);
  const s = []; for (let i = 0; i < 5; i++) { s.push(g.renderer.info.render.calls); await wait(6); }
  return s.sort((a, b) => a - b)[2];
});
// 140 is the Den's own ceiling, not the 125 of a room with fights in it
// (tools/verify-den.mjs: no combat, so standing still IS its worst frame)
check(`a full Den at the fire, banners in view: ${calls} draw calls <= 140 (the Den's ceiling)`, calls <= 140, { calls });

check('no page errors', wk.errors.length === 0, wk.errors.slice(0, 4));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the Den grows with who has come home');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
