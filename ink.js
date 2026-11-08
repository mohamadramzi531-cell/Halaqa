// ink.js: drawing on the Mushaf page.
// Two canvases sit on the page: highlighter strokes go UNDER the text (letters stay crisp),
// pen strokes go OVER it. Strokes are stored as vectors in page coordinates, so they
// line up again at any zoom level and are small enough to save for every student.

const r1 = (v) => Math.round(v * 10) / 10;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const centroid = (pts) => {
  let x = 0;
  let y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return x * x + y * y;
}

function bbox(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i] < x0) x0 = pts[i];
    if (pts[i] > x1) x1 = pts[i];
    if (pts[i + 1] < y0) y0 = pts[i + 1];
    if (pts[i + 1] > y1) y1 = pts[i + 1];
  }
  return [x0, y0, x1, y1];
}

export class InkBoard {
  /**
   * @param {{page: HTMLElement, hlCanvas: HTMLCanvasElement, penCanvas: HTMLCanvasElement, input: HTMLElement, width: number}} o
   */
  constructor({ page, hlCanvas, penCanvas, input, width }) {
    this.page = page;
    this.hl = hlCanvas;
    this.pen = penCanvas;
    this.input = input;
    this.hctx = hlCanvas.getContext('2d');
    this.pctx = penCanvas.getContext('2d');
    this.W = width;
    this.H = 1;
    this.k = 1;
    this.strokes = [];
    this.tool = 'pointer';
    this.style = {
      pen: { color: '#c2362b', size: 3.5 },
      highlighter: { color: '#f5c842', size: 22 },
      eraser: { size: 26, mode: 'precise' },
    };
    this.fingerDraws = true;
    this.pointers = new Map();
    this.active = null;
    this.gesture = null;
    this.bb = new WeakMap();
    this.raf = 0;
    this.laser = null;
    // callbacks set by the app
    this.onStroke = null;
    this.onErase = null;
    this.onPan = null;
    this.onPinch = null;
    this.onGestureEnd = null;
    this.onPen = null;
    this.onBegin = null;

    const opt = { passive: false };
    input.addEventListener('pointerdown', (e) => this.down(e), opt);
    input.addEventListener('pointermove', (e) => this.move(e), opt);
    input.addEventListener('pointerup', (e) => this.up(e));
    input.addEventListener('pointercancel', (e) => this.up(e, true));
    input.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------ document
  setStrokes(strokes) {
    this.cancelActive();
    this.strokes = strokes;
    this.bb = new WeakMap();
    this.render();
  }

  resize(W, H, k) {
    this.W = W;
    this.H = H;
    this.k = k;
    for (const cv of [this.hl, this.pen]) {
      cv.width = Math.max(1, Math.round(W * k));
      cv.height = Math.max(1, Math.round(H * k));
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    }
    this.render();
  }

  requestRender() {
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  render() {
    this.paint(this.hctx, 'hl');
    this.paint(this.pctx, 'pen');
  }

  paint(ctx, layer) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    const live = this.active?.stroke;
    for (const s of this.strokes) if (s.t === layer || s.t === 'er') this.drawStroke(ctx, s);
    if (live && (live.t === layer || live.t === 'er')) this.drawStroke(ctx, live);
  }

  // ------------------------------------------------------------ drawing
  widthAt(s, i) {
    if (!s.pr) return s.w;
    const p = s.pts[i * 3 + 2];
    return Math.max(0.6, s.w * (0.35 + 1.3 * p));
  }

  prep(ctx, s) {
    ctx.globalCompositeOperation = s.t === 'er' ? 'destination-out' : 'source-over';
    const color = s.t === 'er' ? '#000' : s.c;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  dot(ctx, s) {
    ctx.beginPath();
    ctx.arc(s.pts[0], s.pts[1], this.widthAt(s, 0) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Segment i of a smoothed stroke: P0 -> mid(P0,P1), then mid(Pi-1,Pi) -> mid(Pi,Pi+1) curving through Pi. */
  segment(ctx, s, i) {
    const p = s.pts;
    ctx.lineWidth = this.widthAt(s, i);
    ctx.beginPath();
    if (i === 0) {
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo((p[0] + p[3]) / 2, (p[1] + p[4]) / 2);
    } else {
      const ax = p[(i - 1) * 3];
      const ay = p[(i - 1) * 3 + 1];
      const x = p[i * 3];
      const y = p[i * 3 + 1];
      const bx = p[(i + 1) * 3];
      const by = p[(i + 1) * 3 + 1];
      ctx.moveTo((ax + x) / 2, (ay + y) / 2);
      ctx.quadraticCurveTo(x, y, (x + bx) / 2, (y + by) / 2);
    }
    ctx.stroke();
  }

  tail(ctx, s) {
    const p = s.pts;
    const n = p.length / 3;
    if (n < 2) return;
    ctx.lineWidth = this.widthAt(s, n - 1);
    ctx.beginPath();
    ctx.moveTo((p[(n - 2) * 3] + p[(n - 1) * 3]) / 2, (p[(n - 2) * 3 + 1] + p[(n - 1) * 3 + 1]) / 2);
    ctx.lineTo(p[(n - 1) * 3], p[(n - 1) * 3 + 1]);
    ctx.stroke();
  }

  drawStroke(ctx, s) {
    const p = s.pts;
    const n = p.length / 3;
    if (!n) return;
    ctx.save();
    this.prep(ctx, s);
    if (n === 1) {
      this.dot(ctx, s);
    } else if (!s.pr) {
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo((p[0] + p[3]) / 2, (p[1] + p[4]) / 2);
      for (let i = 1; i < n - 1; i++) {
        const x = p[i * 3];
        const y = p[i * 3 + 1];
        ctx.quadraticCurveTo(x, y, (x + p[i * 3 + 3]) / 2, (y + p[i * 3 + 4]) / 2);
      }
      ctx.lineTo(p[(n - 1) * 3], p[(n - 1) * 3 + 1]);
      ctx.stroke();
    } else {
      for (let i = 0; i < n - 1; i++) this.segment(ctx, s, i);
      this.tail(ctx, s);
    }
    ctx.restore();
  }

  contextsFor(s) {
    if (s.t === 'er') return [this.hctx, this.pctx];
    return [s.t === 'hl' ? this.hctx : this.pctx];
  }

  /** Draw only the newest piece of the live stroke (fast). */
  drawLatest(s, finalTail = false) {
    const n = s.pts.length / 3;
    for (const ctx of this.contextsFor(s)) {
      ctx.save();
      ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      this.prep(ctx, s);
      if (finalTail) this.tail(ctx, s);
      else if (n === 1) this.dot(ctx, s);
      else this.segment(ctx, s, n - 2);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ input
  touches() {
    return [...this.pointers.values()].filter((p) => p.type === 'touch');
  }

  local(e, rect) {
    const s = rect.width / this.W || 1;
    return {
      x: (e.clientX - rect.left) / s,
      y: (e.clientY - rect.top) / s,
      p: e.pressure > 0 ? e.pressure : 0.5,
    };
  }

  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Palm resting on the screen while writing with a stylus: ignore it.
    if (e.pointerType === 'touch' && this.active?.type === 'pen') return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === 'pen') {
      this.gesture = null;
      this.onPen?.();
    }

    const touches = this.touches();
    if (e.pointerType === 'touch' && (touches.length >= 2 || !this.fingerDraws || this.gesture)) {
      // Two fingers (or finger drawing turned off): move and zoom the page instead of drawing.
      if (this.active && this.active.type === 'touch') this.abort();
      this.startGesture(touches);
      e.preventDefault();
      return;
    }
    if (this.active) return;
    e.preventDefault();
    try { this.input.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.begin(e);
  }

  startGesture(touches) {
    const c = centroid(touches);
    const d = touches.length > 1 ? dist(touches[0], touches[1]) : 0;
    this.gesture = { last: c, lastDist: d };
  }

  move(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (ptr) { ptr.x = e.clientX; ptr.y = e.clientY; }

    if (this.gesture) {
      if (e.pointerType !== 'touch') return;
      e.preventDefault();
      const touches = this.touches();
      if (!touches.length) return;
      const c = centroid(touches);
      this.onPan?.(this.gesture.last.x - c.x, this.gesture.last.y - c.y);
      this.gesture.last = c;
      if (touches.length > 1) {
        const d = dist(touches[0], touches[1]);
        if (this.gesture.lastDist > 0 && Math.abs(d - this.gesture.lastDist) > 2) {
          this.onPinch?.(d / this.gesture.lastDist, c);
          this.gesture.lastDist = d;
        } else if (!this.gesture.lastDist) this.gesture.lastDist = d;
      }
      return;
    }

    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    const rect = this.page.getBoundingClientRect();
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of list.length ? list : [e]) this.extend(ev, rect, e.shiftKey);
  }

  up(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    if (this.gesture) {
      const touches = this.touches();
      if (!touches.length) {
        this.gesture = null;
        this.onGestureEnd?.();
      } else {
        this.startGesture(touches);
      }
      return;
    }
    if (this.active && e.pointerId === this.active.id) {
      if (cancelled && this.active.stroke && this.active.stroke.pts.length < 6) this.abort();
      else this.finish();
    }
  }

  begin(e) {
    const rect = this.page.getBoundingClientRect();
    const pt = this.local(e, rect);
    this.onBegin?.(this.tool);
    const base = { id: e.pointerId, type: e.pointerType };

    if (this.tool === 'laser') {
      this.active = { ...base, laser: true };
      this.laser?.start(e.clientX, e.clientY);
      return;
    }
    if (this.tool === 'eraser' && this.style.eraser.mode === 'stroke') {
      this.active = { ...base, sweep: [] };
      this.sweep(pt);
      return;
    }
    const t = { pen: 'pen', highlighter: 'hl', eraser: 'er' }[this.tool];
    if (!t) return;
    const st = t === 'pen' ? this.style.pen : t === 'hl' ? this.style.highlighter : this.style.eraser;
    const stroke = { id: uid(), t, w: st.size, pts: [] };
    if (t !== 'er') stroke.c = st.color;
    if (t === 'pen' && e.pointerType === 'pen') stroke.pr = 1;
    this.active = { ...base, stroke, start: pt, straight: false };
    this.push(stroke, pt);
  }

  extend(ev, rect, shift) {
    const a = this.active;
    if (!a) return;
    if (a.laser) { this.laser?.move(ev.clientX, ev.clientY); return; }
    const pt = this.local(ev, rect);
    if (a.sweep) { this.sweep(pt); return; }
    const s = a.stroke;
    if (shift && s.t !== 'er') {
      // Hold Shift for a straight line (handy for underlining a line of text).
      s.pts = [r1(a.start.x), r1(a.start.y), 0.5, r1(pt.x), r1(pt.y), 0.5];
      a.straight = true;
      this.requestRender();
      return;
    }
    if (a.straight) {
      a.straight = false;
      this.requestRender();
    }
    this.push(s, pt);
  }

  push(s, pt) {
    const p = s.pts;
    const n = p.length;
    if (n) {
      const dx = pt.x - p[n - 3];
      const dy = pt.y - p[n - 2];
      if (dx * dx + dy * dy < 0.8) return;
    }
    p.push(r1(pt.x), r1(pt.y), Math.round(pt.p * 100) / 100);
    if (!this.active?.straight) this.drawLatest(s);
  }

  finish() {
    const a = this.active;
    this.active = null;
    if (!a) return;
    if (a.laser) { this.laser?.end(); return; }
    if (a.sweep) {
      if (a.sweep.length) this.onErase?.(a.sweep);
      return;
    }
    const s = a.stroke;
    if (!s.pts.length) return;
    this.strokes.push(s);
    if (a.straight) this.render();
    else this.drawLatest(s, true);
    this.onStroke?.(s);
  }

  /** Throw away the stroke in progress (e.g. a second finger landed: the user wants to scroll). */
  abort() {
    const a = this.active;
    this.active = null;
    if (!a) return;
    if (a.laser) this.laser?.end();
    if (a.sweep?.length) {
      for (let i = a.sweep.length - 1; i >= 0; i--) this.strokes.splice(a.sweep[i].index, 0, a.sweep[i].stroke);
    }
    this.render();
  }

  cancelActive() {
    if (this.active) this.abort();
    this.pointers.clear();
    this.gesture = null;
  }

  // ------------------------------------------------------------ whole-stroke eraser
  sweep(pt) {
    const r = this.style.eraser.size / 2;
    let changed = false;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      if (s.t === 'er') continue;
      if (this.hits(s, pt.x, pt.y, r + s.w / 2)) {
        this.active.sweep.push({ stroke: s, index: i });
        this.strokes.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.render();
  }

  hits(s, x, y, tol) {
    let b = this.bb.get(s);
    if (!b) { b = bbox(s.pts); this.bb.set(s, b); }
    if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) return false;
    const p = s.pts;
    const n = p.length / 3;
    const t2 = tol * tol;
    if (n === 1) return (x - p[0]) ** 2 + (y - p[1]) ** 2 <= t2;
    for (let i = 0; i < n - 1; i++) {
      if (segDist2(x, y, p[i * 3], p[i * 3 + 1], p[i * 3 + 3], p[i * 3 + 4]) <= t2) return true;
    }
    return false;
  }
}

/** Laser pointer: a glowing red trail that fades by itself. Nothing is saved. */
export class LaserFx {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.trails = [];
    this.cur = null;
    this.raf = 0;
    this.life = 950;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.d = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(innerWidth * this.d);
    this.cv.height = Math.round(innerHeight * this.d);
    this.cv.style.width = `${innerWidth}px`;
    this.cv.style.height = `${innerHeight}px`;
  }

  start(x, y) {
    this.cur = [{ x, y, t: performance.now() }];
    this.trails.push(this.cur);
    this.kick();
  }

  move(x, y) {
    if (!this.cur) return;
    this.cur.push({ x, y, t: performance.now() });
    this.kick();
  }

  end() {
    this.cur = null;
  }

  kick() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.raf = 0;
    const now = performance.now();
    const { ctx, d } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.trails = this.trails.filter((tr) => {
      while (tr.length > 1 && now - tr[0].t > this.life) tr.shift();
      return tr === this.cur || (tr.length && now - tr[tr.length - 1].t < this.life);
    });

    for (const tr of this.trails) {
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1];
        const b = tr[i];
        const alpha = Math.max(0, 1 - (now - b.t) / this.life);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(255, 70, 52, ${alpha * 0.28})`;
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 92, 72, ${alpha})`;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
      if (tr === this.cur && tr.length) {
        const p = tr[tr.length - 1];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 70, 52, .25)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff5a46';
        ctx.fill();
      }
    }
    if (this.trails.length) this.kick();
  }
}
