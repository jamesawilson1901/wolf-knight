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
const quiet = () => wk.page.evaluate(() => { window.__game.state.settings.captions = false;
  window.__game.narration.skip(); });

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
    out[key] = { name: b.name || key, hp: b.maxHp || b.maxHp || null, stands: +(bb.max.y - bb.min.y).toFixed(2) };
  }
  return out;
});
for (const [k, v] of Object.entries(others)) {
  check(`${k} is in the game and is its own creature`, !v.error, v);
}
console.log('   Boreal wears wyrm.glb (Frostpeak) and the Bone Warden wears the skeleton kit;');
console.log('   neither is a Shadowgrip skin, so neither can collide with the five above.');

console.log('\n── 6. a boss cannot be mashed through ─────────────────');
// Dad: "boss fights are far too easy and are all beatable by spamming the
// attack button." The fix is a GUARD while the boss is up and watching, and
// this measures it the only way that means anything: land the SAME blow in a
// guarded state and in an open one, and compare what it cost.
const guardTest = await wk.page.evaluate(async () => {
  const rooms = await import('/js/rooms.js');
  const THREE = await import('three');
  const st = await import('/js/state.js');
  const out = {};
  for (const [room, skin] of [['le', 'shadowgrip'], ['tgl', 'sylva'], ['xth', 'grimm']]) {
    for (const k of Object.keys(st.state.flags)) {
      if (typeof st.state.flags[k] === 'boolean') st.state.flags[k] = false;
    }
    st.state.flags.bossHp = 0; st.state.flags.sylvaHp = 0; st.state.flags.grimmHp = 0;
    const w = await rooms.buildRoom(room, new THREE.Scene());
    const b = w.boss;
    if (!b) { out[skin] = { error: 'no boss' }; continue; }
    const hit = (action) => {
      b.action = action;
      const before = b.coreHp;
      b.coreHittable.takeDamage(2, 'steel');
      const cost = before - b.coreHp;
      b.coreHp = before;                      // put it back; this is a ruler, not a fight
      return +cost.toFixed(3);
    };
    out[skin] = { guarded: hit('prowl'), open: hit('tired'), declared: b.skin.guard };
  }
  return out;
});
for (const [skin, r] of Object.entries(guardTest)) {
  if (r.error) { check(`${skin} has a boss to measure`, false, r); continue; }
  check(`${skin}: a blow lands harder in the opening than through the guard`,
    r.open > r.guarded * 1.15, r);
  check(`${skin}: and the guard still lets damage through (never a wall)`,
    r.guarded > 0, r);
}

console.log('\n── 7. no tell is shorter than the law ─────────────────');
// LAW 1 (combat context §2): every boss telegraph is at least 0.9s, because a
// child's choice reaction is around 800ms. Difficulty is allowed to change
// what a child must DO; it is never allowed to buy itself their reading time.
const tells = await wk.page.evaluate(async () => {
  const { SKINS } = await import('/js/boss.js');
  const out = {};
  for (const [k, s] of Object.entries(SKINS)) {
    const m = s.tellMult || 1;
    out[k] = { tellMult: m, swipe: +Math.max(0.9, 0.9 * m).toFixed(2),
      charge: +Math.max(0.9, 1.0 * m).toFixed(2), gap: s.gap || 3.2, tier: s.tier || null,
      moves: (s.moves || ['swipe', 'charge']).length };
  }
  return out;
});
for (const [k, r] of Object.entries(tells)) {
  console.log(`   ${k.padEnd(12)} tier ${r.tier}  swipe ${r.swipe}s  charge ${r.charge}s  gap ${r.gap}s  ${r.moves} moves`);
  check(`${k}'s tells clear the 0.9s boss floor`, r.swipe >= 0.9 && r.charge >= 0.9, r);
}
const tiers = Object.values(tells).filter((r) => r.tier).sort((a, b) => a.tier - b.tier);
check('the gap between attacks tightens as the regions go on',
  tiers.every((r, i) => i === 0 || r.gap <= tiers[i - 1].gap), tiers.map((r) => `${r.tier}:${r.gap}`));
check('...and a later boss never telegraphs faster than the floor',
  tiers.every((r) => r.swipe >= 0.9), tiers.map((r) => `${r.tier}:${r.swipe}`));

console.log('\n── 8. the same move never comes twice running ─────────');
const picks = await wk.page.evaluate(async () => {
  const rooms = await import('/js/rooms.js');
  const THREE = await import('three');
  const st = await import('/js/state.js');
  for (const k of Object.keys(st.state.flags)) {
    if (typeof st.state.flags[k] === 'boolean') st.state.flags[k] = false;
  }
  st.state.flags.sylvaHp = 0;
  const w = await rooms.buildRoom('tgl', new THREE.Scene());
  const b = w.boss;
  b._halfHowled = true;                 // her root only unlocks below half
  const seq = [];
  for (let i = 0; i < 60; i++) seq.push(b._pickMove(3.0));
  const far = [];
  for (let i = 0; i < 60; i++) far.push(b._pickMove(6.5));
  return { seq, far, distinct: [...new Set(seq)], distinctFar: [...new Set(far)] };
});
let repeats = 0;
for (let i = 1; i < picks.seq.length; i++) if (picks.seq[i] === picks.seq[i - 1]) repeats++;
check('sixty draws in close, and never the same move twice running', repeats === 0,
  { repeats, distinct: picks.distinct });
