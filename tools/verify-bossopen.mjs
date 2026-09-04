// EVERY BOSS MUST HAVE A WAY IN.
//
// Bosses are immune now except inside a window their own verb opens (js/boss.js
// `open.by`). That is what dad asked for — "you can only hurt it when it's
// down" — and it carries a failure mode far worse than the one it fixes: if a
// verb is wired wrong, that boss cannot be hurt AT ALL, and a child grinds
// against it forever with no way to know why.
//
// The Shadowgrip is proven by play (probe-masher loses, probe-blocker wins).
// Doing that for all seven costs half an hour a fight and would not have been
// run before shipping, which is how an unbeatable boss reaches a five-year-old.
// So this proves the WIRING for every skin in seconds: perform each boss's own
// verb through the same call the game makes, and insist the window opens and
// damage then lands. Play-testing stays the standard for whether a fight is
// GOOD; this is the standard for whether it is possible.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'OPEN');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });

// Every boss room, and the forms a child would hold arriving there.
const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
const ROOMS = ['le', 'tgl', 'scr', 'ddp', 'xth'];

console.log('\n── every boss can be opened, and then hurt ────────────');
for (const room of ROOMS) {
  let r = null;
  for (let a = 0; a < 6 && !r; a++) {
    try {
      await page.evaluate(({ rm, f }) => {
        const g = window.__game;
        g.player.iframes = 0;                 // never let a previous check pin the jump
        window.__wkJump(rm, f);
      }, { rm: room, f: ALL });
      // WAIT FOR THE ROOM IT ASKED FOR, not merely for a boss to exist. The
      // first cut waited for `world.boss` and got the previous room's boss,
      // still standing, still wounded from the last check.
      await page.waitForFunction((rm) => window.__game.world
        && window.__game.world.roomId === window.__game.resolveRoom(rm)
        && window.__game.world.boss, room, { timeout: 40000 });
      // and a window left open by the previous boss is not this one's armour
      await page.evaluate(() => { const b = window.__game.world.boss;
        b.openT = 0; b.action = 'prowl'; });
      r = await page.evaluate(() => {
        const g = window.__game, boss = g.world.boss;
        const by = (boss.skin.open && boss.skin.open.by) || null;
        const before = boss.coreHp;

        // 1. ARMOURED FIRST. A plain steel blow while it is up must do nothing,
        //    or the window is not the only way in and the fight is back to mash.
        boss._hitCore(1, 'steel');
        const afterPing = boss.coreHp;

        // 2. ITS OWN VERB, through the same call the game makes.
        let opened = null;
        if (by === 'block') {
          // the strike path: a boss hitting a child who has the shield up
          const p = g.player;
          const wasDef = p.defending;
          p.defending = true;
          if (!p.form.def) p.form.def = {};
          const hadShield = p.form.def.shield; p.form.def.shield = true;
          // MEASURING THE TOPPLE, NOT THE DAMAGE — but iframes must go back.
          // __wkJump moves rooms by killing the player and letting the respawn
          // path load the next one, so a probe that leaves iframes at 999
          // silently pins every later jump: the first run of this suite tested
          // the Shadowgrip five times and reported it as five different bosses.
          p.iframes = 999;
          boss._strike(p, 0);
          p.iframes = 0;
          p.defending = wasDef; p.form.def.shield = hadShield;
          opened = boss.openT > 0;
        } else if (by === 'stomp') {
          boss.takeStun(1);
          opened = boss.openT > 0;
        } else if (by === 'element') {
          boss._hitCore(0.0001, boss.skin.weakness);
          opened = boss.openT > 0;
        } else if (by === 'switch') {
          // two blows of DIFFERENT elements — her lesson, performed
          boss._hitCore(0.0001, 'fire');
          boss._hitCore(0.0001, 'frost');
          opened = boss.openT > 0;
        } else if (by === 'cut') {
          boss.action = 'root';
          boss._hitCore(0.0001, 'steel');
          opened = boss.openT > 0;
        }

        // 3. AND NOW IT BLEEDS. An opening that does not let damage through is
        //    the same dead end wearing a gold ring.
        const midHp = boss.coreHp;
        boss._hitCore(1, 'steel');
        const afterOpen = boss.coreHp;

        return { name: boss.skin.name, by, hp: before,
          pingedForNothing: afterPing === before,
          opened: !!opened, openT: +(boss.openT || 0).toFixed(2),
          hurtInWindow: afterOpen < midHp };
      });
    } catch (e) { r = null; }
  }
  if (!r) { check(`${room}: the boss builds`, false); continue; }
  check(`${r.name}: armoured — a plain blow does nothing`, r.pingedForNothing, r);
  check(`${r.name}: its own verb (${r.by}) opens the window`, r.opened, r);
  check(`${r.name}: ...and damage lands inside it`, r.hurtInWindow, r);
}

check('nothing threw during the run',
  errors.filter((e) => e.startsWith('PAGEERROR')).length === 0);
await b.close();
console.log(errors.length
  ? `\n✗ FAIL — ${errors.length} problem(s). A boss with no way in is unbeatable.`
  : '\n✓ PASS — every boss is immune until its own verb, then it bleeds');
process.exit(errors.length ? 1 : 0);
