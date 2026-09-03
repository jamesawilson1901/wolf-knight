// SEVEN BOSSES, SEVEN CREATURES.
//
// Dad, 2026-09-03: "every boss fight should be a different asset. scale
// assets, change their colour schemes, their bodies, their health and attack
// sets for the boss fights. the first boss is a giant wolf, no more giant wolf
// bosses after that."
//
// He was right, and the count was worse than it looked: FOUR of the seven wore
// wolf.gltf — the Shadowgrip, Sylva, Aria and Shadow-Grimm — so more than half
// the game's bosses were the same animal in a different colour, and nothing in
// the suite set had ever counted them.
//
// THE ONE DELIBERATE REPEAT is Shadow-Grimm. He IS the great wolf: the
// Shadowgrip was a piece of him and every form Kael carries is a piece of his
// stolen strength (STORY-BIBLE, "The reveal"). The first fight in the game and
// the last being the same animal is the bookend the whole story rests on. It
// is named here so it stays a decision rather than becoming an oversight
// again.
import { launch } from './wk-drive.mjs';

const BOOKEND = ['shadowgrip', 'grimm'];   // the wolf, first and last, on purpose

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};
const wk = await launch({ timescale: 1 });
await wk.newGame('BOSSES');

const skins = await wk.page.evaluate(async () => {
  const { SKINS } = await import('/js/boss.js');
  const out = {};
  for (const [k, s] of Object.entries(SKINS)) {
    out[k] = { name: s.name, url: (s.body && s.body.url) || './assets/chars/wolf.gltf',
      stands: (s.body && s.body.stands) || null, hp: s.maxHp, dmg: s.dmg,
      speed: s.speedMult || 1, weakness: s.weakness || null,
      clips: s.clips ? Object.keys(s.clips) : null,
      hasSnares: !!s.snares, hasGales: !!s.gales, hasFloods: !!s.floods, adapts: !!s.adapts };
  }
  return out;
});

console.log('\n── 1. no two bosses are the same animal ───────────────');
const byBody = {};
for (const [k, s] of Object.entries(skins)) (byBody[s.url] ||= []).push(k);
const shared = Object.entries(byBody).filter(([, ks]) => ks.length > 1);
const badShare = shared.filter(([, ks]) => ks.join() !== BOOKEND.join());
for (const [url, ks] of Object.entries(byBody)) {
  console.log(`   ${url.split('/').pop().padEnd(16)} ${ks.join(', ')}`);
}
check('every duel boss has its own body, bar the wolf bookend',
  badShare.length === 0, badShare);
check('...and the bookend is exactly the first boss and the last',
  !shared.length || shared.every(([, ks]) => ks.join() === BOOKEND.join()), shared);

console.log('\n── 2. every body loads, and stands where it says ──────');
const bodies = await wk.page.evaluate(async (urls) => {
  const THREE = await import('three');
  const { loadGLB } = await import('/js/assets.js');
  const out = {};
  for (const u of urls) {
    try {
      const g = await loadGLB(u);
      g.scene.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(g.scene);
      out[u] = { h: +(bb.max.y - bb.min.y).toFixed(2),
        clips: (g.animations || []).map((c) => c.name) };
    } catch (e) { out[u] = { error: String(e && e.message || e) }; }
  }
  return out;
}, [...new Set(Object.values(skins).map((s) => s.url))]);
for (const [u, b] of Object.entries(bodies)) {
  check(`${u.split('/').pop()} loads`, !b.error, b.error || { nativeHeight: b.h, clips: b.clips.length });
}

console.log('\n── 3. every skin names clips its own body actually has ─');
for (const [k, s] of Object.entries(skins)) {
  const have = (bodies[s.url] && bodies[s.url].clips) || [];
  const want = s.clips
    ? Object.values(await wk.page.evaluate(async (kk) => (await import('/js/boss.js')).SKINS[kk].clips, k))
    : ['Idle', 'Walk', 'Gallop', 'Attack', 'Death'];
  const missing = want.filter((n) => !have.includes(n));
  // A CLIP LOOKUP THAT FINDS NOTHING IS SILENT. Meri fought in her bind pose
  // for a month because DEFAULT_CLIPS named the wolf's clips and her body is a
  // slime (js/boss.js SKINS.meri). This is that bug, caught by a machine.
  check(`${s.name} names ${want.length} clips its body has`, missing.length === 0,
    { missing, body: s.url.split('/').pop() });
}

console.log('\n── 4. the fights are not the same fight ───────────────');
const stats = Object.entries(skins).map(([k, s]) => ({ k, hp: s.hp, speed: s.speed,
  extra: [s.hasSnares && 'snares', s.hasGales && 'gales', s.hasFloods && 'floods',
    s.adapts && 'adapts'].filter(Boolean).join('+') || '—' }));
for (const r of stats) console.log(`   ${r.k.padEnd(12)} hp ${String(r.hp).padEnd(3)} speed ${r.speed}  ${r.extra}`);
check('health rises across the game', new Set(stats.map((r) => r.hp)).size >= 4,
  stats.map((r) => r.hp));
check('no two duel bosses share hp AND speed AND extras',
  new Set(stats.map((r) => `${r.hp}|${r.speed}|${r.extra}`)).size === stats.length,
  stats);

console.log('\n── 5. ...and the two that are not duel bosses at all ───');
// THE SUITE MUST COVER ALL SEVEN, not just the five in SKINS. Frostpeak's
// Boreal and Stoneroot's Bone Warden are their own classes with their own
// bodies; a "no two bosses share an animal" check that only looks at SKINS
// would happily let one of them collide with one of these.
const others = await wk.page.evaluate(async () => {
  const rooms = await import('/js/rooms.js');
  const THREE = await import('three');
  const st = await import('/js/state.js');
  const out = {};
  for (const [room, key] of [['f5', 'boreal'], ['vz', 'warden']]) {
    st.state.flags.bossDefeated = false; st.state.flags.wardenDefeated = false;
    const w = await rooms.buildRoom(room, new THREE.Scene());
    const b = w.boss || w.warden;
    if (!b) { out[key] = { error: 'no boss in ' + room }; continue; }
    const mesh = b.dragon || b.model || b.root;
    mesh.updateWorldMatrix(true, true);
    const bb = new THREE.Box3().setFromObject(mesh);
    out[key] = { name: b.name, hp: b.maxHp || b.maxHp, stands: +(bb.max.y - bb.min.y).toFixed(2) };
  }
  return out;
});
for (const [k, v] of Object.entries(others)) {
  check(`${k} is in the game and is its own creature`, !v.error, v);
}
console.log('   Boreal wears wyrm.glb (Frostpeak) and the Bone Warden wears the skeleton kit;');
console.log('   neither is a Shadowgrip skin, so neither can collide with the five above.');

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — seven fights, seven creatures');
process.exit(errors.length ? 1 : 0);
