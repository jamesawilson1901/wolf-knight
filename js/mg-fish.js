// FISHING — the third game on the shared harness (js/minigame.js), from
// design/WIDER-WORLD.md §3.4: "tap to cast, a gold ring closes on the float,
// tap in the window to hook — and the window IS PARRY_WINDOW, so fishing
// teaches the parry the way Fetch teaches the catch."
//
// UNLIKE FETCH, CASTING IS ITS OWN TAP. Fetch has one verb (catch); this game
// has two (cast, then hook), because §3.4 names "tap to cast" as the game's
// own first beat, not an automatic loop like Fetch's throw. A child who mashes
// still wins — casting on a stray tap costs nothing, and the hook window is
// exactly as forgiving as Fetch's catch window — but the rhythm reads as
// fishing's own stop-and-wait, not a copy of the stick game in a lake.
//
// THE CATCH IS THE REWARD, SHOWN, NOT NAMED. §2's "no reading required" rule
// (already Quiz's own reasoning for real wolf portraits over text) means a
// species is never spelled out — the vendored model itself rises out of the
// water at the moment of the hook, which is the whole answer to "what did I
// catch" a five-year-old needs.
import * as THREE from 'three';
import { audio } from './audio.js';
import { loadGLB, prepareModel } from './assets.js';
import { PARRY_WINDOW } from './player.js';

const HOOK_WINDOW = PARRY_WINDOW;
const PERFECT = 0.09;   // same sub-window Fetch's own catch uses

// design/WIDER-WORLD.md §3.4 / assets/LICENSES/MANIFEST.json's own "Fish Pack
// (Animated)" entry: seven species, already vendored, already the fishing
// minigame's one blocking asset — converted with no rig ("a catch, not a
// creature"), which is exactly right for a model that only ever needs to rise
// out of the water once and hang there.
const SPECIES = ['fish1', 'fish2', 'fish3', 'dolphin', 'manta-ray', 'shark', 'whale'];

let modelCache = null;
export async function preloadFish() {
  if (modelCache) return modelCache;
  const entries = await Promise.all(SPECIES.map(async (id) => {
    const gltf = await loadGLB(`./assets/chars/fish/${id}.glb`);
    return [id, gltf];
  }));
  modelCache = Object.fromEntries(entries);
  modelCache.rod = await loadGLB('./assets/env/fishing-rod.glb');
  return modelCache;
}

export const FISH = {
  id: 'fish',
  icon: '🎣',
  seconds: 40,          // §3.4 — a slower, calmer clock than Fetch's 32s
  rewards: SPECIES,
  make(ctx) { return new Fishing(ctx); },
};

