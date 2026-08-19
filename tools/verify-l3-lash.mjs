// A2a — THE LASH CUTS, and the log bridge burns.
//
// Drives the REAL verbs: player.trySpecial as Verdant Wolf (world.cutAt) for
// the regrowing tangles that stay optional post-boss content, and as Fire
// Wolf (world.burnAt) for the log-bridge rope, which used to be a lash-cut
// gate taught BEFORE the child had verdant — the thing dad's law forbids
// ("each wolf is locked behind its own boss; the next level runs on it").
// Verdant is Sylva's reward now (js/boss.js pushes it, main.js runs the
// ceremony); the spine runs on fire, which the child already holds walking
// out of Ember Hollow. Nothing here reaches past the game to clear a
// bramble/rope itself — a test that solves things its own way proves only
// that the test works.
import { chromium } from 'playwright';
const errors = [];
const check = (n, ok, d) => { console.log((ok?'✓ ':'✗ ')+n, d!==undefined?JSON.stringify(d):''); if(!ok) errors.push(n); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e)=>errors.push('PAGEERROR: '+e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'LASH');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf','verdant_wolf'];
  g.state.form='verdant_wolf'; g.player.iframes=99999; });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.world&&window.__game.world.roomId===r&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };

// stand next to a target, face it, and lash — the real input path
const lashAt = (x, z) => page.evaluate(async ({tx, tz}) => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  g.state.form = 'verdant_wolf';
  // forward is (sin ry, cos ry): ry = PI faces -z. Stand SOUTH of the target
  // and face NORTH at it — ry = 0 would point the lash the other way.
  g.player.root.position.set(tx, g.player.root.position.y, tz + 2.4);
  g.player.root.rotation.y = Math.PI;
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  const before = g.world.cuttables.filter((c)=>!c.cut).length;
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<6;i++) await s();
  return { before, after: g.world.cuttables.filter((c)=>!c.cut).length };
}, {tx:x, tz:z});

// stand within slam range and ground-slam — the real fire input path
const slamAt = (x, z) => page.evaluate(async ({tx, tz}) => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  g.state.form = 'fire_wolf';
  g.player.root.position.set(tx, g.player.root.position.y, tz + 1.5);
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  const before = g.world.burnables.filter((c)=>!c.burned).length;
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<6;i++) await s();
  return { before, after: g.world.burnables.filter((c)=>!c.burned).length };
}, {tx:x, tz:z});

console.log('\n── tsh: the shrine is a PROMISE, not a gate ────────────');
await go('tsh');
const shrine = await page.evaluate(() => {
  const w = window.__game.world;
  return { cuttables: w.cuttables.length, hasSpark: !!w.markers.sparkSpot,
    grants: w.markers.sparkSpot && w.markers.sparkSpot.grants };
});
check('the shrine room has NO bramble to cut — verdant is Sylva\'s reward, not this room\'s',
  shrine.cuttables === 0, shrine);
check('the shrine grants NOTHING directly (dad\'s law: wolves are boss rewards)',
  shrine.grants === undefined, shrine);

console.log('\n── DEVELOP: brambles that grow back (post-boss, optional) ─');
await go('tc2');
const dev = await page.evaluate(() => ({
  cuttables: window.__game.world.cuttables.length,
  regrowing: window.__game.world.cuttables.filter((c)=>c.regrows).length,
  burnables: window.__game.world.burnables.length,
}));
check('the crossing has three regrowing tangles (no rope among the cuttables any more)',
  dev.cuttables === 3 && dev.regrowing === 3, dev);
check('...and the log-bridge rope is a BURNABLE now, not a cuttable', dev.burnables === 1, dev);
let r = await lashAt(-4, 4);
check('a regrowing tangle can still be cut with verdant', r.after === r.before - 1, r);
const notFlagged = await page.evaluate(() => window.__game.WS.get('wild3', 'cut_l3_tc2_0'));
check('a REGROWING tangle is NOT flagged permanently (or it solves itself)',
  notFlagged === false, { flagged: notFlagged });
