// A2b — THE KNOT: the lash HOLDS.
//
// Drives the real verb (player.trySpecial as the Verdant Wolf) and the real
// boulder physics (world.updateBoulders). Nothing here moves a boulder or
// presses a plate by hand.
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
await page.fill('#t-name', 'KNOT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf','verdant_wolf'];
  g.state.form='verdant_wolf'; g.player.iframes=99999; g.state.flags.plates={}; });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.state.room===r&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };

console.log('\n── the room sets up the twist ──────────────────────────');
await page.evaluate(() => { window.__game.state.flags.plates = {}; });
await go('tkn');
const setup = await page.evaluate(() => {
  const w = window.__game.world;
  return { boulders: w.boulders.length, plates: (w.plates||[]).length,
           doors: w.doors.map((d)=>({to:d.to, gated:!!d.when})) };
});
check('the Knot has a boulder and a plate', setup.boulders === 1 && setup.plates === 1, setup);
check('the way onward is GATED on the plate', setup.doors.some((d)=>d.to==='tc3' && d.gated), setup);
const shut = await page.evaluate(() => {
  const w = window.__game.world;
  const d = w.doors.find((x)=>x.to==='tc3');
  return d.when ? d.when() : true;
});
check('...and that gate is shut before the puzzle is solved', shut === false, { open: shut });

console.log('\n── the lash PULLS the boulder (the twist) ──────────────');
const pulled = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const bo = g.world.boulders[0];
  const before = { x: bo.x, z: bo.z };
  // stand EAST of the boulder, facing west at it — the only reachable side
  g.player.root.position.set(bo.x + 2.6, g.player.root.position.y, bo.z);
  g.player.root.rotation.y = -Math.PI / 2;      // forward = (sin, cos) = (-1, 0)
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.state.form = 'verdant_wolf';
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<4;i++) await s();
  const slid = !!bo._slide;
  for (let i=0;i<60;i++) g.world.updateBoulders(0.05, g.player);
  return { before, after: { x: bo.x, z: bo.z }, slid };
});
check('lashing a boulder starts a slide', pulled.slid, pulled);
check('the boulder moves TOWARD the lasher (east), not away',
  pulled.after.x > pulled.before.x + 0.5, pulled);
check('it moves on ONE axis — the same cardinal step as a push',
  Math.abs(pulled.after.z - pulled.before.z) < 0.01, pulled);

console.log('\n── pulling it onto the plate solves the room ───────────');
const solved = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const bo = g.world.boulders[0];
  const plate = g.world.plates[0];
  // keep lashing from the far side of the plate until it lands
  for (let n = 0; n < 14 && !plate.pressed; n++) {
    g.player.root.position.set(plate.x + 2.6, g.player.root.position.y, plate.z);
    g.player.root.rotation.y = -Math.PI / 2;
    g.player.specialCooldown = 0; g.player.lockTime = 0;
    g.player.trySpecial(g.effects, g.world);
    for (let i=0;i<3;i++) await s();
    for (let i=0;i<60;i++) g.world.updateBoulders(0.05, g.player);
  }
  return { pressed: plate.pressed, flag: !!g.state.flags.plates.l3_knot_p1,
           bx: +bo.x.toFixed(2), bz: +bo.z.toFixed(2) };
});
check('the boulder can be pulled onto the plate', solved.pressed, solved);
check('...and the plate records itself in the save flags', solved.flag, solved);
const nowOpen = await page.evaluate(() => {
  const d = window.__game.world.doors.find((x)=>x.to==='tc3');
  return d.when ? d.when() : true;
});
check('solving the puzzle OPENS the way onward', nowOpen === true, { open: nowOpen });

console.log('\n── the lash SNARES (the other half) ────────────────────');
await go('t3b');
const snare = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const foe = (g.world.enemies||[]).find((e)=>!e.dead);
  if (!foe) return { none: true };
  foe.hp = 99; foe.maxHp = 99;
  // square on: stand due south, face north straight at it
  g.player.root.position.set(foe.x, g.player.root.position.y, foe.z + 2.2);
  g.player.root.rotation.y = Math.PI;
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.state.form = 'verdant_wolf';
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<4;i++) await s();
  return { stun: foe.stunned || 0, snared: !!foe.snaredUntil };
});
check('a square-on lash SNARES a foe (a long hold, not a graze)',
  !snare.none && snare.snared && snare.stun > 1.5, snare);

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n`+errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
