// Does the keep-clear SWEEP ever fire? It is a last line of defence, and a last
// line of defence that fires often is telling you the first line is missing:
// every collider it drops is a prop that was dressed before its room declared
// where gameplay lives, left standing but walk-through-able. Better to know
// which rooms those are and fix the ORDER than to keep declawing props.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const hits = [];
let current = '';
page.on('console', (m) => { if (/keepclear/.test(m.text())) hits.push(`${current}: ${m.text()}`); });
page.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'KEEPCLEAR');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game;
  g.state.settings.greybox = false; g.player.iframes = 999999;
  g.WS.set('wild3','rootCut',true); g.WS.set('wild3','logDown',true); });
const go = async (room) => { for (let a = 0; a < 8; a++) {
  await page.evaluate((r) => { const g = window.__game; g.state.room = r; g.player.iframes = 0;
    g.player.hearts = 0.5; g.player.hurt(99, { pierceDefend: true }); }, room);
  try { await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1, room, { timeout: 45000 }); return true; } catch {} }
  return false; };
const ROOMS = process.argv.slice(2);
for (const id of ROOMS) { current = id; if (!await go(id)) console.log(id + ' FAILED'); }
console.log(hits.length ? 'SWEEP FIRED:\n' + hits.join('\n')
  : `✓ the sweep fired in none of the ${ROOMS.length} rooms — every builder asked before it placed`);
await b.close();
