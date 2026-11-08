// api.js: Quran text, translations, recitation audio and search.
// Source: AlQuran Cloud (https://alquran.cloud), free and without an API key.
// The Arabic text is the Tanzil Uthmani text (https://tanzil.net), shown unchanged.
// Every response is kept on the device so pages you have opened work offline.

import { cache } from './db.js';

export const API_BASE = 'https://api.alquran.cloud/v1';
export const TOTAL_PAGES = 604;
export const QURAN_EDITION = 'quran-uthmani';
const WEEK = 7 * 24 * 3600 * 1000;

const memo = new Map();
const inflight = new Map();

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function getJSON(path, { ttl = Infinity, persist = true } = {}) {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.d;
  if (inflight.has(path)) return inflight.get(path);

  const job = (async () => {
    let stored = null;
    if (persist) {
      try { stored = await cache.get(path); } catch { stored = null; }
      if (stored && Date.now() - stored.t < ttl) {
        memo.set(path, stored);
        return stored.d;
      }
    }
    try {
      const res = await fetch(API_BASE + path);
      let body = null;
      try { body = await res.json(); } catch { body = null; }
      if (!res.ok || !body || (body.code && body.code !== 200)) {
        const msg = body && typeof body.data === 'string' ? body.data : `Request failed (${res.status})`;
        throw new ApiError(msg, res.status || body?.code || 0);
      }
      const rec = { t: Date.now(), d: body.data };
      memo.set(path, rec);
      if (persist) cache.set(path, rec).catch(() => {});
      return rec.d;
    } catch (err) {
      if (stored) {
        // Offline or the server is busy: an older saved copy is fine for Quran text.
        memo.set(path, stored);
        return stored.d;
      }
      throw err;
    }
  })();

  inflight.set(path, job);
  try {
    return await job;
  } finally {
    inflight.delete(path);
  }
}

