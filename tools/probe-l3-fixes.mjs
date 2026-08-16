// FOCUSED RE-PROOF for the two L3 defect fixes (found by the run-3 route):
//   D1 — t1a's south door now returns to the CRYPT, both directions walked.
//   D2 — region-3 narration lives: wild_enter on entry, thornhound_intro in t1b.
// Plus the D3 settled read: what does tgl actually play mid-fight?
import { launch } from './wk-drive.mjs';

const TS = parseFloat(process.env.WK_TIMESCALE || '3');
const d = await launch({ evidenceDir: 'test-evidence/level-3/fix-proof', timescale: TS });
const say = (...a) => console.log(...a);
const fails = [];
const bad = (m) => { fails.push(m); say('  ** FAIL:', m); };

await d.newGame('FIXES');
// arriving in the woods as a real kid does: the Warden is down, the vine open
await d.page.evaluate(() => {
  const g = window.__game;
  g.state.flags.wardenDefeated = true;
  g.WS.set('stone', 'restored', true);
});
await d.jump('t1a', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf']);
await d.page.waitForTimeout(2500);

// D2a — Pip introduces the region now
{
  const spoken = await d.page.evaluate(() => !!window.__game.state.spoken.wild_enter);
  if (!spoken) bad('wild_enter still unspoken in t1a');
  else say('  wild_enter SPOKEN on entry');
}

// D1 — south door goes to the crypt, and the crypt sends you back
{
  const doors = (await d.wk('doors')).map((x) => x.to);
  say('  t1a doors:', doors.join(','));
  if (doors.includes('den')) bad('t1a still has a den door');
  if (!doors.includes('vz')) bad('t1a has no vz door');
  const s = (await d.wk('doors')).find((x) => x.to === 'vz');
  if (s) {
    await d.walkTo(s.x, s.z, { timeout: 40, arrive: 0.4 });
    if ((await d.wk('room')) !== 'vz') {
      const n = await d.walkTo(s.x, s.z + 0.8, { timeout: 8, arrive: 0.25 });
      void n;
    }
    await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
    const room = await d.wk('room');
    if (room !== 'vz') bad(`south door landed in ${room}, not vz`);
    else {
      say('  t1a -> vz walked (the vine, southbound)');
      const back = (await d.wk('doors')).find((x) => x.to === 't1a');
      if (!back) bad('vz has no t1a door with the warden beaten');
      else {
        await d.walkTo(back.x, back.z, { timeout: 40, arrive: 0.4 });
        if ((await d.wk('room')) !== 't1a') await d.walkTo(back.x, back.z - 0.8, { timeout: 8, arrive: 0.25 });
        await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
        if ((await d.wk('room')) !== 't1a') bad('vz -> t1a return leg failed');
        else say('  vz -> t1a walked back (round trip proven)');
      }
    }
  }
}

// D2b — the hound line in t1b
{
  if ((await d.wk('room')) === 't1a') {
    const n = (await d.wk('doors')).find((x) => x.to === 't1b');
    if (n) {
      await d.walkTo(3.2, 5, { timeout: 20 });
      await d.walkTo(3.2, -4, { timeout: 20 });
      await d.walkTo(n.x, n.z, { timeout: 40, arrive: 0.4 });
      await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
    }
  }
  if ((await d.wk('room')) === 't1b') {
    await d.walkTo(0, 2, { timeout: 20, arrive: 2.0 }).catch(() => {});   // near the hounds
    await d.page.waitForTimeout(3000);
    const spoken = await d.page.evaluate(() => !!window.__game.state.spoken.thornhound_intro);
    if (!spoken) bad('thornhound_intro still unspoken near t1b hounds');
    else say('  thornhound_intro SPOKEN near the first hounds');
  } else {
    bad('could not reach t1b for the hound line');
  }
}

// D3 — settled boss-arena music read
{
  await d.jump('tgl', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
  await d.page.waitForTimeout(9000);
  const music = await d.wk('music');
  say('  tgl settled music with Sylva live:', music);
}

// THE FREED GLADE — the duel's post-kill asserts, via the same code path a
// rebuild takes after a real kill (the 1x kill itself is in the fight log:
// 24 -> -0.7, zero deaths; the script idled on the corpse getter afterwards).
{
  await d.page.evaluate(() => { window.__game.state.flags.sylvaDefeated = true; });
  await d.jump('tc4', ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']);
  const g = (await d.wk('doors')).find((x) => x.to === 'tgl');
  if (g) {
    await d.walkTo(g.x, g.z, { timeout: 40, arrive: 0.4 });
    if ((await d.wk('room')) !== 'tgl') await d.walkTo(g.x, g.z - 0.8, { timeout: 8, arrive: 0.25 });
    await d.page.waitForFunction(() => !window.__wk.gates.transitioning, null, { timeout: 30000 }).catch(() => {});
  }
  if ((await d.wk('room')) === 'tgl') {
    const doors = await d.wk('doors');
    const f1 = doors.find((x) => x.to === 'f1');
    const boss = await d.wk('boss');
    say('  freed tgl doors:', doors.map((x) => x.to).join(','), '· boss:', boss && boss.name);
    if (!f1 || f1.open === false) bad('freed tgl has no open f1 door');
    if (boss) bad('freed tgl still spawns Sylva');
    if (f1 && !boss) say('  FREED GLADE: the way to Frostpeak is open, Sylva at rest');
    await d.shot('tgl-freed');
  } else bad('could not re-enter tgl for the freed asserts');
}

say('FAILS:', fails.length ? JSON.stringify(fails) : 'none');
say('errors:', JSON.stringify(d.errors));
await d.close();
process.exit(fails.length === 0 && d.errors.length === 0 ? 0 : 1);
