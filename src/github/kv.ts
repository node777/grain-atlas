// A minimal IndexedDB key-value store with an in-memory fallback, for caching trees and files.

const DB = 'grain-atlas'
const STORE = 'kv'
const memory = new Map<string, unknown>()
let dbp: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T
  const db = await open()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => {
        if (req.result !== undefined) memory.set(key, req.result)
        resolve(req.result as T | undefined)
      }
      req.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value)
  const db = await open()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
