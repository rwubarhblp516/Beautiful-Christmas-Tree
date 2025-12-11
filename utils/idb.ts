const DB_NAME = 'awesome-tree-cache';
const STORE_NAME = 'images';
const DB_VERSION = 1;

type ImageRecord = {
  blob: Blob;
  createdAt: number;
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> => {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    fn(store)
      .then(result => {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      })
      .catch(err => reject(err));
  });
};

const getAllRecords = async (): Promise<Array<{ key: string; value: ImageRecord }>> => {
  return withStore('readonly', async store => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      const keyRequest = store.getAllKeys();

      request.onsuccess = () => {
        keyRequest.onsuccess = () => {
          const values = request.result as ImageRecord[];
          const keys = keyRequest.result as string[];
          const combined = keys.map((key, idx) => ({ key, value: values[idx] }));
          resolve(combined);
        };
        keyRequest.onerror = () => reject(keyRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
};

const deleteKeys = async (keys: string[]) => {
  if (!keys.length) return;
  return withStore('readwrite', async store => {
    return new Promise<void>((resolve, reject) => {
      let remaining = keys.length;
      keys.forEach(key => {
        const req = store.delete(key);
        req.onsuccess = () => {
          remaining -= 1;
          if (remaining === 0) resolve();
        };
        req.onerror = () => reject(req.error);
      });
    });
  });
};

export const loadCachedImagesWithKeys = async (limit: number): Promise<Array<{ key: string; url: string }>> => {
  const records = await getAllRecords();
  const sorted = records
    .filter(r => r.value && r.value.blob)
    .sort((a, b) => b.value.createdAt - a.value.createdAt)
    .slice(0, limit);

  return sorted.map(r => ({
    key: r.key,
    url: URL.createObjectURL(r.value.blob)
  }));
};

export const saveImagesToCacheWithKeys = async (files: File[], limit: number): Promise<Array<{ key: string; url: string }>> => {
  if (!files.length) return [];

  const timestamp = Date.now();

  await withStore('readwrite', async store => {
    return new Promise<void>((resolve, reject) => {
      let remaining = files.length;
      files.forEach((file, idx) => {
        const key = `${timestamp}-${idx}-${Math.random().toString(16).slice(2)}`;
        const value: ImageRecord = { blob: file, createdAt: timestamp + idx };
        const req = store.put(value, key);
        req.onsuccess = () => {
          remaining -= 1;
          if (remaining === 0) resolve();
        };
        req.onerror = () => reject(req.error);
      });
    });
  });

  // Enforce limit (keep newest)
  const records = await getAllRecords();
  const sorted = records.sort((a, b) => b.value.createdAt - a.value.createdAt);
  const toDelete = sorted.slice(limit).map(r => r.key);
  if (toDelete.length) {
    await deleteKeys(toDelete);
  }

  // Return newest up to limit
  return sorted.slice(0, limit).map(r => ({
    key: r.key,
    url: URL.createObjectURL(r.value.blob)
  }));
};

export const deleteCachedImages = async (keys: string[]) => {
  await deleteKeys(keys);
};

// Backwards compatibility wrappers
export const loadCachedImages = async (limit: number): Promise<string[]> => {
  const list = await loadCachedImagesWithKeys(limit);
  return list.map(item => item.url);
};

export const saveImagesToCache = async (files: File[], limit: number): Promise<string[]> => {
  const list = await saveImagesToCacheWithKeys(files, limit);
  return list.map(item => item.url);
};
