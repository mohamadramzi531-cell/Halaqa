// db.js: key/value storage on the device (IndexedDB, with a localStorage fallback).
// Everything a teacher saves lives here: students, drawings, highlights, bookmarks, notes.

const DB_NAME = 'halaqa';
const DB_VERSION = 1;
const STORES = ['kv', 'cache'];
const LS_PREFIX = 'halaqa:';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      console.warn('IndexedDB is not available, using localStorage instead.', err);
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => {
      console.warn('IndexedDB failed to open, using localStorage instead.', req.error);
      resolve(null);
    };
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    let result;
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}

const lsKey = (store, key) => `${LS_PREFIX}${store}:${key}`;

function lsKeys(store) {
  const prefix = `${LS_PREFIX}${store}:`;
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
  }
  return out.sort();
}

function makeStore(store) {
  return {
    async get(key) {
      const db = await openDb();
      if (db) return run(db, store, 'readonly', (s) => s.get(key));
      const raw = localStorage.getItem(lsKey(store, key));
      return raw == null ? undefined : JSON.parse(raw);
    },
    async set(key, value) {
      const db = await openDb();
      if (db) return run(db, store, 'readwrite', (s) => s.put(value, key));
      localStorage.setItem(lsKey(store, key), JSON.stringify(value));
      return undefined;
    },
    async del(key) {
      const db = await openDb();
      if (db) return run(db, store, 'readwrite', (s) => s.delete(key));
      localStorage.removeItem(lsKey(store, key));
      return undefined;
    },
    async keys() {
      const db = await openDb();
      if (db) return run(db, store, 'readonly', (s) => s.getAllKeys());
      return lsKeys(store);
    },
    /** All [key, value] pairs, in key order. */
    async entries() {
      const db = await openDb();
      if (!db) return lsKeys(store).map((k) => [k, JSON.parse(localStorage.getItem(lsKey(store, k)))]);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const os = tx.objectStore(store);
        const kr = os.getAllKeys();
        const vr = os.getAll();
        tx.oncomplete = () => resolve(kr.result.map((k, i) => [k, vr.result[i]]));
        tx.onerror = () => reject(tx.error);
      });
    },
    async clear() {
      const db = await openDb();
      if (db) return run(db, store, 'readwrite', (s) => s.clear());
      for (const k of lsKeys(store)) localStorage.removeItem(lsKey(store, k));
      return undefined;
    },
  };
}

/** The teacher's data. */
export const kv = makeStore('kv');
/** Downloaded Quran text and lists, kept so pages open offline. */
export const cache = makeStore('cache');

/** Ask the browser not to clear our storage when the device runs low on space. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

/** Remove every stored item (used by Settings, "Erase everything"). */
export async function eraseEverything() {
  await kv.clear();
  await cache.clear();
  for (const k of Object.keys(localStorage)) if (k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
}
