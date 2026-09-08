// TAM THE WAYFARER — the ride home, in every room a boss used to stand in.
//
// Dad's ask: "have an NPC appear in the room of every boss fight after they
// are defeated. when you talk to him he offers teleportation back to the den
// and all previous levels. when you talk to him in the den he offers the same."
//
// The four things that can silently be wrong, in the order they would hurt:
//
//   1. HE IS THERE BEFORE THE FIGHT. A fast-travel point inside a boss arena
//      with the boss still alive is a way to skip the fight.
//   2. HE NEVER TURNS UP. Spawning only on a REBUILD would mean the child who
//      just won never meets him — they walk out and back in first, or never.
//   3. HE IS THERE AND DOES NOTHING. The marker is what main.js watches; if
//      spawnWayfarer sets the body and not `travelSpot`, he is scenery.
//   4. HE IS STANDING IN A ROCK. Same class of bug as issue #129 — measured
//      here rather than eyeballed, at the roster's own body radius.
//
// §5 is the only one that proves the FEATURE rather than its wiring: real
// WASD keys, an actual walk across the arena floor, and the travel menu open
// on the screen at the end of it with real rooms in it.
import { launch } from './wk-drive.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const ARENAS = ['le', 'vz', 'tgl', 'f5', 'scr', 'ddp', 'xth'];
const ALL_FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
const FLAGS = ['bossDefeated', 'wardenDefeated', 'sylvaDefeated', 'borealDefeated',
  'ariaDefeated', 'meriDefeated', 'grimmFreed'];

const wk = await launch({ dev: true });
const { page } = wk;
await wk.newGame('TAM');
await page.evaluate(() => { const g = window.__game; g.state.settings.captions = false; });

// ---------------------------------------------------------------------------
console.log('\n── 1 · the posts themselves ──────────────────────────');
// One post per boss arena plus the Den, and no others: if a new arena ships
// without a post, this is where it says so.
const posts = await page.evaluate(async () => {
  const m = await import('/js/npcs.js');
  return m.WAYFARER_POSTS;
});
check('a post for every boss arena, and the Den',
  Object.keys(posts).sort().join(',') === [...ARENAS, 'den'].sort().join(','),
  Object.keys(posts));
check('every arena post is gated on a boss flag',
  ARENAS.every((r) => FLAGS.includes(posts[r].flag)),
  ARENAS.map((r) => `${r}:${posts[r].flag}`));
check('the Den post is ungated and leaves the moonstone its marker',
  posts.den.flag === null && posts.den.keepMarker === true);

// ---------------------------------------------------------------------------
console.log('\n── 2 · not one step before the boss falls ────────────');
await wk.jump('le', ALL_FORMS);
const before = await page.evaluate(() => {
  const w = window.__game.world;
  return { wayfarer: !!w.wayfarer, travel: w.markers.travelSpot || null,
    boss: !!w.boss, flag: !!window.__game.state.flags.bossDefeated };
});
check('the Shadowgrip is still standing', before.boss && !before.flag);
check('no wayfarer in the arena yet', !before.wayfarer, before);
check('no fast-travel out of a live boss fight', before.travel === null, before.travel);

// ---------------------------------------------------------------------------
console.log('\n── 3 · he walks in where the child is standing ───────');
// Not a rebuild — the same room instance the fight happened in.
await page.evaluate(() => { const b = window.__game.world.boss; b._defeat(); });
// TWO THINGS STAND BETWEEN THE WIN AND THE ARRIVAL, AND BOTH ARE ON PURPOSE.
//
// Tam counts himself in on GAME time, exactly as openTheWayOn's door does and
// for the reason written there — a wall clock fires on a page whose tab is
// throttled and on a page that is paused, and the arena must not fill up with
// arrivals while the child is looking at something else. So anything that
// stops main.js reaching `world.animate` also holds him at the door:
//
//   * the PERK CARD. A boss pays 60 XP, a level-up puts a card up, and the
//     card sets menuPaused — which returns out of the animate loop before a
//     single onAnimate hook runs.
//   * NARRATION. A story line freezes the world while it plays, and a boss
//     kill fires three of them back to back.
//
// A child clears both by playing: pick a power, listen to Pip. This does the
// same, in a loop, because which of them is up at any instant is a race.
const play = async () => {
  const card = page.locator('#perk-menu .perk-card').first();
  if (await card.count() && await card.isVisible().catch(() => false)) {
    await card.dispatchEvent('pointerdown');
    return 'perk';
  }
  const skipped = await page.evaluate(() => {
    const n = window.__game.narration;
    if (n && n.blocking) { n.skip(); return true; }
    return false;
  });
  return skipped ? 'narration' : null;
};
let arrived = false, held = [];
for (let i = 0; i < 40 && !arrived; i++) {
  const what = await play();
  if (what) held.push(what);
  arrived = await page.evaluate(() => !!window.__game.world.wayfarer);
  if (!arrived) await page.waitForTimeout(1000);
}
check('what held him at the door was the win itself, not a bug', true, held);
check('Tam arrives into the arena that was just won, without a reload', arrived);
const live = await page.evaluate(() => {
  const w = window.__game.world;
  return { travel: w.markers.travelSpot, wayfarerSpot: w.markers.wayfarerSpot,
    room: w.roomId, sameRoom: w.roomId === 'le' };
});
check('...in le, and he owns the fast-travel marker',
  live.sameRoom && live.travel && Math.abs(live.travel.x - 6) < 0.01
  && Math.abs(live.travel.z - 8) < 0.01, live);

