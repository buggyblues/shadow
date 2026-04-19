// ═══════════════════════════════════════════════════════════════
// PersistentMap — Generic disk-backed Map
//
// In-memory Map for fast access, auto-flush to disk on mutation.
// ═══════════════════════════════════════════════════════════════

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

// ── Debounced file writer (shared across all instances) ──

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleFlush(filePath: string, getData: () => unknown, delayMs = 300): void {
  if (pendingWrites.has(filePath)) {
    clearTimeout(pendingWrites.get(filePath)!)
  }
  pendingWrites.set(
    filePath,
    setTimeout(() => {
      pendingWrites.delete(filePath)
      try {
        const data = JSON.stringify(getData(), null, 2)
        writeFile(filePath, data, 'utf-8').catch((err) => {
          console.error(`[PersistentMap] Flush failed ${filePath}:`, err.message)
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[PersistentMap] Serialize failed ${filePath}:`, msg)
      }
    }, delayMs),
  )
}

// ── PersistentMap class ──

export class PersistentMap<V> {
  private map = new Map<string, V>()
  private readonly filePath: string
  private readonly name: string

  constructor(name: string, filePath: string) {
    this.name = name
    this.filePath = filePath
  }

  get size(): number {
    return this.map.size
  }

  get(key: string): V | undefined {
    return this.map.get(key)
  }

  set(key: string, value: V): this {
    this.map.set(key, value)
    this.flush()
    return this
  }

  delete(key: string): boolean {
    const result = this.map.delete(key)
    if (result) this.flush()
    return result
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  values(): IterableIterator<V> {
    return this.map.values()
  }
  keys(): IterableIterator<string> {
    return this.map.keys()
  }
  entries(): IterableIterator<[string, V]> {
    return this.map.entries()
  }

  forEach(fn: (value: V, key: string) => void): void {
    this.map.forEach(fn)
  }

  [Symbol.iterator](): IterableIterator<[string, V]> {
    return this.map[Symbol.iterator]()
  }

  clear(): void {
    this.map.clear()
    this.flush()
  }

  toArray(): V[] {
    return Array.from(this.map.values())
  }

  /** Load from disk (called once at startup) */
  restore(): void {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8')
        const entries: Array<[string, V]> = JSON.parse(raw)
        if (Array.isArray(entries)) {
          for (const [k, v] of entries) {
            this.map.set(k, v)
          }
          console.log(`   📂 ${this.name}: restored ${this.map.size} entries`)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`   ⚠️  ${this.name}: restore failed (${msg}), starting fresh`)
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    scheduleFlush(this.filePath, () => Array.from(this.map.entries()))
  }
}
