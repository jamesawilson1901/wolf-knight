import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function buildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID; // used by the update test
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}
const BUILD_ID = buildId();

// Static, relative-path build so the folder can be dropped anywhere on a host.
export default defineConfig({
  base: './',
  define: {
    // music is optional; the audio build only emits music.wav when a source
    // loop has been supplied
    __MUSIC_PRESENT__: JSON.stringify(
      existsSync(fileURLToPath(new URL('./public/assets/audio/music.wav', import.meta.url))),
    ),
    // stamped so "which build am I actually running?" has an answer
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
  plugins: [
    {
      // A tiny, never-cached stamp of the deployed build. The app compares it
      // against its own baked-in id to decide whether it is stale. This is
      // the reliable update path: service-worker update() alone proved
      // unreliable, and a child's installed app must not sit on an old build.
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ build: BUILD_ID }),
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate', // silent updates — no prompts, no dialogue
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png', 'rotate.svg'],
      manifest: {
        name: 'Mermaid Reef',
        short_name: 'Mermaid',
        description: 'Gentle underwater side-scroller',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#07253d',
        theme_color: '#07253d',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the entire game — she may never have network on first play.
        globPatterns: ['**/*.{js,css,html,png,webp,json,wav,svg,ico}'],
        // version.json must always come from the network, never the cache —
        // it is how the app finds out it is out of date.
        globIgnores: ['**/version.json'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
