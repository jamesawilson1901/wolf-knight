// Visual effects. Phase 3: the Blood Moon ultimate + camera shake.
// Effects are self-contained updaters: main.js calls effects.update(dt) and
// adds effects.shakeOffset to the camera each frame.

import * as THREE from 'three';
import { juice } from './juice.js';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { SHARED } from './assets.js';

// ---------------------------------------------------------------------------
// THE BLOOD MOON'S TEXTURES (2026-09-26). Built/loaded ONCE for the session, the
// first time Effects is constructed, so the ceremony's first frame never waits
// on a decode. All of them go into assets.SHARED: nothing here is ever in a
// room's graph, but a texture a room teardown could reach must be marked, and
// being explicit costs one Set entry each.
//
// Six are Kenney Particle Pack sprites (CC0, the same pack v3.174 took
// spark/flare/flash from — design/FX.md), downscaled from 512px and stored
// grey+alpha: light_03 -> moon-ring, light_02 -> moon-corona, star_09 ->
// gleam, trace_07 -> streak, smoke_07 -> smoke, scorch_02 -> scorch.
// The moon's FACE and its soft glow are painted here on a canvas — a disc
// needs no file, and a painted one can be exactly the blood moon we want.
// ---------------------------------------------------------------------------
// light_03 (moon-ring.png) is a soft disc whose bright wisps fade out at 0.41
// of the quad's width: a quad of `r / RING_EDGE` puts the visible edge at r.
const RING_EDGE = 0.41;
const MOON_FX_URLS = {
  ring: './assets/fx/moon-ring.png',
  corona: './assets/fx/moon-corona.png',
  gleam: './assets/fx/gleam.png',
  streak: './assets/fx/streak.png',
  smoke: './assets/fx/smoke.png',
  scorch: './assets/fx/scorch.png',
  spark: './assets/fx/spark.png',
  flash: './assets/fx/flash.png',
};
let _moonFx = null;
function moonFx() {
  if (_moonFx) return _moonFx;
  _moonFx = {};
  const loader = new THREE.TextureLoader();
  for (const [k, url] of Object.entries(MOON_FX_URLS)) {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    SHARED.add(t);
    _moonFx[k] = t;
  }
  _moonFx.face = paintMoonFace();
  _moonFx.glow = paintGlow();
  SHARED.add(_moonFx.face);
  SHARED.add(_moonFx.glow);
  return _moonFx;
}

