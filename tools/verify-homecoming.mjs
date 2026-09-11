// EVERYONE HOME — design/WIDER-WORLD.md §4.2, slice v3.144. The last two
// slices in the sequencing table: Grimm and Luna rest at the Den once he is
// freed, and every hearth reads growth stage 5 (its own spirit light on the
// hearth-fire, the settler's gesture turned to `Interact`) at the same
// moment — the one world-wide beat this whole plan has.
//
// Before `grimmFreed`, none of this exists. After it, all of it does, at
// once — never gated stage-by-stage the way la/vh/t1a/... shipped, because
// stage 5 is a single global fact, not five more slices.
import { launch } from './wk-drive.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];

const wk = await launch({ dev: true });
const { page } = wk;
await wk.newGame('HOME');
await page.evaluate(() => { window.__game.state.settings.captions = false; });

// Every fact growthStage(key) sums, driven to its max for every one of the
// seven regions at once — the same `setStage` shape verify-growth.mjs uses,
// but pinned to n=5 (or n=0) rather than swept 0..4, since this suite is
// about the one moment every hearth crosses together.
const setAll = (grimmFreed) => page.evaluate(async (grimmFreed) => {
  const g = window.__game;
  const { PUP_HOME } = await import('/js/pip.js');
  const { KEEPSAKE, COURT_RELICS } = await import('/js/restoration.js');
  const KEYS = ['ember', 'stone', 'wild', 'frost', 'storm', 'vale', 'court'];
  for (const key of KEYS) {
    g.WS.set(key, 'restored', true);
    for (const id of Object.keys(PUP_HOME)) if (PUP_HOME[id] === key) g.state.flags.pups[id] = true;
    if (!g.state.inventory.treasures) g.state.inventory.treasures = [];
    if (key === 'court') {
      for (const r of COURT_RELICS) g.WS.set('court', 'relic_' + r, true);
    } else if (KEEPSAKE[key] && !g.state.inventory.treasures.includes(KEEPSAKE[key])) {
      g.state.inventory.treasures.push(KEEPSAKE[key]);
    }
    g.WS.set(key, 'dungeon', true);
  }
  g.state.flags.grimmFreed = grimmFreed;
}, grimmFreed);

// ---------------------------------------------------------------------------
console.log('\n── 1 · before grimmFreed: none of it exists ──────────────');
await setAll(false);
const before = await page.evaluate(async () => {
  const { growthStage } = await import('/js/restoration.js');
  return { stage: growthStage('ember') };
});
check('with every other fact true but grimmFreed false, growthStage caps at 4',
  before.stage === 4, before);

await wk.jump('den', ALL);
const denSnapBefore = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  return {
    hasGrimm: !!w.markers.grimmSpot,
    hasLuna: !!w.markers.lunaHome,
    calls: g.renderer.info.render.calls,
  };
});
check('no Grimm at the Den before he is freed', !denSnapBefore.hasGrimm, denSnapBefore);
check('no Luna at the Den before he is freed', !denSnapBefore.hasLuna, denSnapBefore);

await wk.jump('la', ALL);
const laSnapBefore = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  return { hasOrb: !!w.markers.homeOrbSpot, calls: g.renderer.info.render.calls };
});
check('no home-orb at a hearth before grimmFreed (la)', !laSnapBefore.hasOrb, laSnapBefore);

// ---------------------------------------------------------------------------
console.log('\n── 2 · with grimmFreed: everyone, everywhere, at once ────');
await setAll(true);
const after = await page.evaluate(async () => {
  const { growthStage } = await import('/js/restoration.js');
  return { stage: growthStage('ember') };
});
check('with grimmFreed too, growthStage reaches 5', after.stage === 5, after);

console.log('\n   the Den:');
await wk.jump('den', ALL);
const denSnap = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
  return {
    hasGrimm: !!w.markers.grimmSpot,
    hasLuna: !!w.markers.lunaHome,
    calls: g.renderer.info.render.calls,
  };
});
check('Grimm rests by the north gate', denSnap.hasGrimm, denSnap);
check('Luna’s light stands by the fire', denSnap.hasLuna, denSnap);
check('the Den stays under 135 draw calls with both', denSnap.calls <= 135, denSnap);

console.log('\n   every hearth reads stage 5:');
// SETTLER_POSTS with `minStage: 1` (the Village's three) never reach stage
// 5 — village has no pups/keepsake/dungeon fact of its own — so they are
// filtered out here rather than asserted against a claim they never made,
// the same `minStage >= 2` line verify-growth.mjs's own §3 draws.
const posts = await page.evaluate(async () => {
  const { SETTLER_POSTS } = await import('/js/npcs.js');
  return Object.entries(SETTLER_POSTS)
    .filter(([, p]) => p.minStage >= 2)
    .map(([room, p]) => ({ room, key: p.key }));
});
check('all seven region hearths are in SETTLER_POSTS', posts.length === 7, posts);

for (const post of posts) {
  await wk.jump(post.room, ALL);
  const snap = await page.evaluate(async () => {
    const g = window.__game, w = g.world;
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    const settler = (w.npcs || []).find((npc) => npc.id && w.markers.settlerSpot
      && Math.hypot(npc.model.position.x - w.markers.settlerSpot.x, npc.model.position.z - w.markers.settlerSpot.z) < 0.1);
    return {
      room: w.roomId,
      hasOrb: !!w.markers.homeOrbSpot,
      gestureIsInteract: !!(settler && settler.gesture && settler.gesture.getClip().name === 'Interact'),
      calls: g.renderer.info.render.calls,
    };
  });
  check(`${post.key} @ ${post.room}: the hearth-fire itself becomes the spirit light`,
    snap.hasOrb, snap);
  check(`${post.key} @ ${post.room}: the settler's gesture turns to Interact`,
    snap.gestureIsInteract, snap);
  check(`${post.key} @ ${post.room}: draw calls ${snap.calls} <= 125`, snap.calls <= 125, snap);
}

// ---------------------------------------------------------------------------
console.log('\n── 3 · Grimm and Luna speak, once, then throttled ────────');
await wk.jump('den', ALL);
const spoke = await page.evaluate(async () => {
  const g = window.__game;
  const out = {};
  out.grimmFirst = await g.narration.say('grimm_den');
  out.grimmSecond = await g.narration.say('grimm_den');
  out.lunaFirst = await g.narration.say('luna_den');
  out.lunaSecond = await g.narration.say('luna_den');
  return out;
});
check('grimm_den fires once, not on a second call', spoke.grimmFirst && !spoke.grimmSecond, spoke);
check('luna_den fires once, not on a second call', spoke.lunaFirst && !spoke.lunaSecond, spoke);

console.log('\n' + (errors.length ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : '✓ Grimm and Luna are home, and every hearth caught fire for real'));
await wk.close();
process.exit(errors.length ? 1 : 0);
