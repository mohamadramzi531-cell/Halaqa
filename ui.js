// ui.js: small DOM helpers, icons, toasts and dialogs used across the app.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Create an element: h('button', { class: 'btn', onclick }, 'Label') */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, val);
          else el.style[prop] = val;
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === true) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---------------------------------------------------------------- icons
// 24x24 line icons, drawn for this app. Stroke uses currentColor.
const ICONS = {
  pointer: '<path d="M5.5 3.5 19 10.6l-6 1.7-2.9 6.2z"/>',
  laser: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/>',
  pen: '<path d="m4 20 1.2-4.6L15.6 5a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L8.6 18.8z"/><path d="m13.6 7 3.4 3.4"/>',
  highlighter: '<path d="m15 3.8 5.2 5.2-8.6 8.6H6.4v-5.2z"/><path d="M6.4 17.6 3.6 20.4h5.2"/><path d="m12.4 6.4 5.2 5.2"/>',
  eraser: '<path d="M8.5 20H20"/><path d="m4.6 15.2 9.9-9.9a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8L11.3 19H8.4z"/><path d="m9 10.8 5.2 5.2"/>',
  mistake: '<path d="M5 6.5h14M5 11h9"/><path d="M4 16.5c1.3-1.4 2.7-1.4 4 0s2.7 1.4 4 0 2.7-1.4 4 0 2.7 1.4 4 0"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  eye: '<path d="M2.5 12C3.5 9.3 7 5 12 5s8.5 4.3 9.5 7c-1 2.7-4.5 7-9.5 7s-8.5-4.3-9.5-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 8.5 4.3 9.5 7a13 13 0 0 1-2.7 3.9M6.4 6.5C4.3 7.9 3 10 2.5 12c1 2.7 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4M8 11h6"/>',
  fitWidth: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4.2-6 4.2z"/>',
  bookmarkPlus: '<path d="M6 3.5h12v17l-6-4.2-6 4.2z"/><path d="M12 7.3v6M9 10.3h6"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5a6.3 6.3 0 0 1 12.4 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.6 14a6.2 6.2 0 0 1 3.6 5.5"/>',
  notebook: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12.5 8H16M12.5 12H16"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="9.5" cy="17" r="2.3"/>',
  play: '<path d="M7.5 4.8v14.4L19 12z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14" stroke-width="3"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none"/>',
  next: '<path d="M6 5.5 15 12l-9 6.5z" fill="currentColor" stroke="none"/><path d="M18 5.5v13"/>',
  prev: '<path d="M18 5.5 9 12l9 6.5z" fill="currentColor" stroke="none"/><path d="M6 5.5v13"/>',
  repeat: '<path d="m17 2.5 3 3-3 3"/><path d="M4 11V9.5a4 4 0 0 1 4-4h12"/><path d="m7 21.5-3-3 3-3"/><path d="M20 13v1.5a4 4 0 0 1-4 4H4"/>',
  forward: '<path d="M4 6l7 6-7 6z"/><path d="M12.5 6l7 6-7 6z"/>',
  chevLeft: '<path d="m15 5-7 7 7 7"/>',
  chevRight: '<path d="m9 5 7 7-7 7"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  translate: '<path d="M4 5h9M8.5 3v2M6 5c.6 3.4 3 6.2 6 7.5M11 5c-.8 3.8-3.3 6.8-7 8.5"/><path d="m13 21 4-9 4 9M14.5 18h5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/>',
  edit: '<path d="m4 20 1-4L16 5l3 3L8 19z"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h1M10.5 10h1M14.5 10h1M8 14h8"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  book: '<path d="M3 5.5c3-1.3 6-1.3 9 .8 3-2.1 6-2.1 9-.8V19c-3-1.3-6-1.3-9 .8-3-2.1-6-2.1-9-.8z"/><path d="M12 6.3v13.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>',
  star8: '<polygon points="12,2.5 14.78,5.28 18.72,5.28 18.72,9.22 21.5,12 18.72,14.78 18.72,18.72 14.78,18.72 12,21.5 9.22,18.72 5.28,18.72 5.28,14.78 2.5,12 5.28,9.22 5.28,5.28 9.22,5.28"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

export function iconEl(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = icon(name, cls);
  return t.content.firstElementChild;
}

/** Insert icons into every element with a data-icon attribute. */
export function hydrateIcons(root = document) {
  for (const el of $$('[data-icon]', root)) {
    const old = el.querySelector(':scope > svg.ic');
    if (old && old.dataset.name === el.dataset.icon) continue;
    old?.remove();
    const svg = iconEl(el.dataset.icon);
    svg.dataset.name = el.dataset.icon;
    el.prepend(svg);
  }
}

// ---------------------------------------------------------------- toasts
export function toast(message, { actionLabel, onAction, duration = 3800 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return () => {};
  const el = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'toast__msg' }, message));
  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 220);
  };
  if (actionLabel) {
    el.append(h('button', { class: 'toast__action', type: 'button', onclick: () => { dismiss(); onAction?.(); } }, actionLabel));
  }
  host.append(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('is-in'));
  timer = setTimeout(dismiss, duration);
  return dismiss;
}

// ---------------------------------------------------------------- dialogs
export function openDialog(dlg) {
  if (!dlg) return;
  if (!dlg.open) dlg.showModal();
  document.body.classList.add('modal-open');
}

export function closeDialog(dlg) {
  if (dlg?.open) dlg.close();
}

/** Close on backdrop click, close buttons, and keep track of open modals. */
export function wireDialogs() {
  for (const dlg of $$('dialog')) {
    let downOnBackdrop = false;
    dlg.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dlg; });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg && downOnBackdrop) dlg.close();
      downOnBackdrop = false;
    });
    dlg.addEventListener('close', () => {
      if (!$$('dialog').some((d) => d.open)) document.body.classList.remove('modal-open');
    });
    for (const b of $$('[data-close]', dlg)) b.addEventListener('click', () => dlg.close());
  }
}

export function confirmBox({ title, message, okLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  const dlg = document.getElementById('dlgConfirm');
  $('[data-title]', dlg).textContent = title;
  $('[data-message]', dlg).textContent = message;
  const ok = $('[data-ok]', dlg);
  ok.textContent = okLabel;
  ok.classList.toggle('btn--danger', danger);
  ok.classList.toggle('btn--primary', !danger);
  $('[data-cancel]', dlg).textContent = cancelLabel;
  dlg.returnValue = '';
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    openDialog(dlg);
    setTimeout(() => $('[data-cancel]', dlg).focus(), 30);
  });
}

// ---------------------------------------------------------------- utilities
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function debounce(fn, ms) {
  let t = 0;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  return d;
}

export function todayISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(isoOrTs) {
  const d = typeof isoOrTs === 'number' ? new Date(isoOrTs) : new Date(`${isoOrTs}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pickFile(accept = '') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** True when the keyboard event belongs to a text field. */
export function isTyping(e) {
  const t = e.target;
  if (!(t instanceof Element)) return false;
  if (t.closest('textarea, select, [contenteditable="true"]')) return true;
  const input = t.closest('input');
  return !!input && !['checkbox', 'radio', 'range', 'button', 'color'].includes(input.type);
}
