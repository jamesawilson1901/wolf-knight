// WHERE DOES A CHILD LAND WHEN THEY WALK THROUGH A DOOR?
//
// `sideDoor(world, side, halfW, halfD, to, entry)` writes the arrival point in
// the DESTINATION room's coordinates. Nothing checks it. A door whose entry is
// a couple of units off still boots, still shows in the topology verifiers —
// every one of them compares door.to against a room list and never looks at
// door.entry — and drops the child inside a wall or outside the room's shell.
//
// So this measures the landing, per door, against the destination room's own
// colliders: is the arrival point free, and is it in the same connected region
// as that room's spawn? The flood fill is the one verify-promises uses, run
// from the spawn through world.boxColliders / world.circleColliders — the same
// two arrays the player's own movement reads.
//
// Usage: node tools/probe-door-entries.mjs [prefix ...]     (default: s d)
import { chromium } from 'playwright';

const WANT = process.argv.slice(2).length ? process.argv.slice(2) : ['s', 'd'];

const LEVELS = {
  l: ['la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3', 'ld', 'ld1', 'lg4', 'le'],
  v: ['vh', 'vga', 'va1', 'va2', 'vap', 'va3', 'vgb', 'vb1', 'vb2', 'vbp', 'vb3', 'vgc',
    'vc1', 'vc2', 'vcp', 'vc3', 'vz'],
  t: ['t1a', 't1b', 't1p', 'tc1', 't2a', 't2b', 't2p', 'tsh', 'tc2', 't3a', 't3b', 't3p',
    'tkn', 'tc3', 't4a', 't4b', 't4p', 'tc4', 'tgl', 'tsA', 'tsB'],
  s: ['s1a', 's1b', 's1p', 'sc1', 's2a', 's2b', 's2p', 'ssh', 'sc2', 's3a', 's3b', 's3p',
    'svn', 'sc3', 's4a', 's4b', 's4p', 'sc4', 'scr', 'ssA'],
  d: ['d1a', 'd1b', 'd1p', 'dg1', 'd2a', 'd2b', 'd2p', 'dsh', 'dg2', 'd3a', 'd3b', 'd3p',
    'dtp', 'dg3', 'd4a', 'd4b', 'd4p', 'dg4', 'dlg', 'ddp'],
};
// An argument is either a level key ('s', 'd') or a bare room id, so a room
// that crashes on build can be left out of a run without losing the rest — the
// loader does not recover from a build error, so one bad room ends the session.
const ROOMS = WANT.flatMap((k) => LEVELS[k] || [k]);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 25000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'DOORS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
// EVERY form, so the doors that only exist after a gift are measured too — the
// lagoon's four mouths are the whole point of this run.
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.settings.greybox = false;
  g.state.flags.borealDefeated = true; g.state.flags.ariaDefeated = true;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf'];
  g.player.iframes = 999999;
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

// Read a room: its doors (with entries), its spawn, and the reachable set as a
// coarse grid so an arrival point can be tested against it later.
const READ = () => {
  const w = window.__game.world;
  const R = 0.34, STEP = 0.4, LIM = 70;
  const free = (x, z) => {
    for (const b of w.boxColliders) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < R * R) return false;
    }
    for (const c of w.circleColliders) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + R) * (c.r + R)) return false;
    }
    return true;
  };
  const key = (i, j) => i + ',' + j;
  const si = Math.round(w.spawn.x / STEP), sj = Math.round(w.spawn.z / STEP);
  const seen = new Set([key(si, sj)]);
  const q = [[si, sj]];
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const ni = i + di, nj = j + dj;
      if (Math.abs(ni) > LIM || Math.abs(nj) > LIM) continue;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      if (!free(ni * STEP, nj * STEP)) continue;
      seen.add(k); q.push([ni, nj]);
    }
  }
  return {
    spawn: { x: +w.spawn.x.toFixed(2), z: +w.spawn.z.toFixed(2) },
    doors: w.doors.map((d) => ({
      to: d.to,
      entry: d.entry ? { x: d.entry.x, z: d.entry.z } : null,
      rect: { minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: d.maxZ },
    })),
    reach: [...seen],
    free: [...seen].length,
  };
};