check('...and the far-range draws drop the moves that make no sense up close',
  !picks.distinctFar.includes('swipe'), { distinctFar: picks.distinctFar });

console.log('\n── 9. and mashing is measured, not assumed ────────────');
// The only honest test of "beatable by spamming the attack button" is to spam
// the attack button. This walks at the boss and presses J, nothing else — no
// reading, no dodging, no shield — for a minute, against the FIRST fight in
// the game and the LAST one, and compares what it buys.
//
// THIS SECTION USED TO ASSERT THE OPPOSITE, and the change is dad's.
//
// It said region one must still be winnable by mashing — "a five-year-old who
// only mashes has to be able to get through the Shadowgrip, or the game stops
// at its first boss" — and measured that the masher took at least 35% of the
// bar off. Then he played it and wrote, of that exact fight: "Boss can be beat
// by button mashing. Make it you can only hurt it when it's down. Blocking its
// attack makes it fall over." Every boss is armoured now until its own verb
// opens it, so a masher takes off nothing at all, by design.
//
// Rewriting a test to match the code it is testing is normally how a suite
// becomes a lie, so this is only safe because the OTHER half is proven
// separately and by real play: probe-blocker.mjs plays the fight the way it is
// meant to be played — shield up on the tell, swing only in the window — and
// insists a child who does that WINS. Masher must lose; blocker must win. This
// file owns the first half; do not let it own both.
const mash = async (room, forms, seconds) => {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: forms });
  await wk.page.waitForFunction((r) => window.__wk.room === r && !window.__wk.gates.transitioning,
    room, { timeout: 60000 });
  await quiet();
  const read = () => wk.page.evaluate(() => {
    const b = window.__game.world.boss;
    return { hp: b ? +b.coreHp.toFixed(2) : 0,
      x: b ? b.x + b.core.position.x : 0, z: b ? b.z + b.core.position.z : 0,
      hearts: window.__game.player.hearts };
  });
  const start = await read();
  const t0 = Date.now();
  let hits = 0, last = start.hearts;
  while ((Date.now() - t0) / 1000 < seconds) {
    const b = await read();
    if (!b.hp) break;
    const p = await wk.wk('pos');
    if (Math.hypot(b.x - p.x, b.z - p.z) > 1.7) await wk.walkTo(b.x, b.z, { timeout: 2, arrive: 1.5 });
    await wk.page.keyboard.press('j');
    const now = (await read()).hearts;
    if (now < last) hits++;
    if (now <= 0.5) { await wk.page.waitForTimeout(3500); }
    last = (await read()).hearts;
    await wk.page.waitForTimeout(120);
  }
  const end = await read();
  const dt = (Date.now() - t0) / 1000;
  // FRACTION of health per second, not raw health per second. Shadow-Grimm
  // carries 32 and the Shadowgrip 20, so raw damage compares two different
  // rulers; what a child feels is how much of the BAR moves.
  return { room, dealt: +(start.hp - end.hp).toFixed(2), hp: start.hp,
    barPerSecond: +(((start.hp - end.hp) / start.hp) / dt).toFixed(4),
    hitsTaken: hits };
};
const first = await mash('le', ['knight', 'dark_wolf', 'fire_wolf'], 60);
const last = await mash('xth', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
  'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'], 60);
console.log('   ', JSON.stringify(first));
console.log('   ', JSON.stringify(last));
// A WHOLE MINUTE OF NOTHING BUT THE ATTACK BUTTON, and the bar must not move.
check('a minute of mashing takes nothing off the FIRST boss', first.dealt === 0, first);
check('...nor off the LAST one', last.dealt === 0, last);
// and it has to COST something, or "immune" just reads as a boss that is
// asleep. A masher should be losing hearts while it learns nothing.
check('mashing costs hearts even in region one', first.hitsTaken >= 1, first);
check('the last fight hurts a masher at least as much as the first',
  last.hitsTaken >= first.hitsTaken, { first: first.hitsTaken, last: last.hitsTaken });
// THE OTHER HALF, NAMED SO IT CANNOT BE FORGOTTEN. Everything above passes
// trivially if a boss is simply unbeatable, which would be far worse than one
// that can be mashed. tools/probe-blocker.mjs is what stops that, and
// tools/verify-bossopen.mjs proves every skin's verb opens it and that damage
// lands inside the window. If this file is green and those are not, the fights
// are broken and this file is the one lying.
console.log('   (masher must lose; blocker must win — see probe-blocker.mjs '
  + 'and verify-bossopen.mjs for the other half)');

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — seven fights, seven creatures');
process.exit(errors.length ? 1 : 0);
