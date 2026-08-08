// PROGRESSION — is this a GAME now, or still a demo behind a cheat code?
//
// Fix-plan A1/A7. Checks the two journeys that matter:
//   a FRESH child walks den → Level 1 → Level 2 → Level 3 → Frostpeak
//   a RETURNING child whose save predates the rebuild still loads, in the
//   right place, and is not handed a checkerboard.
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
await page.fill('#t-name', 'PROG');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.player.iframes=99999; });

const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.state.room===r&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };
const doorsOf = () => page.evaluate(() => window.__game.world.doors.map((d)=>d.to));

console.log('\n── A7: a child is never handed a checkerboard ──────────');
const grey = await page.evaluate(() => window.__game.state.settings.greybox);
check('greybox is OFF by default for a fresh profile', grey === false, { greybox: grey });

console.log('\n── A1: the den leads into the rebuilt Level 1 ─────────');
await go('den');
const den = await doorsOf();
check('the den door goes to the rebuilt Level 1 (la), not r1',
  den.includes('la') && !den.includes('r1'), { doors: den });

console.log('\n── A1: the three levels chain to each other ───────────');
// Level 1 boss down → onward to Stoneroot
await page.evaluate(() => { window.__game.state.flags.bossDefeated = true; });
await go('le');
const le = await doorsOf();
check('beating the Shadowgrip opens the way to Level 2 (vh)', le.includes('vh'), { doors: le });
// Level 2 warden down → onward to Wild Woods
await page.evaluate(() => { window.__game.state.flags.wardenDefeated = true; });
await go('vz');
const vz = await doorsOf();
check('beating the Bone Warden opens the way to Level 3 (t1a)', vz.includes('t1a'), { doors: vz });
// Level 3 Sylva down → onward to Frostpeak
await page.evaluate(() => { window.__game.state.flags.sylvaDefeated = true; });
await go('tgl');
const tgl = await doorsOf();
check('freeing Sylva opens the way to Frostpeak (f1)', tgl.includes('f1'), { doors: tgl });
check('the ring still closes back to Thornedge', tgl.includes('t1a'), { doors: tgl });

// and the boss rooms are dead ends BEFORE the boss is beaten
await page.evaluate(() => { const g=window.__game;
  g.state.flags.wardenDefeated=false; g.state.flags.sylvaDefeated=false; });
await go('vz');
check('the crypt does not leak onward before the Warden is beaten',
  !(await doorsOf()).includes('t1a'));

console.log('\n── A1: an OLD save still loads, in the right place ────');
for (const [oldRoom, expect] of [['r1','la'],['r2','lb'],['r3','le'],['ka','ld'],
                                 ['e1','vh'],['e2','vb1'],['e3','vz'],
                                 ['w1','t1a'],['w3','t3a'],['w5','tgl'],['f1','f1']]) {
  const r = await page.evaluate((o) => window.__game.resolveRoom(o), oldRoom);
  check(`a save parked in ${oldRoom} resumes at ${expect}`, r === expect, { got: r });
}
// the retired ids must still BUILD (a save can point at any of them)
for (const oldRoom of ['r1', 'e2', 'w3']) {
  check(`${oldRoom} still builds (redirected)`, await go(oldRoom));
}

console.log('\n── A7: an old profile does not restore greybox ────────');
const restored = await page.evaluate(() => {
  const g = window.__game;
  // forge a pre-rebuild profile: greybox on, parked in a retired room
  const data = { profileId: g.state.profileId, name: 'OLD', region: 'ember_hollow',
    checkpoint: { room: 'r2', x: 0, z: 0, id: 'spawn' },
    settings: { greybox: true, musicVol: 0.3 }, formsUnlocked: ['knight'] };
  g.applySave(g.state.profileId, 'OLD', data);
  return { greybox: g.state.settings.greybox, musicVol: g.state.settings.musicVol,
           room: g.state.checkpoint.room };
});
check('an old profile is NOT restored into greybox', restored.greybox === false, restored);
check('its other settings still restore', restored.musicVol === 0.3, restored);
check('its retired checkpoint is resolved on load', restored.room === 'lb', restored);

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n`+errors.join('\n') : '\nALL CLEAN.');
await b.close();
process.exit(errors.length ? 1 : 0);
