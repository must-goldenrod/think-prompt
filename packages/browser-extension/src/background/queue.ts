/**
 * IndexedDB-backed retry queue for prompt ingest.
 *
 * Service workers can be killed at any time. We persist every captured
 * prompt to IndexedDB as soon as it arrives, then attempt sync. The local
 * agent accepting the row flips `synced` to true.
 */

const DB_NAME = 'think-prompt-ext';
const STORE = 'ingest';
const DB_VERSION = 1;

export interface QueueRow {
  id: string; // prompt_hash + timestamp
  source: string;
  browser_session_id: string;
  prompt_text: string;
  pii_masked: string;
  pii_hits: Record<string, number>;
  created_at: string;
  synced: boolean;
  attempts: number;
  last_error?: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('synced', 'synced', { unique: false });
        os.createIndex('created_at', 'created_at', { unique: false });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function enqueue(row: QueueRow): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function markSynced(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const g = store.get(id);
    g.onsuccess = () => {
      const row = g.result as QueueRow | undefined;
      if (row) {
        row.synced = true;
        store.put(row);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function markError(id: string, err: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const g = store.get(id);
    g.onsuccess = () => {
      const row = g.result as QueueRow | undefined;
      if (row) {
        row.last_error = err;
        row.attempts = (row.attempts ?? 0) + 1;
        store.put(row);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function pendingRows(limit = 50): Promise<QueueRow[]> {
  const db = await open();
  return await new Promise<QueueRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx
      .objectStore(STORE)
      .index('synced')
      .getAll(IDBKeyRange.only(false as any));
    req.onsuccess = () => {
      const rows = (req.result as QueueRow[]).slice(0, limit);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function stats(): Promise<{ total: number; synced: number; pending: number }> {
  const db = await open();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = req.result as QueueRow[];
      const synced = rows.filter((r) => r.synced).length;
      resolve({ total: rows.length, synced, pending: rows.length - synced });
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