class Fishing {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.state = 'ready';   // ready | out | bite | catchable | caught | missed
    this.t = 0;
    this.castN = 0;
  }

  init({ world, area }) {
    this.world = world;
    this.area = area;
    this.rodTip = { x: area.x, z: area.z - 0.5 };

    // THE FLOAT — a small bright cork, easy to track against dark water.
    const float = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xe6483a, roughness: 0.6 })
    );
    float.position.set(this.rodTip.x, 0.3, this.rodTip.z);
    this.float = float;
    this.group.add(float);

    // THE LINE — a thin static cylinder stretched between rod tip and float
    // each frame, exactly the way Fetch reasons about the stick: one
    // continuous thread a child's eye can follow from hand to water.
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1, 5),
      new THREE.MeshBasicMaterial({ color: 0xdfe9f2 })
    );
    this.line = line;
    this.group.add(line);

    // THE RING — blue while settled (an idle float bobbing, nothing to do
    // yet), gold while a bite closes in, the same "act here" colour law
    // Fetch and every Den game already use.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.5, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    this.ring = ring;
    this.group.add(ring);

    // THE CATCH — populated the instant a hook lands; nothing to show until
    // then, so it starts empty rather than as a hidden placeholder mesh that
    // would otherwise cost a frame's worth of "did it load" bookkeeping.
    this.prize = null;

    // THE ROD — planted at the water's edge, leaning out over the line. Only
    // ever a cache hit (installFishHost, below, preloads the whole kit the
    // moment its room builds), but a game must not assume its own caller got
    // there first, so a slow first frame without it is a silent no-op, not a wait.
    if (modelCache && modelCache.rod) {
      const rod = prepareModel(modelCache.rod.scene.clone());
      const box = new THREE.Box3().setFromObject(rod);
      const h = Math.max(0.05, box.max.y - box.min.y);
      rod.scale.setScalar(1.3 / h);
      rod.position.set(this.rodTip.x + 0.3, 0, this.rodTip.z + 0.3);
      rod.rotation.set(0, 0.4, -0.55);
      this.group.add(rod);
    }

    world.add(this.group);
    world.keepLoose(this.group);
    this._updateLine();

    // Belt and braces: installFishHost() already called this when the room
    // built, so this is a cache hit — but a game must not assume its own
    // caller got there first.
    preloadFish();
  }

  _updateLine() {
    const ax = this.rodTip.x, ay = 0.9, az = this.rodTip.z;
    const b = this.float.position;
    this.line.position.set((ax + b.x) / 2, (ay + b.y) / 2, (az + b.z) / 2);
    this.line.scale.y = Math.max(0.05, Math.hypot(b.x - ax, b.y - ay, b.z - az));
    this.line.lookAt(b.x, b.y, b.z);
    this.line.rotateX(Math.PI / 2);
  }

  // where the cast lands — further out than Fetch's own throw, since a float
  // sits still and waits rather than bouncing back immediately
  _castSpot() {
    const a = this.area;
    const lean = (this.castN % 2 ? 1 : -1) * 1.6;
    return { x: a.x + lean, z: a.z - Math.min(a.ahead - 2.0, 6.5) };
  }

  start() {}   // §3.4: the round opens on the rod at rest — the first cast is a tap, not a start()

  _cast() {
    this.castN++;
    this.state = 'out';
    this.t = 0;
    this.a = { ...this.rodTip };
    this.b = this._castSpot();
    this.flight = 0.55;
    this.ring.material.opacity = 0;
    audio.play('whoosh', { volume: 0.45, rate: 0.9, vary: 0.06 });
  }

  // the one input this game reads directly: cast when idle, hook when the
  // window is open, nothing in between (§2: mashing costs nothing and never
  // helps skip ahead of the bite it hasn't finished telegraphing)
  tap() {
    if (this.state === 'ready') { this._cast(); return 0; }
    if (this.state !== 'catchable') return 0;
    const off = Math.abs(this.t - this.perfectAt);
    const perfect = off <= PERFECT;
    this.state = 'caught';
    this.t = 0;
    this._reveal();
    audio.play(perfect ? 'chest-open' : 'pup-chime', { volume: perfect ? 0.85 : 0.7, rate: perfect ? 1.3 : 1.0 });
    this.ring.material.opacity = 0;
    return perfect ? 2 : 1;
  }

  // THE REVEAL — the caught species itself, risen out of the water. Grabbed
  // from the cache preloaded at room-build time (js/npcs.js); if a game
  // somehow opens before that resolves (never observed, but the harness
  // contract makes no promise about it), the round still completes cleanly
  // with no fish shown rather than a thrown error.
  _reveal() {
    const cache = modelCache;
    if (!cache) return;
    const id = SPECIES[Math.floor(this.ctx.rand() * SPECIES.length)];
    const model = prepareModel(cache[id].scene.clone());
    const box = new THREE.Box3().setFromObject(model);
    const h = Math.max(0.05, box.max.y - box.min.y);
    model.scale.setScalar(0.55 / h);
    model.position.set(this.float.position.x, 0.2, this.float.position.z);
    model.rotation.y = this.ctx.rand() * Math.PI * 2;
    this.prize = { model, t: 0, riseTo: 0.9 };
    this.group.add(model);
  }

  update(dt) {
    this.t += dt;
    const r = this.ring;

    if (this.prize) {
      this.prize.t += dt;
      const k = Math.min(1, this.prize.t / 0.5);
      this.prize.model.position.y = 0.2 + Math.sin(k * Math.PI * 0.5) * this.prize.riseTo;
      this.prize.model.rotation.y += dt * 1.2;
      if (this.prize.t > 1.6) {
        this.group.remove(this.prize.model);
        this.prize.model.traverse((n) => {
          if (n.isMesh) { n.geometry.dispose(); }
        });
        this.prize = null;
      }
    }

    if (this.state === 'ready') {
      // a gentle idle bob so the float reads as ALIVE, not parked
      this.float.position.y = 0.3 + Math.sin(this.t * 1.6) * 0.03;
      this._updateLine();
      return 0;
    }

    if (this.state === 'out') {
      const k = Math.min(1, this.t / this.flight);
      this.float.position.x = this.a.x + (this.b.x - this.a.x) * k;
      this.float.position.z = this.a.z + (this.b.z - this.a.z) * k;
      this.float.position.y = 0.3 + Math.sin(k * Math.PI) * 1.1;
      this._updateLine();
      if (k >= 1) {
        this.state = 'bite';
        this.t = 0;
        // A CHILD WHO JUST CAST NEEDS A MOMENT TO LOOK BEFORE THE RING
        // CLOSES — Fetch's own ring starts closing the instant the stick
        // lands because the catch IS the landing; here the float sits still
        // first, so the ring has something calm to interrupt.
        this.biteAt = 0.6 + this.ctx.rand() * 0.9;
      }
      return 0;
    }

    if (this.state === 'bite') {
      this.float.position.y = 0.3 + Math.sin(this.t * 5) * 0.02;
      this._updateLine();
      if (this.t >= this.biteAt) {
        this.state = 'closing';
        this.t = 0;
        this.closeFor = 0.9;
      }
      return 0;
    }

    if (this.state === 'closing') {
      // THE POSE NEVER LIES: the ring reaches its smallest exactly when the
      // window opens, never before — Fetch's own law, carried over whole.
      const k = Math.min(1, this.t / this.closeFor);
      r.position.set(this.float.position.x, 0.05, this.float.position.z);
      r.material.opacity = 0.3 + k * 0.55;
      r.scale.setScalar(1 + (1 - k) * 2.2);
      this.float.position.y = 0.3 - k * 0.18;   // the float dips as the bite arrives
      this._updateLine();
      if (k >= 1) {
        this.state = 'catchable';
        this.t = 0;
        this.perfectAt = HOOK_WINDOW * 0.5;
        audio.play('ui-click', { volume: 0.45, rate: 1.4 });
      }
      return 0;
    }

    if (this.state === 'catchable') {
      const k = this.t / HOOK_WINDOW;
      r.scale.setScalar(1 + Math.max(0, k) * 0.6);
      r.material.opacity = 0.85 * (1 - Math.min(1, k));
      this.float.position.y = 0.12 - Math.sin(Math.min(1, k) * Math.PI) * 0.1;
      this._updateLine();
      if (this.t >= HOOK_WINDOW) {
        this.state = 'missed';
        this.t = 0;
        r.material.opacity = 0;
        audio.play('ui-click', { volume: 0.3, rate: 0.7 });
      }
      return 0;
    }

    // CAUGHT or MISSED — either way the float drifts back to rest and the
    // rod is ready for another tap. There is no fail state (§2): a missed
    // bite costs a few seconds, nothing else.
    if (this.state === 'caught' || this.state === 'missed') {
      const pause = this.state === 'caught' ? 0.4 : 0.7;
      const k = Math.min(1, this.t / pause);
      this.float.position.x += (this.rodTip.x - this.float.position.x) * Math.min(1, dt * 6);
      this.float.position.z += (this.rodTip.z - this.float.position.z) * Math.min(1, dt * 6);
      this.float.position.y += (0.3 - this.float.position.y) * Math.min(1, dt * 6);
      this._updateLine();
      if (k >= 1) { this.state = 'ready'; this.t = 0; }
      return 0;
    }
    return 0;
  }

  // the demo (§3.2): shown once, on a child's first ever round — it casts,
  // waits, and hooks itself, the real loop running before the clock starts.
  demo(dt, t, elapsed) {
    if (this.state === 'ready' && elapsed > 0.5) this._cast();
    if (this.state !== 'ready') this.update(dt);
    if (this.state === 'catchable') this.tap();
  }

  end() { return { score: undefined }; }   // the harness already has the tally

  // §3.4 — zero residue. Everything this game made, it removes.
  teardown() {
    if (this.prize) this.group.remove(this.prize.model);
    this.group.traverse((n) => {
      if (!n.isMesh) return;
      if (n.geometry) n.geometry.dispose();
      if (n.material) n.material.dispose();
    });
    if (this.group.parent) this.group.parent.remove(this.group);
    const loose = this.world && this.world._keepLoose;
    if (loose) {
      const i = loose.indexOf(this.group);
      if (i >= 0) loose.splice(i, 1);
    }
    this.group = null; this.float = null; this.line = null; this.ring = null; this.prize = null;
  }
}

