// DEV MODE — the bug-report loop, built because the photographs were only ever
// half a report.
//
// Dad's play-tests arrive as screenshots, and every one of them costs the same
// detective work before a single line can change: which room is this, and which
// object am I looking at? The 2026-09-03 batch was twenty images; the floating
// stone took a source hunt, the yg1 wall took an afternoon of probes and still
// could not be reproduced. The picture proves something is wrong. It never says
// WHERE, and where is the expensive half.
//
// So a report here is not a picture with a caption. It is a picture, plus the
// room, plus the spot on the floor, plus — when he taps the thing that is wrong
// — enough of the camera to re-cast that exact ray offline and name the prop.
// Every prop in this game is placed by a literal in a level file: given `tkn`
// and (0, -12) the fix is a grep away instead of an afternoon.
//
// THREE DECISIONS WORTH KEEPING
//
// 1. IT DOES NOT TURN BATCHING OFF. flattenStatic merges forty props into one
//    mesh, so a live raycast in the shipped build usually answers "batched" and
//    nothing more. The obvious fix — build unmerged in dev mode — would change
//    the very thing he is looking at, and he would no longer be testing the
//    game the kids play. Instead the report stores the camera and the tap point
//    exactly, and the ray gets re-cast offline against an unbatched build
//    (tools/ already does this: `window.__noBatch`). He plays the real thing; I
//    still get the name. The live hit is recorded too, as a hint, honestly
//    labelled when it is a merged mesh.
//
// 2. THE SHOT IS THE CANVAS, SO THE HUD IS MEASURED INSTEAD. toDataURL only
//    sees the WebGL canvas — the HUD is DOM and will not appear in it. Rather
//    than drag in a DOM-rasteriser, every visible HUD element's rectangle goes
//    into the report. Dad's first item that batch was "the LV overlaps the
//    shards", and two rectangles settle that argument in a way a screenshot
//    never can: overlap becomes measurable rather than eyeballed.
//
// 3. IT CAPTURES IN THE RENDER CALL, NOT AFTER IT. The renderer has no
//    preserveDrawingBuffer, so the drawing buffer is empty by the time any
//    later code asks for it — toDataURL has to happen in the same turn as the
//    draw or it returns a blank frame. Rather than edit five render call sites
//    in the game loop, this wraps renderer.render once.
//
// Gate: `?dev=1` on the URL and nothing else. It has to work on the DEPLOYED
// build, because that is where the bugs are found — a build-time flag would
// mean the one place it matters is the one place it is off. With the parameter
// absent this module creates no DOM, adds no listener and wraps nothing.
import * as THREE from 'three';

// HOW YOU GET IN, AND WHY THERE ARE TWO WAYS.
//
// `?dev=1` was the whole gate, and it shipped broken for the one person it is
// for: manifest.json is `"display": "fullscreen"` with `start_url: "./"`, so
// the installed app has NO ADDRESS BAR. Dad opens Wolf Knight from the home
// screen like the kids do, and there is physically nowhere to type a query
// string. A dev mode reachable only from a browser tab is a dev mode he cannot
// use on the device he finds the bugs on.
//
// So the URL still works and now STICKS: `?dev=1` remembers itself, `?dev=0`
// forgets. And there is a way in with no URL at all — a long press on the
// version badge in the corner, which is already the developer's own label,
// sits outside every control, and is not something a five-year-old presses for
// a second and a half by accident.
const DEV_KEY = 'wk-dev';
function urlSays() {
  const m = /[?&]dev=([01])/.exec(location.search || '');
  return m ? m[1] === '1' : null;
}
function remembered() {
  try { return localStorage.getItem(DEV_KEY) === '1'; } catch { return false; }
}
function remember(on) {
  try { localStorage.setItem(DEV_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}
let ON = (() => {
  const fromUrl = urlSays();
  if (fromUrl === null) return remembered();
  remember(fromUrl);
  return fromUrl;
})();

const DB_NAME = 'wolfknight-dev';
const STORE = 'reports';
const SHOT_W = 960;          // downscaled: ~100KB a shot, ~3MB for a session
const SHOT_QUALITY = 0.72;

let reports = [];
let seq = 0;
let ui = null;
let armed = false;           // waiting for him to tap the problem
let pendingShot = null;      // resolved inside the wrapped render()

// --- the store ------------------------------------------------------------
// IndexedDB rather than localStorage: a session of thirty screenshots is
// megabytes and localStorage's quota is about five. Reports survive a reload
// and a crash, which matters because the crash is sometimes the bug.
function idb() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'n' });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

