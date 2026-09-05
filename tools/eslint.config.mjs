// TWO RULES. NOT A STYLE GUIDE.
//
// This is deliberately the smallest useful lint in the world, and it stays
// that way. The shipped game is a static PWA with no bundler and no build step
// (CLAUDE.md), and nothing here changes that: eslint lives in
// tools/package.json beside playwright, runs on demand, and never touches a
// file the browser loads. The config lives in tools/ rather than the repo root
// for one boring reason — it imports `globals`, and node resolves that from
// the config file's own directory, which is where node_modules is.
//
//   sh tools/lint.sh          from anywhere in the repo
//   npm --prefix tools run lint
//
// WHY IT EXISTS. The bugs it catches are ones this project has paid for in
// whole sessions rather than minutes:
//
//   * `juice.shake()` — a method that did not exist. It made Stoneroot's dam
//     unreachable, and verify-callable.mjs was written afterwards to catch
//     that shape at runtime.
//   * `resolveCircle(p, R)` against a signature of `(x, z, r)` — a probe on
//     2026-09-05 that reported every point in a room as clear, because the
//     object argument made the arithmetic NaN and nothing threw.
//   * A stale name left behind by a rename, which reads fine and throws only
//     on the one branch a child eventually walks into.
//
// `no-undef` and `no-unused-vars` are the two rules that see that family
// statically, in about a second, with no browser. Everything else — quotes,
// semicolons, arrow spacing — is noise this codebase does not need and would
// spend a week silencing. That is why the recommended set is NOT spread in
// here: a green run means exactly these two things and nothing else. If a
// third rule is ever added it should be because a real bug got through that
// it would have caught, and the comment should say which bug.
//
// verify-callable.mjs still earns its keep: it resolves method calls ACROSS
// module boundaries at runtime, which no static pass here attempts.
import globals from 'globals';

// no-undef is an ERROR: it is the rule that sees the bug class above, and the
// shipped game is clean of it today (measured 2026-09-05, 0 findings across
// js/ and sw.js), so making it blocking costs nothing and catches the next one.
//
// no-unused-vars is a WARNING, and that is a deliberate, temporary compromise.
// It reports 68 real findings on the day it was switched on — dead imports and
// bindings left behind by refactors, none of them behavioural. Landing a gate
// that is RED on arrival is precisely how the nightly sweep became something
// everyone ignored (docs/TESTING.md §7b, and the 38 consecutive cancelled runs
// this file was written to end). So it prints, loudly, on every run, and it
// does not block. Board item: burn the 68 down in one mechanical commit, then
// change this line to 'error'. Do not let it sit here as scenery.
const TWO_RULES = {
  'no-undef': 'error',
  // Unused args are how a changed signature announces itself, and unused
  // caught errors are deliberate in a dozen places here
  // (`catch { /* reported below */ }`), so neither is reported.
  'no-unused-vars': ['warn', {
    args: 'none',
    caughtErrors: 'none',
    varsIgnorePattern: '^_',
  }],
};

export default [
  {
    // vendor/ is three.js, shipped as-is and never edited here. The rest is
    // not the game.
    ignores: [
      'vendor/**',
      '**/node_modules/**',
      '.claude/**',
      'scratchpad/**',
      'tools/eslint.config.mjs',
    ],
  },

  // The game: browser modules that index.html loads.
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Set by index.html's inline bootstrap and by the ?dev=1 harness, and
        // read across modules. Real globals, declared so that no-undef can
        // stay an error everywhere else.
        __game: 'writable',
        __errors: 'writable',
        __noSolid: 'writable',
      },
    },
    rules: TWO_RULES,
  },

  // The tooling: node ESM that also evaluates browser code inside
  // page.evaluate(), so it legitimately names both sets of globals.
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: TWO_RULES,
  },

  // The service worker has its own.
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: TWO_RULES,
  },
];
