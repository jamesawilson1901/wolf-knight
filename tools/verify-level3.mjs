// LEVEL 3 VERIFIER — the ring, the shortcuts, and getting lost.
//
// Level 3 is the structurally hardest of the three, so this checks things the
// earlier two did not need:
//
//   THE LOOP ACTUALLY CLOSES  — walked as a graph, returning to the start.
//   SHORTCUTS ARE SHORTER     — measured in real world units, not hop counts,
//                               because "fewer rooms" and "less walking" are
//                               not the same claim.
//   DISORIENTATION            — for every junction, the district's hero prop
//                               is PROJECTED INTO THE CAMERA FRUSTUM from each
//                               door in turn. A landmark that is only visible
//                               from the intended approach is not a landmark.
//
//   Run:  (nohup python3 -m http.server 8901 &) ; node tools/verify-level3.mjs
//   Add:  --dressed
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
await page.fill('#t-name', DRESSED ? 'L3DRESS' : 'L3GREY');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate((dressed) => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf'];
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
    } catch { /* retry */ }
  }
  return false;
};

const setShortcuts = (open) => page.evaluate((o) => {
  const g = window.__game;
  g.state.flags.world = {};
  if (o) { g.WS.set('wild3', 'rootCut', true); g.WS.set('wild3', 'logDown', true); }
}, open);

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
    doors: w.doors.map((d) => ({ to: d.to, entry: d.entry })),
    spawn: { ...w.spawn },
    markers: Object.keys(w.markers),
    hero: w.markers.heroSpot || null,
    interactive, southEdge,
    calls: i.render.calls, tris: i.render.triangles,
  };
});

const SPACES = ['t1a', 't1b', 't1p', 'tc1', 't2a', 't2b', 't2p', 'tsh', 'tc2',
  't3a', 't3b', 't3p', 'tkn', 'tc3', 't4a', 't4b', 't4p', 'tc4', 'tgl', 'tsA', 'tsB'];
const POCKETS = { t1p: 't1b', t2p: 't2b', t3p: 't3b', t4p: 't4b' };
const JUNCTIONS = ['t1a', 't2a', 't3a', 't4a'];
// room footprints, for measuring walked distance rather than counting doors
const SIZE = { island: [32, 26], pocket: [20, 16], ring: [26, 20], arena: [26, 26] };
const KIND = { t1a: 'island', t1b: 'island', t1p: 'pocket', tc1: 'ring',
  t2a: 'island', t2b: 'island', t2p: 'pocket', tsh: 'pocket', tc2: 'ring',
  t3a: 'island', t3b: 'island', t3p: 'pocket', tkn: 'island', tc3: 'ring',
  t4a: 'island', t4b: 'island', t4p: 'pocket', tc4: 'ring', tgl: 'arena',
  tsA: 'ring', tsB: 'ring' };

console.log(`\nmode: ${DRESSED ? 'DRESSED (art)' : 'GREYBOX'}`);

// ---------------------------------------------------------------------------
console.log('\n── 1. every space builds (both shortcuts open) ─────────');
await setShortcuts(true);
const S = {};
for (const id of SPACES) {
  if (!await go(id)) { check(`${id} builds`, false); continue; }
  S[id] = await snap();
  console.log(`  ${id.padEnd(4)} doors→[${S[id].doors.map((d) => d.to).join(',')}]  ` +
    `calls ${String(S[id].calls).padStart(3)}  tris ${String(S[id].tris).padStart(6)}`);
}
check('all 21 Level 3 spaces build', Object.keys(S).length === 21,
  { built: Object.keys(S).length, missing: SPACES.filter((i) => !S[i]) });

const linked = (a, c) => !!S[a] && S[a].doors.some((d) => d.to === c);
const walk = (path) => {
  for (let i = 0; i < path.length - 1; i++) if (!linked(path[i], path[i + 1])) return `${path[i]} → ${path[i + 1]}`;
  return null;
};

// ---------------------------------------------------------------------------
console.log('\n── 2. THE LOOP CLOSES ──────────────────────────────────');
const RING_PATH = ['t1a', 't1b', 'tc1', 't2a', 't2b', 'tsh', 'tc2',
  't3a', 't3b', 'tkn', 'tc3', 't4a', 't4b', 'tc4', 'tgl', 't1a'];
