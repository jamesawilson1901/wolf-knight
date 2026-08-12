// IS THERE A DOORWAY ANYWHERE THAT IS JUST A HOLE?
//
// A doorway has no wall in it. Nothing stops a child standing in one — the door
// TRIGGER is what catches them, and the moment doorAt() declines to fire, the
// opening is a gap in the room with the void behind it. That is exactly how the
// encounter seal put dad in "the black nothing": it returned null from doorAt
// and left the hole wide open.
//
// The seal is fixed. This asks the general question, in every room, at every
// door: if the trigger will NOT fire here, is there something solid instead?
//
// Both halves have to hold. A door that fires but is also walled off is just as
// broken — a promise that cannot be kept.
import { chromium } from 'playwright';

const ROOMS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3', 'ld', 'ld1', 'lg4', 'le', 'vh', 'vga', 'va1', 'va2', 'vap', 'va3', 'vgb', 'vb1', 'vb2', 'vbp', 'vb3', 'vgc', 'vc1', 'vc2', 'vcp', 'vc3', 'vz', 't1a', 't1b', 't1p', 'tc1', 't2a', 't2b', 't2p', 'tsh', 'tc2', 't3a', 't3b', 't3p', 'tkn', 'tc3', 't4a', 't4b', 't4p', 'tc4', 'tgl', 's1a', 's1b', 's1p', 'sc1', 's2a', 's2b', 's2p', 'ssh', 'sc2', 's3a', 's3b', 's3p', 'svn', 'sc3', 's4a', 's4b', 's4p', 'sc4', 'scr', 'd1a', 'd1b', 'd1p', 'dg1', 'd2a', 'd2b', 'd2p', 'dsh', 'dg2', 'd3a', 'd3b', 'd3p', 'dtp', 'dg3', 'd4a', 'd4b', 'd4p', 'dg4', 'dlg', 'ddp', 'x1', 'xsh', 'xh', 'xa1', 'xa2', 'xa3', 'xr1', 'xr2', 'xr3', 'xg1', 'xg2', 'xg3', 'xm1', 'xm2', 'xm3', 'xp1', 'xp2', 'xst', 'xth'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'HOLES');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const holes = [], walled = [];
for (const room of ROOMS) {
  if (!(await go(room))) { console.log(room.padEnd(6), 'BUILD FAILED'); continue; }
  const r = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    return (w.doors || []).map((d) => {
      const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
      const out = w.resolveCircle(cx, cz, 0.12);
      return { to: d.to, cx: +cx.toFixed(1), cz: +cz.toFixed(1),
        fires: !!w.doorAt(cx, cz),
        solid: Math.hypot(out.x - cx, out.z - cz) > 0.01,
        sealed: !!w.sealed };
    });
  });
  for (const d of r) {
    if (!d.fires && !d.solid) holes.push({ room, ...d });
    if (d.fires && d.solid) walled.push({ room, ...d });
  }
  console.log(room.padEnd(6), r.map((d) => `${d.to}${d.fires ? '' : d.solid ? '#' : '!!'}`).join(' '));
}

console.log(`\n${holes.length} doorway(s) that will not fire AND have nothing solid in them:`);
for (const h of holes) console.log(`  ${h.room} → ${h.to} at (${h.cx}, ${h.cz})${h.sealed ? ' [room sealed]' : ''}`);
console.log(`\n${walled.length} doorway(s) that fire but are walled off:`);
for (const h of walled) console.log(`  ${h.room} → ${h.to} at (${h.cx}, ${h.cz})`);
if (!holes.length && !walled.length) console.log('\nALL CLEAN — every doorway either lets you through or stops you.');
await b.close();
process.exit(holes.length || walled.length ? 1 : 0);