async function dbPut(rec) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('[dev] could not save report', e); }
}

async function dbAll() {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).getAll();
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => rej(rq.error);
    });
  } catch (e) { console.warn('[dev] could not read reports', e); return []; }
}

async function dbClear() {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('[dev] could not clear reports', e); }
}

// --- what the game can tell us about right now ----------------------------
function snapshotState() {
  const g = window.__game;
  if (!g) return {};
  const p = g.player && g.player.root ? g.player.root.position : null;
  const badge = document.getElementById('badge');
  return {
    version: badge ? badge.textContent.trim() : '(no badge)',
    room: g.state ? g.state.room : null,
    // The region is the room id's first letter — the one mapping the whole
    // codebase agrees on (js/main.js regionOf).
    region: g.state && g.state.room ? String(g.state.room)[0] : null,
    player: p ? {
      x: +p.x.toFixed(2), z: +p.z.toFixed(2),
      angle: g.player.root.rotation ? +g.player.root.rotation.y.toFixed(3) : null,
      form: g.state.form, hearts: g.player.hearts, level: g.state.level,
    } : null,
    // Only the flags that could explain what he is looking at: a room reads
    // differently once its boss is down or its gate is open, and a report that
    // does not say which state the room was in cannot be reproduced.
    flags: g.state ? compactFlags(g.state.flags) : null,
    settings: g.state ? { easy: !!(g.state.settings || {}).easy,
      captions: !!(g.state.settings || {}).captions,
      reduceMotion: !!(g.state.settings || {}).reduceMotion } : null,
  };
}

// Flags are a deep bag with plenty of `false` in it; only the true ones say
// anything, and the whole bag would swamp the report.
function compactFlags(flags, depth = 0) {
  if (!flags || typeof flags !== 'object' || depth > 2) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(flags)) {
    if (v === true) out[k] = true;
    else if (v && typeof v === 'object') {
      const inner = compactFlags(v, depth + 1);
      if (inner && Object.keys(inner).length) out[k] = inner;
    }
  }
  return out;
}

