// D-L5-1 VERIFICATION: the wind bridge (ssA) is a ONE-WAY-DOWN shortcut. Its
// entrance at s4a is unconditional; s1a's entrance is gated by the dead
// windBridge flag. Prove the intended DOWN route s4a -> ssA -> s1a walks
// end to end (if it does, the vestigial flag is harmless, not a trap).
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-5/bridge', timescale: 3 });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

await d.newGame('BRIDGE');
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.borealDefeated = true;
  g.WS.set('storm', 'spark', true);
  g.WS.set('storm', 'vanesTurned', true);
});
await d.jump('s4a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf']);
await d.page.waitForFunction(() => !window.__game.narration.speaking && !window.__wk.gates.blocking, null, { timeout: 30000 }).catch(() => {});

const settle = () => d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).then(() => d.page.waitForTimeout(300)).catch(() => {});
async function go(to) {
  for (let t = 0; t < 4; t++) {
    if ((await d.wk('room')) === to) { await settle(); return true; }
    const door = (await d.wk('doors')).find((x) => x.to === to);
    if (!door) { bad(`no door to ${to} from ${await d.wk('room')} (${(await d.wk('doors')).map((x) => x.to).join(',')})`); return false; }
    const r = await d.walkTo(door.x, door.z, { timeout: 30, arrive: 0.4 });
    if (r.roomChanged === to || (await d.wk('room')) === to) { await settle(); return true; }
    if (r.ok) { const ox = Math.abs(door.x) > Math.abs(door.z) ? Math.sign(door.x) : 0, oz = ox === 0 ? Math.sign(door.z) : 0;
      await d.walkTo(door.x + ox * 0.7, door.z + oz * 0.7, { timeout: 8, arrive: 0.25 }); }
    if ((await d.wk('room')) === to) { await settle(); return true; }
  }
  bad(`could not reach ${to}`); return false;
}

say('s4a doors:', (await d.wk('doors')).map((x) => x.to).join(','));
if (await go('ssA')) {
  say('  s4a -> ssA (the bridge, entered from the top)');
  say('ssA doors:', (await d.wk('doors')).map((x) => x.to).join(','));
  if (await go('s1a')) say('  ssA -> s1a (down to the landing) — DOWN ROUTE WALKS');
}
const finalRoom = await d.wk('room');
say('final room:', finalRoom);
const ok = finalRoom === 's1a' && fails.length === 0 && d.errors.length === 0;
say('DOWN ROUTE', ok ? 'OK — one-way-down shortcut works' : 'BROKEN');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(ok ? 0 : 1);
