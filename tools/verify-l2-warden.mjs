// A4 — the Bone Warden's conclude step: a stomp at his feet drops his guard.
//
// The probe that preceded this found the MECHANIC already worked generically
// (a stomp stuns, and shieldUp is false while stunned). So this asserts the
// whole causal chain a child actually experiences: the shield really does
// block from the front, the stomp really does break it, and the punish really
// does land — plus that the break ANNOUNCES itself, which is the part that
// was missing.
import { launchBrowser } from './launch.mjs';
const errors = [];
const check = (n, ok, d) => { console.log((ok?'✓ ':'✗ ')+n, d!==undefined?JSON.stringify(d):''); if(!ok) errors.push(n); };
const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e)=>errors.push('PAGEERROR: '+e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name','WARDEN');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf'];
  g.state.flags.wardenDefeated=false; g.player.iframes=99999; });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r)&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };

await go('vz');
console.log('\n── the crypt sets up the conclude step ─────────────────');
const setup = await page.evaluate(() => ({
  warden: !!window.__game.world.warden,
  marker: !!window.__game.world.markers.stompStagger,
}));
check('the crypt spawns the Warden and marks the conclude step',
  setup.warden && setup.marker, setup);

console.log('\n── the shield genuinely blocks from the front ──────────');
const front = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const w = g.world.warden;
  w.state = 'chase'; w.stunned = 0; w.hp = 14;
  // stand in FRONT and let his update() cache the player position — the block
  // check reads _pp, so a test that sets position without stepping the world
  // measures nothing (which is exactly what my first probe did)
  g.player.root.position.set(w.x, g.player.root.position.y, w.z + 2.0);
  w.root.rotation.y = 0;                       // facing +z, at the player
  for (let i=0;i<3;i++) { w.update(0.016, i*0.016, g.player); await s(); }
  const guard = w.shieldUp;
  const hp0 = w.hp;
  w.takeDamage(3, 'steel', 'melee');
  return { guard, blocked: w.hp === hp0, hp: w.hp };
});
check('his shield is UP while he advances', front.guard, front);
check('a frontal hit CLANKS off and does nothing', front.blocked, front);

console.log('\n── a stomp at his feet breaks the guard ────────────────');
const stomp = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const w = g.world.warden;
  w.state = 'chase'; w.stunned = 0; w.hp = 14;
  for (let i=0;i<3;i++) { w.update(0.016, i*0.016, g.player); await s(); }
  const guardBefore = w.shieldUp;
  let announced = null;
  g.world.onDmgNum = (x, y, z, txt) => { if (txt === 'GUARD BROKEN!') announced = txt; };
  g.state.form = 'earth_wolf';
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.player.root.position.set(w.x, g.player.root.position.y, w.z + 1.2);
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<4;i++) await s();
  const guardAfter = w.shieldUp;
  const hp0 = w.hp;
  w.takeDamage(3, 'steel', 'melee');           // the punish
  return { guardBefore, guardAfter, announced, stunned: +w.stunned.toFixed(2),
           punishLanded: w.hp < hp0, broke: !!g.player.brokeGuardAt };
});
check('his guard is up before the stomp', stomp.guardBefore, stomp);
check('the stomp DROPS his guard', stomp.guardAfter === false, stomp);
check('the break ANNOUNCES itself so a child can learn it',
  stomp.announced === 'GUARD BROKEN!', stomp);
check('the stagger is a real punish window (over 2s)', stomp.stunned > 2, stomp);
check('and the punish now lands', stomp.punishLanded, stomp);
check('the player records the break so rooms can react', stomp.broke, stomp);

console.log('\n── the same lesson works on the shieldlings ────────────');
await go('vc1');
const shield = await page.evaluate(async () => {
  const g = window.__game;
  const s = () => new Promise((r)=>requestAnimationFrame(r));
  const sh = (g.world.enemies||[]).find((e)=>e.constructor.name==='SkeletonShield' && !e.dead);
  if (!sh) return { none: true };
  sh.state = 'chase'; sh.stunned = 0; sh.hp = 99;
  g.player.root.position.set(sh.x, g.player.root.position.y, sh.z + 1.6);
  for (let i=0;i<3;i++) { sh.update(0.016, i*0.016, g.player); await s(); }
  const before = sh.shieldUp;
  g.state.form = 'earth_wolf';
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  g.player.trySpecial(g.effects, g.world);
  for (let i=0;i<4;i++) await s();
  return { before, after: sh.shieldUp };
});
check('a stomp also breaks a shieldling guard (same rule, taught earlier)',
  !shield.none && shield.before === true && shield.after === false, shield);

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n`+errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
