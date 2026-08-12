// A2a — THE LASH CUTS. Introduce, develop, and the log bridge.
//
// Drives the REAL verb: player.trySpecial as the Verdant Wolf, which calls
// world.cutAt. Nothing here reaches past the game to clear a bramble itself,
// because a test that cuts brambles its own way proves only that the test works.
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
  try { await page.waitForFunction((r)=>window.__game.state.room===r&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };

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

console.log('\n── INTRODUCE: the shrine bramble ───────────────────────');
await go('tsh');
let n = await page.evaluate(() => window.__game.world.cuttables.length);
check('the shrine has exactly one bramble to cut', n === 1, { cuttables: n });
let r = await lashAt(0, -5);
check('lashing it CUTS it (real verb, via world.cutAt)', r.after === r.before - 1, r);
const flagged = await page.evaluate(() => window.__game.WS.get('wild3', 'cut_l3_tsh_teach'));
check('the cut is recorded in WorldState (so it stays cut)', flagged === true);
// rebuild the room: it must still be gone
await go('t2b'); await go('tsh');
n = await page.evaluate(() => window.__game.world.cuttables.length);
check('after leaving and returning, the shrine bramble is still gone', n === 0, { cuttables: n });

console.log('\n── DEVELOP: brambles that grow back ────────────────────');
await go('tc2');
const dev = await page.evaluate(() => ({
  cuttables: window.__game.world.cuttables.length,
  regrowing: window.__game.world.cuttables.filter((c)=>c.regrows).length,
}));
check('the crossing has three regrowing tangles plus the rope', dev.cuttables === 4, dev);
check('exactly three of them regrow', dev.regrowing === 3, dev);
r = await lashAt(-4, 4);
check('a regrowing tangle can be cut', r.after === r.before - 1, r);
const notFlagged = await page.evaluate(() => window.__game.WS.get('wild3', 'cut_l3_tc2_0'));
check('a REGROWING tangle is NOT flagged permanently (or it solves itself)',
  notFlagged === false, { flagged: notFlagged });
// let the clock run past REGROW_AFTER
const grew = await page.evaluate(async () => {
  const g = window.__game;
  const e = g.world.cuttables.find((c)=>c.id==='l3_tc2_0');
  // drive the world clock directly rather than waiting 7 real seconds
  for (let i=0;i<80;i++) g.world.animate(i*0.1, 0.1);
  return { cut: e.cut };
});
check('it grows back if you dawdle', grew.cut === false, grew);

console.log('\n── DEVELOP: the log bridge ─────────────────────────────');
await go('tc2');
const gapBefore = await page.evaluate(() => {
  const w = window.__game.world;
  return { blocked: w.boxColliders.some((b)=>b.minZ===-6-1.6 && b.maxX-b.minX===14),
           safe: w.safeZones.length };
});
check('the gap is impassable before the rope is lashed', gapBefore.blocked, gapBefore);
const bridged = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const rope = g.world.cuttables.find((c)=>c.id==='l3_tc2_bridge');
  g.state.form='verdant_wolf';
  g.player.root.position.set(rope.x, g.player.root.position.y, rope.z + 2.2);
  g.player.root.rotation.y = Math.PI;
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<6;i++) await s();
  for (let i=0;i<40;i++) g.world.animate(i*0.05, 0.05);   // let the log swing
  const w = g.world;
  return { cut: rope.cut,
           stillBlocked: w.boxColliders.some((b)=>b.maxX-b.minX===14 && b.minZ===-6-1.6),
           safe: w.safeZones.length };
});
check('lashing the rope swings the log', bridged.cut === true, bridged);
check('the gap becomes walkable only after the log lands',
  !bridged.stillBlocked && bridged.safe > gapBefore.safe, bridged);

console.log('\n── A3: the shrine grants the RIGHT wolf ────────────────');
// STAND ON THE SHRINE THE ROOM ACTUALLY HAS.
//
// This used to walk to a hardcoded (0,-3) and (0,-2). Petra's shrine moved to
// the middle of va3 — onto the line between its two doors, because a child was
// crossing that room without ever touching it and locking the whole region into
// a loop — and this file went red for a grant that works perfectly. A test that
// pins coordinates fails the day the level is improved, and says nothing true
// about the game either way. It reads the marker now.
//
// AND IT WAITS ON THE GAME, NOT THE CLOCK. 600ms of wall time is about three
// frames under SwiftShader, so this was already a coin toss before anything
// moved.
const standOnSpark = async (room) => {
  await go(room);
  return page.evaluate(async (r) => {
    const g = window.__game;
    const s = g.world.markers.sparkSpot;
    if (!s) return { err: 'no sparkSpot in ' + r };
    g.player.root.position.set(s.x, g.player.root.position.y, s.z);
    // up to eight seconds of GAME time for the grant to fire.
    //
    // WAIT FOR A FORM TO ARRIVE, not for the list to reach a magic length. The
    // exit used to be `formsUnlocked.length > 2`, which is true the instant the
    // Level 3 case starts — it is seeded with four forms so that Kael can even
    // reach the Wild Woods. So this stood on the shrine for exactly one frame,
    // read the list back unchanged and reported a broken grant. Counting from
    // wherever the list happens to start asks the real question: did standing
    // here give Kael something he did not have.
    const n0 = g.state.formsUnlocked.length;
    const t0 = g.state.clock !== undefined ? g.state.clock : 0;
    for (let i = 0; i < 600; i++) {
      g.player.iframes = 9999;
      await new Promise((res) => requestAnimationFrame(res));
      if (g.state.formsUnlocked.length > n0) break;
      if (g.state.clock !== undefined && g.state.clock - t0 > 8) break;
    }
    return { at: { x: s.x, z: s.z }, forms: [...g.state.formsUnlocked],
      vault: g.WS.stage('vault'), wild: g.WS.stage('wild3') };
  }, room);
};

await page.evaluate(() => {
  const g = window.__game;
  g.state.formsUnlocked = ['knight','dark_wolf'];
  g.state.flags.world = {};
});
const afterL2 = await standOnSpark('va3');   // Level 2's shrine
check("Level 2's shrine grants the EARTH wolf", afterL2.forms.includes('earth_wolf'), afterL2);
check("...and advances the VAULT, not the woods", afterL2.vault === 1 && afterL2.wild === 0, afterL2);

await page.evaluate(() => { const g=window.__game;
  g.state.formsUnlocked = ['knight','dark_wolf','fire_wolf','earth_wolf']; });
const afterL3 = await standOnSpark('tsh');
check("Level 3's shrine grants the VERDANT wolf, not the Earth wolf",
  afterL3.forms.includes('verdant_wolf'), afterL3);

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n`+errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
