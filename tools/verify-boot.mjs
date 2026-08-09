// DOES THE GAME START?
//
// `node --check js/player.js` exits 0 on a file with a broken if/else chain,
// because a .js file parses as CommonJS, hits the `import` on line 5 and never
// reads the body. It has now given a false pass twice in one session — once on
// a syntax error that stopped the game booting at all, and once on a
// ReferenceError that would have fired the first time a child breathed fire.
//
// This is the cheap check that actually catches those: load the page, wait for
// the title screen, and report any page error. Run it before anything longer.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

// --- STATIC CHECK: nothing after `return finish()` -------------------------
//
// A room builder that returns before its dressing still BUILDS. It boots, its
// topology is intact, its promise gates work, its enemies spawn — every
// behavioural verifier stays green and the room is simply empty. That is
// exactly what happened to the Great Vault: a marker-reordering script tripped
// over a trailing comment, swallowed `return finish(world, spec, D);` into the
// block it was moving, and left nineteen lines of dressing unreachable. It cost
// 103 draw calls of content, and only the density check noticed.
//
// The function body is found by BRACE MATCHING. The first version of this check
// sliced from one `export async function` to the next, which reads straight
// past a builder followed by a non-async export — it reported buildVz and
// buildTsB as broken when both were fine, and I nearly "fixed" two healthy
// functions on its word.
{
  const dead = [];
  for (const path of ['js/level1.js', 'js/level2.js', 'js/level3.js']) {
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(/export async function (build\w+)\(/g)) {
      let i = src.indexOf('{', m.index + m[0].length);
      let depth = 0, end = -1;
      for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) { end = j; break; }
      }
      if (end < 0) { dead.push(`${path} ${m[1]}: unbalanced braces`); continue; }
      const body = src.slice(m.index, end + 1);
      const r = body.match(/\n  return finish\(/);
      if (!r) continue;
      const after = body.slice(r.index + r[0].length).split('\n').slice(1);
      const live = after.filter((l) => l.trim() && !l.trim().startsWith('//') && l.trim() !== '}');
      if (live.length) dead.push(`${path} ${m[1]}: ${live.length} unreachable line(s)`);
    }
  }
  if (dead.length) {
    console.log('✗ UNREACHABLE CODE AFTER return finish():\n  ' + dead.join('\n  '));
    process.exit(1);
  }
  console.log('✓ no room builder returns before it finishes dressing');
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
let titled = false;
try {
  await page.waitForSelector('#title', { state: 'visible', timeout: 25000 });
  titled = true;
} catch { /* reported below */ }
// ...and it must survive actually starting a game, not just showing a menu
let playing = false;
if (titled) {
  try {
    await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
    await page.fill('#t-name', 'BOOT');
    await page.locator('#t-start').dispatchEvent('pointerdown');
    await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
    playing = true;
  } catch { /* reported below */ }
}
console.log(titled ? '✓ the title screen appears' : '✗ the title screen never appeared');
console.log(playing ? '✓ a new game starts and the world builds' : '✗ a new game did not start');
if (errs.length) console.log('\n' + errs.length + ' page error(s):\n' + errs.join('\n'));
const ok = titled && playing && !errs.length;
console.log('\n' + (ok ? '✓ the game boots clean' : '✗ THE GAME IS BROKEN'));
await b.close();
process.exit(ok ? 0 : 1);
