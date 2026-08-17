// D6-1 VERIFICATION: the lagoon (dlg) is the tide shortcut hub. Recon flags
// its entry landings as MISMATCHED (d2a e->dlg lands 0,13 beside the d4a
// door; d3a s->dlg lands 0,-13 beside the d2a door) with velocity preserved
// on handoff — a bounce/strand risk. Prove you can ENTER the lagoon and LEAVE
// it by a chosen door without getting ping-ponged or stuck.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-6/lagoon', timescale: 3 });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

await d.newGame('LAGOON');
await d.page.evaluate(() => { window.__game.state.flags.ariaDefeated = true; });
// arrive WITH tide so canWade is true when d2a builds (its dlg door appears)
await d.jump('d2a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking, null, { timeout: 30000 }).catch(() => {});

const settle = () => d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).then(() => d.page.waitForTimeout(400)).catch(() => {});
async function go(to, viaList = []) {
  for (let t = 0; t < 5; t++) {
    if ((await d.wk('room')) === to) { await settle(); return true; }
    const door = (await d.wk('doors')).find((x) => x.to === to);
    if (!door) { bad(`no door to ${to} from ${await d.wk('room')} (${(await d.wk('doors')).map((x) => x.to).join(',')})`); return false; }
    for (const v of viaList) { await d.walkTo(v[0], v[1], { timeout: 16 }); if ((await d.wk('room')) === to) { await settle(); return true; } }
    const r = await d.walkTo(door.x, door.z, { timeout: 30, arrive: 0.4 });
    if (r.roomChanged === to || (await d.wk('room')) === to) { await settle(); return true; }
    if (r.ok) { const ox = Math.abs(door.x) > Math.abs(door.z) ? Math.sign(door.x) : 0, oz = ox === 0 ? Math.sign(door.z) : 0;
      await d.walkTo(door.x + ox * 0.7, door.z + oz * 0.7, { timeout: 8, arrive: 0.25 }); }
    if ((await d.wk('room')) === to) { await settle(); return true; }
  }
  bad(`could not reach ${to}`); return false;
}

say('d2a doors:', (await d.wk('doors')).map((x) => x.to).join(','));
if (!(await d.wk('doors')).some((x) => x.to === 'dlg')) { bad('d2a has no dlg door with tide'); }
else {
  await d.page.evaluate(() => { window.__game.state.form = 'tide_wolf'; });
  if (await go('dlg')) {
    const land = await d.wk('pos');
    say('  entered dlg, landed at', JSON.stringify(land), '· doors:', (await d.wk('doors')).map((x) => x.to).join(','));
    // did we bounce straight back out?
    if ((await d.wk('room')) !== 'dlg') bad('bounced out of the lagoon on entry');
    else {
      // try to leave by a DIFFERENT door (west -> d3a) to prove it is not a trap
      await d.page.waitForTimeout(600);
      if (await go('d3a', [[0, 0]])) say('  left the lagoon by the d3a door — NOT a trap');
    }
  }
}
const room = await d.wk('room');
say('final room:', room);
const ok = fails.length === 0 && d.errors.length === 0;
say('LAGOON', ok ? 'OK — enter/exit works' : 'TRAP/BUG');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(ok ? 0 : 1);