// ---------------------------------------------------------------------------
// THE HOST — a doorway only, the exact shape js/minigames.js's makeFetchHost
// already proved (armed-on-step-off latch, dimmed the instant the harness
// opens because the world freezes and no update() runs again until the round
// ends). Duplicated rather than imported: that helper lives in the Den's own
// file and this game's hosts stand in region hearths, which import nothing
// Den-specific today and should not start now for three lines of ring code.
//
// design/WIDER-WORLD.md §3.4: "Hosts are makeFetchHost clones... placed at a
// water edge with world.nearWater() so nothing stands in paint." The guard
// runs at BUILD TIME, here — a room whose water moved away from this exact
// spot in some later edit gets no ring rather than a ring floating over dry
// ground with nothing to explain it.
function actRing(world, x, z) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.78, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.05, z);
  world.add(ring);
  return ring;
}

function nearRing(player, ring, r = 0.8) {
  const dx = player.root.position.x - ring.position.x;
  const dz = player.root.position.z - ring.position.z;
  return dx * dx + dz * dz < r * r;
}

// world.nearWater() ONLY reads world.waterPatches — the circular ground-
// texture blends shell()'s own `patches:` option draws (its every other
// caller, cartWreck/wayshrine, is a "does not look silly sitting in mud"
// check against that same texture). The Vale's lagoon and the Market's
// channel are real gameplay water laid as `waterZone()` rectangles instead
// (js/water.js) — a SEPARATE array `nearWater()` never looks at — so q1's
// own channel would fail that check outright despite being the one water in
// the room. This is the actual §3.4 guard: both kinds, so a fishing ring can
// stand at any real water this game has, not only the ones with a matching
// texture patch underneath.
function nearAnyWater(world, x, z, pad) {
  for (const w of (world.waterPatches || [])) {
    const dx = x - w.x, dz = z - w.z;
    if (dx * dx + dz * dz < (w.r + pad) * (w.r + pad)) return true;
  }
  for (const zn of (world.waterZones || [])) {
    if (x >= zn.minX - pad && x <= zn.maxX + pad && z >= zn.minZ - pad && z <= zn.maxZ + pad) return true;
  }
  return false;
}

// Called from a room's own builder (js/level5.js buildS1a, js/level6.js
// buildD1a, js/levelMarket.js buildQ1) once its own hearth/water geometry is
// in place. Kicks off preloadFish() itself so the model cache is warm long
// before a child can walk here and open the harness.
export function installFishHost(world, x, z) {
  if (!nearAnyWater(world, x, z, 3.0)) return;
  preloadFish();
  const ring = actRing(world, x, z);
  const chipEl = document.getElementById('mg-chip');
  let armed = true;
  world.updateMinigames = (dt, t, player) => {
    const h = world.harness;
    const on = nearRing(player, ring);
    if (h && h.active) { chipEl.textContent = ''; chipEl.style.display = 'none'; return; }
    if (!on) armed = true;
    ring.material.opacity = armed ? 0.55 + Math.sin(t * 3) * 0.2 : 0.16;
    const text = on && armed ? '🎣 fish!' : '';
    if (on && armed && h && h.open(FISH, world, player)) {
      armed = false;
      ring.material.opacity = 0.12;
    }
    chipEl.textContent = text;
    chipEl.style.display = text ? 'block' : 'none';
  };
}
