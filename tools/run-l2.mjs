// LEVEL 2, PLAYED. Enter Stoneroot the way a child does after Level 1: dev
// jump to vh with knight/dark/fire (the jump is allowed only to ENTER the
// level). Then the region is played by its own new rules — with FIRE:
//   spoke A: vh → vga → va1 → va2 → va3, light Petra's lantern (fire slam)
//   spoke B: vh → vgb → vb1 → vb2 → vb3, ring the plate (slam)
//   spoke C: vh → vgc → vc1 → vc2 → vc3, burn the shoulder pin (slam)
//   then vh → vz and the Bone Warden, who grants EARTH on defeat.
// Real inputs throughout: WASD walk, Tab cycles form, K is the special.
import { launch } from './wk-drive.mjs';

const DIR = process.argv[2] || 'test-evidence/level-2';
const d = await launch({ evidenceDir: DIR });
const say = (...a) => console.log(...a);

await d.newGame('L2BOT');
await d.jump('vh', ['knight', 'dark_wolf', 'fire_wolf']);
say('entered:', JSON.stringify(await d.wk()));
await d.shot('enter-vh');

async function fightNear(maxMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const foes = await d.wk('foes');
    if (!foes.length) return true;
    const me = (await d.wk()).pos;
    foes.sort((a, b2) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b2.x - me.x, b2.z - me.z));
    const f = foes[0];
    if (Math.hypot(f.x - me.x, f.z - me.z) > 1.35) await d.walkTo(f.x, f.z, { timeout: 2.5, arrive: 1.1 });
    else { await d.tap('j'); await d.page.waitForTimeout(240); }
  }
  return (await d.wk('foes')).length === 0;
}

async function toForm(want) {
  for (let i = 0; i < 10; i++) {
    if ((await d.wk('form')) === want) return true;
    await d.tap('Tab');
    await d.page.waitForTimeout(500);
  }
  return (await d.wk('form')) === want;
}

async function goRoom(to) {
  for (let tries = 0; tries < 3; tries++) {
    const here = await d.wk();
    const doors = await d.wk('doors');
    const door = doors.find((x) => x.to === to);
    if (!door) { say(`!! no door to ${to} from ${here.room}`); return false; }
    say(`  try${tries} ${here.room}@(${here.pos.x},${here.pos.z}) -> door ${to}@(${door.x},${door.z})`);
    let r = await d.walkTo(door.x, door.z, { timeout: 60 });
    say(`  try${tries} walk:`, JSON.stringify(r));
    if (!r.ok && r.why === 'stuck') { await fightNear(25000); r = await d.walkTo(door.x, door.z, { timeout: 40 }); }
    if (!r.roomChanged && (await d.wk('room')) === r.room) {
      for (let i = 0; i < 20; i++) { await d.page.waitForTimeout(200); if ((await d.wk('room')) !== r.room) break; }
      if ((await d.wk('room')) === r.room) {
        await d.walkTo(door.x * 1.12, door.z * 1.12, { timeout: 10, arrive: 0.4 });
        await d.page.waitForTimeout(1200);
      }
    }
    const now = await d.wk('room');
    say(`  try${tries} end room ${now}`);
    if (now === to) return true;
    if (now !== here.room) { say(`   passed through to ${now} en route to ${to}`); continue; }
    await fightNear(20000);
  }
  return (await d.wk('room')) === to;
}

async function slamAt(x, z, label, wsCheck) {
  await toForm('fire_wolf');
  const w = await d.walkTo(x, z, { timeout: 40, arrive: 0.8 });
  say(`  at ${label}:`, JSON.stringify(w));
  for (let i = 0; i < 6; i++) {
    await d.tap('k');
    await d.page.waitForTimeout(1400);
    const ws = await d.wk('ws');
    const flags = await d.page.evaluate(() => window.__wk.flags.burned);
    if (await wsCheck()) { say(`  ${label} DONE`); return true; }
  }
  return wsCheck();
}
const vaultStage = async () => (await d.wk('ws')).vault;

let ok = true;
const route = async (rooms) => { for (const r of rooms) { await fightNear(30000); if (!(await goRoom(r))) { say(`!! blocked before ${r}`); return false; } await d.shot(`enter-${r}`); } return true; };

// ---- spoke A: the lantern
ok = ok && await route(['vga', 'va1', 'va2', 'va3']);
if (ok) {
  const stage0 = await vaultStage();
  ok = await slamAt(0, -0.2, "Petra's lantern", async () => (await vaultStage()) > stage0);
  say('vault stage now', await vaultStage());
  await d.shot('lantern-lit');
}
// ---- back to the hub, spoke B: the rattle
ok = ok && await route(['vh', 'vgb', 'vb1', 'vb2', 'vb3']);
if (ok) {
  ok = await slamAt(0, 0, 'the rattle plate', async () => (await d.page.evaluate(() => !!window.__game.WS.get('vault', 'drained'))));
  await d.shot('plate-rung');
}
// ---- spoke C: the pin
ok = ok && await route(['vh', 'vgc', 'vc1', 'vc2', 'vc3']);
if (ok) {
  ok = await slamAt(1.2, -3, 'the shoulder pin', async () => (await d.page.evaluate(() => !!window.__game.WS.get('vault', 'handDown'))));
  await d.shot('pin-burned');
}
// ---- the crypt
ok = ok && await route(['vh', 'vz']);
if (ok) { say('pre-boss state:', JSON.stringify(await d.wk())); await d.shot('warden-arena'); }

// ---- THE BONE WARDEN: chase/lunge machine — shield the lunge, poke the chase
if (ok) {
  await toForm('knight');
  const t0 = Date.now();
  let lastHp = null, deaths = 0, lastHearts = (await d.wk()).hearts;
  while ((Date.now() - t0) / 1000 < 50 * 60) {
    const s = await d.wk();
    const b = s.boss;
    if (!b) { say('warden gone — defeated?'); break; }
    if (s.hearts <= 0.5 && lastHearts > 0.5) { deaths++; say(`DEATH #${deaths}`); await d.page.waitForTimeout(5000);
      const back = await d.wk(); say('respawn:', JSON.stringify(back)); if (back.room !== 'vz') await goRoom('vz'); }
    lastHearts = s.hearts;
    if (s.hearts <= 1.5 && s.hearts > 0.5) await d.tap('h');
    const dist = Math.hypot(b.x - s.pos.x, b.z - s.pos.z);
    if (b.state === 'lunge') { await d.page.keyboard.down('i'); await d.page.waitForTimeout(700); await d.page.keyboard.up('i'); }
    else if (dist > 1.5) await d.walkTo(b.x, b.z, { timeout: 2.5, arrive: 1.3 });
    else { await d.tap('j'); await d.page.waitForTimeout(230); }
    if (b.hp !== lastHp) { say(`warden hp ${lastHp} -> ${b.hp}`); lastHp = b.hp; }
  }
  const flags = await d.page.evaluate(() => ({ warden: !!window.__wk.flags.wardenDefeated, forms: window.__wk.forms }));
  say('WARDEN FLAGS:', JSON.stringify(flags));
  ok = ok && flags.warden && flags.forms.includes('earth_wolf');
  await d.shot('post-warden');
}

const end = await d.wk();
say('END:', JSON.stringify(end));
d.saveLog('l2');
say('uncaught errors:', JSON.stringify(d.errors));
say(ok && d.errors.length === 0 ? 'LEVEL 2 COMPLETE, CLEAN' : 'LEVEL 2 INCOMPLETE OR ERRORS');
await d.close();
process.exit(ok && d.errors.length === 0 ? 0 : 1);
