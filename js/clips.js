// Saved recordings live in this browser's IndexedDB (nothing is uploaded anywhere).
const DB = 'gn-clips', STORE = 'clips';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const res = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(res?.result);
    t.onerror = () => reject(t.error);
  });
};
export const listClips = async () => ((await tx('readonly', (s) => s.getAll())) || []).sort((a, b) => b.end - a.end);
export const putClip = (clip) => tx('readwrite', (s) => s.put(clip));
export const deleteClip = (id) => tx('readwrite', (s) => s.delete(id));
export const clipBytes = (c) => c.segs.reduce((n, s) => n + s.blob.size, 0);
