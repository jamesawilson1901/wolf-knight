import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Static, relative-path build so the folder can be dropped anywhere on a host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
  plugins: [
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
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
