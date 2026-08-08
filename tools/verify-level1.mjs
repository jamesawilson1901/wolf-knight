// LEVEL 1 GREYBOX VERIFIER — does the built level match design/LEVEL-MAP.md?
//
// Everything here is read from the WORLD THAT WAS BUILT, not from the spec
// table that describes it. A door graph derived from the data it was generated
// from proves nothing; a door graph derived from world.doors proves the rooms.
//
// Checks:
//   1  every space builds, with no page errors
//   2  the spine is traversable end to end, in order
//   3  every optional pocket loops back onto the space it hangs off
//   4  no dead ends — every space has a way out
//   5  the four-step teach is laid out, in order, along the walk
//   6  per-room draw calls and triangles vs the budget (<125 / <500k)
//   7  no interactive marker sits in the blind strip
//   Run:  (nohup python3 -m http.server 8901 &) ; node tools/verify-level1.mjs
//   Add:  --dressed   to check the art costume instead of the greybox
import { chromium } from 'playwright';

const DRESSED = process.argv.includes('--dressed');
const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', DRESSED ? 'DRESSED' : 'GREYBOX');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate((dressed) => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf'];
  g.state.settings.greybox = !dressed;
  g.player.iframes = 99999;
}, DRESSED);

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => {
      const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true });
    }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry — SwiftShader builds a room slowly */ }
  }
  return false;
};

// Snapshot what the room actually contains.
const snap = () => page.evaluate(() => {
  const g = window.__game, w = g.world, i = g.renderer.info;
  // the southernmost box collider is the real south edge (the ground plane is
  // built oversized, which is how an earlier blind-strip audit lied)
  let southEdge = -Infinity;
  for (const c of w.boxColliders) southEdge = Math.max(southEdge, c.maxZ);
  const interactive = [];
  for (const [k, v] of Object.entries(w.markers)) {
    const push = (o) => { if (o && typeof o.z === 'number') interactive.push({ k, x: o.x, z: o.z }); };
    if (Array.isArray(v)) v.forEach(push); else push(v);
  }
  return {
    doors: w.doors.map((d) => ({ to: d.to, minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: d.maxZ })),
    spawn: { ...w.spawn },
    markers: Object.keys(w.markers),
    interactive,
    southEdge,
    boxes: w.boxColliders.length,
    calls: i.render.calls, tris: i.render.triangles,
    geoms: i.memory.geometries, texs: i.memory.textures,
  };
});

const SPACES = ['la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3', 'ld', 'ld1', 'lg4', 'le'];
const SPINE = ['la', 'lg1', 'lb', 'lg2', 'lc', 'lg3', 'ld', 'lg4', 'le'];
const POCKETS = { la1: 'la', lb1: 'lb', lb2: 'lb', lc1: 'lc', ld1: 'ld' };

console.log(`\nmode: ${DRESSED ? 'DRESSED (art)' : 'GREYBOX'}`);
console.log('\n── 1. every space builds ────────────────────────────────');
const S = {};
for (const id of [...SPACES, 'zoo']) {
  const ok = await go(id);
  if (!ok) { check(`${id} builds`, false); continue; }
  S[id] = await snap();
  console.log(`  ${id.padEnd(4)} doors→[${S[id].doors.map((d) => d.to).join(',')}]  ` +
    `calls ${String(S[id].calls).padStart(3)}  tris ${String(S[id].tris).padStart(6)}  boxes ${S[id].boxes}`);
}
check('all 14 Level 1 spaces + the zoo build', Object.keys(S).length === 15,
  { built: Object.keys(S).length, missing: [...SPACES, 'zoo'].filter((i) => !S[i]) });

console.log('\n── 2. the spine is traversable, in order ────────────────');
let broken = null;
for (let i = 0; i < SPINE.length - 1; i++) {
  const from = SPINE[i], to = SPINE[i + 1];
  if (!S[from] || !S[from].doors.some((d) => d.to === to)) { broken = `${from} → ${to}`; break; }
}
check('the critical path la→lg1→lb→lg2→lc→lg3→ld→lg4→le is walkable', !broken,
  broken ? { missingLink: broken } : { hops: SPINE.length - 1 });

// and backwards — a child who walks into a choke must be able to walk out again
let backBroken = null;
for (let i = SPINE.length - 1; i > 0; i--) {
  const from = SPINE[i], to = SPINE[i - 1];
  if (!S[from] || !S[from].doors.some((d) => d.to === to)) { backBroken = `${from} → ${to}`; break; }
}
check('the spine is walkable BACKWARDS too (no one-way compression)', !backBroken,
  backBroken ? { missingLink: backBroken } : undefined);