// A blood moon, 256px: lit from the upper left, a hot orange heart cooling to
// deep blood at the limb, soft dark seas, craters with a bright lip toward the
// light and a shadowed lip away from it, a fine grain, limb darkening, and the
// thin bright rim of refracted light a real eclipsed moon wears on one edge.
// Seeded, so it is the same moon every time.
function paintMoonFace() {
  const S = 256, R = S / 2 - 4, cx = S / 2, cy = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  let seed = 1901;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const TAU = Math.PI * 2;
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  let gr = g.createRadialGradient(cx - R * 0.32, cy - R * 0.36, R * 0.08, cx, cy, R * 1.02);
  gr.addColorStop(0, '#ffa27a');
  gr.addColorStop(0.3, '#f4502f');
  gr.addColorStop(0.7, '#b0141e');
  gr.addColorStop(1, '#4c030a');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) {                         // maria
    const x = cx + (rnd() - 0.5) * R * 1.3, y = cy + (rnd() - 0.5) * R * 1.3, r = R * (0.16 + rnd() * 0.3);
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    m.addColorStop(0, 'rgba(74,4,12,0.5)');
    m.addColorStop(0.65, 'rgba(74,4,12,0.28)');
    m.addColorStop(1, 'rgba(74,4,12,0)');
    g.fillStyle = m;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (let i = 0; i < 1100; i++) {                      // grain
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,196,160,0.08)' : 'rgba(40,0,6,0.1)';
    g.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
  }
  for (let i = 0; i < 28; i++) {                        // craters
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.9;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const r = R * (i < 6 ? 0.08 + rnd() * 0.07 : 0.022 + rnd() * 0.045);
    const bowl = g.createRadialGradient(x + r * 0.3, y + r * 0.3, 0, x, y, r);
    bowl.addColorStop(0, 'rgba(46,2,8,0.6)');
    bowl.addColorStop(1, 'rgba(46,2,8,0.12)');
    g.fillStyle = bowl;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.lineWidth = Math.max(1, r * 0.24);
    g.strokeStyle = 'rgba(255,178,140,0.5)';
    g.beginPath(); g.arc(x, y, r, Math.PI * 0.95, Math.PI * 1.8); g.stroke();
    g.strokeStyle = 'rgba(28,0,4,0.42)';
    g.beginPath(); g.arc(x, y, r, -Math.PI * 0.05, Math.PI * 0.8); g.stroke();
  }
  gr = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);   // limb darkening
  gr.addColorStop(0, 'rgba(18,0,3,0)');
  gr.addColorStop(1, 'rgba(18,0,3,0.72)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  g.restore();
  g.lineWidth = 3.5;                                    // the refracted rim
  g.strokeStyle = 'rgba(255,128,92,0.6)';
  g.beginPath(); g.arc(cx, cy, R - 1.5, -0.25, Math.PI * 0.75); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A soft round glow (white; tinted per use), 128px.
function paintGlow() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.75, 'rgba(255,255,255,0.05)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shakeOffset = new THREE.Vector3();
    this.hitStopTime = 0; // freeze-frame on solid hits (real-time seconds)
    this.zoom = 0;        // 0..1 camera punch-in (Blood Moon drama)
    this.timeScale = 1;   // <1 = the world moves through syrup (surge morph)
    this._shakeTime = 0;
    this._shakeStrength = 0;
    this._active = [];
    this.dim = 0;         // 0..1 the room's own light pulled down (Blood Moon night)
    moonFx();             // the Blood Moon's textures, ready before its first frame
  }

  // Camera punch-in: a quick lean toward the action that releases over dur.
  punch(amount = 0.3, dur = 0.25) {
    if (state.settings.reduceMotion) amount *= CONFIG.ACCESSIBILITY.REDUCE_MOTION_PUNCH_SCALE;
    if (amount <= 0) return;
    let elapsed = 0;
    this._active.push((dt) => {
      elapsed += dt;
      const f = Math.min(1, elapsed / dur);
      this.zoom = Math.max(this.zoom, amount * (1 - f));
      return f < 1;
    });
  }

  // Brief time-slow: world updates run at `scale` speed, easing back to 1.
  slow(scale = 0.7, dur = 0.6) {
    let elapsed = 0;
    this.timeScale = Math.min(this.timeScale, scale);
    this._active.push((dt) => {
      elapsed += dt;
      const f = Math.min(1, elapsed / dur);
      this.timeScale = scale + (1 - scale) * f * f;
      if (f >= 1) { this.timeScale = 1; return false; }
      return true;
    });
  }

  shake(strength = 0.4, time = 0.5) {
    if (state.settings.reduceMotion) strength *= CONFIG.ACCESSIBILITY.REDUCE_MOTION_SHAKE_SCALE;
    if (strength <= 0) return;
    this._shakeStrength = Math.max(this._shakeStrength, strength);
    this._shakeTime = Math.max(this._shakeTime, time);
  }

  hitStop(t = 0.07) {
    if (state.settings.reduceMotion) t *= CONFIG.ACCESSIBILITY.REDUCE_MOTION_HITSTOP_SCALE;
    this.hitStopTime = Math.max(this.hitStopTime, t);
  }

  // 1 normally; dimmed under reduce-motion for one-off light-burst flashes
  // (ground-slam impact glow, the Surge's red wash/moon glow).
  _flashScale() {
    return state.settings.reduceMotion ? CONFIG.ACCESSIBILITY.REDUCE_MOTION_FLASH_SCALE : 1;
  }

  update(dt, t) {
    if (this._shakeTime > 0) {
      this._shakeTime -= dt;
      const s = this._shakeStrength * Math.max(0, this._shakeTime) * 2;
      this.shakeOffset.set(
        Math.sin(t * 91) * s,
        Math.sin(t * 83 + 1.7) * s * 0.5,
        Math.sin(t * 77 + 4.1) * s
      );
      if (this._shakeTime <= 0) this._shakeStrength = 0;
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
    for (let i = this._active.length - 1; i >= 0; i--) {
      if (!this._active[i](dt)) this._active.splice(i, 1);
    }
  }

  // Radial shockwave ring + emissive flash. Used by every ability that hits in
  // a circle, and by the boss death ceremonies.
  //
  // C1 — `radius` IS THE ABILITY'S TRUE REACH, and the ring stops there.
  //
  // This used to grow to a fixed scale 4.2, so whatever called it drew the same
  // ~4u circle. The abilities it represents are not 4u and are not all the same
  // size, so the flourish was telling a child the wrong thing about every one of
  // them — worst on the knight's spin, whose own comment in player.js says the
  // ring "sweeps out to the spin's reach" while SPIN_RANGE is 2.3, a 74%
  // overstatement. THE POSE NEVER LIES applies to a shockwave as much as to a
  // shield: these children learn range by watching, not by reading numbers.
  //
  // NOT a room-scale problem, whatever the fix plan said. The camera is a fixed
  // world-space offset and never changes distance, so the visible ground is
  // 21.2u wide, 12.9u ahead and 4.5u behind in EVERY room — measured identically
  // in a 14x10 choke and the 36x28 hub. A ring that reads correctly in one room
  // reads correctly in all of them. Do not "scale this with room size" later.
  //
  // The growth eases OUT so the ring arrives at its true extent early and
  // lingers there while it fades, instead of still expanding as it disappears.
  // That is what makes the honest radius legible rather than merely correct.
  // `cone` makes the flourish the ability's SHAPE as well as its reach:
  // {deg, fx, fz} draws a wedge of half-angle `deg` centred on the facing
  // (fx, fz) instead of a full disc. Two abilities needed it — the frost breath
  // is a 40-degree cone and the vine-lash is a 3.8 x 0.9 corridor, and drawing
  // either as a circle told a child it reached 0.6u BEHIND them, which is the
  // one direction the fixed camera barely shows.
  //
  // Same primitive: RingGeometry takes thetaStart/thetaLength, so a wedge costs
  // no new geometry type and no extra draw call. After the -90-degree X
  // rotation that lays the ring flat, local theta 0 points at world +x and
  // theta grows toward world -z, so the facing maps to atan2(-fz, fx).
  groundSlam(pos, color = 0xff7a2a, radius = 4.0, cone = null) {
    const OUTER = 0.95;                                  // ring outer radius at scale 1
    const grow = Math.max(0.25, radius / OUTER - 1);
    const half = cone ? THREE.MathUtils.degToRad(cone.deg) : 0;
    const mid = cone ? Math.atan2(-cone.fz, cone.fx) : 0;
    const ring = new THREE.Mesh(
      cone
        ? new THREE.RingGeometry(0.5, 0.95, 24, 1, mid - half, half * 2)
        : new THREE.RingGeometry(0.5, 0.95, 36),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.07, pos.z);
    const fScale = this._flashScale();
    const flash = new THREE.PointLight(0xff8a3a, 18 * fScale, 12, 1.7);
    flash.position.set(pos.x, 1.0, pos.z);
    this.scene.add(ring, flash);
    this.shake(0.3, 0.35);

    let elapsed = 0;
    const DURATION = 0.55;
    this._active.push((dt) => {
      elapsed += dt;
      const f = Math.min(1, elapsed / DURATION);
      const e = 1 - (1 - f) * (1 - f);                    // ease out: arrive, then linger
      const s = 1 + e * grow;
      ring.scale.set(s, s, 1);
      ring.material.opacity = 0.95 * (1 - f);
      flash.intensity = 18 * fScale * (1 - f);
      if (f >= 1) {
        this.scene.remove(ring, flash);
        ring.geometry.dispose();
        ring.material.dispose();
        return false;
      }
      return true;
    });
  }

  // THE SURGE'S SHOCKWAVE, textured (2026-09-26): the same soft wisp ring the
  // Blood Moon's impact lays down, instead of groundSlam's flat RingGeometry,
  // so the ceremony's two rings are one family. Same honesty rule as
  // groundSlam (C1): the visible edge stops at `radius`, the true reach.
  // No PointLight — the moon's own light is already burning at this beat,
  // and adding one recompiles every lit material in the room.
  softRing(pos, color = 0xff2a18, radius = 4.0, dur = 0.8) {
    const tex = moonFx();
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: tex.ring, color, transparent: true, depthWrite: false, opacity: 0, fog: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.08, pos.z);
    ring.renderOrder = 5;
    this.scene.add(ring);
    const full = radius / RING_EDGE;
    let elapsed = 0;
    this._active.push((dt) => {
      elapsed += dt;
      const f = Math.min(1, elapsed / dur);
      const e = 1 - (1 - Math.min(1, f / 0.55)) ** 3;     // arrive early, linger
      ring.scale.setScalar(0.6 + (full - 0.6) * e);
      ring.rotation.z -= dt * 0.7;
      mat.opacity = Math.min(1, elapsed / 0.04) * (1 - f * f);
      if (f >= 1) {
        this.scene.remove(ring);
        geo.dispose();
        mat.dispose();
        return false;
      }
      return true;
    });
  }

  // Victory: warm light floods the room as the shadow's hold breaks.
  warmFlood() {
    const flood = new THREE.HemisphereLight(0xffd9a0, 0x7a4a2a, 0);
    this.scene.add(flood);
    let elapsed = 0;
    this._active.push((dt) => {
      elapsed += dt;
      if (elapsed < 0.9) flood.intensity = (elapsed / 0.9) * 2.6;
      else flood.intensity = Math.max(0, 2.6 * (1 - (elapsed - 0.9) / 3.6));
      if (elapsed > 4.5) {
        this.scene.remove(flood);
        return false;
      }
      return true;
    });
  }

  // THE BLOOD MOON (~3.5s + crash + aftermath). The world darkens and a
  // blood moon RISES behind Kael while he morphs and howls — then the moon
  // itself DIVES OUT OF THE SKY and CRASHES INTO the nearest enemy (playtest
  // ask: the blood moon must visibly slam down on someone). Gameplay beats
  // (morph, shockwave) live in Player._tickCeremony, timed to the same clock;
  // `crash` is { at, onImpact, onDive?, live? } supplied by the player so the
  // dive aims and deals damage through real game systems.
  //
  // REBUILT 2026-09-26 (dad: "the current one is too low quality"). It was one
  // flat-shaded red icosahedron, a pink hemisphere wash and a flat
  // RingGeometry — at phone size, a red blob that slid sideways. Now, every
  // piece a child can see is a real texture:
  //   RISE  the room darkens (effects.dim, applied to the light rig in
  //         main.js) while a textured moon — craters, seas, a dark limb and a
  //         bright refracted rim, painted once on a canvas — fades up out of
  //         a pool of light, wrapped in a soft glow and two counter-rotating
  //         wisp coronas (Kenney light_02/light_03). Red motes stream in off
  //         the floor and are swallowed by it. When Kael howls (t=1.0) the
  //         corona FLARES, as if the moon heard him.
  //   HANG  a star-glint on its limb as it arrives; for the last 0.3s it
  //         lifts, trembles and brightens — the wind-up before the throw.
  //   DIVE  it falls along a curve, heating toward orange, dragging a streak
  //         (Kenney trace_07), three afterimages and a spray of sparks.
  //   CRASH a white flash, a star-burst, a soft textured shockwave (light_03,
  //         laid on the ground) that stops at the moon's TRUE 2.6u reach, a
  //         glowing crater that cools, rising embers, three smoke puffs, and
  //         a scorch mark (scorch_02) that lingers and fades.
  // Draw calls: the moon, glow, two coronas, a glint, a streak, three
  // ghosts and one Points pool — ~10 at the peak, all transient, and no
  // light is ever added beyond the two this always had (a new light
  // recompiles every lit material in the room, a visible hitch on a phone).
  surgeCeremony(pos, crash = null) {
    const scene = this.scene;
    const fScale = this._flashScale();
    const zScale = state.settings.reduceMotion ? CONFIG.ACCESSIBILITY.REDUCE_MOTION_PUNCH_SCALE : 1;
    const tex = moonFx();

    // the red wash: much gentler than it was (2.2 bleached the whole room
    // pink) because the room is now DARKENED under it, which reads as night
    const wash = new THREE.HemisphereLight(0xff2a33, 0x220408, 0);
    const moonLight = new THREE.PointLight(0xff2233, 0, 34, 1.5);
    scene.add(wash, moonLight);

    const own = [];     // every object this ceremony made, freed at teardown
    let plane = null;   // one quad shared by the ground decals
    const sprite = (map, color, { opacity = 0, depthTest = false, order = 20, blending = THREE.AdditiveBlending } = {}) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map, color, transparent: true, depthWrite: false, depthTest, blending, opacity, fog: false,
      }));
      s.renderOrder = order;
      s.frustumCulled = false;
      scene.add(s);
      own.push(s);
      return s;
    };
    const decal = (map, color, x, z, y, blending, order) => {
      if (!plane) plane = new THREE.PlaneGeometry(1, 1);
      const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
        map, color, transparent: true, depthWrite: false, blending, opacity: 0, fog: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * Math.PI * 2;
      m.position.set(x, y, z);
      m.renderOrder = order;
      scene.add(m);
      own.push(m);
      return m;
    };

    // NOT the pos.z - 9 this first shipped with: at this camera's pitch and
    // FOV that projects above the viewport for the whole climb (measured with
    // tools/wk-drive.mjs + Vector3.project). Beside Kael, climbing from the
    // floor to ~1.1u (1.35 at the wind-up), keeps the disc between NDC
    // y~0.0 and ~0.25 at 740x360 — big, and clear of the HUD rows. depthTest off on the moon's layers: it is a sky
    // object, and a crate or wall must never bite a chunk out of it.
    const MOON_D = 3.4;                                  // diameter, world units
    const moon = sprite(tex.face, 0xffffff, { order: 23, blending: THREE.NormalBlending });
    const glow = sprite(tex.glow, 0xff2a1c, { order: 21 });
    const corona = sprite(tex.corona, 0xff4a32, { order: 22 });
    const halo = sprite(tex.ring, 0xff7a52, { order: 22 });
    const glint = sprite(tex.gleam, 0xffe6c8, { order: 24 });
    const streak = sprite(tex.streak, 0xff9a5a, { order: 20 });
    const ghosts = [0, 1, 2].map(() => sprite(tex.glow, 0xff6a38, { order: 20 }));
    const home = new THREE.Vector3(pos.x - 3.3, 0, pos.z + 0.45);
    moon.position.copy(home);

    // ---- one small pool of glowing motes / sparks / embers ----
    const N = 120;
    const pPos = new Float32Array(N * 3), pCol = new Float32Array(N * 3);
    const pVel = new Float32Array(N * 3), pBase = new Float32Array(N * 3);
    const pLife = new Float32Array(N), pMax = new Float32Array(N), pGrav = new Float32Array(N);
    for (let i = 0; i < N; i++) pPos[i * 3 + 1] = -99;
    const pGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage);
    pGeo.setAttribute('position', posAttr);
    pGeo.setAttribute('color', colAttr);
    const motes = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.55, map: tex.spark, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    motes.frustumCulled = false;
    motes.renderOrder = 25;
    scene.add(motes);
    own.push(motes);
    let pCur = 0;
    const tmpC = new THREE.Color();
    const emit = (x, y, z, vx, vy, vz, life, hex, grav = 0) => {
      const i = pCur;
      pCur = (pCur + 1) % N;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
      tmpC.setHex(hex);
      pBase[i * 3] = tmpC.r; pBase[i * 3 + 1] = tmpC.g; pBase[i * 3 + 2] = tmpC.b;
      pLife[i] = pMax[i] = life;
      pGrav[i] = grav;
    };
    const tickMotes = (dt) => {
      for (let i = 0; i < N; i++) {
        if (pLife[i] <= 0) continue;
        pLife[i] -= dt;
        if (pLife[i] <= 0) { pPos[i * 3 + 1] = -99; continue; }
        const k = pLife[i] / pMax[i];
        const a = k < 0.7 ? k / 0.7 : 1;                // full, then fades out
        pCol[i * 3] = pBase[i * 3] * a; pCol[i * 3 + 1] = pBase[i * 3 + 1] * a; pCol[i * 3 + 2] = pBase[i * 3 + 2] * a;
        pVel[i * 3 + 1] += pGrav[i] * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    };

    const RISE = 2.2;    // the moon climbs while the night comes down
    const HOLD = 0.8;    // it hangs there through the howl + shockwave
    const DIVE = 0.5;    // then PLUMMETS onto its target
    const FADE = 0.9;    // the light comes back
    const LINGER = 3.4;  // the scorch mark outlives the ceremony, then goes
    const DIM = 0.85;     // how far the room's own light comes down
    const WASH = 0.45;    // the red hemisphere wash over what is left
    const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    let elapsed = 0;
    let diveFrom = null, diveCtl = null, diveTo = null, dived = false, impacted = false, impactT = 0;
    let moteAcc = 0;
    let flash = null, burst = null, shock = null, crater = null, scorch = null;
    const smokes = [];
    const bez = new THREE.Vector3();
    const bezAt = (f, out) => {           // quadratic curve: lift, then fall
      const u = 1 - f;
      return out.set(
        u * u * diveFrom.x + 2 * u * f * diveCtl.x + f * f * diveTo.x,
        u * u * diveFrom.y + 2 * u * f * diveCtl.y + f * f * diveTo.y,
        u * u * diveFrom.z + 2 * u * f * diveCtl.z + f * f * diveTo.z);
    };

    const teardown = () => {
      for (const o of own) {
        scene.remove(o);
        o.material.dispose();       // textures are session-shared (moonFx)
      }
      if (plane) plane.dispose();
      pGeo.dispose();
      scene.remove(moonLight, wash);
      this.dim = 0;
    };

    this._active.push((dt) => {
      // THE ROOM WENT AWAY UNDER IT (a door, a respawn): vanish, quietly.
      // Nothing of a dead room's moon may land in the next one.
      if (crash && crash.live && !crash.live()) { teardown(); return false; }
      elapsed += dt;
      const e = elapsed;
      tickMotes(dt);

      if (e < RISE + HOLD || (!crash && e < RISE + HOLD + FADE)) {
        // ---------------- RISE + HANG ----------------
        const f = Math.min(1, e / RISE);
        const e1 = 1 - (1 - f) * (1 - f);                   // decelerate upward
        const fadeIn = smooth(0, 0.7, e);
        const hold = Math.max(0, e - RISE);
        const windup = smooth(HOLD - 0.3, HOLD, hold);      // last 0.3s: coil
        const out = crash ? 1 : 1 - smooth(RISE + HOLD, RISE + HOLD + FADE, e);
        const howlBeat = Math.exp(-(((e - 1.05) / 0.16) ** 2)); // Kael howls at 1.0
        const shiver = windup * 0.05;
        moon.position.set(
          home.x + (Math.random() - 0.5) * shiver,
          home.y - 0.2 + e1 * 1.3 + Math.sin(hold * 4) * 0.04 * (hold > 0 ? 1 : 0) + windup * 0.25,
          home.z + (Math.random() - 0.5) * shiver);
        const ms = MOON_D * (0.6 + 0.4 * e1) * (1 + windup * 0.06);
        moon.scale.setScalar(ms);
        moon.material.opacity = fadeIn * out;
        moon.material.rotation = e * 0.06;
        const pulse = 1 + 0.07 * Math.sin(e * 5.2);
        glow.position.copy(moon.position);
        glow.scale.setScalar(ms * 2.6 * pulse * (1 + howlBeat * 0.3 + windup * 0.2));
        glow.material.opacity = (0.55 + howlBeat * 0.35 + windup * 0.3) * fadeIn * out * fScale;
        corona.position.copy(moon.position);
        corona.scale.setScalar(ms * 1.8 * (1 + 0.05 * Math.sin(e * 3.1)) * (1 + howlBeat * 0.35));
        corona.material.rotation += dt * (0.35 + windup * 2.2);
        corona.material.opacity = (0.75 + howlBeat * 0.25) * fadeIn * out;
        halo.position.copy(moon.position);
        halo.scale.setScalar(ms * 1.5 * (1 + howlBeat * 0.2));
        halo.material.rotation -= dt * (0.22 + windup * 1.6);
        halo.material.opacity = 0.5 * fadeIn * out;
        // the arrival glint: a star catches the limb as the moon settles
        const g = hold > 0 ? Math.max(0, 1 - Math.abs(hold - 0.2) / 0.22) : 0;
        glint.position.set(moon.position.x - ms * 0.28, moon.position.y + ms * 0.3, moon.position.z + 0.1);
        glint.scale.setScalar(ms * 1.1 * g);
        glint.material.rotation = hold * 2.5;
        glint.material.opacity = g * out;

        wash.intensity = f * WASH * fScale * out;
        this.dim = Math.max(0, smooth(0, 1.4, e) * DIM * out);
        moonLight.position.copy(moon.position);
        moonLight.intensity = (f * 9 + howlBeat * 8 + windup * 6) * fScale * out;
        this.zoom = Math.max(this.zoom, f * 0.85 * zScale * out); // the camera leans in

        // motes: drawn in off the floor and swallowed by the moon
        moteAcc += dt * (e < RISE ? 46 : 22);
        while (moteAcc >= 1) {
          moteAcc -= 1;
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 2.8;
          const sx = moon.position.x + Math.cos(a) * r, sz = moon.position.z + Math.sin(a) * r * 0.7;
          const T = 0.7 + Math.random() * 0.35;
          emit(sx, 0.15, sz,
            (moon.position.x - sx) / T, (moon.position.y - 0.15) / T, (moon.position.z - sz) / T,
            T, Math.random() < 0.3 ? 0xffa060 : 0xff3a2a);
        }
        if (!crash && out <= 0) { teardown(); return false; }
      } else if (crash && e < RISE + HOLD + DIVE) {
        // ---------------- DIVE ----------------
        if (!diveFrom) {
          // aim ONCE, at dive start, then scream down in a curve
          diveFrom = moon.position.clone();
          const target = crash.at();
          diveTo = new THREE.Vector3(target.x, 0.55, target.z);
          // a target right under the moon would make the dive a twitch: the
          // shorter the throw, the higher the arc, so it always READS as a fall
          const reach = Math.hypot(diveTo.x - diveFrom.x, diveTo.z - diveFrom.z);
          diveCtl = new THREE.Vector3((diveFrom.x * 0.7 + diveTo.x * 0.3),
            diveFrom.y + 0.9 + Math.max(0, 4 - reach) * 0.55, (diveFrom.z * 0.7 + diveTo.z * 0.3));
          halo.material.opacity = 0;
          glint.material.opacity = 0;
        }
        if (!dived) { dived = true; if (crash.onDive) crash.onDive(); }
        const f = Math.min(1, (e - RISE - HOLD) / DIVE);
        const e2 = f ** 1.6;                                // accelerate — a falling sky
        bezAt(e2, moon.position);
        const ms = MOON_D * (1.06 - f * 0.3);
        moon.scale.setScalar(ms);
        moon.material.opacity = 1;
        moon.material.rotation += dt * 3;                   // tumbling in
        glow.position.copy(moon.position);
        glow.scale.setScalar(ms * (2.6 + f * 0.8));
        glow.material.color.setHex(0xff2a1c).lerp(tmpC.setHex(0xff8a3a), f); // heating up
        glow.material.opacity = (0.8 + f * 0.2) * fScale;
        corona.position.copy(moon.position);
        corona.scale.setScalar(ms * 1.6);
        corona.material.rotation += dt * 4;
        corona.material.opacity = 0.7 * (1 - f * 0.5);
        // the streak: laid along the SCREEN direction of travel. The camera
        // is a fixed 50-degree pitch with no yaw, so screen-right is world +x
        // and screen-up is (y*cos50 - z*sin50) — no camera handle needed.
        const lag = Math.max(0, e2 - 0.5);
        const tail = bezAt(lag, bez);
        const sdx = moon.position.x - tail.x;
        const sdy = (moon.position.y - tail.y) * 0.643 - (moon.position.z - tail.z) * 0.766;
        const len = Math.max(0.5, Math.hypot(sdx, sdy));
        streak.position.lerpVectors(tail, moon.position, 0.5);
        streak.material.rotation = Math.atan2(sdy, sdx) - Math.PI / 2;
        streak.scale.set(ms * 1.1, len * 1.25 + ms * 0.8, 1);
        streak.material.opacity = smooth(0, 0.25, f) * 0.95 * fScale;
        ghosts.forEach((gh, i) => {
          bezAt(Math.max(0, e2 - 0.12 * (i + 1)), gh.position);
          gh.scale.setScalar(ms * (1.5 - i * 0.28));
          gh.material.opacity = smooth(0, 0.3, f) * (0.55 - i * 0.15) * fScale;
        });
        moonLight.position.copy(moon.position);
        moonLight.intensity = (9 + f * 10) * fScale;
        wash.intensity = WASH * fScale;
        this.dim = DIM;
        for (let k = 0; k < 6; k++) {
          emit(moon.position.x + (Math.random() - 0.5) * ms * 0.5, moon.position.y + (Math.random() - 0.5) * ms * 0.4,
            moon.position.z + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6,
            0.35 + Math.random() * 0.3, Math.random() < 0.4 ? 0xffd07a : 0xff4a2a, -2);
        }
      } else {
        // ---------------- CRASH + AFTERMATH ----------------
        if (!crash) { teardown(); return false; }
        if (!impacted) {
          impacted = true;
          impactT = e;
          const ix = diveTo ? diveTo.x : pos.x, iz = diveTo ? diveTo.z : pos.z;
          for (const s of [moon, corona, halo, glint, streak, ...ghosts]) s.visible = false;
          glow.position.set(ix, 0.7, iz);
          glow.material.color.setHex(0xff5a2a);
          flash = sprite(tex.flash, 0xfff2d0, { order: 26 });
          flash.position.set(ix, 0.9, iz);
          burst = sprite(tex.gleam, 0xffd8a0, { order: 26 });
          burst.position.set(ix, 1.0, iz);
          // THE RING IS THE MOON'S TRUE REACH, 2.6u: damageEnemiesAt uses
          // 2.4 and the stun sweep 2.6 (player.js onImpact). The biggest,
          // most dramatic ring in the game must not claim more reach than
          // it has (the old flat one once did). See RING_EDGE.
          shock = decal(tex.ring, 0xff6a24, ix, iz, 0.07, THREE.AdditiveBlending, 5);
          crater = decal(tex.scorch, 0xff4a1e, ix, iz, 0.06, THREE.AdditiveBlending, 4);
          scorch = decal(tex.scorch, 0x140305, ix, iz, 0.05, THREE.NormalBlending, 3);
          for (let k = 0; k < 3; k++) {
            const sm = sprite(tex.smoke, 0x4a2a2e, { order: 6, depthTest: true, blending: THREE.NormalBlending });
            sm.position.set(ix + (k - 1) * 0.6, 0.5, iz + (Math.random() - 0.5) * 0.5);
            sm.material.rotation = Math.random() * 6;
            smokes.push({ s: sm, x0: sm.position.x, spin: (Math.random() - 0.5) * 1.2, d: k * 0.08 });
          }
          for (let k = 0; k < 64; k++) {
            const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.8;
            emit(ix + Math.cos(a) * 0.4, 0.3 + Math.random() * 0.4, iz + Math.sin(a) * 0.4,
              Math.cos(a) * sp, 2.4 + Math.random() * 3.8, Math.sin(a) * sp,
              0.9 + Math.random() * 0.9, k % 3 === 0 ? 0xffe2a0 : (k % 3 === 1 ? 0xff8a3a : 0xff3a24), -4.2);
          }
          moonLight.position.set(ix, 1.3, iz);
          this.shake(0.55, 0.5);
          this.hitStop(0.09);
          for (let i = 0; i < 3; i++) {
            juice.burst(ix, 0.4 + i * 0.5, iz, i === 1 ? 0xffd76a : 0xff3a4a, 12);
          }
          crash.onImpact(ix, iz);
        }
        const a = e - impactT;                              // seconds since impact
        const f = Math.min(1, a / FADE);
        this.zoom = Math.max(this.zoom, 0.85 * (1 - f) * zScale); // release the lean
        wash.intensity = WASH * (1 - f) * fScale;
        this.dim = DIM * (1 - smooth(0, FADE, a));
        moonLight.color.setHex(0xff2233).lerp(tmpC.setHex(0xffb070), Math.exp(-a / 0.15));
        moonLight.intensity = (6 + 34 * Math.exp(-a / 0.18)) * (1 - f) * fScale;
        // the flash: a white sun, gone in a blink
        const fl = Math.min(1, a / 0.3);
        flash.scale.setScalar(2.5 + 9 * (1 - (1 - fl) * (1 - fl)));
        flash.material.opacity = (1 - fl) * fScale;
        const bl = Math.min(1, a / 0.45);
        burst.scale.setScalar(3 + 6 * bl);
        burst.material.rotation = a * 1.5;
        burst.material.opacity = (1 - bl) * fScale;
        glow.scale.setScalar(4 + 3 * Math.min(1, a / 0.3));
        glow.material.opacity = 0.9 * Math.max(0, 1 - a / 0.6) * fScale;
        // the shockwave: arrive at the true reach early, linger, fade
        const sw = Math.min(1, a / 0.42);
        shock.scale.setScalar(1 + (2.6 / RING_EDGE - 1) * (1 - (1 - sw) ** 3));
        shock.rotation.z += dt * 0.9;
        shock.material.opacity = Math.min(1, a / 0.04) * (1 - smooth(0.25, 1.05, a));
        // the crater glows, then cools; the scorch stays a while, then goes
        crater.scale.setScalar(4.2);
        crater.material.opacity = Math.max(0, 1 - a / 1.6) * fScale;
        scorch.scale.setScalar(5);
        scorch.material.opacity = 0.9 * Math.min(1, a / 0.1) * (1 - smooth(LINGER - 1.2, LINGER, a));
        for (const p of smokes) {
          const u = Math.min(1, Math.max(0, (a - p.d) / 1.7));
          p.s.position.y = 0.5 + u * 1.4;
          p.s.position.x = p.x0 + (p.x0 - (diveTo ? diveTo.x : pos.x)) * u * 0.8;
          p.s.scale.setScalar(1.4 + u * 2.8);
          p.s.material.rotation += dt * p.spin;
          p.s.material.opacity = 0.6 * Math.min(1, u * 8) * (1 - u);
        }
        if (a >= LINGER) { teardown(); return false; }
      }
      return true;
    });
  }
}
