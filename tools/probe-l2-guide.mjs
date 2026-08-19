// LEVEL 2 LOOP FIX — verify a LOST child is rescued, the thing run-l2's
// hardcoded "slam the pin at (1.2,-3)" knowledge always bypassed. Three claims:
//   1. In each spoke's last room, with its milestone UNDONE, Pip's guide points
//      to the ACTION object (lantern / plate / pin), not the loop-back door.
//   2. Walking up to the unburned pin makes Pip name the FIRE verb (pin_hint).
//   3. Once the pin is burned for real, the guide falls through to the hub door.
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/level-2/guide', timescale: 1 });
const say = (...a) => console.log(...a);
let ok = true;
const near = (t, x, z, r = 1.2) => t && Math.hypot(t.x - x, t.z - z) <= r;

await d.newGame('L2GUIDE');

async function toForm(want) {
  for (let i = 0; i < 10; i++) {
    if ((await d.wk('form')) === want) return true;
    await d.tap('Tab');
    await d.page.waitForTimeout(500);
  }
  return (await d.wk('form')) === want;
}

const guideAt = async (room) => {
  await d.jump(room, ['knight', 'dark_wolf', 'fire_wolf']);
  await d.page.waitForFunction(() => !window.__game.narration.speaking, null, { timeout: 20000 }).catch(() => {});
  return d.page.evaluate(() => {
    const g = window.__game;
    const t = g.guideTarget();
    const m = g.world.markers;
    return { t, hasRelight: !!m.relightSpot, hasPlate: !!m.rattlePlate, hasPin: !!m.pinSpot,
      ws: { vault: g.WS.stage('vault') },
      doors: (g.world.doors || []).map((x) => ({ to: x.to, x: +((x.minX + x.maxX) / 2).toFixed(1), z: +((x.minZ + x.maxZ) / 2).toFixed(1) })) };
  });
};

// --- Spoke A: the cold lantern (spark undone) ------------------------------
{
  const g = await guideAt('va3');
  say('va3 guide →', JSON.stringify(g.t), 'stage', g.ws.vault);
  const good = g.hasRelight && near(g.t, 0, -1.1, 1.6);
  say(good ? '  PASS: guide points at the lantern' : '  FAIL: guide NOT at lantern');
  ok = ok && good;
}

// --- Spoke B: the rattle plate (drained undone) ----------------------------
{
  const g = await guideAt('vb3');
  say('vb3 guide →', JSON.stringify(g.t), 'stage', g.ws.vault);
  const good = g.hasPlate && near(g.t, 0, 0, 1.2);
  say(good ? '  PASS: guide points at the rattle plate' : '  FAIL: guide NOT at plate');
  ok = ok && good;
}

// --- Spoke C: the shoulder pin (handDown undone) — THE REPORTED LOOP -------
{
  const g = await guideAt('vc3');
  say('vc3 guide →', JSON.stringify(g.t), 'stage', g.ws.vault);
  const doorTos = g.doors.map((x) => x.to);
  const atPin = g.hasPin && near(g.t, 0, -3, 1.2);
  const notDoor = !g.doors.some((x) => near(g.t, x.x, x.z, 1.5));
  say('  doors here:', JSON.stringify(doorTos));
  say(atPin && notDoor ? '  PASS: guide points at the pin, NOT a loop-back door'
    : `  FAIL: atPin=${atPin} notDoor=${notDoor}`);
  ok = ok && atPin && notDoor;
}

// --- Claim 2: nearing the unburned pin speaks the fire hint ----------------
{
  // clear any prior record, then walk to the pin the way a child wanders up
  await d.page.evaluate(() => { delete window.__game.state.spoken.pin_hint; });
  await d.walkTo(0, -1.4, { timeout: 20, arrive: 0.6 }).catch(() => {});
  // give the per-frame trigger a couple of ticks
  await d.page.waitForTimeout(1200);
  const said = await d.page.evaluate(() => !!window.__game.state.spoken.pin_hint);
  say(said ? '  PASS: pin_hint spoke on approach' : '  FAIL: pin_hint never fired near the pin');
  ok = ok && said;
  await d.shot('vc3-at-pin');
}

// --- Claim 3: burn the pin FOR REAL, then guide falls through to the door ---
{
  // fire wolf slam on the pin (real K taps), like run-l2's slamAt
  await toForm('fire_wolf');
  await d.walkTo(1.3, -3, { timeout: 30, arrive: 0.8 }).catch(() => {});
  let burned = false;
  for (let i = 0; i < 8 && !burned; i++) {
    await d.tap('k');
    await d.page.waitForTimeout(1300);
    burned = await d.page.evaluate(() => !!window.__wk.flags.burned.l2_vc3_pin);
  }
  say(burned ? '  pin BURNED by fire slam' : '  FAIL: could not burn the pin');
  ok = ok && burned;
  if (burned) {
    const g = await d.page.evaluate(() => {
      const gg = window.__game;
      return { t: gg.guideTarget(), handDown: gg.WS.get('vault', 'handDown'),
        doors: (gg.world.doors || []).map((x) => ({ to: x.to, x: +((x.minX + x.maxX) / 2).toFixed(1), z: +((x.minZ + x.maxZ) / 2).toFixed(1) })) };
    });
    const toHub = g.doors.some((x) => x.to === 'vh' && near(g.t, x.x, x.z, 2.0));
    say('  after burn: handDown=', g.handDown, 'guide →', JSON.stringify(g.t));
    say(toHub ? '  PASS: guide now leads back to the hub (vh)' : '  FAIL: guide not at the vh door');
    ok = ok && !!g.handDown && toHub;
  }
}

say('errors:', JSON.stringify(d.errors));
say(ok && d.errors.length === 0 ? 'L2 GUIDE FIX: PASS' : 'L2 GUIDE FIX: FAIL');
d.saveLog('l2-guide');
await d.close();
process.exit(ok && d.errors.length === 0 ? 0 : 1);