// let the clock run past REGROW_AFTER
const grew = await page.evaluate(async () => {
  const g = window.__game;
  const e = g.world.cuttables.find((c)=>c.id==='l3_tc2_0');
  for (let i=0;i<80;i++) g.world.animate(i*0.1, 0.1);
  return { cut: e.cut };
});
check('it grows back if you dawdle', grew.cut === false, grew);

console.log('\n── DEVELOP: the log bridge, now FIRE (the child\'s own wolf) ─');
await go('tc2');
const gapBefore = await page.evaluate(() => {
  const w = window.__game.world;
  return { blocked: w.boxColliders.some((b)=>b.minZ===-6-1.6 && b.maxX-b.minX===14),
           safe: w.safeZones.length };
});
check('the gap is impassable before the rope burns', gapBefore.blocked, gapBefore);
const bridged = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const rope = g.world.burnables.find((c)=>c.id==='l3_tc2_bridge');
  g.state.form='fire_wolf';
  g.player.root.position.set(rope.x, g.player.root.position.y, rope.z + 1.5);
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<6;i++) await s();
  for (let i=0;i<40;i++) g.world.animate(i*0.05, 0.05);   // let the log swing
  const w = g.world;
  return { burned: rope.burned,
           stillBlocked: w.boxColliders.some((b)=>b.maxX-b.minX===14 && b.minZ===-6-1.6),
           safe: w.safeZones.length,
           knotCut: g.WS.get('wild3', 'cut_l3_tc2_bridge') };
});
check('slamming the rope burns it and swings the log', bridged.burned === true, bridged);
check('the gap becomes walkable only after the log lands',
  !bridged.stillBlocked && bridged.safe > gapBefore.safe, bridged);

console.log('\n── the great thorn-knot burns too (gates the boss door) ─');
await go('t4b');
const knotBefore = await page.evaluate(() => {
  const w = window.__game.world;
  return { burnables: w.burnables.filter((x)=>x.id==='l3_thornknot').length,
    knotCut: window.__game.WS.get('wild3', 'knotCut') };
});
check('the thorn-knot is a burnable and knotCut is not yet set', knotBefore.burnables === 1 && !knotBefore.knotCut, knotBefore);
const knotBurned = await slamAt(0, -7);
const knotAfter = await page.evaluate(() => window.__game.WS.get('wild3', 'knotCut'));
check('slamming the great thorn-knot burns it away', knotBurned.after === knotBurned.before - 1, knotBurned);
check('...and sets knotCut, which gates the boss door', knotAfter === true, { knotCut: knotAfter });

console.log('\n── A3: verdant is SYLVA\'S reward, not the shrine\'s ──────');
// The shrine grants nothing directly any more (asserted above). The real
// grant lives in main.js, watching state.flags.sylvaDefeated — same pattern
// as the Fire Wolf watching bossDefeated. Simulate the kill flag and confirm
// the ceremony fires through a real game tick, not a hand-set forms array.
await page.evaluate(() => { const g=window.__game;
  g.state.formsUnlocked = ['knight','dark_wolf','fire_wolf','earth_wolf'];
  g.state.flags.sylvaDefeated = false; g.state.flags.world = {}; });
await go('tgl');
const before = await page.evaluate(() => [...window.__game.state.formsUnlocked]);
check("verdant is NOT held before Sylva falls", !before.includes('verdant_wolf'), { before });
const afterKill = await page.evaluate(async () => {
  const g = window.__game;
  g.state.flags.sylvaDefeated = true;
  for (let i = 0; i < 30; i++) await new Promise((res) => requestAnimationFrame(res));
  return { forms: [...g.state.formsUnlocked], wild: g.WS.stage('wild3') };
});
check("defeating Sylva grants the VERDANT wolf (the ceremony fires on the flag)",
  afterKill.forms.includes('verdant_wolf'), afterKill);

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n`+errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
