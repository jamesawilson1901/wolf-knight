// Wolf Knight service worker — cache-first so the game plays fully offline.
// Bump CACHE_NAME on every deploy that changes any cached file.
const CACHE_NAME = 'wolfknight-v0.6.0';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './js/main.js',
  './js/assets.js',
  './js/input.js',
  './js/world.js',
  './js/player.js',
  './js/rooms.js',
  './js/state.js',
  './js/effects.js',
  './js/ui.js',
  './js/enemies.js',
  './js/boss.js',
  './assets/chars/knight.glb',
  './assets/chars/wolf.gltf',
  './assets/anims/rig-medium-movement-basic.glb',
  './assets/anims/rig-medium-general.glb',
  './assets/anims/rig-medium-combat-melee.glb',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './vendor/addons/loaders/GLTFLoader.js',
  './vendor/addons/utils/BufferGeometryUtils.js',
  './vendor/addons/utils/SkeletonUtils.js',
  './assets/env/floor-tile.glb',
  './assets/env/rock-large-a.glb',
  './assets/env/rock-large-b.glb',
  './assets/env/rock-large-c.glb',
  './assets/env/rock-small-a.glb',
  './assets/env/rock-small-b.glb',
  './assets/env/cliff-block.glb',
  './assets/env/pillar.glb',
  './assets/env/campfire.glb',
  './assets/env/bridge-stone.glb',
  './assets/env/bush-large.glb',
  './assets/env/log-stack.glb',
  './assets/env/stump.glb',
  './assets/env/Textures/colormap.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' bypasses the browser HTTP cache (GitHub Pages serves
      // max-age=600), so a new CACHE_NAME never gets filled with stale files.
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match('./index.html');
          throw new Error('offline and not cached: ' + url.pathname);
        });
    })
  );
});
