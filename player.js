// player.js: verse-by-verse recitation with "repeat each ayah", "loop selection" and "keep going".
// Built for memorisation: play ayah 5 three times, then ayah 6 three times, and so on.

/** A tenth of a second of silence. Playing it inside a tap lets phones play the real audio a moment later. */
function silentClip() {
  const n = 800;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export class Player {
  /**
   * @param {{
   *   urlSync: (item) => string|null,
   *   urlAsync: (item) => Promise<string>,
   *   nextItem: (item) => object|null,
   *   prevItem: (item) => object|null,
   *   describe: (item) => {title: string, artist: string, album: string},
   *   onChange: (state) => void,
   *   onError: (err) => void,
   * }} o
   */
  constructor(o) {
    Object.assign(this, o);
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.pre = new Audio();
    this.pre.preload = 'auto';
    this.queue = [];
    this.index = 0;
    this.rep = 0;
    this.repeatEach = 1;
    this.loop = false;
    this.keepGoing = true;
    this.rate = 1;
    this.state = 'idle';
    this.token = 0;
    this.silent = null;

    const a = this.audio;
    const real = () => !!a.getAttribute('src') && a.getAttribute('src') !== this.silent;
    a.addEventListener('ended', () => { if (real()) this.ended(); });
    a.addEventListener('playing', () => { if (real()) this.set('playing'); });
    a.addEventListener('waiting', () => { if (real() && this.state === 'playing') this.set('loading'); });
    a.addEventListener('pause', () => { if (real() && this.state === 'playing' && !a.ended) this.set('paused'); });
    a.addEventListener('error', () => { if (real() && this.state !== 'idle') this.fail(new Error('Audio could not be played')); });
    this.mediaSession();
  }

  /** Called from a tap: wake the audio element up so it may play once the real URL arrives. */
  unlock() {
    try {
      this.silent ||= silentClip();
      this.audio.src = this.silent;
      const p = this.audio.play();
      if (p) p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  get item() {
    return this.queue[this.index] || null;
  }

  get busy() {
    return this.state !== 'idle';
  }

  set(state) {
    this.state = state;
    this.onChange?.({ state, item: this.item, rep: this.rep + 1, of: this.repeatEach });
  }

  play(items, start = 0) {
    if (!items?.length) return;
    this.queue = items.slice();
    this.index = Math.min(start, this.queue.length - 1);
    this.rep = 0;
    if (!this.urlSync(this.item)) this.unlock();
    this.begin();
  }

  begin() {
    const item = this.item;
    if (!item) { this.stop(); return; }
    const token = ++this.token;
    this.set('loading');
    const url = this.urlSync(item);
    // Start right away when the URL is known: phones only allow sound that starts from a tap.
    if (url) this.load(url, token);
    else {
      this.urlAsync(item)
        .then((u) => { if (token === this.token) this.load(u, token); })
        .catch((err) => { if (token === this.token) this.fail(err); });
    }
  }

  load(url, token) {
    const a = this.audio;
    a.src = url;
    a.playbackRate = this.rate;
    a.defaultPlaybackRate = this.rate;
    const p = a.play();
    if (p) p.catch((err) => { if (token === this.token && err?.name !== 'AbortError') this.fail(err); });
    this.updateMediaSession();
    this.preloadNext();
  }

  preloadNext() {
    const next = this.queue[this.index + 1] || (this.keepGoing && !this.loop ? this.nextItem?.(this.item) : null);
    const url = next && this.urlSync(next);
    if (url && this.pre.getAttribute('src') !== url) {
      this.pre.src = url;
      try { this.pre.load(); } catch { /* ignore */ }
    }
  }

  ended() {
    if (this.rep + 1 < this.repeatEach) {
      this.rep++;
      this.audio.currentTime = 0;
      this.audio.play().catch((err) => this.fail(err));
      this.set('playing');
      return;
    }
    this.rep = 0;
    if (this.index + 1 < this.queue.length) {
      this.index++;
      this.begin();
    } else if (this.loop && this.queue.length) {
      this.index = 0;
      this.begin();
    } else if (this.keepGoing) {
      const nx = this.nextItem?.(this.item);
      if (nx) {
        this.queue.push(nx);
        this.index++;
        this.begin();
      } else this.stop();
    } else this.stop();
  }

  toggle() {
    if (this.state === 'playing' || this.state === 'loading') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  pause() {
    this.audio.pause();
    this.set('paused');
  }

  resume() {
    if (!this.item) return;
    this.audio.play().then(() => this.set('playing')).catch((err) => this.fail(err));
  }

  next() {
    this.rep = 0;
    if (this.index + 1 < this.queue.length) {
      this.index++;
      this.begin();
      return;
    }
    const nx = this.nextItem?.(this.item);
    if (nx) {
      this.queue.push(nx);
      this.index++;
      this.begin();
    }
  }

  prev() {
    this.rep = 0;
    if (this.audio.currentTime > 2.5) {
      this.audio.currentTime = 0;
      return;
    }
    if (this.index > 0) {
      this.index--;
      this.begin();
      return;
    }
    const pv = this.prevItem?.(this.item);
    if (pv) {
      this.queue.unshift(pv);
      this.index = 0;
      this.begin();
    } else this.audio.currentTime = 0;
  }

  setRate(rate) {
    this.rate = rate;
    this.audio.playbackRate = rate;
    this.audio.defaultPlaybackRate = rate;
  }

  stop() {
    this.token++;
    const a = this.audio;
    a.pause();
    a.removeAttribute('src');
    try { a.load(); } catch { /* ignore */ }
    this.queue = [];
    this.index = 0;
    this.rep = 0;
    this.set('idle');
  }

  fail(err) {
    this.stop();
    this.onError?.(err);
  }

  mediaSession() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const handlers = {
      play: () => this.resume(),
      pause: () => this.pause(),
      nexttrack: () => this.next(),
      previoustrack: () => this.prev(),
      stop: () => this.stop(),
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try { ms.setActionHandler(action, fn); } catch { /* unsupported action */ }
    }
  }

  updateMediaSession() {
    const ms = navigator.mediaSession;
    if (!ms || !this.describe || typeof MediaMetadata === 'undefined') return;
    try { ms.metadata = new MediaMetadata(this.describe(this.item)); } catch { /* ignore */ }
  }
}
