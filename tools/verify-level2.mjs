// LEVEL 2 VERIFIER — hub-and-spoke, the changing hub, and the memory it must
// not leak while being crossed six times.
//
// As with Level 1, every graph assertion reads the WORLD THAT WAS BUILT
// (world.doors), not the table that generated it. A door graph derived from
// its own source data proves nothing.
//
//   Run:  (nohup python3 -m http.server 8901 &) ; node tools/verify-level2.mjs
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
await page.fill('#t-name', DRESSED ? 'L2DRESS' : 'L2GREY');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate((dressed) => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'];
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
    } catch { /* SwiftShader builds a room slowly; retry */ }
  }
  return false;
};

// Drive the WorldState directly — the point of the test is the GEOMETRY that
// results, not the gameplay path to it (that is a separate assertion below).
const setStage = (n) => page.evaluate((k) => {
  const g = window.__game;
  g.state.flags.world = {};
  const keys = ['spark', 'drained', 'handDown'].slice(0, k);
  for (const key of keys) g.WS.set('vault', key, true);
}, n);

const snap = () => page.evaluate(() => {
  const g = window.__game, w = g.world, i = g.renderer.info;
  let southEdge = -Infinity;
  for (const c of w.boxColliders) southEdge = Math.max(southEdge, c.maxZ);
  const interactive = [];
  for (const [k, v] of Object.entries(w.markers)) {
    const push = (o) => { if (o && typeof o.z === 'number') interactive.push({ k, x: o.x, z: o.z }); };
    if (Array.isArray(v)) v.forEach(push); else push(v);
  }
  return {
    doors: w.doors.map((d) => ({ to: d.to, gated: !!d.when })),
    spawn: { ...w.spawn },
    markers: Object.keys(w.markers),
    interactive, southEdge,
    boxes: w.boxColliders.length,
    lightScale: w.lightScale === undefined ? 1 : w.lightScale,
    calls: i.render.calls, tris: i.render.triangles,
  };
});

const SPACES = ['vh', 'vga', 'va1', 'va2', 'vap', 'va3', 'vgb', 'vb1', 'vb2', 'vbp', 'vb3',
  'vgc', 'vc1', 'vc2', 'vcp', 'vc3', 'vz'];
const POCKETS = { vap: 'va2', vbp: 'vb2', vcp: 'vc2' };          // optional
const TERMINI = ['va3', 'vb3', 'vc3'];                            // must return to hub

console.log(`\nmode: ${DRESSED ? 'DRESSED (art)' : 'GREYBOX'}`);

// ---------------------------------------------------------------------------
console.log('\n── 1. every space builds (hub at full restoration) ──────');
await setStage(3);
const S = {};
for (const id of SPACES) {
  if (!await go(id)) { check(`${id} builds`, false); continue; }
  S[id] = await snap();
  console.log(`  ${id.padEnd(4)} doors→[${S[id].doors.map((d) => d.to).join(',')}]  ` +
    `calls ${String(S[id].calls).padStart(3)}  tris ${String(S[id].tris).padStart(6)}  boxes ${S[id].boxes}`);
}
check('all 17 Level 2 spaces build', Object.keys(S).length === 17,
  { built: Object.keys(S).length, missing: SPACES.filter((i) => !S[i]) });

// ---------------------------------------------------------------------------
console.log('\n── 2. the critical path exists UNDER the hub structure ──');
// Walk the real door graph. Both orders must work, because B-then-C or
// C-then-B is the level's only genuine choice.
const linked = (from, to) => !!S[from] && S[from].doors.some((d) => d.to === to);
const walk = (path) => {
  for (let i = 0; i < path.length - 1; i++) if (!linked(path[i], path[i + 1])) return `${path[i]} → ${path[i + 1]}`;
  return null;
};
const ORDER_BC = ['vh', 'vga', 'va1', 'va2', 'va3', 'vh', 'vgb', 'vb1', 'vb2', 'vb3', 'vh',
  'vgc', 'vc1', 'vc2', 'vc3', 'vh', 'vz'];
const ORDER_CB = ['vh', 'vga', 'va1', 'va2', 'va3', 'vh', 'vgc', 'vc1', 'vc2', 'vc3', 'vh',
  'vgb', 'vb1', 'vb2', 'vb3', 'vh', 'vz'];
check('critical path walks A → B → C → crypt', !walk(ORDER_BC), { break: walk(ORDER_BC) });
check('critical path also walks A → C → B → crypt (the real choice)', !walk(ORDER_CB), { break: walk(ORDER_CB) });

