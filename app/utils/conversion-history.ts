import type { ConversionResult, DocumentConversionResult, DocumentBlock, EquationCrop } from "~/recognition/types";

export type HistoryEntry = {
  id: string;
  createdAt: string;
  mode: "equation" | "document";
  files: File[];
  crop?: EquationCrop;
  result: ConversionResult | DocumentConversionResult;
  latex: string;
  blocks: DocumentBlock[];
  documentEdited: boolean;
};

const DATABASE = "snaptex-conversion-history";
const STORE = "conversions";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("History is open in another tab."));
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("History could not be saved.")); };
    tx.onerror = () => { /* onabort reports the failure after the transaction ends */ };
  });
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const entries = await transaction<HistoryEntry[]>("readonly", (store) => store.getAll());
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveHistory(entry: HistoryEntry): Promise<void> {
  await transaction("readwrite", (store) => store.put(entry));
}

export async function deleteHistory(id: string): Promise<void> {
  await transaction("readwrite", (store) => store.delete(id));
}

export async function clearHistory(): Promise<void> {
  await transaction("readwrite", (store) => store.clear());
}