const info = {};
const failed = [];
for (const id of ROOMS) {
  const before = errs.length;
  if (!(await go(id))) {
    // WHY it did not build matters more than that it did not: a page error
    // names the line, a clean failure means the room never finished.
    const why = errs.slice(before);
    console.log('✗ ' + id + ' did not build' + (why.length ? ' — ' + why.join(' | ') : ' (no page error)'));
    failed.push(id);
    continue;
  }
  info[id] = await page.evaluate(READ);
}
if (failed.length) console.log('\nrooms that did not build: ' + failed.join(', ') + '\n');
// The count, always. A probe that measures nothing and reports no problems
// looks exactly like a probe that measured everything and found none.
const totalDoors = Object.values(info).reduce((n, r) => n + r.doors.length, 0);
console.log(`read ${Object.keys(info).length} of ${ROOMS.length} rooms, ${totalDoors} doors`);

// A landing is GOOD when the arrival cell is in the destination's reachable
// set. Checked at the cell itself and its four neighbours, because a legal
// landing can sit one 0.4u cell off the sampled grid.
const STEP = 0.4;
const landed = (dest, e) => {
  if (!info[dest]) return 'dest-not-built';
  const set = new Set(info[dest].reach);
  const i = Math.round(e.x / STEP), j = Math.round(e.z / STEP);
  for (const [di, dj] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) {
    if (set.has((i + di) + ',' + (j + dj))) return 'ok';
  }
  return 'STRANDED';
};

// ...and the SIDE matters as much as the standing. A child who walks west out
// of a room should arrive beside the door they came through, not across the
// room from it. The destination's own door back to this room is where they
// should land; anything more than a few units from it is a teleport with extra
// steps. Measured as distance from the entry point to that return door's own
// rectangle.
const RETURN_SLACK = 5.0;
const backDoorDist = (dest, from, e) => {
  const back = (info[dest].doors || []).filter((d) => d.to === from);
  if (!back.length) return null;                  // one-way; reported separately
  let best = 1e9;
  for (const r of back.map((d) => d.rect)) {
    const cx = Math.max(r.minX, Math.min(e.x, r.maxX));
    const cz = Math.max(r.minZ, Math.min(e.z, r.maxZ));
    best = Math.min(best, Math.hypot(e.x - cx, e.z - cz));
  }
  return +best.toFixed(2);
};

console.log('\nfrom → to        entry            landing      to return door');
console.log('─'.repeat(72));
const bad = [];
for (const id of ROOMS) {
  if (!info[id]) continue;
  for (const d of info[id].doors) {
    if (!d.entry) { bad.push({ from: id, to: d.to, why: 'no entry point' }); continue; }
    if (!ROOMS.includes(d.to)) continue;          // leaving the measured set
    const verdict = landed(d.to, d.entry);
    const back = verdict === 'ok' ? backDoorDist(d.to, id, d.entry) : null;
    const wrongSide = back !== null && back > RETURN_SLACK;
    const line = `${id} → ${d.to}`.padEnd(16) + `(${d.entry.x}, ${d.entry.z})`.padEnd(17)
      + verdict.padEnd(13) + (back === null ? '—' : back + (wrongSide ? '  ← WRONG SIDE' : ''));
    if (verdict !== 'ok' || wrongSide) {
      console.log(line);
      bad.push({ from: id, to: d.to, entry: d.entry, verdict, backDoor: back });
    }
  }
}
const stranded = bad.filter((x) => x.verdict !== 'ok').length;
const wrongSide = bad.length - stranded;
console.log(bad.length
  ? `\n✗ ${stranded} door(s) land where a child cannot stand, ${wrongSide} on the wrong side of the room`
  : '\n✓ every door lands beside the door it opens into');

// ONE-WAY DOORS. A room that opens onto another which does not open back is
// either a deliberate drop (Level 1 has one) or a child walking into a place
// they cannot leave the way they came. Either way it should be a decision
// somebody made, so it gets printed.
console.log('\none-way doors (A opens to B, B does not open back to A)');
console.log('─'.repeat(58));
const oneWay = [];
for (const id of ROOMS) {
  if (!info[id]) continue;
  for (const d of info[id].doors) {
    if (!info[d.to]) continue;
    if (!info[d.to].doors.some((x) => x.to === id)) oneWay.push(`${id} → ${d.to}`);
  }
}
console.log(oneWay.length ? '  ' + oneWay.join('\n  ') : '  none');
if (errs.length) console.log('\n' + errs.length + ' page error(s):\n' + errs.join('\n'));
await b.close();
process.exit(bad.length || errs.length ? 1 : 0);