// EVERY VISIBLE HUD RECTANGLE. This is the half of the screen the canvas
// screenshot cannot see, and it is where a whole class of dad's reports lives
// ("the LV overlaps the shards"). Rectangles make that provable.
function hudRects() {
  const out = [];
  document.querySelectorAll('#hud, #hud-top, #hud-top *, #hearts, #shards, #pups, #buffs, #level-badge, #form-badge, #special, #moon-gauge, #badge').forEach((el) => {
    if (!el.id && !el.className) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;                    // not on screen
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    out.push({ id: el.id || null, cls: el.className || null,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
}

// --- the tap ---------------------------------------------------------------
// What he pointed at, in two forms. The LIVE hit is a hint and says so when the
// mesh it found is a merged batch. The camera block is the part that actually
// matters: position, orientation and lens are enough to rebuild this exact ray
// offline against a room built unbatched, where every prop still has its name.
function readTap(ev) {
  const g = window.__game;
  if (!g || !g.camera || !g.renderer) return null;
  const canvas = g.renderer.domElement;
  const r = canvas.getBoundingClientRect();
  const ndcX = ((ev.clientX - r.left) / r.width) * 2 - 1;
  const ndcY = -((ev.clientY - r.top) / r.height) * 2 + 1;

  const cam = g.camera;
  cam.updateMatrixWorld(true);
  const camRec = {
    pos: [+cam.position.x.toFixed(3), +cam.position.y.toFixed(3), +cam.position.z.toFixed(3)],
    quat: [+cam.quaternion.x.toFixed(5), +cam.quaternion.y.toFixed(5),
      +cam.quaternion.z.toFixed(5), +cam.quaternion.w.toFixed(5)],
    fov: cam.fov, aspect: cam.aspect, near: cam.near, far: cam.far,
    zoom: cam.zoom,
  };

  let hit = null;
  try {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    const root = g.world && g.world.root;
    const hits = root ? ray.intersectObject(root, true).filter((h) => h.object.visible) : [];
    if (hits.length) {
      const h = hits[0];
      const chain = [];
      for (let n = h.object; n && chain.length < 6; n = n.parent) chain.push(n.name || n.type);
      const name = h.object.name || '';
      hit = {
        name: name || null,
        material: (h.object.material && h.object.material.name) || null,
        geometry: h.object.geometry ? h.object.geometry.type : null,
        point: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)],
        distance: +h.distance.toFixed(2),
        chain,
        // Said out loud rather than left to be discovered: a merged mesh cannot
        // identify the prop, and the offline re-cast is the answer.
        batched: /batch/i.test(name) || /batch/i.test(chain.join(' ')),
      };
    }
  } catch (e) { hit = { error: String(e && e.message || e) }; }

  return { ndc: [+ndcX.toFixed(4), +ndcY.toFixed(4)],
    screen: [Math.round(ev.clientX), Math.round(ev.clientY)], camera: camRec, hit };
}

// --- the frame -------------------------------------------------------------
// Wrapped once, rather than five call sites edited. The renderer has no
// preserveDrawingBuffer, so this is the only moment the pixels exist.
function hookRenderer() {
  const g = window.__game;
  if (!g || !g.renderer || g.renderer.__devWrapped) return;
  const orig = g.renderer.render.bind(g.renderer);
  g.renderer.render = (scene, cam) => {
    orig(scene, cam);
    if (pendingShot) {
      const done = pendingShot; pendingShot = null;
      try { done(shrink(g.renderer.domElement)); }
      catch (e) { console.warn('[dev] capture failed', e); done(null); }
    }
  };
  g.renderer.__devWrapped = true;
}

// A tablet screenshot at full resolution is a megabyte of PNG. 960px of JPEG
// is about a tenth of that and still shows a floating rock perfectly well.
function shrink(canvas) {
  const w = Math.min(SHOT_W, canvas.width);
  const h = Math.round(canvas.height * (w / canvas.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(canvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', SHOT_QUALITY);
}

// A PAUSED GAME NEVER RENDERS, AND A CRASHED ONE NEVER RENDERS AGAIN. The
// capture rides the next draw, so with the menu open — or with the error
// handler firing after the loop has already died — waiting for one would hang
// the report form forever and lose the note he was about to type. After a beat
// the report goes ahead without a picture, which is still worth having: the
// room, the position and the words are most of what makes it actionable.
function grabFrame(ms = 2500) {
  return new Promise((res) => {
    let done = false;
    pendingShot = (data) => { if (!done) { done = true; res(data); } };
    // ASK FOR THE FRAME, DO NOT WAIT FOR ONE.
    //
    // The first cut armed the hook and waited for the loop to come round, and
    // the suite caught it capturing nothing at all: every field of the report
    // was right and the picture was empty. Worse, the cases where it would
    // most often fail are the ones that matter — the armoury, the map and the
    // pause menu all hold the world still, and a HUD complaint is exactly the
    // kind he wants to photograph. Rendering one frame on demand is
    // synchronous, so the wrapper fires before this function returns and
    // toDataURL sees pixels that certainly exist. The timeout stays as a
    // backstop for the case where the loop has died and taken the scene with
    // it; a report with no picture still carries the room and the words.
    try {
      const g = window.__game;
      if (g && g.renderer && g.scene && g.camera) g.renderer.render(g.scene, g.camera);
    } catch (e) { console.warn('[dev] forced render failed', e); }
    if (!done) setTimeout(() => { if (!done) { done = true; pendingShot = null; res(null); } }, ms);
  });
}

// --- the report ------------------------------------------------------------
async function makeReport({ tap, note, kind }) {
  hookRenderer();
  const shot = await grabFrame();
  const rec = {
    n: ++seq,
    at: new Date().toISOString(),
    kind,                                   // 'tap' | 'frame' | 'note' | 'error'
    note: note || '',
    ...snapshotState(),
    tap: tap || null,
    hud: hudRects(),
    shot,
  };
  reports.push(rec);
  await dbPut(rec);
  paint();
  return rec;
}

// --- the export ------------------------------------------------------------
// One self-contained HTML file. He opens it, flicks through what he reported,
// and sends the same file on — no unzipping, nothing to go missing, and it
// reads as plain text at the other end. The JSON is embedded whole underneath
// the pictures, because that is the half that gets acted on.
function exportHtml(list) {
  const rows = list.map((r) => `
  <section>
    <h2>#${r.n} · ${esc(r.room || '(no room)')} · ${esc(r.kind)}</h2>
    <p class="note">${esc(r.note || '(no note)')}</p>
    ${r.shot ? `<img src="${r.shot}" alt="report ${r.n}">` : '<p class="none">(no frame captured)</p>'}
    <dl>
      <dt>room</dt><dd>${esc(r.room)}</dd>
      <dt>player</dt><dd>${r.player ? `x ${r.player.x}, z ${r.player.z} · ${esc(r.player.form)}` : '—'}</dd>
      ${r.tap && r.tap.hit ? `<dt>tapped</dt><dd>${esc(r.tap.hit.name || r.tap.hit.material || r.tap.hit.geometry || '?')}
        at (${(r.tap.hit.point || []).join(', ')})${r.tap.hit.batched ? ' <b>[merged mesh — re-cast offline]</b>' : ''}</dd>` : ''}
      <dt>build</dt><dd>${esc(r.version)}</dd>
      <dt>when</dt><dd>${esc(r.at)}</dd>
    </dl>
  </section>`).join('\n');

  return `<!doctype html><meta charset="utf-8">
<title>Wolf Knight — play-test report</title>
<style>
 body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#14121a;color:#e8e4f0}
 h1{font-size:22px;margin:0 0 4px}
 .sub{color:#9d94b5;margin:0 0 24px}
 section{background:#1e1b28;border:1px solid #2e2a3d;border-radius:10px;padding:16px;margin:0 0 20px}
 h2{font-size:16px;margin:0 0 8px;color:#ffd08a}
 .note{font-size:16px;margin:0 0 12px}
 .none{color:#7d7590}
 img{max-width:100%;border-radius:6px;display:block;margin:0 0 12px}
 dl{display:grid;grid-template-columns:90px 1fr;gap:2px 12px;margin:0;font-size:13px;color:#bdb5cf}
 dt{color:#7d7590}
 pre{white-space:pre-wrap;word-break:break-word;font-size:11px;color:#8b83a3;
     background:#17151f;border-radius:8px;padding:12px;max-height:60vh;overflow:auto}
</style>
<h1>Wolf Knight — play-test report</h1>
<p class="sub">${list.length} report${list.length === 1 ? '' : 's'} · exported ${new Date().toISOString()}</p>
${rows}
<h1>Data</h1>
<p class="sub">Everything above, machine-readable. The screenshots are stripped here so it stays skimmable — they are in the pictures.</p>
<pre>${esc(JSON.stringify(list.map(({ shot, ...rest }) => rest), null, 1))}</pre>`;
}

function esc(s) {
  return String(s === undefined || s === null ? '—' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function doExport() {
  const list = (await dbAll()).sort((a, b) => a.n - b.n);
  if (!list.length) { toast('nothing to export yet'); return; }
  const blob = new Blob([exportHtml(list)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const name = `wolfknight-report-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.html`;
  const a = document.createElement('a');
  a.className = 'ui dev-savelink';
  a.href = url; a.download = name; a.textContent = 'save report';
  document.body.appendChild(a);
  a.click();
  // AND A LINK THAT SURVIVES THE TAP. On iPad a programmatic download is
  // frequently swallowed, and losing an evening of reports to that would be
  // worse than an untidy panel — so the link stays on screen to be long-pressed
  // and shared, and only clears when the panel is closed.
  ui.link.innerHTML = '';
  ui.link.appendChild(a);
  toast(`exported ${list.length} — tap the link if nothing downloaded`);
}

// --- the panel -------------------------------------------------------------
function css() {
  const s = document.createElement('style');
  s.textContent = `
 #dev-badge{position:fixed;left:8px;bottom:8px;z-index:9998;font:600 11px/1 system-ui,sans-serif;
   letter-spacing:.12em;color:#14121a;background:#ffd08a;padding:5px 8px;border-radius:4px;
   pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.4)}
 #dev-bar{position:fixed;left:8px;bottom:32px;z-index:9998;display:flex;flex-direction:column;gap:6px}
 #dev-bar button{font:600 12px/1 system-ui,sans-serif;letter-spacing:.06em;color:#e8e4f0;
   background:rgba(30,27,40,.92);border:1px solid #3a3450;border-radius:6px;padding:9px 11px;
   min-width:84px;text-align:left;cursor:pointer}
 #dev-bar button:active{background:#3a3450}
 #dev-count{color:#ffd08a}
 #dev-aim{position:fixed;inset:0;z-index:9999;background:rgba(20,18,26,.35);
   display:flex;align-items:flex-start;justify-content:center;padding-top:14vh}
 #dev-aim p{font:600 15px/1.4 system-ui,sans-serif;color:#fff;background:rgba(20,18,26,.9);
   padding:12px 16px;border-radius:8px;text-align:center;max-width:80vw}
 #dev-aim button{margin-top:10px;font:600 12px system-ui,sans-serif;color:#e8e4f0;
   background:#2e2a3d;border:1px solid #4a4463;border-radius:6px;padding:8px 12px;cursor:pointer}
 #dev-form{position:fixed;inset:0;z-index:10000;background:rgba(20,18,26,.94);
   display:flex;flex-direction:column;gap:10px;padding:18px;
   font:14px/1.5 system-ui,sans-serif;color:#e8e4f0;overflow:auto}
 #dev-form h3{margin:0;font-size:15px;color:#ffd08a}
 #dev-form .where{font-size:12px;color:#9d94b5;word-break:break-word}
 #dev-form textarea{width:100%;min-height:5em;font:15px/1.4 system-ui,sans-serif;
   color:#e8e4f0;background:#1e1b28;border:1px solid #3a3450;border-radius:8px;padding:10px;
   box-sizing:border-box;resize:vertical}
 #dev-form img{max-width:100%;max-height:34vh;object-fit:contain;border-radius:6px;align-self:center}
 #dev-form .row{display:flex;gap:10px}
 #dev-form button{flex:1;font:600 14px system-ui,sans-serif;color:#14121a;background:#ffd08a;
   border:0;border-radius:8px;padding:12px;cursor:pointer}
 #dev-form button.ghost{color:#e8e4f0;background:#2e2a3d}
 #dev-toast{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:10001;
   font:600 13px system-ui,sans-serif;color:#14121a;background:#ffd08a;padding:9px 14px;
   border-radius:6px;pointer-events:none;opacity:0;transition:opacity .2s}
 #dev-toast.on{opacity:1}
 .dev-savelink{display:block;margin-top:8px;color:#ffd08a;font:600 12px system-ui,sans-serif}`;
  document.head.appendChild(s);
}

// EVERY DEV ELEMENT CARRIES `.ui`. That is not decoration: js/input.js bails
// out of _onDown the moment a tap lands inside `.ui` ("HTML UI wins"), which is
// how the game already keeps its own buttons from also swinging the sword.
// Reporting a bug must never attack something, and the aim overlay in
// particular has to swallow the tap it is there to read.
function el(tag, id, text) {
  const e = document.createElement(tag);
  if (id) e.id = id;
  e.className = 'ui';
  if (text !== undefined) e.textContent = text;
  return e;
}

function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('on');
  clearTimeout(ui.toast._t);
  ui.toast._t = setTimeout(() => ui.toast.classList.remove('on'), 2200);
}

function paint() {
  ui.count.textContent = String(reports.length);
}

// He taps SHOT, then taps the thing that is wrong. Two taps, because the second
// one is the whole point: it is the only moment anyone in the world knows which
// object of the several hundred in the room is the broken one.
function armTap() {
  if (armed) return;
  armed = true;
  const aim = el('div', 'dev-aim');
  const p = el('p', null, 'Tap the thing that is wrong.');
  const skip = el('button', null, "It's not an object — just take the picture");
  skip.className = 'ui';
  p.appendChild(document.createElement('br'));
  p.appendChild(skip);
  aim.appendChild(p);
  document.body.appendChild(aim);

  const finish = async (tap, kind) => {
    armed = false;
    aim.remove();
    const rec = await makeReport({ tap, kind });
    openForm(rec);
  };
  skip.addEventListener('pointerdown', (e) => { e.stopPropagation(); finish(null, 'frame'); });
  aim.addEventListener('pointerdown', (e) => {
    // the overlay is transparent to the eye but not to the finger, so the tap
    // is read here and never reaches the game — no accidental attacks while
    // reporting a bug
    e.preventDefault(); e.stopPropagation();
    finish(readTap(e), 'tap');
  });
}

function openForm(rec) {
  const f = el('div', 'dev-form');
  const h = el('h3', null, `Report #${rec.n} — ${rec.room || 'unknown room'}`);
  const where = el('div', null, describe(rec));
  where.className = 'ui where';
  const img = document.createElement('img');
  img.className = 'ui';
  if (rec.shot) img.src = rec.shot;
  const ta = document.createElement('textarea');
  ta.className = 'ui';
  ta.placeholder = "What's wrong with it?";
  const row = el('div'); row.className = 'ui row';
  const save = el('button', null, 'Save');
  const drop = el('button', null, 'Discard'); drop.className = 'ui ghost';
  row.appendChild(save); row.appendChild(drop);
  f.appendChild(h); f.appendChild(where);
  if (rec.shot) f.appendChild(img);
  f.appendChild(ta); f.appendChild(row);
  document.body.appendChild(f);
  setTimeout(() => ta.focus(), 50);

  save.addEventListener('pointerdown', async () => {
    rec.note = ta.value.trim();
    await dbPut(rec);
    f.remove();
    toast(`saved #${rec.n}`);
  });
  drop.addEventListener('pointerdown', async () => {
    reports = reports.filter((r) => r.n !== rec.n);
    try {
      const db = await idb();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(rec.n);
    } catch { /* the in-memory list is what the panel counts */ }
    f.remove(); paint(); toast('discarded');
  });
}

function describe(rec) {
  const bits = [];
  if (rec.player) bits.push(`stood at (${rec.player.x}, ${rec.player.z}) as ${rec.player.form}`);
  if (rec.tap && rec.tap.hit) {
    const h = rec.tap.hit;
    bits.push(`tapped ${h.name || h.material || h.geometry || 'something'} at (${(h.point || []).join(', ')})${h.batched ? ' — merged mesh, will be identified offline' : ''}`);
  } else if (rec.kind === 'tap') {
    bits.push('tapped empty space');
  }
  return bits.join(' · ') || '—';
}

// A note with no picture, for the things a screenshot cannot hold: "this fight
// is too hard", "the music stopped". Still carries the room and the position,
// which is most of what makes a complaint actionable.
function quickNote() {
  makeReport({ kind: 'note' }).then(openForm);
}

export function initDevMode() {
  if (!ON || ui) return;
  css();

  ui = {};
  ui.badge = el('div', 'dev-badge', 'DEV MODE');
  const bar = el('div', 'dev-bar');
  const shot = el('button', null, 'REPORT');
  const note = el('button', null, 'NOTE');
  const out = el('button', null, 'EXPORT ');
  ui.count = el('span', 'dev-count', '0');
  out.appendChild(ui.count);
  ui.link = el('div');
  bar.appendChild(shot); bar.appendChild(note); bar.appendChild(out); bar.appendChild(ui.link);
  ui.toast = el('div', 'dev-toast');
  document.body.appendChild(ui.badge);
  document.body.appendChild(bar);
  document.body.appendChild(ui.toast);

  shot.addEventListener('pointerdown', (e) => { e.stopPropagation(); armTap(); });
  note.addEventListener('pointerdown', (e) => { e.stopPropagation(); quickNote(); });
  out.addEventListener('pointerdown', (e) => { e.stopPropagation(); doExport(); });

  hookRenderer();

  // AN ERROR IS THE ONE BUG HE WOULD NEVER THINK TO PHOTOGRAPH, because by the
  // time anything looks wrong the moment has passed. These file themselves.
  window.addEventListener('error', (ev) => {
    makeReport({ kind: 'error', note: `AUTO: ${ev.message} (${ev.filename}:${ev.lineno})` })
      .then(() => toast('an error was captured'));
  });
  window.addEventListener('unhandledrejection', (ev) => {
    makeReport({ kind: 'error', note: `AUTO: unhandled rejection — ${ev.reason && ev.reason.message || ev.reason}` });
  });

  // Pick up anything from before a reload or a crash, so a session survives
  // the thing that ended it.
  dbAll().then((list) => {
    reports = list.sort((a, b) => a.n - b.n);
    seq = reports.reduce((m, r) => Math.max(m, r.n), 0);
    paint();
    if (reports.length) toast(`${reports.length} report(s) carried over`);
  });

  // `__dev.clear()` from the console when a batch has been sent and acted on.
  window.__dev = { reports: () => reports.slice(), export: doExport,
    clear: async () => { await dbClear(); reports = []; seq = 0; paint(); toast('cleared'); } };

  console.log('[dev] DEV MODE on — REPORT / NOTE / EXPORT, bottom left');
}

// THE WAY IN WITH NO URL. Armed whether dev mode is on or off, because when it
// is off it is the only way to turn it on from the installed app. It is one
// listener on one element and it creates nothing until it fires.
function armBadgeToggle() {
  const badge = document.getElementById('badge');
  if (!badge || badge.__devArmed) return;
  badge.__devArmed = true;
  badge.style.pointerEvents = 'auto';
  let timer = null;
  const start = () => {
    timer = setTimeout(() => {
      timer = null;
      const now = !ON;
      remember(now);
      // A reload is the honest switch: turning dev mode ON has to run the
      // module's setup, and turning it OFF has to leave nothing behind. Both
      // are exactly what a fresh load does.
      location.reload();
    }, 1500);
  };
  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
  badge.addEventListener('pointerdown', start);
  badge.addEventListener('pointerup', stop);
  badge.addEventListener('pointercancel', stop);
  badge.addEventListener('pointerleave', stop);
}

// UP BEFORE THE GAME IS. main.js calls initDevMode() when a room is entered,
// which is three call sites too late for two real cases: a bug on the title
// screen or in a menu, and a RELOAD — after which the panel would not come back
// until a profile had been picked, and the carried-over session looked lost.
// The panel needs nothing from the game to exist (the renderer hook heals
// itself on the first capture), so it comes up as soon as there is a body to
// put it in. Every call is idempotent, so the ones in main.js stay as the
// visible wiring.
function boot() {
  armBadgeToggle();          // always — it is the way back in when ON is false
  if (ON) initDevMode();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
