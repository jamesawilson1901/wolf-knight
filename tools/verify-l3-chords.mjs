// A2c — the conclude step and the two chords.
//
// The shortcuts have to OPEN, from the far side, by the verb the level taught,
// and survive a quit. And the glade must wait on the great thorn-knot.
import { launchBrowser } from './launch.mjs';
const errors = [];
const check = (n, ok, d) => { console.log((ok?'✓ ':'✗ ')+n, d!==undefined?JSON.stringify(d):''); if(!ok) errors.push(n); };
const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e)=>errors.push('PAGEERROR: '+e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'CHORD');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf','verdant_wolf'];
  g.state.form='verdant_wolf'; g.player.iframes=99999; g.state.flags.world={}; });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.world&&window.__game.world.roomId===r&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };
// lash a named cuttable, standing south of it and facing north
const lash = (id) => page.evaluate(async (cid) => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const c = g.world.cuttables.find((x)=>x.id===cid);
  if (!c) return { missing: true };
  g.state.form='verdant_wolf';
  g.player.root.position.set(c.x, g.player.root.position.y, c.z + 2.2);
  g.player.root.rotation.y = Math.PI;
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<6;i++) await s();
  return { cut: c.cut };
}, id);

// slam a named burnable — the great thorn-knot is fire's now, not the lash's
// (dad's law: verdant is Sylva's reward, so the pre-boss spine cannot ask for
// it — the knot burns instead, the verb the child already holds)
const slam = (id) => page.evaluate(async (bid) => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const c = g.world.burnables.find((x)=>x.id===bid);
  if (!c) return { missing: true };
  g.state.form='fire_wolf';
  g.player.root.position.set(c.x, g.player.root.position.y, c.z + 1.5);
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<6;i++) await s();
  return { cut: c.burned };
}, id);

console.log('\n── the chords are SHUT before they are earned ──────────');
await go('t3a');
let d = await page.evaluate(() => window.__game.world.doors.map((x)=>x.to));
check('t3a shows no chord before the root-wall is cut', !d.includes('tsB'), { doors: d });
await go('t4a');
d = await page.evaluate(() => window.__game.world.doors.map((x)=>x.to));
check('t4a shows no chord before the log comes down', !d.includes('tsA'), { doors: d });

console.log('\n── cutting the root-wall opens the chord ───────────────');
await go('t3a');
let r = await lash('l3_rootwall');
check('the root-wall can be cut with the lash', r.cut === true, r);
let ws = await page.evaluate(() => window.__game.WS.get('wild3','rootCut'));
check('...and that records rootCut in WorldState', ws === true);
await go('t3a');
d = await page.evaluate(() => window.__game.world.doors.map((x)=>x.to));
check('the chord to the Gloomwood now exists', d.includes('tsB'), { doors: d });

console.log('\n── hauling the great log down opens the way home ───────');
await go('t4a');
r = await lash('l3_greatlog');
check('the great log can be cut loose', r.cut === true, r);
ws = await page.evaluate(() => window.__game.WS.get('wild3','logDown'));
check('...and that records logDown', ws === true);
await go('t4a');
d = await page.evaluate(() => window.__game.world.doors.map((x)=>x.to));
check('the long chord home to Thornedge now exists', d.includes('tsA'), { doors: d });

console.log('\n── CONCLUDE: the great thorn-knot opens the glade ──────');
await page.evaluate(() => { window.__game.WS.set('wild3','knotCut', false); });
await go('tc4');
let open = await page.evaluate(() => {
  const x = window.__game.world.doors.find((y)=>y.to==='tgl');
  return x && x.when ? x.when() : null;
});
check('the glade door is SHUT before the knot is parted', open === false, { open });
await go('t4b');
r = await slam('l3_thornknot');
check('the great thorn-knot can be burned away', r.cut === true, r);
ws = await page.evaluate(() => window.__game.WS.get('wild3','knotCut'));
check('...and that records knotCut', ws === true);
await go('tc4');
open = await page.evaluate(() => {
  const x = window.__game.world.doors.find((y)=>y.to==='tgl');
  return x && x.when ? x.when() : null;
});
check('parting the knot OPENS the glade', open === true, { open });

console.log('\n── it all survives a quit ──────────────────────────────');
const round = await page.evaluate(() => {
  const g = window.__game;
  const wrote = g.persist();
  const raw = JSON.parse(localStorage.getItem('wolfknight:save:' + g.state.profileId));
  g.state.flags.world = {};
  g.WS.restore(raw.flags.world);
  return { wrote, wild: g.state.flags.world.wild3 };
});
check('the woods state round-trips through the save file',
  round.wrote && round.wild && round.wild.rootCut && round.wild.logDown && round.wild.knotCut, round);
await go('t4a');
d = await page.evaluate(() => window.__game.world.doors.map((x)=>x.to));
check('a child who quits and returns still has the shortcut', d.includes('tsA'), { doors: d });

console.log('\n── Sylva is waiting, and the ring still closes ─────────');
await page.evaluate(() => { window.__game.state.flags.sylvaDefeated = false; });
await go('tgl');
const glade = await page.evaluate(() => ({
  boss: !!window.__game.world.markers.bossSpot,
  skin: window.__game.world.markers.bossSpot && window.__game.world.markers.bossSpot.skin,
  doors: window.__game.world.doors.map((x)=>x.to),
}));
check('the glade spawns Sylva', glade.boss && glade.skin === 'sylva', glade);
check('the ring still closes back to Thornedge', glade.doors.includes('t1a'), glade);

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n`+errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