// ---------------------------------------------------------------- Arabic helpers
const HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Arabic without vowel marks, small letters or tatweel. Used for matching, never for display. */
export function plainArabic(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(HARAKAT, '')
    .replace(/[ٱآأإ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Search queries: drop marks so "الرَّحْمَٰن" and "الرحمن" find the same ayahs. */
export const searchableArabic = (s) => String(s || '').replace(HARAKAT, '').replace(/ٱ/g, 'ا').trim();

export const hasArabic = (s) => /[؀-ۿ]/.test(s);

const BASMALA_PLAIN = 'بسم الله الرحمن الرحيم';
/** Shown only if the server text ever arrives without its own basmala. */
export const FALLBACK_BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

/** The first ayah of most surahs comes with the basmala in front. Split it off so it can sit on its own line. */
function splitBasmala(text) {
  const words = text.trim().split(/\s+/);
  if (words.length > 4 && plainArabic(words.slice(0, 4).join(' ')) === BASMALA_PLAIN) {
    return { basmala: words.slice(0, 4).join(' '), text: words.slice(4).join(' ') };
  }
  return { basmala: null, text };
}

/** Pause marks and section signs (they are separate tokens in the Tanzil text). */
export const isMarkToken = (tok) => /^[ۖ-ۭؕ-ؚ]+$/.test(tok);

// ---------------------------------------------------------------- shapes
function surahNumberOf(a) {
  if (a && typeof a.surah === 'object' && a.surah) return Number(a.surah.number);
  return Number(a?.surah);
}

function normSurah(s) {
  if (!s) return null;
  const number = Number(s.number);
  if (!number) return null;
  return {
    number,
    name: s.name || '',
    englishName: s.englishName || `Surah ${number}`,
    englishNameTranslation: s.englishNameTranslation || '',
    numberOfAyahs: Number(s.numberOfAyahs) || 0,
    revelationType: s.revelationType || '',
  };
}

function normRef(r) {
  if (!r) return null;
  const s = Number(typeof r.surah === 'object' ? r.surah?.number : r.surah);
  const a = Number(typeof r.ayah === 'object' ? r.ayah?.numberInSurah : r.ayah);
  return s && a ? { s, a } : null;
}

const refsOf = (x) => (Array.isArray(x?.references) ? x.references : Array.isArray(x) ? x : []);

// ---------------------------------------------------------------- metadata
/**
 * Surah list, plus where each of the 604 pages and 30 juz begin.
 * Returns { surahs[114], pageStarts[604] | null, juzStarts[30] | null, cum[115] }.
 */
export async function getMeta() {
  let d = null;
  try {
    d = await getJSON('/meta');
  } catch (err) {
    console.warn('Could not load /meta, trying /surah', err);
  }
  let surahs = refsOf(d?.surahs).map(normSurah).filter(Boolean);
  if (surahs.length !== 114) {
    const list = await getJSON('/surah');
    surahs = (Array.isArray(list) ? list : []).map(normSurah).filter(Boolean);
  }
  if (surahs.length !== 114) throw new ApiError('The surah list could not be loaded.');
  surahs.sort((x, y) => x.number - y.number);

  const pages = refsOf(d?.pages).map(normRef);
  const juzs = refsOf(d?.juzs).map(normRef);
  const meta = {
    surahs,
    pageStarts: pages.length === TOTAL_PAGES && pages.every(Boolean) ? pages : null,
    juzStarts: juzs.length === 30 && juzs.every(Boolean) ? juzs : null,
    cum: [0],
  };
  for (const s of surahs) meta.cum.push(meta.cum[meta.cum.length - 1] + s.numberOfAyahs);
  return meta;
}

/** The page an ayah is on, from the page table (no network). */
export function pageOfSync(meta, s, a) {
  const ps = meta?.pageStarts;
  if (!ps) return null;
  let lo = 0;
  let hi = ps.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = ps[mid];
    if (p.s < s || (p.s === s && p.a <= a)) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans + 1;
}

export async function pageOf(meta, s, a) {
  const p = pageOfSync(meta, s, a);
  if (p) return p;
  const d = await getJSON(`/ayah/${s}:${a}`);
  return Number(d?.page) || 1;
}

export async function juzStartPage(meta, j) {
  const r = meta?.juzStarts?.[j - 1];
  if (r) return pageOf(meta, r.s, r.a);
  const d = await getJSON(`/juz/${j}/${QURAN_EDITION}?offset=0&limit=1`);
  return Number(d?.ayahs?.[0]?.page) || 1;
}

/** Ayah number counted from the start of the Quran (1 to 6236). */
export function globalAyah(meta, s, a) {
  if (!meta?.cum || s < 1 || s > 114) return null;
  return meta.cum[s - 1] + a;
}

// ---------------------------------------------------------------- pages
/**
 * One Mushaf page (Madani, 604 pages) as a list of ayahs:
 * { key, s, a, n, text, basmala, juz, page, hizbQuarter, sajda, surah }
 */
export async function getPage(n) {
  const d = await getJSON(`/page/${n}/${QURAN_EDITION}`);
  const ayahs = Array.isArray(d?.ayahs) ? d.ayahs : [];
  if (!ayahs.length) throw new ApiError(`Page ${n} came back empty.`);
  return ayahs.map((a) => {
    const s = surahNumberOf(a);
    const num = Number(a.numberInSurah);
    let text = String(a.text || '').trim();
    let basmala = null;
    if (num === 1 && s !== 1 && s !== 9) ({ text, basmala } = splitBasmala(text));
    return {
      key: `${s}:${num}`,
      s,
      a: num,
      n: Number(a.number) || null,
      text,
      basmala,
      juz: Number(a.juz) || null,
      page: Number(a.page) || n,
      hizbQuarter: Number(a.hizbQuarter) || null,
      sajda: !!a.sajda,
      surah: typeof a.surah === 'object' ? normSurah(a.surah) : null,
    };
  });
}

export function prefetchPage(n) {
  if (n >= 1 && n <= TOTAL_PAGES) getPage(n).catch(() => {});
}

/** Translation (or tafsir) of one page: { map: Map(key -> text), dir, name } */
export async function getPageTranslation(n, edition) {
  const d = await getJSON(`/page/${n}/${edition}`);
  const map = new Map();
  for (const a of d?.ayahs || []) map.set(`${surahNumberOf(a)}:${a.numberInSurah}`, String(a.text || ''));
  return { map, dir: d?.edition?.direction === 'rtl' ? 'rtl' : 'ltr', name: d?.edition?.englishName || edition };
}

// ---------------------------------------------------------------- editions
const editionShape = (e) => ({
  id: e.identifier,
  name: e.englishName || e.name || e.identifier,
  nativeName: e.name || '',
  lang: e.language || '',
  dir: e.direction === 'rtl' ? 'rtl' : 'ltr',
  type: e.type || '',
});

/** Translations and tafsirs that can be shown next to the page. */
export async function getTextEditions() {
  const [tr, tf] = await Promise.all([
    getJSON('/edition?format=text&type=translation', { ttl: WEEK }),
    getJSON('/edition?format=text&type=tafsir', { ttl: WEEK }).catch(() => []),
  ]);
  return [...(tr || []), ...(tf || [])].filter((e) => e?.identifier).map(editionShape);
}

/** Verse-by-verse recitations. */
export async function getReciters() {
  const list = await getJSON('/edition/format/audio', { ttl: WEEK });
  return (list || []).filter((e) => e?.identifier).map(editionShape);
}

// ---------------------------------------------------------------- audio
const templates = new Map();
const httpsOnly = (u) => String(u || '').replace(/^http:/, 'https:');

/** Learn the audio URL pattern of a reciter from their first ayah, so later ayahs need no lookup. */
export async function audioTemplate(reciter) {
  if (templates.has(reciter)) return templates.get(reciter);
  const d = await getJSON(`/ayah/1/${reciter}`, { ttl: WEEK });
  const url = httpsOnly(d?.audio || d?.audioSecondary?.[0]);
  if (!url) throw new ApiError('This reciter has no verse-by-verse audio.');
  const pattern = /\/1\.mp3(\?.*)?$/;
  const tpl = pattern.test(url) ? url.replace(pattern, '/{n}.mp3') : null;
  templates.set(reciter, tpl);
  return tpl;
}

export function audioUrlSync(reciter, n) {
  const tpl = templates.get(reciter);
  return tpl && n ? tpl.replace('{n}', String(n)) : null;
}

export async function audioUrl(reciter, n) {
  const tpl = await audioTemplate(reciter);
  if (tpl) return tpl.replace('{n}', String(n));
  const d = await getJSON(`/ayah/${n}/${reciter}`, { persist: false });
  const url = httpsOnly(d?.audio || d?.audioSecondary?.[0]);
  if (!url) throw new ApiError('No audio for this ayah.');
  return url;
}

// ---------------------------------------------------------------- search
/** Search Arabic (without vowel marks) or a translation. Returns [{ s, a, text }]. */
export async function searchQuran(query, edition) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  try {
    const d = await getJSON(`/search/${encodeURIComponent(q)}/all/${encodeURIComponent(edition)}`, { persist: false });
    return (d?.matches || [])
      .map((m) => ({ s: surahNumberOf(m), a: Number(m.numberInSurah), text: String(m.text || '') }))
      .filter((m) => m.s && m.a);
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}