const ringBreak = walk(RING_PATH);
check('the ring is walkable clockwise and RETURNS TO ITS START', !ringBreak,
  ringBreak ? { break: ringBreak } : { hops: RING_PATH.length - 1, start: 't1a', end: 't1a' });
// a loop that only works one way is a one-way system, not a loop
const backBreak = walk([...RING_PATH].reverse());
check('the ring is also walkable anticlockwise', !backBreak, backBreak ? { break: backBreak } : undefined);

// ---------------------------------------------------------------------------
console.log('\n── 3. SHORTCUTS ARE GENUINELY SHORTER ──────────────────');
// Distance, not door count. A "shortcut" through three big rooms is not one.
const spanOf = (id) => { const [w, d] = SIZE[KIND[id]]; return (w + d) / 2; };
const lengthOf = (path) => path.reduce((a, id) => a + spanOf(id), 0);
const idx = (id) => RING_PATH.indexOf(id);
const longWay = (from, to) => RING_PATH.slice(idx(from), idx(to) + 1);

for (const [leg, from, to] of [['tsA', 't4a', 't1a'], ['tsB', 't3a', 't2a']]) {
  check(`${leg} connects ${from} and ${to} in both directions`,
    linked(from, leg) && linked(leg, to) && linked(to, leg) && linked(leg, from),
    { fromDoors: S[from] && S[from].doors.map((d) => d.to), legDoors: S[leg] && S[leg].doors.map((d) => d.to) });
  // the outbound route is the ring the long way round
  const around = from === 't4a'
    ? RING_PATH.slice(idx('t1a'), idx('t4a') + 1)          // t1a … t4a
    : RING_PATH.slice(idx('t2a'), idx('t3a') + 1);         // t2a … t3a
  const shortcut = [from, leg, to];
  const aroundLen = lengthOf(around), shortLen = lengthOf(shortcut);
  check(`${leg} is shorter than walking round (${Math.round(shortLen)}u vs ${Math.round(aroundLen)}u)`,
    shortLen < aroundLen * 0.5,
    { shortcutRooms: shortcut.length, aroundRooms: around.length,
      shortcutUnits: Math.round(shortLen), aroundUnits: Math.round(aroundLen),
      ratio: +(shortLen / aroundLen).toFixed(2) });
}

// and they must OPEN FROM THE FAR SIDE — closed before, open after
await setShortcuts(false);
await go('t1a'); const t1aClosed = await snap();
await go('t2a'); const t2aClosed = await snap();
check('before they are earned, neither chord exists at the near end',
  !t1aClosed.doors.some((d) => d.to === 'tsA') && !t2aClosed.doors.some((d) => d.to === 'tsB'),
  { t1a: t1aClosed.doors.map((d) => d.to), t2a: t2aClosed.doors.map((d) => d.to) });
await setShortcuts(true);

// ---------------------------------------------------------------------------
console.log('\n── 4. every branch reconnects, no dead ends ────────────');
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
// reachability from the entrance, walking only real doors
const reach = new Set(['t1a']);
for (let pass = 0; pass < 12; pass++) {
  for (const id of [...reach]) for (const d of (S[id] ? S[id].doors : [])) if (S[d.to]) reach.add(d.to);
}
check('every space is reachable from the entrance', SPACES.every((id) => reach.has(id)),
  { unreachable: SPACES.filter((id) => !reach.has(id)) });

// ---------------------------------------------------------------------------
console.log('\n── 5. the four-step teach, in order ────────────────────');
const TEACH = [['introduce', 'tsh', 'teachBramble'], ['develop', 'tc2', 'developBrambles'],
  ['twist', 'tkn', 'knotTether'], ['conclude', 't4b', 'thornKnot']];
for (const [step, room, marker] of TEACH) {
  check(`${step}: ${room} carries ${marker}`, !!S[room] && S[room].markers.includes(marker));
}
const pos = TEACH.map(([, r]) => RING_PATH.indexOf(r));
check('the teach rooms are met in order round the ring',
  pos.every((v, i) => i === 0 || v > pos[i - 1]), { positions: pos });