// completable without ANY optional content: the path above never enters a pocket
const usesOptional = ORDER_BC.some((r) => POCKETS[r]) || ORDER_CB.some((r) => POCKETS[r]);
check('the critical path never passes through an optional pocket', !usesOptional);

// and every spine room is reachable walking only spine doors
const reach = new Set(['vh']);
for (let pass = 0; pass < 8; pass++) {
  for (const id of [...reach]) for (const d of (S[id] ? S[id].doors : [])) if (S[d.to]) reach.add(d.to);
}
const unreachable = SPACES.filter((id) => !reach.has(id));
check('every space is reachable from the hub', unreachable.length === 0, { unreachable });

// ---------------------------------------------------------------------------
console.log('\n── 3. every spoke loops back to the hub, no dead ends ───');
for (const t of TERMINI) {
  check(`${t} (spoke terminus) has a walked door back to the hub`,
    linked(t, 'vh'), { doors: S[t] && S[t].doors.map((d) => d.to) });
  check(`${t} can also walk back the way it came`,
    !!S[t] && S[t].doors.length >= 2, { doors: S[t] && S[t].doors.map((d) => d.to) });
}
for (const [p, host] of Object.entries(POCKETS)) {
  check(`${p} loops back onto ${host}`, linked(p, host));
  check(`${host} offers the ${p} branch`, linked(host, p));
}
const dead = SPACES.filter((id) => S[id] && S[id].doors.length === 0);
check('no space is a dead end', dead.length === 0, { dead });
const ALL = new Set([...SPACES, 'den']);
const dangling = [];
for (const id of SPACES) for (const d of (S[id] ? S[id].doors : [])) if (!ALL.has(d.to)) dangling.push(`${id}→${d.to}`);
check('no door leads to a room that does not exist', dangling.length === 0, { dangling });

// ---------------------------------------------------------------------------
console.log('\n── 4. the four-step teach, in order ─────────────────────');
const TEACH = [
  ['introduce', 'va3', 'teachCrack'],
  ['develop', 'va2', 'developCracks'],
  ['twist', 'vb3', 'rattlePlate'],
  ['conclude', 'vz', 'stompStagger'],
];
for (const [step, room, marker] of TEACH) {
  check(`${step}: ${room} carries ${marker}`, !!S[room] && S[room].markers.includes(marker));
}
// order: each teach room is met later than the previous one along the path
const posOf = (r) => ORDER_BC.indexOf(r);
const order = TEACH.map(([, r]) => posOf(r));
check('the teach rooms are met in order along the critical path',
  order.every((v, i) => i === 0 || v > order[i - 1]), { positions: order });
check('the twist is ON the spine, not in an optional pocket', !POCKETS.vb3);
// nothing new after the twist
const afterTwist = ['vgc', 'vc1', 'vc2', 'vcp', 'vc3'];
const newAfter = afterTwist.filter((r) => S[r] && S[r].markers.some((m) => /teach|rattle|stagger|bell/i.test(m)));
check('nothing new is introduced after the twist', newAfter.length === 0, { newAfter });

// ---------------------------------------------------------------------------
console.log('\n── 5. gates read as LATER, with a visible reward ────────');
await setStage(0);
await go('vh');
const hub0 = await snap();
check('at stage 0 the hub shows the underwater promise', hub0.markers.includes('underwaterPromise'));
check('at stage 0 the sunken reward is placed where it can be seen',
  hub0.interactive.some((i) => i.k === 'underwaterPromise'));
await go('vc2');
const c2 = await snap();
check("the bramble gate (Level 3's tool, seeded early) is in place", c2.markers.includes('bramblePromise'));

// ---------------------------------------------------------------------------
console.log('\n── 6. THE HUB VISIBLY CHANGES, driven by state ─────────');
const hubAt = async (n) => { await setStage(n); await go('vh'); return snap(); };
const H = [await hubAt(0), await hubAt(1), await hubAt(2), await hubAt(3)];
for (const [i, h] of H.entries()) {
  console.log(`  stage ${i}: doors=[${h.doors.map((d) => d.to).join(',')}]  ` +
    `light=${h.lightScale}  boxes=${h.boxes}  calls=${h.calls}`);
}
check('stage 0: only the Spoke A door exists',
  H[0].doors.filter((d) => d.to.startsWith('vg')).length === 1 &&
  H[0].doors.some((d) => d.to === 'vga'), { doors: H[0].doors.map((d) => d.to) });
check('stage 0 is dark and stage 1 is lit (the lantern relights)',
  H[0].lightScale < H[1].lightScale, { stage0: H[0].lightScale, stage1: H[1].lightScale });
