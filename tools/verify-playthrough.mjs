// CAN A CHILD WALK THIS GAME FROM THE START TO THE END?
//
// Nothing had ever asked. Ember Hollow shipped with its boss sealed behind the
// Kiln's own forge while eighteen suites were green, because every one of them
// checked a room, a graph or a flag — and none of them WALKED.
//
// This does. It starts a new save and travels the spine of all seven regions
// using the real input path: it writes to `input.move`, the same field the
// joystick writes, and lets the game's own movement and collision carry Kael.
//
// THE ONE RULE THAT MAKES IT WORTH ANYTHING: never place the player. Setting
// root.position teleports straight through the collider that IS the bug — that
// is exactly how verify-route walked past the Kiln blocker and reported clean.
// Every leg here is walked or it fails.
//
//   node tools/verify-playthrough.mjs            all seven regions
//   node tools/verify-playthrough.mjs ember      one region by name
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// The spine of each region, in the order a child walks it, taken from the
// `spine: true` rooms in each level's own room table.
//
// `grant` is what the child would be carrying by the time they arrive — the
// forms earned so far and the bosses already down. This file tests the ROUTE,
// not whether the game hands those out at the right moment; verify-progression
// and verify-sequence own that.
const REGIONS = [
  { name: 'ember', label: 'Ember Hollow', enter: 'la',
    spine: ['la', 'lg1', 'lb', 'lg2', 'lc', 'lg3', 'ld', 'lg4', 'le'],
    grant: { forms: ['knight', 'dark_wolf', 'fire_wolf'], flags: {} } },
  { name: 'stoneroot', label: 'Stoneroot', enter: 'vh',
    spine: ['vh', 'vga', 'va1', 'va2', 'va3', 'vgb', 'vb1', 'vb2', 'vb3', 'vgc', 'vc1', 'vc2', 'vc3', 'vz'],
    grant: { forms: ['earth_wolf'], flags: { bossDefeated: true } } },
  { name: 'woods', label: 'The Wild Woods', enter: 't1a',
    spine: ['t1a', 't1b', 'tc1', 't2a', 't2b', 'tsh', 'tc2', 't3a', 't3b', 'tkn', 'tc3', 't4a', 't4b', 'tc4', 'tgl'],
    grant: { forms: ['verdant_wolf'], flags: { wardenDefeated: true } } },
  { name: 'frostpeak', label: 'Frostpeak', enter: 'f1',
    spine: ['f1', 'f2', 'f3', 'f4', 'f5'],
    grant: { forms: ['frost_wolf'], flags: { sylvaDefeated: true } } },
  { name: 'stormreach', label: 'Stormreach Cliffs', enter: 's1a',
    spine: ['s1a', 's1b', 'sc1', 's2a', 's2b', 'ssh', 'sc2', 's3a', 's3b', 'svn', 'sc3', 's4a', 's4b', 'sc4', 'scr'],
    grant: { forms: ['storm_wolf'], flags: { borealDefeated: true } } },
  { name: 'vale', label: 'The Sunken Vale', enter: 'd1a',
    spine: ['d1a', 'd1b', 'dg1', 'd2a', 'd2b', 'dsh', 'dg2', 'd3a', 'd3b', 'dtp', 'dg3', 'd4a', 'd4b', 'dg4', 'ddp'],
    grant: { forms: ['tide_wolf'], flags: { ariaDefeated: true } } },
  { name: 'court', label: 'The Shadow Court', enter: 'x1',
    spine: ['x1', 'xsh', 'xh', 'xst', 'xth'],
    grant: { forms: ['ghost_wolf'], flags: { meriDefeated: true }, relics: true } },
];

const only = process.argv[2];
const RUN = only ? REGIONS.filter((r) => r.name === only) : REGIONS;
if (!RUN.length) { console.log('no such region:', only); process.exit(2); }

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'WALK');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
});

const settle = () => page.waitForFunction(() => !document.getElementById('fade')
  || getComputedStyle(document.getElementById('fade')).opacity === '0', null, { timeout: 30000 }).catch(() => {});

// Drop into a region's first room. This is the ONLY teleport in the file and it
// is a scene load, not a step through geometry — every door after it is walked.
const enterRegion = async (r) => {
  await page.evaluate((reg) => {
    const g = window.__game;
    for (const f of reg.grant.forms) if (!g.state.formsUnlocked.includes(f)) g.state.formsUnlocked.push(f);
    Object.assign(g.state.flags, reg.grant.flags);
    if (reg.grant.relics) for (const k of ['ember', 'thorn', 'tide', 'moon']) g.WS.set('court', 'relic_' + k);
    g.state.room = reg.enter;
    g.player.iframes = 0; g.player.hearts = 0.5;
    g.player.hurt(99, { pierceDefend: true });
  }, r);
  try {
    await page.waitForFunction((id) => window.__game.state.room === id && window.__game.player.hearts > 1,
      r.enter, { timeout: 60000 });
  } catch { return false; }
  await settle();
  return true;
};

