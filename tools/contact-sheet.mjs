// CONTACT SHEET — every room in the game on one page, as dad would meet them.
//
// A verifier cannot tell you a room is boring, which is the whole reason
// ROOM-STANDARD.md exists. The counter-measure is not another assertion, it is
// making the rooms EASY TO LOOK AT: fifty-two arrival frames, in walk order,
// on a page that can be flicked through in a minute on a phone.
//
// Images are inlined as data URIs because an Artifact page is served under a
// strict CSP with no external requests allowed — and because a sheet that
// depends on files in /tmp stops working the moment the container is reclaimed.
//
//   node tools/shot.mjs <dir> <rooms...>      # take the shots (DPR=1)
//   node tools/contact-sheet.mjs <dir> <out.html>
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';

const dir = process.argv[2] || '/tmp/shots';
const out = process.argv[3] || '/tmp/rooms.html';

// Walk order, with the story beat each room carries. The order matters more
// than the grid: dad should be able to scroll it the way a child plays it.
const SECTIONS = [
  ['The Den', 'home base', [['den', 'the Den — home, and where rescued survivors turn up']]],
  ['Ember Hollow — ruined and sad', 'Level 1 · somewhere people LIVED before it burned', [
    ['la', 'A · THE ASHFALL — arrival, first Shades'],
    ['la1', 'Ash Warrens — optional, the switchback stores'],
    ['lg1', 'THE FALLEN GATE — rest'],
    ['lb', 'B · EMBER CAUSEWAY — the road in; the Kiln first appears'],
    ['lb1', 'Moth Hollow — optional, pup'],
    ['lb2', 'Scorched Cubby — optional, the FIRE promise gate'],
    ['lg2', 'THE NARROWS — rest'],
    ['lc', 'C · CINDER BRIDGES — lava slabs, Elder Hound'],
    ['lc1', 'The Drowned Forge — optional, heart piece'],
    ['lg3', 'THE EMBER SEAL — rest'],
    ['ld', 'D · THE KILN — the shrine, FIRE WOLF, the gutter run'],
    ['ld1', 'THE ORDER HALL — the puzzle room (perimeter dressing only)'],
    ['lg4', 'THE BOSS DOOR — the quietest room in Ember'],
    ['le', 'E · HEART OF THE HOLLOW — the Shadowgrip (arena, edges only)'],
  ]],
  ['Stoneroot Caverns — buried and waiting', 'Level 2 · something enormous was carved here, and the dark has been sitting on it since', [
    ['vh', 'THE GREAT VAULT — the hub; Old Bram’s fire is the only warm thing in it'],
    ['vga', 'THE CRYSTAL MOUTH — rest'],
    ['va1', 'A1 · THE GLIMMERWAY — slimes'],
    ['va2', 'A2 · THE GEODE — the practice cracks'],
    ['vap', 'Glitter Pocket — optional, pup'],
    ['va3', 'PETRA’S SPARK — EARTH WOLF granted (empty middle: ceremony)'],
    ['vgb', 'THE CHALK MOUTH — rest'],
    ['vb1', 'B1 · THE BONE QUARRY — terraces'],
    ['vb2', 'B2 · THE RIBCAGE — Bone Brutes'],
    ['vbp', 'The Chalk Seam — optional, chest'],
    ['vb3', 'THE RATTLE — the puzzle room (perimeter dressing only)'],
    ['vgc', 'THE WET MOUTH — rest; past here the workings flooded'],
    ['vc1', 'C1 · THE SUNKEN STAIR — shieldlings'],
    ['vc2', 'C2 — the THORN promise gate'],
    ['vcp', 'the last dry pocket — gold chest'],
    ['vc3', 'the pin'],
    ['vz', 'THE WARDEN — arena, edges only'],
  ]],
  ['The Wild Woods — beautiful and sick', 'Level 3 · the loveliest place in the world, rotting from the inside. The rot rises room by room.', [
    ['t1a', 'THORNEDGE — rot 10%'], ['t1b', 'rot 15%'], ['t1p', 'optional'],
    ['tc1', 'rest'],
    ['t2a', 'THE GLOOMWOOD — rot 30%'], ['t2b', 'rot 38%'], ['t2p', 'optional'],
    ['tsh', 'the shelter'], ['tc2', 'rest'],
    ['t3a', 'THE ROOTBOUND DEEP — rot 55%'], ['t3b', 'rot 62%'], ['t3p', 'optional'],
    ['tkn', 'THE KNOT — the puzzle room (perimeter dressing only)'], ['tc3', 'rest'],
    ['t4a', 'THE BLOOMFALL — rot 78%; blossom drifts on leaf litter'],
    ['t4b', 'rot 85%'], ['t4p', 'optional'], ['tc4', 'rest'],
    ['tgl', 'SYLVA’S GLADE — arena, edges only'],
    ['tsA', 'secret'], ['tsB', 'secret'],
  ]],
];

