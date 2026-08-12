// A METHOD THAT DOES NOT EXIST IS A ROOM THAT CANNOT BE FINISHED.
//
// js/main.js called `juice.shake(0.5, 0.5)` on the rattle plate — Stoneroot's
// second hub milestone. `juice` has no shake and never has; the shake lives on
// `effects`. The line threw every time a child stomped on the plate, and it
// threw BEFORE the WS.complete under it, so the dam could not be brought down by
// playing the game. Stage 2 of the hub was unreachable, and the region dad could
// not finish was unfinishable.
//
// Nothing caught it. `node --check` parses this file happily — a missing method
// is not a syntax error. Every suite that needed `drained` set the flag itself.
// It is the sort of mistake that cannot survive being RUN, which is exactly what
// that line never was.
//
// So: find every singleton the game exports, list what it actually answers to,
// and check every call against it. Pure static reading — no browser, one second.
import { readFileSync, readdirSync } from 'fs';

const errors = [];
const files = readdirSync('js').filter((f) => f.endsWith('.js'));
const src = new Map(files.map((f) => [f, readFileSync('js/' + f, 'utf8')]));

// Two kinds of instance to check, and the second is the one that mattered.
//
//   * MODULE SINGLETONS — `export const juice = new Juice()`. Called by name
//     from anywhere, so every file is fair game.
//   * LOCAL INSTANCES — `const effects = new Effects(...)` inside main.js. The
//     first version of this file only looked for the exported kind and reported
//     ALL CLEAN over 275 calls, having never once looked at `effects`,
//     `narration`, `ui` or `input` — which is where the bug it was written for
//     actually lived. A checker that cannot see the thing it was built to catch
//     is worse than no checker, because it is believed.
const singles = new Map();     // name -> {cls, scope: file or null for global}
for (const [file, s] of src) {
  for (const m of s.matchAll(/export const (\w+)\s*=\s*new (\w+)\(/g)) {
    singles.set(m[1], { cls: m[2], file, scope: null });
  }
  // Both `const effects = new Effects()` and the deferred `let effects;` …
  // `effects = new Effects(scene)` that main.js actually uses — the second form
  // is how every one of main.js's own systems is built, so a pattern that only
  // matched the first found none of them.
  for (const m of s.matchAll(/^\s*(?:const|let|var)?\s*(\w+)\s*=\s*new ([A-Z]\w+)\(/gm)) {
    if (singles.has(m[1])) continue;
    singles.set(m[1] + '@' + file, { cls: m[2], file, scope: file, name: m[1] });
  }
}

// ...and what each class answers to: its own methods, plus anything assigned on
// to `this` in the constructor (a handler slot like `onHold` is callable too),
// plus getters.
const methodsOf = (cls) => {
  const out = new Set();
  for (const [, s] of src) {
    const at = s.indexOf(`class ${cls} `);
    if (at < 0) continue;
    // crude but sufficient: from the class head to the next top-level `}` line
    const body = s.slice(at, (() => {
      const end = s.indexOf('\n}', at);
      return end < 0 ? s.length : end;
    })());
    for (const m of body.matchAll(/^\s{2}(?:async\s+|get\s+|set\s+|static\s+)*([A-Za-z_$][\w$]*)\s*\(/gm)) out.add(m[1]);
    for (const m of body.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
    // a base class, if it extends one
    const ext = body.match(new RegExp(`class ${cls} extends (\\w+)`));
    if (ext) for (const n of methodsOf(ext[1])) out.add(n);
  }
  return out;
};

console.log('── every call on a game singleton reaches a real method ──');
let calls = 0;
const hooks = [];
const seen = new Set();
for (const [key, info] of singles) {
  const name = info.name || key;
  // Single-letter names shadow constantly — enemies.js's `m` is a material, not
  // the ShuffleCrate the pattern happened to match first. Two letters is not the
  // same thing: `ui` is a real system, and a first cut of this rule dropped it.
  if (name.length <= 1) continue;
  if (seen.has(name + (info.scope || ''))) continue;
  seen.add(name + (info.scope || ''));
  const known = methodsOf(info.cls);
  if (!known.size) { console.log(`· ${name} (${info.cls}) — no class body found, skipped`); continue; }
  // Properties bolted on to the instance at runtime are real too: rooms.js does
  // `world.checkRoot = () => {…}` and calls it back through the same name.
  const assigned = new Set();
  for (const [, s2] of src) {
    for (const a of s2.matchAll(new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*)\\s*=[^=]`, 'g'))) assigned.add(a[1]);
  }
  const bad = [];
  for (const [file, s] of src) {
    if (info.scope && file !== info.scope) continue;   // a local instance is local
    for (const m of s.matchAll(new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))) {
      calls++;
      if (known.has(m[1]) || assigned.has(m[1])) continue;
      const line = s.slice(0, m.index).split('\n').length;
      const text = s.split('\n')[line - 1];
      // `if (world.onSolved) world.onSolved()` is a HOOK, not a mistake: the
      // caller has already asked whether anyone implements it. Those are worth
      // knowing about — a hook nobody implements is a puzzle with no
      // consequence — but they cannot throw, so they are not failures.
      if (new RegExp(`if\\s*\\(\\s*[\\w.]*\\b${m[1]}\\b`).test(text)
          || new RegExp(`[\\w.]*\\b${m[1]}\\b\\s*&&`).test(text)) {
        hooks.push(`${file}:${line} ${name}.${m[1]}() — guarded, and nothing implements it`);
        continue;
      }
      bad.push(`${file}:${line} ${name}.${m[1]}()`);
    }
  }
  const ok = bad.length === 0;
  console.log((ok ? '✓ ' : '✗ ') + `${name} (${info.cls}) — ${known.size} methods`,
    ok ? '' : JSON.stringify(bad));
  if (!ok) errors.push(...bad);
}
if (hooks.length) {
  console.log('\n── hooks that are called but never implemented ───────');
  for (const h of hooks) console.log('· ' + h);
}
console.log(`\nchecked ${calls} calls across ${seen.size} instances`);
console.log(errors.length ? `${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : 'ALL CLEAN — every call reaches something that exists.');
process.exit(errors.length ? 1 : 0);