// WALK to the door leading to `to`. Route is a BFS over the floor the player
// can actually stand on; movement is the game's own, driven through input.move.
const walkTo = async (to) => {
  const from = await page.evaluate(() => window.__game.state.room);
  const ok = await page.evaluate(async (target) => {
    const g = window.__game, w = g.world;
    const STEP = 0.5, RAD = 0.32;
    // Impassable = solid OR on fire. hazardAt() knows about the bridge decks
    // that override the lava beneath them, so routing over a crossing is fine
    // and routing through the channel beside it is not. Without this the router
    // walked Kael straight into the Cinder Bridges lava and sat there.
    const solid = (x, z) => {
      const s = w.resolveCircle(x, z, RAD);
      if (Math.abs(s.x - x) > 1e-6 || Math.abs(s.z - z) > 1e-6) return true;
      return w.hazardAt(x, z);
    };
    const hx = w.halfW || 30, hz = w.halfD || 30;
    const inside = (x, z) => Math.abs(x) <= hx + 0.01 && Math.abs(z) <= hz + 0.01;
    // ENEMIES OFF. They are solid and they move, so a shade standing in a
    // corridor would read as a wall and make this file flap. A child can fight
    // or run past one; they cannot walk through a doorway a prop is sitting in,
    // and that is the only thing under test here.
    for (const e of (w.enemies || [])) e.dead = true;
    w.enemies = [];
    const d = (w.doors || []).find((x) => x.to === target);
    if (!d) return { ok: false, why: 'no door to ' + target };
    const dcx = (d.minX + d.maxX) / 2, dcz = (d.minZ + d.maxZ) / 2;

    // BFS from where Kael is standing to the floor nearest the doorway.
    const ci = (v) => Math.round(v / STEP);
    const key = (i, j) => i + ',' + j;
    const start = [ci(g.player.root.position.x), ci(g.player.root.position.z)];
    const prev = new Map(); prev.set(key(start[0], start[1]), null);
    const q = [start];
    let best = null, bestD = Infinity;
    for (let qi = 0; qi < q.length; qi++) {
      const [i, j] = q[qi];
      const dist = Math.hypot(i * STEP - dcx, j * STEP - dcz);
      if (dist < bestD) { bestD = dist; best = [i, j]; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        const k = key(ni, nj);
        if (prev.has(k)) continue;
        if (!inside(ni * STEP, nj * STEP) || solid(ni * STEP, nj * STEP)) continue;
        prev.set(k, [i, j]); q.push([ni, nj]);
      }
    }
    if (!best || bestD > 2.2) return { ok: false, why: 'no walkable floor reaches the doorway', bestD: +bestD.toFixed(2) };

    const path = [];
    for (let cur = best; cur; cur = prev.get(key(cur[0], cur[1]))) path.push([cur[0] * STEP, cur[1] * STEP]);
    path.reverse();
    path.push([dcx, dcz]);   // the last stride is INTO the trigger

    // Now walk it, one waypoint at a time, using the real move vector.
    const startRoom = g.state.room;
    let wp = 0, frames = 0;
    while (wp < path.length && frames < 3000) {
      await new Promise((r) => requestAnimationFrame(r));
      frames++;
      if (g.narration) g.narration.blocking = false;   // a blocking line freezes the world
      g.player.iframes = 60;                            // the route is under test, not the fight
      if (g.state.room !== startRoom) { g.input.move.x = 0; g.input.move.z = 0; return { ok: true, frames }; }
      const p = g.player.root.position;
      const [tx, tz] = path[wp];
      const dx = tx - p.x, dz = tz - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.34) { wp++; continue; }
      g.input.move.x = dx / len; g.input.move.z = dz / len;
    }
    g.input.move.x = 0; g.input.move.z = 0;
    if (g.state.room !== startRoom) return { ok: true, frames };
    const p = g.player.root.position;
    return { ok: false, why: frames >= 3000 ? 'walked for 3000 frames and never arrived' : 'ran out of path',
      stuckAt: { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }, door: { x: +dcx.toFixed(1), z: +dcz.toFixed(1) } };
  }, to);
  if (!ok.ok) return ok;
  try {
    await page.waitForFunction((f) => window.__game.state.room !== f, from, { timeout: 20000 });
  } catch { return { ok: false, why: 'the door never fired' }; }
  await settle();
  return { ok: true, room: await page.evaluate(() => window.__game.state.room), frames: ok.frames };
};

for (const r of RUN) {
  console.log(`\n── ${r.label} ─────────────────────────────────`);
  if (!(await enterRegion(r))) { check(`${r.label}: the first room builds`, false); continue; }
  let here = r.enter;
  for (let i = 1; i < r.spine.length; i++) {
    const next = r.spine[i];
    const res = await walkTo(next);
    check(`  ${here} → ${next}`, !!res.ok, res.ok ? undefined : res);
    if (!res.ok) break;
    here = res.room;
  }
}

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — the whole game is walkable.'));
await b.close();
process.exit(errors.length ? 1 : 0);