const uri = (id) => {
  const p = `${dir}/${id}.png`;
  if (!existsSync(p)) return null;
  return 'data:image/png;base64,' + readFileSync(p).toString('base64');
};

let bytes = 0, shown = 0, missing = [];
const cards = (rooms) => rooms.map(([id, beat]) => {
  const u = uri(id);
  if (!u) { missing.push(id); return ''; }
  bytes += statSync(`${dir}/${id}.png`).size; shown++;
  return `<figure><img loading="lazy" src="${u}" alt="${id}">
      <figcaption><b>${id}</b> · ${beat}</figcaption></figure>`;
}).join('\n');

const html = `<title>Wolf Knight — every room</title>
<style>
  :root {
    --bg: #f6f3ef; --card: #fff; --ink: #21201d; --dim: #6b665f; --line: #e2ddd5;
    --accent: #b4571f;
  }
  :root:not([data-theme="light"]) { }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #14120f; --card: #1d1a16; --ink: #ece7df; --dim: #a09a90; --line: #2e2a24;
      --accent: #ff9a4a;
    }
  }
  :root[data-theme="dark"] {
    --bg: #14120f; --card: #1d1a16; --ink: #ece7df; --dim: #a09a90; --line: #2e2a24;
    --accent: #ff9a4a;
  }
  body { background: var(--bg); color: var(--ink); margin: 0;
    font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 28px 18px 80px; }
  h1 { font-size: clamp(24px, 4.5vw, 38px); margin: 0 0 6px; letter-spacing: -0.02em; }
  .sub { color: var(--dim); margin: 0 0 28px; }
  h2 { font-size: clamp(18px, 3vw, 25px); margin: 40px 0 2px; letter-spacing: -0.01em; }
  h2 .n { color: var(--accent); }
  .lead { color: var(--dim); margin: 0 0 16px; font-size: 15px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); }
  figure { margin: 0; background: var(--card); border: 1px solid var(--line);
    border-radius: 12px; overflow: hidden; }
  img { display: block; width: 100%; height: auto; }
  figcaption { padding: 9px 12px; font-size: 13px; color: var(--dim);
    border-top: 1px solid var(--line); }
  figcaption b { color: var(--ink); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .note { background: var(--card); border: 1px solid var(--line); border-left: 3px solid var(--accent);
    border-radius: 10px; padding: 14px 16px; margin: 22px 0 6px; font-size: 15px; }
  .note p { margin: 0 0 8px; } .note p:last-child { margin: 0; }
</style>
<div class="wrap">
  <h1>Wolf Knight — every room</h1>
  <p class="sub">The arrival frame of each space, in walk order: exactly what the
  camera shows the moment you step in.</p>

  <div class="note">
    <p><b>What you are looking for.</b> You said the levels were “big but bare”,
    that the floor was “just a generic colour everywhere”, and that of all the
    art “there is only a handful used”. These are the same rooms after that.</p>
    <p>Two kinds of room are <i>deliberately</i> sparse and are labelled as
    such: <b>puzzle rooms</b>, where clutter would compete with the thing you
    have to spot, and <b>boss arenas</b>, where anything you can snag on turns a
    fair dodge into an unfair hit. Everywhere else, if it looks empty, tell me.</p>
  </div>

${SECTIONS.map(([title, lead, rooms]) =>
  `  <h2>${title}</h2>\n  <p class="lead">${lead}</p>\n  <div class="grid">\n${cards(rooms)}\n  </div>`
).join('\n')}
</div>`;

writeFileSync(out, html);
console.log(`${shown} rooms, ${(bytes / 1e6).toFixed(1)} MB of PNG -> ${out} ` +
  `(${(statSync(out).size / 1e6).toFixed(1)} MB page)`);
if (missing.length) console.log('MISSING shots: ' + missing.join(' '));
