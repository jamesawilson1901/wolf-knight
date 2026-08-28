// THE ONE PLACE EVERY SUITE LAUNCHES CHROMIUM.
//
// Flags scattered per-suite are how one file silently drifts (this is job 1
// of the test-infra hardening pass, docs/TESTING.md addendum §9). Every
// verify-*.mjs suite imports launchBrowser() from here instead of calling
// chromium.launch() with its own copy of the args.
//
//   --disable-dev-shm-usage     Chromium puts shared memory in /dev/shm,
//                               which is tiny (typically 64MB) in containers;
//                               when it fills, a renderer process is OOM-
//                               killed — the §5 symptom of headless Chromium
//                               dying mid-run at a DIFFERENT point every
//                               retry. This flag routes shared memory to
//                               /tmp, which has the machine's real memory
//                               behind it.
//   --enable-unsafe-swiftshader Chromium is removing automatic software-WebGL
//                               fallback; headless/no-GPU use is opt-in only.
//                               Without this flag, a future Playwright/
//                               Chromium bump fails every suite with context-
//                               creation errors that cosplay as N simultaneous
//                               game bugs. Harmless on versions that don't
//                               need it yet.
import { chromium } from 'playwright';
import { existsSync } from 'fs';

// This sandbox pre-installs Chromium at a fixed path outside Playwright's own
// cache. CI (and any other environment) instead runs `npx playwright install
// chromium`, which puts the browser wherever Playwright's own cache lives —
// so EXECUTABLE_PATH is used only when it actually exists; everywhere else
// `executablePath` is simply omitted and Playwright resolves its own
// install. An env var lets a real deployment pin something else entirely.
const SANDBOX_PATH = '/opt/pw-browsers/chromium';
export const EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  (existsSync(SANDBOX_PATH) ? SANDBOX_PATH : undefined);

export const LAUNCH_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-dev-shm-usage',
];

// `opts` merges over the defaults — a suite that needs one extra flag (or a
// different executablePath for local experimentation) is not blocked from
// using the shared launcher; it just passes what differs.
export async function launchBrowser(opts = {}) {
  const { args, ...rest } = opts;
  return chromium.launch({
    ...(EXECUTABLE_PATH ? { executablePath: EXECUTABLE_PATH } : {}),
    headless: true,
    ...rest,
    args: args ? [...LAUNCH_ARGS, ...args] : LAUNCH_ARGS,
  });
}

// THE RENDERER ASSERTION (job 1 / addendum §9). Call this right after the
// first page is created. verify-boot calls it and PRINTS the renderer string
// on every run, and every suite gets the benefit: if WebGL context creation
// ever fails (a Chromium/Playwright bump, a sandbox that lost software
// rendering), this throws ONE loud, named error instead of the first suite
// quietly reporting a wall of unrelated-looking gameplay failures.
export async function assertWebGL(page) {
  const renderer = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return null;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch {
      return null;
    }
  });
  if (!renderer) {
    throw new Error(
      'WebGL context could not be created. This usually means the software ' +
      'renderer is unavailable: check --enable-unsafe-swiftshader is passed ' +
      '(tools/launch.mjs), that Chromium is actually installed (`npx ' +
      'playwright install chromium` — or that EXECUTABLE_PATH in ' +
      'tools/launch.mjs points at a real binary), and that this environment ' +
      'is not GPU-only with software rendering blocked.'
    );
  }
  return renderer;
}
