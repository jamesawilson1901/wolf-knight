// WEST BOULDER ONLY, INSTRUMENTED. The widened lanes fixed the east side at
// timescale 1, but the west boulder refused to START its north slide. Log the
// player's true stand position at every keydown, hold longer, use a clean
// mid-room approach — separate probe-mechanics failure from real geometry.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-4/lake-west', timescale: 1 });
const say = (...a) => console.log(...a);

await d.newGame('LAKEW');
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.sylvaDefeated = true;
  g.WS.set('frost', 'braziers', true);
});
await d.jump('f3', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking, null, { timeout: 20000 }).catch(() => {});

const west = () => d.page.evaluate(() => {
  const b = (window.__game.world.boulders || []).map((x) => ({
    x: +((x.collider && x.collider.x != null ? x.collider.x : x.x)).toFixed(2),
    z: +((x.collider && x.collider.z != null ? x.collider.z : x.z)).toFixed(2),
    locked: !!x._locked, slide: !!x._slide,
  })).filter((x) => x.x < 0.5)[0];
  return b;
});
const me = () => d.page.evaluate(() => ({
  x: +window.__wk.pos.x.toFixed(2), z: +window.__wk.pos.z.toFixed(2) }));
const settle = () => d.page.evaluate(async () => {
  for (let w = 0; w < 60; w++) {
    if (!(window.__game.world.boulders || []).some((x) => x._slide)) break;
    await new Promise((r) => setTimeout(r, 150));
  }
});

async function hold(key, ms) {
  await d.page.keyboard.down(key); await d.page.waitForTimeout(ms); await d.page.keyboard.up(key);
  await settle();
}

say('start: west boulder', JSON.stringify(await west()), 'me', JSON.stringify(await me()));

// THE LESSON FROM RUN 1: on ice, ANY grazing contact launches a slide — the
// old approach walked diagonally past the boulder and accidentally shoved it
// into the NW corner before the "push" even began. Every approach here stays
// >1.3u away until the deliberate contact: south corridor first, then square
// up along the axis of the push.
// 1) east push: approach via the south, hug the west wall, come up BESIDE it
await d.walkTo(-8.35, 4.0, { timeout: 25, arrive: 0.4 });
await d.walkTo(-8.35, 1.6, { timeout: 12, arrive: 0.3 });
say('stand for E-push: me', JSON.stringify(await me()), 'boulder', JSON.stringify(await west()));
await hold('d', 1100);
let b = await west();
say('after E-push: boulder', JSON.stringify(b), 'me', JSON.stringify(await me()));
if (Math.abs(b.x + 2.97) > 0.5) { say('!! stopper not reached — abort'); }

// 2) north push: back off south, cross east along z=3.8 (clear of stopper),
// square up EXACTLY south of the boulder, then lean north
await d.walkTo(-7.0, 3.8, { timeout: 15, arrive: 0.4 });
await d.walkTo(b.x, 3.8, { timeout: 15, arrive: 0.3 });
const r = await d.walkTo(b.x, b.z + 1.32, { timeout: 12, arrive: 0.22 });
say('stand for N-push: walk', JSON.stringify(r), 'me', JSON.stringify(await me()), 'boulder', JSON.stringify(await west()));
await hold('w', 1600);
b = await west();
say('after N-push #1: boulder', JSON.stringify(b), 'me', JSON.stringify(await me()));
if (!b.locked && Math.abs(b.z - 1.6) < 0.4) {
  await d.walkTo(b.x, b.z + 1.32, { timeout: 12, arrive: 0.2 });
  say('retry stand: me', JSON.stringify(await me()));
  await hold('w', 2600);
  b = await west();
  say('after N-push #2: boulder', JSON.stringify(b), 'me', JSON.stringify(await me()));
}

const plates = await d.page.evaluate(() => ({
  p1: !!window.__game.state.flags.plates.f3_p1, p2: !!window.__game.state.flags.plates.f3_p2 }));
say('plates:', JSON.stringify(plates));
await d.shot('west-final');
say('errors:', JSON.stringify(d.errors));
say(plates.p1 ? 'WEST LANE: SOLVED' : 'WEST LANE: NOT SOLVED');
await d.close();
process.exit(plates.p1 ? 0 : 1);
