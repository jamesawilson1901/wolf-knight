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
  ['The Den', 'Home, and where the survivors you free turn up afterwards.', [
    ['den', 'home base'],
  ], 'den'],
  ['Ember Hollow — ruined and sad', 'Level 1 · somewhere people LIVED before it burned.', [
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
    ['ld1', 'THE ORDER HALL — puzzle room, dressed at the perimeter only'],
    ['lg4', 'THE BOSS DOOR — the quietest room in Ember'],
    ['le', 'E · HEART OF THE HOLLOW — the Shadowgrip. Arena: edges only'],
  ], 'ember'],
  ['Stoneroot Caverns — buried and waiting',
   'Level 2 · something enormous was carved here, and the dark has been sitting on it since.', [
    ['vh', 'THE GREAT VAULT — the hub. Old Bram’s fire is the only warm thing in it'],
    ['vga', 'THE CRYSTAL MOUTH — rest'],
    ['va1', 'A1 · THE GLIMMERWAY — slimes'],
    ['va2', 'A2 · THE GEODE — the practice cracks'],
    ['vap', 'Glitter Pocket — optional, pup'],
    ['va3', 'PETRA’S SPARK — the EARTH WOLF is granted here. Empty middle: ceremony'],
    ['vgb', 'THE CHALK MOUTH — rest'],
    ['vb1', 'B1 · THE BONE QUARRY — terraces'],
    ['vb2', 'B2 · THE RIBCAGE — Bone Brutes'],
    ['vbp', 'The Chalk Seam — optional, chest'],
    ['vb3', 'THE RATTLE — puzzle room, dressed at the perimeter only'],
    ['vgc', 'THE WET MOUTH — rest. Past here the workings flooded'],
    ['vc1', 'C1 · THE SUNKEN STAIR — shieldlings'],
    ['vc2', 'C2 — the THORN promise gate'],
    ['vcp', 'the last dry pocket — gold chest'],
    ['vc3', 'the pin'],
    ['vz', 'THE WARDEN. Arena: edges only'],
  ], 'stone'],
  ['The Wild Woods — beautiful and sick',
   'Level 3 · the loveliest place in the world, rotting from the inside. The rot rises room by room as you walk in — 10% at the edge, 90% at the heart.', [
    ['t1a', 'THORNEDGE — rot 10%'], ['t1b', 'rot 15%'], ['t1p', 'optional'],
    ['tc1', 'rest'],
    ['t2a', 'THE GLOOMWOOD — rot 30%'], ['t2b', 'rot 38%'], ['t2p', 'optional'],
    ['tsh', 'the shelter'], ['tc2', 'rest'],
    ['t3a', 'THE ROOTBOUND DEEP — rot 55%'], ['t3b', 'rot 62%'], ['t3p', 'optional'],
    ['tkn', 'THE KNOT — puzzle room, dressed at the perimeter only'], ['tc3', 'rest'],
    ['t4a', 'THE BLOOMFALL — rot 78%. Blossom drifts on leaf litter'],
    ['t4b', 'rot 85%'], ['t4p', 'optional'], ['tc4', 'rest'],
    ['tgl', 'SYLVA’S GLADE. Arena: edges only'],
    ['tsA', 'secret shortcut'], ['tsB', 'secret shortcut'],
  ], 'woods'],
  // THE BACK HALF OF THE GAME was never on this sheet — the same hand-kept
  // rot every room list in tools/ carried (2026-08-30). A review page that
  // shows regions 1-3 of a nine-region game reviews a third of the game.
  ['Frostpeak — the cold, high hush', 'Level 4 · the old build, still played: braziers, the frozen lake, Boreal.', [
    ['f1', 'THE RIME GATE — arrival'], ['f1b', 'the ice pocket — Rime Plate chest'],
    ['f2', 'THE ICEBOUND HALL — braziers melt the way'], ['f2b', 'the Glacier Nook'],
    ['f3', 'THE FROZEN LAKE — skidding boulders, two plates'],
    ['f4', 'THE WINDSCOUR'], ['f5', 'BOREAL'],
  ], 'frost'],
  ['Stormreach Cliffs — a climb into weather', 'Level 5 · a switchback up the sea-cliffs; the wind is the wall.', [
    ['s1a', 'THE LANDING'], ['s1b', 'up from the shore'], ['s1p', 'optional'],
    ['sc1', 'rest'], ['s2a', 'THE GALESTAIR'], ['s2b', 'higher'], ['s2p', 'optional'],
    ['ssh', 'the shrine (storm detour)'], ['sc2', 'rest'],
    ['s3a', 'THE THUNDER SHELF'], ['s3b', 'higher'], ['s3p', 'optional'],
    ['svn', 'the weathervane room (detour)'], ['sc3', 'rest'],
    ['s4a', 'THE OPEN SKY'], ['s4b', 'the last pitch'], ['s4p', 'optional'],
    ['sc4', 'rest'], ['scr', 'THE CROWN — Aria'],
    ['ssA', 'secret shortcut'],
  ], 'storm'],
  ['The Sunken Vale — four shores that drowned', 'Level 6 · a lagoon that becomes a hub; Meri under it all.', [
    ['d1a', 'THE SHALLOWS'], ['d1b', 'deeper in'], ['d1p', 'optional'],
    ['dg1', 'rest'], ['d2a', 'THE REEDS'], ['d2b', 'deeper'], ['d2p', 'optional'],
    ['dsh', 'the shrine (tide detour)'], ['dg2', 'rest'],
    ['d3a', 'THE DROWNED TOWN'], ['d3b', 'deeper'], ['d3p', 'optional'],
    ['dtp', 'the tide pools'], ['dg3', 'rest'],
    ['d4a', 'THE SALT FLATS'], ['d4b', 'the last shore'], ['d4p', 'optional'],
    ['dg4', 'rest'], ['dlg', 'THE LAGOON'], ['ddp', 'THE DEEP — Meri'],
  ], 'vale'],
  ['The Shadow Court — one palace, four wings', 'Level 7 · four relics open the throne; Grimm at the top.', [
    ['x1', 'THE APPROACH'], ['xsh', 'the shrine'], ['xh', 'THE GREAT HALL — hub'],
    ['xa1', 'Ash Wing'], ['xa2', 'deeper'], ['xa3', 'the relic'],
    ['xr1', 'Root Wing'], ['xr2', 'deeper'], ['xr3', 'the relic'],
    ['xg1', 'Tide Wing'], ['xg2', 'deeper'], ['xg3', 'the relic'],
    ['xm1', 'Mirror Wing'], ['xm2', 'deeper'], ['xm3', 'the relic'],
    ['xp1', 'pocket'], ['xp2', 'pocket'],
    ['xst', 'THE THRONE STAIR'], ['xth', 'THE THRONE — Grimm'],
  ], 'court'],
  ['The Village — cleared street by street', 'Epilogue · overrun and dark until all six guardians fall; then the sun.', [
    ['ysq', 'THE VILLAGE SQUARE — the tree, the well, two streets'],
    ['yhs', 'THE HIGH STREET'], ['yg1', 'The Gate House'], ['yg2', 'The Market Row'], ['yg3', 'The Mill'],
    ['ylw', 'THE LOW LANES'], ['yg4', 'The Bell Tower'], ['yg5', 'The Back Alley'], ['yg6', 'The Chapel Roof'],
    ['yrw', 'THE WELL — a rescued pup, a chest'],
  ], 'village'],
  ['The Moonlit Spire — the finale', 'The last climb: the jump room, two trials, and the Elemental Wolf at the crown.', [
    ['m1', 'THE BROKEN ASCENT — the game\'s first REQUIRED jumps'],
    ['m2', 'THE HALL OF SIGILS — two trials off it, the last door barred'],
    ['ma', 'THE TRIAL OF STONE'], ['mb', 'THE TRIAL OF EMBERS'],
    ['m3', 'THE MOON\'S CROWN — Luna, and the Elemental Wolf'],
  ], 'spire'],
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
  return `      <figure><img loading="lazy" src="${u}" alt="the arrival frame of room ${id}">
        <figcaption><span class="id">${id}</span>${beat}</figcaption></figure>`;
}).join('\n');