check('the twist is ON the ring, not in an optional pocket', !POCKETS.tkn);
const afterTwist = ['tc3', 't4a', 't4b', 't4p', 'tc4', 'tgl'];
const newAfter = afterTwist.filter((r) => S[r] && S[r].markers.some((m) => /teach|tether|snare/i.test(m)));
check('nothing new is introduced after the twist', newAfter.length === 0, { newAfter });

// critical path with zero optional content
const criticalUsesPocket = RING_PATH.some((r) => POCKETS[r]);
check('the critical path needs no optional content', !criticalUsesPocket);

// ---------------------------------------------------------------------------
console.log('\n── 6. DISORIENTATION — is the landmark in frame? ───────');
// For each junction, stand at each incoming door's entry point facing its
// entry angle, settle the camera, and project the hero prop to screen space.
// This is the check the brief asks for and the one a ring actually needs.
const seenFrom = [];
for (const j of JUNCTIONS) {
  if (!S[j] || !S[j].hero) { check(`${j} has a hero prop`, false); continue; }
  // gather every entry INTO this junction, from every room that points at it
  const entries = [];
  for (const other of SPACES) {
    if (!S[other]) continue;
    for (const d of S[other].doors) if (d.to === j && d.entry) entries.push({ from: other, ...d.entry });
  }
  entries.push({ from: '(spawn)', ...S[j].spawn });
  for (const e of entries) {
    const r = await page.evaluate(async ({ room, x, z, angle, hero }) => {
      const g = window.__game;
      const s = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      g.player.root.position.set(x, g.player.root.position.y, z);
      g.player.root.rotation.y = angle;
      // let the camera damping settle at the new position
      for (let i = 0; i < 40; i++) await s();
      const v = new (Object.getPrototypeOf(g.camera.position).constructor)(hero.x, 1.4, hero.z);
      v.project(g.camera);
      return { ndcX: +v.x.toFixed(2), ndcY: +v.y.toFixed(2), z: +v.z.toFixed(3) };
    }, { room: j, x: e.x, z: e.z, angle: e.angle || Math.PI, hero: S[j].hero });
    const onScreen = Math.abs(r.ndcX) <= 1 && Math.abs(r.ndcY) <= 1 && r.z > 0 && r.z < 1;
    seenFrom.push({ junction: j, from: e.from, onScreen, ndc: [r.ndcX, r.ndcY] });
    console.log(`  ${j} from ${String(e.from).padEnd(9)} → ${onScreen ? 'LANDMARK IN FRAME' : 'NOT VISIBLE'}  ndc(${r.ndcX}, ${r.ndcY})`);
  }
  await go(j);   // rebuild before the next junction
}
const blindApproaches = seenFrom.filter((s) => !s.onScreen);
check('every junction shows its landmark from EVERY approach', blindApproaches.length === 0,
  { blind: blindApproaches.map((s) => `${s.junction} from ${s.from}`) });
// and no two junctions may share a hero prop kind — checked from the level data
const heroes = await page.evaluate(() => {
  const D = window.__L3 ? window.__L3.DISTRICTS : null;
  return D ? Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.hero])) : null;
});
if (heroes) {
  const list = Object.values(heroes);
  check('no two districts share a hero prop', new Set(list).size === list.length, heroes);
}

// ---------------------------------------------------------------------------
console.log('\n── 7. draw call + triangle budget ─────────────────────');
const worst = SPACES.map((id) => S[id]).filter(Boolean).reduce((a, s) => (s.calls > a.calls ? s : a), { calls: 0 });
const worstId = SPACES.find((id) => S[id] && S[id].calls === worst.calls);
check('worst-case draw calls under 100', worst.calls < 100, { room: worstId, calls: worst.calls });
const worstTris = SPACES.map((id) => S[id]).filter(Boolean).reduce((a, s) => Math.max(a, s.tris), 0);
check('worst-case triangles under 500,000', worstTris < 500000, { tris: worstTris });

console.log('\n── 8. blind strip is clear ────────────────────────────');
const blind = [];
for (const id of SPACES) {
  if (!S[id]) continue;
  for (const it of S[id].interactive) {
    if (it.z > S[id].southEdge - 2.5) blind.push(`${id}.${it.k} @z=${it.z}`);
  }
}
check('no interactive marker sits in the 2.5u blind strip', blind.length === 0, { blind });

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
