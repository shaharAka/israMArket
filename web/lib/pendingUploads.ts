/**
 * Photos the owner picked for the sample posts at /start, before they have an account.
 *
 * They stay in this browser (IndexedDB, so a refresh keeps them) until signup, and right
 * after `from-draft` they go up to the asset library ("התמונות שלי") through the existing
 * `/assets/upload`, tagged with the post they were chosen for.
 *
 * Every IndexedDB call is wrapped: private mode, a blocked database or a full quota must
 * never break the flow. Without IndexedDB the photos live in memory for this page load
 * only, so they still upload if the owner signs up without refreshing.
 */
import { endpoints } from "./api";

export type PendingUpload = {
  /** One per sample post: `post-0`, `post-1`, `post-2`. */
  key: string;
  postIndex: number;
  blob: Blob;
  name: string;
  type: string;
  createdAt: number;
};

/** The limit we tell the owner about. The server allows more; phones rarely need it. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** The long side after the in-browser downscale: plenty for a 1080px card. */
const MAX_SIDE = 2000;

const DB_NAME = "isramarket_start_uploads";
const STORE = "pending";

const memory = new Map<string, PendingUpload>();

export function keyFor(postIndex: number): string {
  return `post-${postIndex}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result ?? null);
      };
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
      tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function putPending(input: Omit<PendingUpload, "createdAt">): Promise<void> {
  const item: PendingUpload = { ...input, createdAt: Date.now() };
  memory.set(item.key, item);
  await run("readwrite", (store) => store.put(item));
}

export async function getPending(key: string): Promise<PendingUpload | null> {
  const stored = await run<PendingUpload | undefined>("readonly", (store) => store.get(key));
  return stored ?? memory.get(key) ?? null;
}

export async function listPending(): Promise<PendingUpload[]> {
  const stored = (await run<PendingUpload[]>("readonly", (store) => store.getAll())) ?? [];
  const byKey = new Map<string, PendingUpload>(memory);
  for (const item of stored) byKey.set(item.key, item);
  return [...byKey.values()].sort((a, b) => a.postIndex - b.postIndex);
}

export async function deletePending(key: string): Promise<void> {
  memory.delete(key);
  await run("readwrite", (store) => store.delete(key));
}

export async function clearPending(): Promise<void> {
  memory.clear();
  await run("readwrite", (store) => store.clear());
}

export type PreparedPhoto = { ok: true; blob: Blob; name: string; type: string } | { ok: false; error: string };

/**
 * Check and shrink a picked photo in the browser: images only, up to 10MB, long side down
 * to ~2000px as a JPEG. A phone photo goes from ~5MB to a few hundred KB, which is what
 * makes keeping it in the browser and uploading it later on a phone connection sane.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "אפשר להעלות כאן רק תמונה (JPG, PNG או WEBP)." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "התמונה גדולה מ-10MB. נסו תמונה אחרת, או צלמו מחדש." };
  }
  const base = (file.name || "photo").replace(/\.[^.]+$/, "").slice(0, 60) || "photo";
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = null;
  }
  if (!bitmap) {
    return { ok: false, error: "לא הצלחנו לפתוח את התמונה הזו. נסו תמונה אחרת, בפורמט JPG או PNG." };
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    // A small file that needs no resizing keeps its original bytes (and transparency).
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      return { ok: true, blob: file, name: file.name || `${base}.jpg`, type: file.type };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) throw new Error("no blob");
    return { ok: true, blob, name: `${base}.jpg`, type: "image/jpeg" };
  } catch {
    // The canvas failed (memory on an old phone): the original is still within the limit.
    return { ok: true, blob: file, name: file.name || `${base}.jpg`, type: file.type };
  } finally {
    bitmap.close();
  }
}

export type UploadOutcome = {
  total: number;
  uploaded: { postIndex: number; assetId: number }[];
  failed: number;
};

/**
 * After signup and `from-draft`: every pending photo to the asset library, tagged with its
 * post, and out of the browser once it is there. A photo that fails stays pending so the
 * caller can offer to try again; the tags are best effort (the upload is what matters).
 */
export async function uploadPending(
  describe: (postIndex: number) => { description: string; tags: string[] },
  onProgress?: (done: number, total: number) => void,
): Promise<UploadOutcome> {
  const items = await listPending();
  const outcome: UploadOutcome = { total: items.length, uploaded: [], failed: 0 };
  if (!items.length) return outcome;
  onProgress?.(0, items.length);
  for (const [index, item] of items.entries()) {
    try {
      const file = new File([item.blob], item.name, { type: item.type || "image/jpeg" });
      const { asset } = await endpoints.uploadAsset(file);
      const meta = describe(item.postIndex);
      try {
        await endpoints.updateAsset(asset.id, {
          ...(meta.description ? { description: meta.description } : {}),
          tags: meta.tags,
        });
      } catch {
        // The photo is in the library; tags can be added there.
      }
      outcome.uploaded.push({ postIndex: item.postIndex, assetId: asset.id });
      await deletePending(item.key);
    } catch {
      outcome.failed += 1;
    }
    onProgress?.(index + 1, items.length);
  }
  return outcome;
}
