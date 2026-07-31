// Wolf Knight service worker — cache-first so the game plays fully offline.
// Bump CACHE_NAME on every deploy that changes any cached file.
const CACHE_NAME = 'wolfknight-v3.4.0';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './js/main.js',
  './js/config.js',
  './js/juice.js',
  './js/regions.js',
  './js/gates.js',
  './js/worldstate.js',
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
  './js/pip.js',
  './js/audio.js',
  './js/narration.js',
  './js/save.js',
  './js/title.js',
  './js/loot.js',
  './js/items.js',
  './js/progress.js',
  './js/powerups.js',
  './js/menus.js',
  './assets/chars/fox.gltf',
  './assets/chars/sword_1handed.gltf',
  './assets/chars/sword_1handed.bin',
  './assets/chars/shield_badge.gltf',
  './assets/chars/shield_badge.bin',
  './assets/chars/knight_texture.png',
  './assets/chars/mage.glb',
  './assets/loot/platformer/coin.glb',
  './assets/loot/platformer/heart-piece.glb',
  './assets/loot/platformer/key.glb',
  './assets/loot/platformer/jewel.glb',
  './assets/loot/platformer/Textures/colormap.png',
  './assets/loot/survival/chest-wood.glb',
  './assets/loot/survival/crate.glb',
  './assets/loot/survival/barrel.glb',
  './assets/loot/survival/Textures/colormap.png',
  './assets/loot/pirate/chest-gold.glb',
  './assets/loot/pirate/Textures/colormap.png',
  './assets/gear/dagger_A.gltf', './assets/gear/dagger_A.bin',
  './assets/gear/sword_B.gltf', './assets/gear/sword_B.bin',
  './assets/gear/sword_C.gltf', './assets/gear/sword_C.bin',
  './assets/gear/sword_D.gltf', './assets/gear/sword_D.bin',
  './assets/gear/sword_E.gltf', './assets/gear/sword_E.bin',
  './assets/gear/hammer_A.gltf', './assets/gear/hammer_A.bin',
  './assets/gear/axe_B.gltf', './assets/gear/axe_B.bin',
  './assets/gear/spear_A.gltf', './assets/gear/spear_A.bin',
  './assets/gear/shield_A.gltf', './assets/gear/shield_A.bin',
  './assets/gear/shield_B.gltf', './assets/gear/shield_B.bin',
  './assets/gear/shield_C.gltf', './assets/gear/shield_C.bin',
  './assets/gear/staff_A.gltf', './assets/gear/staff_A.bin',
  './assets/gear/weapons_bits_texture.png',
  './assets/env/den-survival/tent.glb',
  './assets/env/den-survival/Textures/colormap.png',
  './assets/env/den-town/cart.glb',
  './assets/env/den-town/Textures/colormap.png',
  './assets/env/tree-a.glb',
  './assets/env/tree-b.glb',
  './assets/env/flower-a.glb',
  './assets/env/flower-b.glb',
  './assets/audio/music/region-ember.ogg',
  './assets/audio/music/causeway.mp3',
  './assets/audio/music/den.ogg',
  './assets/audio/music/boss-intro.ogg',
  './assets/audio/music/boss-loop.ogg',
  './assets/audio/music/victory.ogg',
  './assets/audio/music/region-stone.ogg',
  './assets/audio/music/stone-deep.ogg',
  './assets/audio/music/kiln.mp3',
  './assets/audio/music/ember-calm.ogg',
  './assets/audio/sfx/bones.ogg',
  './assets/audio/sfx/bite.ogg',
  './assets/audio/sfx/sword-swing.ogg',
  './assets/audio/sfx/sword-swing2.ogg',
  './assets/audio/sfx/hit.ogg',
  './assets/audio/sfx/puff.ogg',
  './assets/audio/sfx/hurt.ogg',
  './assets/audio/sfx/form-switch.ogg',
  './assets/audio/sfx/geyser.ogg',
  './assets/audio/sfx/pup-chime.ogg',
  './assets/audio/sfx/checkpoint.ogg',
  './assets/audio/sfx/ui-click.ogg',
  './assets/audio/sfx/slam.ogg',
  './assets/audio/sfx/burn.ogg',
  './assets/audio/sfx/tendril-slam.ogg',
  './assets/audio/sfx/moon-impact.ogg',
  './assets/audio/sfx/throw.ogg',
  './assets/audio/sfx/parry.ogg',
  './assets/audio/sfx/potion.ogg',
  './assets/env/dungeon/Arch.glb',
  './assets/env/dungeon/Arch_Door.glb',
  './assets/env/dungeon/Arch_bars.glb',
  './assets/env/dungeon/Banner_wall.glb',
  './assets/env/dungeon/Barrel.glb',
  './assets/env/dungeon/Brick.glb',
  './assets/env/dungeon/Cobweb.glb',
  './assets/env/dungeon/Coin_Pile.glb',
  './assets/env/dungeon/Column.glb',
  './assets/env/dungeon/Column2.glb',
  './assets/env/dungeon/Crate.glb',
  './assets/env/dungeon/Decorative_Wall.glb',
  './assets/env/dungeon/Floor_Modular.glb',
  './assets/env/dungeon/Pedestal.glb',
  './assets/env/dungeon/Skull.glb',
  './assets/env/dungeon/Spikes.glb',
  './assets/env/dungeon/Stairs_Modular.glb',
  './assets/env/dungeon/Statue_Horse.glb',
  './assets/env/dungeon/Torch.glb',
  './assets/env/dungeon/Trap_empty.glb',
  './assets/env/dungeon/Trap_spikes.glb',
  './assets/env/dungeon/Vase.glb',
  './assets/env/dungeon/WallCover_Modular.glb',
  './assets/env/dungeon/Wall_Modular.glb',
  './assets/env/dungeon/Woodfire.glb',
  './assets/chars/knight.glb',
  './assets/chars/wolf.gltf',
  './assets/anims/rig-medium-movement-basic.glb',
  './assets/anims/rig-medium-general.glb',
  './assets/anims/rig-medium-combat-melee.glb',
  './assets/anims/rig-medium-special.glb',
  './assets/chars/skeletons/Skeleton_Minion.glb',
  './assets/chars/skeletons/Skeleton_Rogue.glb',
  './assets/chars/skeletons/Skeleton_Warrior.glb',
  './assets/chars/skeletons/Skeleton_Blade.gltf',
  './assets/chars/skeletons/Skeleton_Blade.bin',
  './assets/chars/skeletons/Skeleton_Axe.gltf',
  './assets/chars/skeletons/Skeleton_Axe.bin',
  './assets/chars/skeletons/Skeleton_Shield_Large_A.gltf',
  './assets/chars/skeletons/Skeleton_Shield_Large_A.bin',
  './assets/chars/skeletons/skeleton_texture.png',
  './assets/chars/monsters/Slime.glb',
  './assets/chars/monsters/Bat.glb',
  './assets/chars/monsters/Dragon.glb',
  './assets/env/mushroom-group.glb',
  './assets/env/mushroom-tall.glb',
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
  './assets/env/path-tile.glb',
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