console.log('\n── 3. every optional pocket loops back ──────────────────');
for (const [pocket, host] of Object.entries(POCKETS)) {
  const s = S[pocket];
  check(`${pocket} loops back onto ${host}`, !!s && s.doors.some((d) => d.to === host),
    s ? { doors: s.doors.map((d) => d.to) } : undefined);
  const hostHasIt = S[host] && S[host].doors.some((d) => d.to === pocket);
  check(`${host} actually offers the ${pocket} branch`, !!hostHasIt);
}

console.log('\n── 4. no dead ends ─────────────────────────────────────');
const dead = SPACES.filter((id) => S[id] && S[id].doors.length === 0);
check('no space is a dead end', dead.length === 0, { dead });
// and nothing points at a room that does not exist
const ALL = new Set([...SPACES, 'zoo', 'den']);
const dangling = [];
for (const id of SPACES) for (const d of (S[id] ? S[id].doors : [])) if (!ALL.has(d.to)) dangling.push(`${id}→${d.to}`);
check('no door leads to a room that does not exist', dangling.length === 0, { dangling });

console.log('\n── 5. the four-step teach, in order along the walk ──────');
const TEACH = [
  ['introduce', 'ld', 'teachBrazier'],
  ['develop', 'ld', 'gutterSpots'],
  ['twist', 'ld1', 'orderSpots'],
  ['conclude', 'le', 'cageBraziers'],
];
for (const [step, room, marker] of TEACH) {
  check(`${step}: ${room} carries ${marker}`, !!S[room] && S[room].markers.includes(marker));
}
// order = the rooms are met in spine order, and the twist room hangs off the
// develop room so it CANNOT be reached before the ability exists
check('the twist (ld1) is only reachable through the develop room (ld)',
  !!S.ld1 && S.ld1.doors.every((d) => d.to === 'ld'), { from: S.ld1 && S.ld1.doors.map((d) => d.to) });
check('nothing new is introduced after the twist — lg4 and le teach no new marker',
  !!S.lg4 && !S.lg4.markers.some((m) => /teach|gutter|order/i.test(m)));

console.log('\n── 6. draw call + triangle budget ──────────────────────');
const worst = SPACES.map((id) => S[id]).filter(Boolean)
  .reduce((a, s) => (s.calls > a.calls ? s : a), { calls: 0, tris: 0 });
const worstId = SPACES.find((id) => S[id] && S[id].calls === worst.calls);
// THE CEILING MOVED, and it is worth writing down why rather than just
// editing the number. 100 was set in the performance pass against rooms that
// dad has since played and called "big but bare". A budget that can only be
// met by an empty room is measuring the wrong thing — it was, in effect,
// enforcing the emptiness.
//
// A room dressed to design/ROOM-STANDARD.md costs about 110. What paid for the
// difference: surface-class material collapsing, a merge threshold of two, one
// propTint per district, small clutter opting out of the shadow pass, and a
// shadow box that follows Kael instead of sitting at the world origin. Without
// those five, `la` was 163.
//
// 125 is NOT a measured device limit and must not be treated as one — it is
// 110 plus a working margin. The real constraint is frame time on a mid-range
// Android, which cannot be measured from here: SwiftShader is a CPU
// rasteriser, so its timings say nothing about a phone GPU. If the kids report
// jank, this number is the first thing to come back down.
check('worst-case draw calls under 125', worst.calls < 125, { room: worstId, calls: worst.calls });
check('worst-case triangles under 500,000', worst.tris < 500000, { room: worstId, tris: worst.tris });
console.log('  per-room cost:');
for (const id of SPACES) if (S[id]) console.log(`    ${id.padEnd(4)} ${String(S[id].calls).padStart(3)} calls  ${String(S[id].tris).padStart(6)} tris`);
if (S.zoo) console.log(`    zoo  ${String(S.zoo.calls).padStart(3)} calls  ${String(S.zoo.tris).padStart(6)} tris`);

console.log('\n── 7. blind strip is clear ─────────────────────────────');
const blind = [];
for (const id of SPACES) {
  if (!S[id]) continue;
  for (const it of S[id].interactive) {
    if (it.z > S[id].southEdge - 2.5) blind.push(`${id}.${it.k} @z=${it.z} (edge ${S[id].southEdge})`);
  }
}
check('no interactive marker sits in the 2.5u blind strip', blind.length === 0, { blind });

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