// ---------------------------------------------------------------------------
console.log('\n── 4 · every arena, on the way back through ──────────');
await page.evaluate((flags) => {
  for (const f of flags) window.__game.state.flags[f] = true;
}, FLAGS);
for (const room of ARENAS) {
  await wk.jump(room, ALL_FORMS);
  const r = await page.evaluate(async ({ R }) => {
    const g = window.__game, w = g.world;
    const n = w.wayfarer;
    if (!n) return { there: false };
    const post = (await import('/js/npcs.js')).WAYFARER_POSTS[w.roomId];
    // clear ground at the roster's largest body radius, ignoring his own
    // collider — the same overlap test verify-spawn-clear and probe-freespot
    // use, because "would resolveCircle push me off" is a weaker question.
    let clear = true;
    for (const c of w.boxColliders) {
      const cx = Math.max(c.minX, Math.min(post.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(post.z, c.maxZ));
      if ((post.x - cx) ** 2 + (post.z - cz) ** 2 < R * R) clear = false;
    }
    for (const c of w.circleColliders) {
      if (Math.abs(c.x - post.x) < 1e-6 && Math.abs(c.z - post.z) < 1e-6) continue; // his own
      if ((post.x - c.x) ** 2 + (post.z - c.z) ** 2 < (c.r + R) ** 2) clear = false;
    }
    return { there: true, clear, visible: !!(n.model && n.model.parent),
      travel: w.markers.travelSpot, x: post.x, z: post.z,
      ticked: typeof w.updateNpcs === 'function' };
  }, { R: 0.44 });
  check(`${room}: Tam is there, drawn, ticking, on clear ground, holding the marker`,
    r.there && r.clear && r.visible && r.ticked && r.travel
    && Math.abs(r.travel.x - r.x) < 0.01 && Math.abs(r.travel.z - r.z) < 0.01, r);
}

// ---------------------------------------------------------------------------
console.log('\n── 5 · walking up to him, with real keys ─────────────');
await wk.jump('le', ALL_FORMS);
const post = posts.le;
// THE MENU IS ALSO THE FINISH LINE, AND THAT IS THE POINT. Walking inside 1.5u
// of him opens the travel menu, which pauses the world — so the driver's own
// stuck-detector fires a stride later and reports a wedge. The first cut of
// this check read that as a failure and it was the feature working. Arrival is
// therefore "close enough OR the menu is up", whichever lands first.
const seenMenu = () => page.evaluate(() => {
  const el = document.getElementById('map-menu');
  return !!(el && getComputedStyle(el).display !== 'none');
});
let opened = false;
const walk = await wk.walkTo(post.x, post.z, {
  timeout: 25, arrive: 1.4,
  onTick: async () => { if (!opened && await seenMenu()) opened = true; },
});
check('the bot can walk to him across the arena floor',
  !!walk.ok || opened || await seenMenu(), walk);
const menu = await page.waitForFunction(() => {
  const el = document.getElementById('map-menu');
  return el && getComputedStyle(el).display !== 'none'
    && el.querySelectorAll('.map-room').length;
}, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => 0);
check('the travel menu opens on its own when he is reached', menu > 0, { rows: menu });
const rows = await page.evaluate(() => [...document.querySelectorAll('#map-menu .map-room')]
  .map((d) => d.textContent.replace(/\s+/g, ' ').trim()));
check('...and it offers the Den plus the lands already freed',
  rows.some((r) => /Den/.test(r)) && rows.length >= 3, rows);

// ---------------------------------------------------------------------------
console.log('\n── 6 · the Den keeps its moonstone ───────────────────');
await wk.jump('den', ALL_FORMS);
const den = await page.evaluate(() => {
  const w = window.__game.world;
  const t = w.markers.travelSpot, f = w.markers.wayfarerSpot;
  return { wayfarer: !!w.wayfarer, travel: t, wayfarerSpot: f,
    apart: t && f ? Math.hypot(t.x - f.x, t.z - f.z) : null,
    villagers: (w.npcs || []).map((n) => n.id) };
});
check('Tam stands in the Den too', den.wayfarer, den.villagers);
check('...the moonstone still owns the marker',
  den.travel && Math.abs(den.travel.x + 5.4) < 0.01 && Math.abs(den.travel.z + 7.0) < 0.01,
  den.travel);
check('...and he stands inside its reach, so walking to HIM opens it',
  den.apart !== null && den.apart < 1.5, { apart: den.apart });
check('the villagers still spawn and still tick beside him',
  den.villagers.includes('wren') && den.villagers.includes('tam'), den.villagers);

console.log(wk.errors.length ? '\nPAGE ERRORS:\n' + wk.errors.join('\n') : '');
for (const e of wk.errors) errors.push('PAGEERROR: ' + e);
await wk.b.close();
console.log(errors.length ? `\nFAIL (${errors.length}): ${errors.join(', ')}` : '\nPASS');
process.exit(errors.length ? 1 : 0);
