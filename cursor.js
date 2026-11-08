// cursor.js: the custom cursor. A gold eight-pointed star (khatam) trails a small dot;
// it turns into a brush preview for the pen, highlighter and eraser, and a red dot for the laser.
// Only used with a mouse or trackpad. Touch screens keep their normal behaviour.

const STAR = '16,3 19.81,6.81 25.19,6.81 25.19,12.19 29,16 25.19,19.81 25.19,25.19 19.81,25.19 16,29 12.19,25.19 6.81,25.19 6.81,19.81 3,16 6.81,12.19 6.81,6.81 12.19,6.81';

const INTERACTIVE = 'button, a[href], select, label, summary, [role="button"], [role="tab"], [role="radio"], input[type="range"], input[type="checkbox"], input[type="radio"], input[type="color"], .w, .ae';
const TEXT_FIELD = 'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="button"]), textarea, [contenteditable="true"]';

export class FancyCursor {
  constructor() {
    this.fine = matchMedia('(hover: hover) and (pointer: fine)');
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)');
    this.style = 'noor';
    this.tool = 'pointer';
    this.color = '#c2362b';
    this.size = 10;
    this.x = -200;
    this.y = -200;
    this.rx = -200;
    this.ry = -200;
    this.raf = 0;
    this.visible = false;

    const el = document.createElement('div');
    el.className = 'qc-cursor';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="qc-ring"><svg viewBox="0 0 32 32">
        <circle class="qc-halo" cx="16" cy="16" r="15"/>
        <polygon class="qc-star-shadow" points="${STAR}"/>
        <polygon class="qc-star" points="${STAR}"/>
        <circle class="qc-circle" cx="16" cy="16" r="12"/>
      </svg></div>
      <div class="qc-brush"></div>
      <div class="qc-dot"></div>`;
    this.el = el;
    this.ring = el.querySelector('.qc-ring');
    this.brush = el.querySelector('.qc-brush');
    this.dot = el.querySelector('.qc-dot');
    document.body.append(el);

    addEventListener('pointermove', (e) => this.onMove(e), { passive: true });
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { this.hide(); return; }
      el.classList.add('is-down');
      this.onMove(e);
    }, { passive: true });
    addEventListener('pointerup', () => el.classList.remove('is-down'), { passive: true });
    document.addEventListener('pointerover', (e) => this.onOver(e), { passive: true });
    document.documentElement.addEventListener('mouseleave', () => this.hide());
    addEventListener('blur', () => this.hide());
    this.fine.addEventListener?.('change', () => this.apply());
    this.apply();
  }

  get enabled() {
    return this.style !== 'system' && this.fine.matches;
  }

  apply() {
    document.body.classList.toggle('fancy-cursor', this.enabled);
    this.el.dataset.style = this.style;
    this.el.dataset.tool = this.tool;
    this.el.style.setProperty('--c', this.color);
    this.el.style.setProperty('--size', `${Math.max(5, Math.round(this.size))}px`);
    if (!this.enabled) this.hide();
  }

  setStyle(style) {
    this.style = style || 'noor';
    this.apply();
  }

  setTool(tool, { color, size } = {}) {
    this.tool = tool;
    if (color) this.color = color;
    if (size != null) this.size = size;
    this.apply();
  }

  onMove(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') { this.hide(); return; }
    this.x = e.clientX;
    this.y = e.clientY;
    if (!this.visible) {
      this.visible = true;
      this.rx = this.x;
      this.ry = this.y;
      this.el.classList.add('is-visible');
    }
    const t = `translate3d(${this.x}px, ${this.y}px, 0)`;
    this.dot.style.transform = t;
    this.brush.style.transform = t;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  }

  tick() {
    this.raf = 0;
    // The star eases after the pointer in pointer mode; drawing tools stay exactly under it.
    const k = this.reduce.matches || this.tool !== 'pointer' ? 1 : 0.3;
    this.rx += (this.x - this.rx) * k;
    this.ry += (this.y - this.ry) * k;
    this.ring.style.transform = `translate3d(${this.rx}px, ${this.ry}px, 0)`;
    if (Math.abs(this.x - this.rx) + Math.abs(this.y - this.ry) > 0.4) this.raf = requestAnimationFrame(() => this.tick());
  }

  onOver(e) {
    const t = e.target instanceof Element ? e.target : null;
    const text = !!t?.closest(TEXT_FIELD);
    this.el.classList.toggle('is-text', text);
    this.el.classList.toggle('is-hover', !text && !!t?.closest(INTERACTIVE));
    this.el.classList.toggle('is-word', !!t?.closest('.w, .ae'));
  }

  hide() {
    this.visible = false;
    this.el.classList.remove('is-visible');
  }
}
