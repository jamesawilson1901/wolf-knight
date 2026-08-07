// PERFORMANCE GUARDRAILS — instrumented from the start, not bolted on later.
//
// Target device: a mid-range Android phone two to three years old, in a
// browser. The budgets (design/METRICS.md):
//     draw calls  < 100 / frame   — mobile GPUs struggle above this
//     triangles   < 500,000       — whole scene
//
// The overlay reads renderer.info, which is the renderer's own count of what
// it actually submitted — not an estimate. It turns RED the moment a budget is
// breached, so a room that costs too much announces itself while it is being
// built rather than during kid-testing.

const DRAW_BUDGET = 100;
const TRI_BUDGET = 500000;

class Perf {
  constructor() {
    this.el = null;
    this.on = false;
    this.renderer = null;
    this._acc = 0;
    this._frames = 0;
    this._fps = 0;
    this._worst = { calls: 0, tris: 0, room: '' };
    this._samples = [];
  }

  attach(renderer) { this.renderer = renderer; }

  _ensureEl() {
    if (this.el) return;
    const d = document.createElement('div');
    d.id = 'perf-hud';
    d.style.cssText = [
      'position:fixed', 'left:8px', 'bottom:8px', 'z-index:40',
      'font:11px/1.45 ui-monospace, Menlo, Consolas, monospace',
      'background:rgba(8,6,14,.82)', 'color:#cfe8d0',
      'padding:6px 9px', 'border-radius:8px', 'pointer-events:none',
      'white-space:pre', 'border:1px solid rgba(255,255,255,.14)',
    ].join(';');
    document.body.appendChild(d);
    this.el = d;
  }

  toggle(force) {
    this.on = force === undefined ? !this.on : !!force;
    this._ensureEl();
    this.el.style.display = this.on ? 'block' : 'none';
  }

  // Called once per rendered frame, AFTER renderer.render().
  sample(dt, roomId) {
    if (!this.renderer) return;
    const info = this.renderer.info;
    const calls = info.render.calls;
    const tris = info.render.triangles;

    // worst-case tracking survives the frame it happened in — a single spike
    // during a room build is exactly what you need to catch
    if (calls > this._worst.calls) this._worst = { calls, tris, room: roomId || '?' };

    this._acc += dt;
    this._frames++;
    if (this._acc >= 0.5) {
      this._fps = this._frames / this._acc;
      this._acc = 0;
      this._frames = 0;
      this._samples.push({ room: roomId, calls, tris, fps: +this._fps.toFixed(1) });
      if (this._samples.length > 400) this._samples.shift();
    }

    if (!this.on || !this.el) return;
    const over = calls > DRAW_BUDGET || tris > TRI_BUDGET;
    this.el.style.color = over ? '#ff9d9d' : '#cfe8d0';
    const bar = (v, max) => {
      const n = Math.min(12, Math.round((v / max) * 12));
      return '#'.repeat(n) + '.'.repeat(12 - n);
    };
    this.el.textContent =
      `room  ${roomId || '-'}\n` +
      `calls ${String(calls).padStart(4)} /${DRAW_BUDGET}  ${bar(calls, DRAW_BUDGET)}\n` +
      `tris  ${(tris / 1000).toFixed(0).padStart(4)}k/${TRI_BUDGET / 1000}k  ${bar(tris, TRI_BUDGET)}\n` +
      `fps   ${this._fps.toFixed(0).padStart(4)}\n` +
      `geom  ${info.memory.geometries}  tex ${info.memory.textures}\n` +
      `worst ${this._worst.calls} calls (${this._worst.room})`;
  }

  // Machine-readable snapshot for the headless verifier.
  report() {
    if (!this.renderer) return null;
    const i = this.renderer.info;
    return {
      calls: i.render.calls, triangles: i.render.triangles,
      geometries: i.memory.geometries, textures: i.memory.textures,
      programs: i.programs ? i.programs.length : null,
      fps: +this._fps.toFixed(1),
      worst: { ...this._worst },
      budgets: { calls: DRAW_BUDGET, triangles: TRI_BUDGET },
      overBudget: i.render.calls > DRAW_BUDGET || i.render.triangles > TRI_BUDGET,
    };
  }

  resetWorst() { this._worst = { calls: 0, tris: 0, room: '' }; }
}

export const perf = new Perf();
