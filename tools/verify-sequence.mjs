// FULL-SEQUENCE CHECK — Levels 1 -> 2 -> 3 played in order.
// Does memory come back to baseline BETWEEN levels? A leak that is invisible
// inside one level compounds across a whole sitting.
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
await page.fill('#t-name', 'SEQ');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g=window.__game;
  g.state.settings.captions=false; g.state.settings.voice=false; g.state.settings.sfxVol=0;
  g.state.settings.greybox=false;
  g.state.formsUnlocked=['knight','dark_wolf','fire_wolf','earth_wolf','verdant_wolf'];
  g.WS.set('vault','spark',true); g.WS.set('vault','drained',true); g.WS.set('vault','handDown',true);
  g.WS.set('wild3','rootCut',true); g.WS.set('wild3','logDown',true);
  g.player.iframes=99999; });
const go = async (room) => { for (let a=0;a<8;a++){ await page.evaluate((r)=>{const g=window.__game;
  g.state.room=r; g.player.iframes=0; g.player.hearts=0.5; g.player.hurt(99,{pierceDefend:true});}, room);
  try { await page.waitForFunction((r)=>window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r)&&window.__game.player.hearts>1, room,{timeout:45000}); return true;} catch{} } return false; };
const mem = () => page.evaluate(() => { const i=window.__game.renderer.info;
  return { geometries:i.memory.geometries, textures:i.memory.textures, programs:i.programs?i.programs.length:0 }; });

const L1 = ['la','lg1','lb','lc','ld','le'];
const L2 = ['vh','vga','va1','vb1','vc1','vz'];
const L3 = ['t1a','tc1','t2a','t3a','t4a','tgl'];

console.log('\nFULL SEQUENCE 1 -> 2 -> 3 (dressed)\n');
// warm every cache once so the baseline is a real steady state
for (const r of [...L1,...L2,...L3]) await go(r);
const base = await mem();
console.log('  baseline after one full pass:', JSON.stringify(base));

const marks = {};
for (const [name, list] of [['L1',L1],['L2',L2],['L3',L3]]) {
  for (const r of list) await go(r);
  marks[name] = await mem();
  console.log(`  after ${name}: ${JSON.stringify(marks[name])}`);
}
// The PER-GROUP numbers are informational, not pass/fail. Each group ends with
// a different room resident, so its live set legitimately differs — measured,
// they oscillate about +/-6 as one level's asset caches warm while another's
// release. Asserting "back to baseline" mid-lap tests the wrong thing and
// reports a leak that is not there. The meaningful number is LAP OVER LAP,
// taken at the same point in the cycle, which is the check below.
for (const [name, m] of Object.entries(marks)) {
  console.log(`    ${name} live-set delta vs baseline: geom ${m.geometries - base.geometries >= 0 ? '+' : ''}` +
    `${m.geometries - base.geometries}, tex ${m.textures - base.textures >= 0 ? '+' : ''}${m.textures - base.textures}` +
    '   (informational — different rooms resident)');
}
// a second full lap must not drift either
for (const r of [...L1,...L2,...L3]) await go(r);
const after = await mem();
console.log('  after a second full lap:', JSON.stringify(after));
check('a full 1->2->3 lap does not accumulate memory',
  after.geometries - base.geometries <= 3 && after.textures - base.textures <= 3,
  { geom: after.geometries - base.geometries, tex: after.textures - base.textures,
    programs: after.programs - base.programs });

// SAVE AND RESUME AT ANY POINT ACROSS ALL THREE
console.log('\nSAVE / RESUME ACROSS ALL THREE LEVELS');
for (const room of ['lb','vh','t3a']) {
  const r = await page.evaluate((rm) => {
    const g = window.__game;
    g.state.checkpoint = { room: rm, x: 0, z: 0, id: 'spawn' };
    const wrote = g.persist();
    const raw = localStorage.getItem('wolfknight:save:' + g.state.profileId);
    const parsed = raw ? JSON.parse(raw) : null;
    return { wrote, room: parsed && parsed.checkpoint && parsed.checkpoint.room,
             world: parsed && parsed.flags && parsed.flags.world };
  }, room);
  check(`save at ${room} round-trips (and keeps world state)`,
    r.wrote && r.room === room && r.world && r.world.vault && r.world.wild3, r);
}
console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n`+errors.join('\n') : '\nALL CLEAN.');
await b.close();
