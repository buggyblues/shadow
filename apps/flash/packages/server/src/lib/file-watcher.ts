// ═══════════════════════════════════════════════════════════════
// File Watcher — Watch for AI-written files and push to client
//
// Core principle: AI writes file via OpenClaw → server detects
// file change → immediately read & push to frontend via SSE
//
// Uses Node.js native fs.watch (no external deps like chokidar)
// ═══════════════════════════════════════════════════════════════

import { existsSync, type FSWatcher, mkdirSync, watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface FileWatchResult<T = unknown> {
  data: T
  source: 'watch' | 'poll'
  elapsedMs: number
}

export interface FileWatchOptions {
  /** Debounce interval (ms) to avoid multiple triggers during file writes. Default 500ms */
  debounceMs?: number
  /** Timeout (ms). Default 5 minutes */
  timeoutMs?: number
  /** Poll interval (ms) as a supplemental fallback for fs.watch. Default 3000ms */
  pollIntervalMs?: number
  /** Minimum file size (bytes); files smaller than this are considered incomplete. Default 2 */
  minFileSize?: number
  /** AbortSignal for external cancellation */
  signal?: AbortSignal
}

/**
 * Watch a file for creation/write, read and parse its content.
 *
 * How it works:
 * 1. Ensure the target directory exists
 * 2. Start fs.watch on the directory (since the file may not exist yet)
 * 3. Also start polling as a fallback (fs.watch is unreliable on some filesystems)
 * 4. Debounce after file appears/changes → read → parse with parser
 * 5. Resolve on successful parse; reject on timeout or abort
 */
export function watchForFile<T>(
  filePath: string,
  parser: (raw: string) => T | null,
  options: FileWatchOptions = {},
): Promise<FileWatchResult<T>> {
  const {
    debounceMs = 500,
    timeoutMs = 300_000,
    pollIntervalMs = 3000,
    minFileSize = 2,
    signal,
  } = options

  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })

  const startTime = Date.now()

  return new Promise<FileWatchResult<T>>((resolve, reject) => {
    let watcher: FSWatcher | null = null
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let settled = false

    function cleanup() {
      if (watcher) {
        try {
          watcher.close()
        } catch {
          /* ignore */
        }
        watcher = null
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    function settle(result: FileWatchResult<T> | null, error?: Error) {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else if (result) resolve(result)
      else reject(new Error('File watcher settled without result'))
    }

    function onAbort() {
      settle(null, new Error('File watch aborted'))
    }

    if (signal?.aborted) {
      reject(new Error('File watch aborted'))
      return
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    /** Try to read and parse the file */
    async function tryReadAndParse(source: 'watch' | 'poll'): Promise<boolean> {
      if (settled) return true
      try {
        if (!existsSync(filePath)) return false

        const fileStat = await stat(filePath)
        if (fileStat.size < minFileSize) return false

        const raw = await readFile(filePath, 'utf-8')
        const parsed = parser(raw)
        if (parsed !== null) {
          settle({ data: parsed, source, elapsedMs: Date.now() - startTime })
          return true
        }
      } catch {
        // File may still be writing, retry later
      }
      return false
    }

    /** Schedule a debounced read */
    function scheduleRead(source: 'watch' | 'poll') {
      if (settled) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        tryReadAndParse(source)
      }, debounceMs)
    }

    // ── Channel 1: fs.watch on directory ──
    try {
      watcher = watch(dir, (eventType, filename) => {
        if (settled) return
        // Only care about the target file
        const targetBasename = filePath.split('/').pop()
        if (filename === targetBasename || eventType === 'rename') {
          scheduleRead('watch')
        }
      })

      watcher.on('error', (err) => {
        console.warn(`[FileWatcher] fs.watch error on ${dir}:`, err.message)
        // fs.watch error is non-fatal; polling is still working
      })
    } catch (err) {
      console.warn(
        `[FileWatcher] Cannot start fs.watch on ${dir}:`,
        err instanceof Error ? err.message : err,
      )
      // fs.watch unavailable in some environments; fall back entirely to polling
    }

    // ── Channel 2: polling as supplemental fallback ──
    // Do an immediate check first (file may already be written before watcher starts)
    tryReadAndParse('poll').then((found) => {
      if (!found && !settled) {
        pollTimer = setInterval(() => {
          tryReadAndParse('poll')
        }, pollIntervalMs)
      }
    })

    // ── Timeout ──
    timeoutTimer = setTimeout(() => {
      if (!settled) {
        // Last attempt before timeout
        tryReadAndParse('poll').then((found) => {
          if (!found) {
            settle(null, new Error(`File watch timeout after ${timeoutMs}ms: ${filePath}`))
          }
        })
      }
    }, timeoutMs)
  })
}

/**
 * Convenience method: watch a JSON file and parse it as an array
 */
export function watchForJsonArray<T = Record<string, unknown>>(
  filePath: string,
  validator?: (item: unknown) => boolean,
  options?: FileWatchOptions,
): Promise<FileWatchResult<T[]>> {
  return watchForFile<T[]>(
    filePath,
    (raw) => {
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) return null
        if (validator && !parsed.every(validator)) return null
        return parsed
      } catch {
        return null
      }
    },
    options,
  )
}

/**
 * Convenience method: watch a JSON file and parse it as an object or array (e.g. outlines that are not pure arrays)
 */
export function watchForJson<T = unknown>(
  filePath: string,
  validator?: (data: unknown) => boolean,
  options?: FileWatchOptions,
): Promise<FileWatchResult<T>> {
  return watchForFile<T>(
    filePath,
    (raw) => {
      try {
        const parsed = JSON.parse(raw)
        if (validator && !validator(parsed)) return null
        return parsed as T
      } catch {
        return null
      }
    },
    options,
  )
}