// DESIGN NOTE. This is a review document, not a landing page, so the treatment
// is utilitarian-polished: real hierarchy, considered spacing, no flourish.
//
// The one structural decision that carries information: each region's accent IS
// that region's own district colour from the game — Ember's ember orange,
// Stoneroot's cold blue, the Wild Woods' green. Scrolling the page therefore
// runs through the same colour arc the game does, and a section's rail matches
// the screenshots sitting under it. The neutral is an ash grey pulled toward
// the same warmth rather than a pure grey.
//
// Serif headings against a humanist sans body, with a mono for room ids —
// paired from stacks rather than webfonts, because the Artifact CSP blocks font
// CDNs and a linked face would fall back silently.
const ACCENTS = { ember: '#c2622a', stone: '#5f8bab', woods: '#74a049', den: '#a8863f' };

const html = `<title>Wolf Knight — every room</title>
<style>
  :root {
    --ground: #eceae5; --card: #fbfaf8; --ink: #1b1a17; --dim: #6d6860;
    --line: #dcd7cf; --rail: #c8c2b8;
    --ember: ${ACCENTS.ember}; --stone: ${ACCENTS.stone};
    --woods: ${ACCENTS.woods}; --den: ${ACCENTS.den};
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #131210; --card: #1c1a16; --ink: #ece8e0; --dim: #9a948a;
      --line: #2b2822; --rail: #3a352d;
      --ember: #e8853f; --stone: #7fb0d2; --woods: #93c063; --den: #cfa855;
    }
  }
  :root[data-theme="dark"] {
    --ground: #131210; --card: #1c1a16; --ink: #ece8e0; --dim: #9a948a;
    --line: #2b2822; --rail: #3a352d;
    --ember: #e8853f; --stone: #7fb0d2; --woods: #93c063; --den: #cfa855;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font: 16px/1.6 "Segoe UI", Roboto, -apple-system, system-ui, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 32px 20px 96px; }
  h1 {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: clamp(28px, 5vw, 44px); font-weight: 600; letter-spacing: -0.015em;
    margin: 0 0 8px; text-wrap: balance;
  }
  .sub { color: var(--dim); margin: 0 0 26px; max-width: 62ch; }
  .note {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 16px 18px; margin: 0 0 12px; max-width: 78ch;
  }
  .note p { margin: 0 0 10px; } .note p:last-child { margin: 0; }
  .note b { font-weight: 650; }
  section { margin-top: 46px; }
  .band { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
    padding-left: 14px; border-left: 4px solid var(--accent); }
  section.ember { --accent: var(--ember); }
  section.stone { --accent: var(--stone); }
  section.woods { --accent: var(--woods); }
  section.den   { --accent: var(--den); }
  section.frost   { --accent: #9be3ff; }   /* Boreal's pale ice   */
  section.storm   { --accent: #c9d4ff; }   /* Aria's storm-light  */
  section.vale    { --accent: #4fd0e0; }   /* Meri's lagoon       */
  section.court   { --accent: #b45cff; }   /* the shadow violet   */
  section.village { --accent: #d8a44a; }   /* restored-sun warmth */
  section.spire   { --accent: #d8cfff; }   /* moonlit silver      */
  h2 {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: clamp(20px, 3.2vw, 28px); font-weight: 600; letter-spacing: -0.01em;
    margin: 0; color: var(--accent);
  }
  .count { font-size: 13px; color: var(--dim); font-variant-numeric: tabular-nums;
    text-transform: uppercase; letter-spacing: 0.07em; }
  .lead { color: var(--dim); margin: 8px 0 18px 18px; max-width: 66ch; font-size: 15px; }
  .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
  figure {
    margin: 0; background: var(--card); border: 1px solid var(--line);
    border-radius: 10px; overflow: hidden;
  }
  figure img { display: block; width: 100%; height: auto; background: #000; }
  figcaption {
    padding: 10px 13px; font-size: 13.5px; color: var(--dim); line-height: 1.45;
    border-top: 1px solid var(--line);
  }
  figcaption .id {
    font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px; color: var(--accent); letter-spacing: 0.02em;
    margin-right: 7px; font-weight: 600;
  }
  a:focus-visible, figure:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
<div class="wrap">
  <h1>Wolf Knight &mdash; every room</h1>
  <p class="sub">The arrival frame of all 52 spaces, in walk order: exactly what
  the camera shows the moment you step in.</p>

  <div class="note">
    <p><b>What you said.</b> The levels were &ldquo;big but bare&rdquo;, the
    floor was &ldquo;just a generic colour everywhere&rdquo;, and of all the art
    &ldquo;there is only a handful used&rdquo;. These are the same rooms after
    that.</p>
    <p><b>Two kinds of room are deliberately sparse</b>, and are labelled where
    they appear: <b>puzzle rooms</b>, where clutter would compete with the thing
    you have to spot, and <b>boss arenas</b>, where anything you can snag on
    turns a fair dodge into an unfair hit. Everywhere else &mdash; if it still
    looks empty to you, say so and I will fill it.</p>
  </div>

${SECTIONS.map(([title, lead, rooms, cls]) => {
  const body = cards(rooms);
  const n = rooms.filter(([id]) => existsSync(`${dir}/${id}.png`)).length;
  return `  <section class="${cls}">
    <div class="band"><h2>${title}</h2><span class="count">${n} ${n === 1 ? 'space' : 'spaces'}</span></div>
    <p class="lead">${lead}</p>
    <div class="grid">
${body}
    </div>
  </section>`;
}).join('\n')}
</div>`;

writeFileSync(out, html);
console.log(`${shown} rooms, ${(bytes / 1e6).toFixed(1)} MB of PNG -> ${out} ` +
  `(${(statSync(out).size / 1e6).toFixed(1)} MB page)`);
if (missing.length) console.log('MISSING shots: ' + missing.join(' '));
