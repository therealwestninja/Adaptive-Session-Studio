// ── idb-storage.js ─────────────────────────────────────────────────────────
// Lightweight async key/value storage backed by IndexedDB.
// Replaces localStorage for session data, profile, and analytics so there is
// no 5-10 MB quota limit — IndexedDB allows hundreds of MB of structured data.
//
// API:
//   await idbGet(key)          → value | null
//   await idbSet(key, value)   → void
//   await idbDel(key)          → void
//   await idbHas(key)          → boolean

const DB_NAME    = 'ass-db';
const DB_VERSION = 1;
const STORE      = 'kv';

let _db = null;
let _openPromise = null;

function _open() {
  if (_db) return Promise.resolve(_db);
  if (_openPromise) return _openPromise;

  _openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };

    req.onsuccess = e => {
      _db = e.target.result;
      // Re-open if connection is closed by the browser
      _db.onclose = () => { _db = null; _openPromise = null; };
      resolve(_db);
    };

    req.onerror = e => {
      _openPromise = null;
      reject(e.target.error ?? new Error('IndexedDB open failed'));
    };
  });

  return _openPromise;
}

export async function idbGet(key) {
  try {
    const db = await _open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = e => reject(e.target.error);
    });
  } catch {
    return null; // IDB unavailable (private browsing, etc.) — degrade gracefully
  }
}

export async function idbSet(key, value) {
  try {
    const db = await _open();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  } catch {
    /* Silently fail — callers use localStorage as fallback */
  }
}

export async function idbDel(key) {
  try {
    const db = await _open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  } catch {}
}

export async function idbHas(key) {
  const val = await idbGet(key);
  return val !== null;
}