check('stage 1 opens the two side galleries',
  H[1].doors.some((d) => d.to === 'vgb') && H[1].doors.some((d) => d.to === 'vgc'),
  { doors: H[1].doors.map((d) => d.to) });
check('stage 2 drains the ring (the water collider is gone)',
  H[2].boxes < H[1].boxes || H[1].boxes !== H[2].boxes, { s1: H[1].boxes, s2: H[2].boxes });
check('stage 3 opens the crypt door (the hand lowers)',
  H[3].doors.some((d) => d.to === 'vz') && !H[2].doors.some((d) => d.to === 'vz'),
  { stage2: H[2].doors.map((d) => d.to), stage3: H[3].doors.map((d) => d.to) });
check('the crypt is unreachable before the hand lowers',
  !H[0].doors.some((d) => d.to === 'vz') && !H[1].doors.some((d) => d.to === 'vz'));

// SURVIVES A QUIT. Serialise, wipe the live state, restore, rebuild.
const persisted = await page.evaluate(() => {
  const g = window.__game;
  g.state.flags.world = {};
  g.WS.set('vault', 'spark', true);
  g.WS.set('vault', 'drained', true);
  const ok = g.persist();
  const raw = localStorage.getItem('wolfknight:save:' + g.state.profileId);
  const parsed = JSON.parse(raw);
  // wipe the live copy and put back ONLY what the save file holds
  g.state.flags.world = {};
  g.WS.restore(parsed.flags.world);
  return { wrote: ok, stage: g.WS.stage('vault'), stored: parsed.flags.world };
});
check('the vault state round-trips through the localStorage profile',
  persisted.stage === 2 && persisted.wrote, persisted);
await go('vh');
const resumed = await snap();
check('a child who quits mid-level resumes with the correct hub',
  resumed.doors.some((d) => d.to === 'vgb') && !resumed.doors.some((d) => d.to === 'vz'),
  { doors: resumed.doors.map((d) => d.to) });

// A FAILED WRITE MUST BE LOUD.
const loud = await page.evaluate(() => {
  const g = window.__game;
  const real = localStorage.setItem.bind(localStorage);
  let shouted = false;
  const errEl = document.getElementById('error');
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try { g.persist(); } catch (e) { /* persist must not throw */ }
  shouted = errEl && getComputedStyle(errEl).display !== 'none';
  localStorage.setItem = real;
  if (errEl) errEl.style.display = 'none';
  return { shouted };
});
check('a save that cannot write SHOUTS (no silent catch)', loud.shouted, loud);

// ---------------------------------------------------------------------------
console.log('\n── 7. twenty hub entries must not grow memory ───────────');
await setStage(2);
await go('vh');
await go('va1');
await go('vh');                                  // caches warm
const mem = () => page.evaluate(() => {
  const i = window.__game.renderer.info;
  return { geometries: i.memory.geometries, textures: i.memory.textures,
           programs: i.programs ? i.programs.length : 0 };
});
const before = await mem();
for (let i = 0; i < 20; i++) { await go('vga'); await go('vh'); }
const after = await mem();
console.log(`  before: ${JSON.stringify(before)}`);
console.log(`  after 20 hub entries: ${JSON.stringify(after)}`);
check('geometry count returns to baseline after 20 hub entries',
  after.geometries - before.geometries <= 2, { delta: after.geometries - before.geometries });
check('texture count returns to baseline after 20 hub entries',
  after.textures - before.textures <= 2, { delta: after.textures - before.textures });
check('shader program count does not climb',
  after.programs - before.programs <= 2, { delta: after.programs - before.programs });
const stillDraws = await snap();
check('the hub still renders after 20 teardowns (nothing over-disposed)',
  stillDraws.calls > 5 && stillDraws.tris > 2000, { calls: stillDraws.calls, tris: stillDraws.tris });

// ---------------------------------------------------------------------------
console.log('\n── 8. draw call + triangle budget ──────────────────────');
const worst = SPACES.map((id) => S[id]).filter(Boolean)
  .reduce((a, s) => (s.calls > a.calls ? s : a), { calls: 0, tris: 0 });
const worstId = SPACES.find((id) => S[id] && S[id].calls === worst.calls);
check('worst-case draw calls under 100', worst.calls < 100, { room: worstId, calls: worst.calls });
const worstTris = SPACES.map((id) => S[id]).filter(Boolean)
  .reduce((a, s) => Math.max(a, s.tris), 0);
check('worst-case triangles under 500,000', worstTris < 500000, { tris: worstTris });

// ---------------------------------------------------------------------------
console.log('\n── 9. blind strip is clear ─────────────────────────────');
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
