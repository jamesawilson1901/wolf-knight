// MATERIALS AS PICTURES (v3.199). Every cost a child is asked to meet — a
// recipe on the Craft tab, a broken bridge in the world — used to be an emoji
// and two numbers ("🪵 3/8"), which is a reading-and-sums task for a player
// who can do neither. This draws each material as one plain shape in its own
// colour, and a cost as a row of DOTS: one per piece needed, filled for every
// piece already carried. "Fill the dots" needs no reading and no counting.
//
// Drawn on a canvas rather than shipped as art, because a material is one
// colour and one silhouette and nothing more; the same canvas becomes an
// <img> in the menus and a sprite texture in the world.
import { MATERIALS } from './materials.js';

const cache = {};

// One silhouette per material, drawn into a 64x64 box.
function paint(ctx, id) {
  const def = MATERIALS[id] || { color: 0x999999 };
  const col = '#' + def.color.toString(16).padStart(6, '0');
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(20,14,24,.85)';
  ctx.fillStyle = col;
  const poly = (pts) => {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  if (id === 'wood') {
    // a log, end on: bark and a ring
    ctx.beginPath(); ctx.roundRect(8, 20, 44, 26, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8c890';
    ctx.beginPath(); ctx.ellipse(48, 33, 9, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,80,40,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(48, 33, 4, 6, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (id === 'ore') {
    poly([[10, 44], [16, 22], [32, 12], [50, 20], [56, 42], [40, 54], [20, 54]]);
    ctx.fillStyle = '#e9e2d4';
    for (const [x, y] of [[26, 30], [40, 38], [32, 44]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  } else if (id === 'ingot') {
    poly([[8, 46], [16, 26], [48, 26], [56, 46]]);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(19, 30, 26, 4);
  } else if (id === 'crystal') {
    poly([[32, 6], [50, 26], [32, 58], [14, 26]]);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, 26); ctx.lineTo(50, 26); ctx.moveTo(32, 6); ctx.lineTo(32, 58); ctx.stroke();
  } else if (id === 'wisp') {
    ctx.beginPath(); ctx.arc(30, 36, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 24); ctx.quadraticCurveTo(54, 12, 52, 6); ctx.lineWidth = 6;
    ctx.strokeStyle = col; ctx.stroke();
  } else {
    // a shard: a tall cut gem in its element's colour
    poly([[32, 4], [46, 22], [40, 58], [24, 58], [18, 22]]);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(32, 4); ctx.lineTo(32, 58); ctx.stroke();
  }
}

export function materialCanvas(id) {
  if (cache[id]) return cache[id];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  paint(c.getContext('2d'), id);
  cache[id] = c;
  return c;
}

export function materialIconURL(id) {
  const c = materialCanvas(id);
  return c._url || (c._url = c.toDataURL());
}

// A cost line for the menus: the picture and a dot per piece needed. Past ten
// the dots wrap; nothing in the game asks for more than fifteen of a thing.
export function costHTML(id, have, need) {
  const name = (MATERIALS[id] && MATERIALS[id].name) || id;
  const dots = [];
  for (let i = 0; i < need; i++) dots.push(`<i class="dot${i < have ? ' on' : ''}"></i>`);
  return `<span class="cost-pic${have >= need ? ' met' : ''}" title="${name}: ${Math.min(have, need)} of ${need}">`
    + `<img src="${materialIconURL(id)}" alt="${name}"><span class="dots">${dots.join('')}</span></span>`;
}

// The same thing drawn for the world: a board with one row per material.
// Returns a canvas; the caller wraps it in a texture and redraws on change.
export function drawCostBoard(canvas, cost, haveOf) {
  const rows = Object.entries(cost);
  const W = 256, rowH = 56;
  canvas.width = W; canvas.height = rows.length * rowH + 16;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(28,20,34,.78)';
  ctx.beginPath(); ctx.roundRect(2, 2, W - 4, canvas.height - 4, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,106,.85)'; ctx.lineWidth = 3; ctx.stroke();
  rows.forEach(([id, need], r) => {
    const y = 8 + r * rowH;
    ctx.drawImage(materialCanvas(id), 10, y, 48, 48);
    const have = Math.min(need, haveOf(id));
    const per = Math.min(need, 8), rad = 7, gap = 21;
    for (let i = 0; i < need; i++) {
      const row2 = i >= per ? 1 : 0, k = i % per;
      const cx = 74 + k * gap, cy = y + (need > per ? 14 + row2 * 20 : 24);
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      if (i < have) { ctx.fillStyle = '#ffd76a'; ctx.fill(); }
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd76a'; ctx.stroke();
    }
  });
  return canvas;
}
