import { createHash } from 'node:crypto'
import { Worker } from 'node:worker_threads'

export interface FlashScriptCardUpdate {
  id: string
  x?: number
  y?: number
  angle?: number
  flipped?: boolean
  hidden?: boolean
  locked?: boolean
  meta?: Record<string, unknown>
  tags?: string[]
}

export interface FlashScriptArenaUpdate {
  cardIds?: string[]
  x?: number
  y?: number
  radius?: number
  color?: string
  label?: string
  script?: string | null
}

export interface FlashScriptResult {
  cards?: FlashScriptCardUpdate[]
  arena?: FlashScriptArenaUpdate
  log?: string[]
}

export interface FlashScriptState {
  trigger: string
  arena: unknown
  cards: unknown[]
  activeCardIds: string[]
  seed?: number
  now?: number
  rule?: unknown
  command?: unknown
}

export interface FlashScriptCapabilities {
  cardLayout?: boolean
  cardMeta?: boolean
  cardVisibility?: boolean
  arenaLayout?: boolean
  arenaMembership?: boolean
  arenaScript?: boolean
  logs?: boolean
}

export interface FlashScriptEngineOptions {
  timeoutMs?: number
  maxScriptBytes?: number
  maxUpdates?: number
  capabilities?: FlashScriptCapabilities
  allowedCardIds?: string[]
  maxLogLines?: number
  seed?: number | string
  now?: number
}

const DEFAULT_TIMEOUT_MS = 40
const DEFAULT_MAX_SCRIPT_BYTES = 20_000
const DEFAULT_MAX_UPDATES = 64
const MAX_ABS_COORD = 100_000

const DEFAULT_CAPABILITIES: Required<FlashScriptCapabilities> = {
  cardLayout: true,
  cardMeta: false,
  cardVisibility: true,
  arenaLayout: false,
  arenaMembership: true,
  arenaScript: false,
  logs: true,
}

const ARENA_SCRIPT_CAPABILITIES: Required<FlashScriptCapabilities> = {
  cardLayout: true,
  cardMeta: true,
  cardVisibility: true,
  arenaLayout: true,
  arenaMembership: true,
  arenaScript: false,
  logs: true,
}

function capabilitiesOf(input: FlashScriptCapabilities | undefined) {
  return { ...DEFAULT_CAPABILITIES, ...(input ?? {}) }
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-MAX_ABS_COORD, Math.min(MAX_ABS_COORD, value))
    : undefined
}

function stringValue(value: unknown, max = 240): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined
}

function boolValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function plainObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function stringArray(value: unknown, max = 80): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string').slice(0, max)
}

function stableSeed(value: unknown): number {
  const hash = createHash('sha256').update(JSON.stringify(value)).digest()
  return hash.readUInt32LE(0) || 1
}

function normalizeScriptResult(
  value: unknown,
  maxUpdates: number,
  capabilities: Required<FlashScriptCapabilities>,
  constraints: { allowedCardIds?: Set<string>; maxLogLines: number },
): FlashScriptResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const result: FlashScriptResult = {}

  if (Array.isArray(raw.cards)) {
    result.cards = raw.cards.slice(0, maxUpdates).flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const rec = item as Record<string, unknown>
      const id = stringValue(rec.id, 160)
      if (!id || (constraints.allowedCardIds && !constraints.allowedCardIds.has(id))) return []
      const update: FlashScriptCardUpdate = { id }
      if (capabilities.cardLayout) {
        const x = finite(rec.x)
        const y = finite(rec.y)
        const angle = finite(rec.angle)
        if (x !== undefined) update.x = x
        if (y !== undefined) update.y = y
        if (angle !== undefined) update.angle = angle
      }
      if (capabilities.cardVisibility) {
        const flipped = boolValue(rec.flipped)
        const hidden = boolValue(rec.hidden)
        const locked = boolValue(rec.locked)
        if (flipped !== undefined) update.flipped = flipped
        if (hidden !== undefined) update.hidden = hidden
        if (locked !== undefined) update.locked = locked
      }
      if (capabilities.cardMeta) {
        const meta = plainObject(rec.meta)
        const tags = stringArray(rec.tags, 12)
        if (meta !== undefined) update.meta = meta
        if (tags !== undefined) update.tags = tags
      }
      return Object.keys(update).length > 1 ? [update] : []
    })
  }

  if (raw.arena && typeof raw.arena === 'object' && !Array.isArray(raw.arena)) {
    const arena = raw.arena as Record<string, unknown>
    const next: FlashScriptArenaUpdate = {}
    if (capabilities.arenaLayout) {
      const x = finite(arena.x)
      const y = finite(arena.y)
      const radius = finite(arena.radius)
      const color = stringValue(arena.color, 40)
      const label = stringValue(arena.label, 120)
      if (x !== undefined) next.x = x
      if (y !== undefined) next.y = y
      if (radius !== undefined) next.radius = Math.max(40, Math.min(1200, radius))
      if (color !== undefined) next.color = color
      if (label !== undefined) next.label = label
    }
    if (capabilities.arenaScript) {
      const script =
        arena.script === null ? null : stringValue(arena.script, DEFAULT_MAX_SCRIPT_BYTES)
      if (script !== undefined || arena.script === null) next.script = script ?? null
    }
    if (capabilities.arenaMembership) {
      const cardIds = stringArray(arena.cardIds, maxUpdates)
      if (cardIds !== undefined) {
        next.cardIds = constraints.allowedCardIds
          ? cardIds.filter((id) => constraints.allowedCardIds!.has(id))
          : cardIds
      }
    }
    if (Object.keys(next).length > 0) result.arena = next
  }

  if (capabilities.logs && Array.isArray(raw.log)) {
    result.log = raw.log
      .filter((item): item is string => typeof item === 'string')
      .slice(0, constraints.maxLogLines)
  }

  return result
}

const WORKER_CODE = String.raw`
const { parentPort, workerData } = require('node:worker_threads')
const vm = require('node:vm')

function mulberry32(seed) {
  let t = seed >>> 0
  return function rand() {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function idsOf(input) {
  if (Array.isArray(input)) return input.filter((item) => typeof item === 'string')
  return []
}

function makeMath(seed) {
  const rand = mulberry32(seed || 1)
  const safe = Object.create(Math)
  safe.random = rand
  return Object.freeze(safe)
}

function makeDate(nowMs) {
  const fixedNow = Number.isFinite(nowMs) ? nowMs : 0
  function DeterministicDate(...args) {
    if (!(this instanceof DeterministicDate)) return new Date(args.length ? args[0] : fixedNow).toString()
    return args.length ? new Date(...args) : new Date(fixedNow)
  }
  Object.setPrototypeOf(DeterministicDate, Date)
  DeterministicDate.UTC = Date.UTC
  DeterministicDate.parse = Date.parse
  DeterministicDate.now = () => fixedNow
  DeterministicDate.prototype = Date.prototype
  return DeterministicDate
}

const scriptRandom = mulberry32(Number(workerData.seed) || 1)

const api = {
  now() {
    return Number(workerData.now) || 0
  },
  random() {
    return scriptRandom()
  },
  circle(ids, cx, cy, radius, startAngle = -Math.PI / 2) {
    const list = idsOf(ids)
    return {
      cards: list.map((id, index) => {
        const theta = startAngle + (Math.PI * 2 * index) / Math.max(1, list.length)
        return { id, x: cx + Math.cos(theta) * radius, y: cy + Math.sin(theta) * radius, angle: theta + Math.PI / 2 }
      }),
    }
  },
  grid(ids, cx, cy, columns = 4, dx = 180, dy = 150) {
    const list = idsOf(ids)
    const cols = Math.max(1, Math.floor(columns))
    return {
      cards: list.map((id, index) => ({
        id,
        x: cx - ((Math.min(cols, list.length) - 1) * dx) / 2 + (index % cols) * dx,
        y: cy + Math.floor(index / cols) * dy,
        angle: 0,
      })),
    }
  },
  stack(ids, x, y, dx = 18, dy = 8, angleStep = 0.015) {
    return { cards: idsOf(ids).map((id, index) => ({ id, x: x + index * dx, y: y + index * dy, angle: index * angleStep })) }
  },
  shuffle(ids, seed = workerData.seed) {
    const list = idsOf(ids).slice()
    const rand = mulberry32(Number(seed) || 1)
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = list[i]
      list[i] = list[j]
      list[j] = tmp
    }
    return list
  },
  merge(...results) {
    const out = { cards: [] }
    for (const result of results) {
      if (!result || typeof result !== 'object') continue
      if (Array.isArray(result.cards)) out.cards.push(...result.cards)
      if (result.arena) out.arena = { ...(out.arena || {}), ...result.arena }
      if (Array.isArray(result.log)) out.log = [ ...(out.log || []), ...result.log ]
    }
    return out
  },
}

;(async () => {
Object.freeze(api)

  const context = vm.createContext({
    state: workerData.state,
    arena: workerData.state.arena,
    cards: workerData.state.cards,
    activeCardIds: workerData.state.activeCardIds,
    rule: workerData.state.rule,
    command: workerData.state.command,
    api,
    console: { log() {}, warn() {}, error() {} },
    Math: makeMath(workerData.seed),
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date: makeDate(workerData.now),
  })
  const script = new vm.Script('(async () => {\n' + workerData.script + '\n})()', {
    filename: 'flash-rule-card.vm.js',
    displayErrors: true,
  })
  const value = await script.runInContext(context, {
    timeout: workerData.timeoutMs,
    breakOnSigint: false,
    microtaskMode: 'afterEvaluate',
  })
  parentPort.postMessage({ ok: true, value: value === undefined ? null : value })
})().catch((err) => {
  parentPort.postMessage({ ok: false, error: err && err.message ? String(err.message) : String(err) })
})
`

export class FlashScriptEngine {
  constructor(private readonly defaults: FlashScriptEngineOptions = {}) {}

  async executeArenaScript(
    script: string | null | undefined,
    state: FlashScriptState,
    options: FlashScriptEngineOptions = {},
  ): Promise<FlashScriptResult> {
    const source = typeof script === 'string' ? script.trim() : ''
    const maxBytes =
      options.maxScriptBytes ?? this.defaults.maxScriptBytes ?? DEFAULT_MAX_SCRIPT_BYTES
    if (!source) return {}
    if (Buffer.byteLength(source, 'utf8') > maxBytes) throw new Error('flash_script_too_large')

    const timeoutMs = options.timeoutMs ?? this.defaults.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxUpdates = options.maxUpdates ?? this.defaults.maxUpdates ?? DEFAULT_MAX_UPDATES
    const maxLogLines = Math.max(0, options.maxLogLines ?? this.defaults.maxLogLines ?? 20)
    const capabilities = capabilitiesOf(options.capabilities ?? this.defaults.capabilities)
    const safeState = JSON.parse(JSON.stringify(state)) as FlashScriptState
    const seed =
      typeof options.seed === 'number'
        ? options.seed
        : typeof options.seed === 'string'
          ? stableSeed(options.seed)
          : (safeState.seed ??
            stableSeed({
              trigger: safeState.trigger,
              arena: safeState.arena,
              rule: safeState.rule,
            }))
    const now =
      typeof options.now === 'number' && Number.isFinite(options.now)
        ? options.now
        : typeof safeState.now === 'number' && Number.isFinite(safeState.now)
          ? safeState.now
          : 0
    const allowedCardIds = Array.isArray(options.allowedCardIds)
      ? new Set(options.allowedCardIds)
      : undefined

    const raw = await new Promise<unknown>((resolve, reject) => {
      const worker = new Worker(WORKER_CODE, {
        eval: true,
        workerData: { script: source, state: safeState, timeoutMs, seed, now },
      })
      let settled = false
      const wallClockTimeoutMs = Math.max(timeoutMs + 200, 250)
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        worker.terminate().catch(() => undefined)
        reject(new Error('flash_script_timeout'))
      }, wallClockTimeoutMs)

      worker.once('message', (message: { ok?: boolean; value?: unknown; error?: string }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        worker.terminate().catch(() => undefined)
        if (message?.ok) resolve(message.value)
        else reject(new Error(message?.error || 'flash_script_error'))
      })
      worker.once('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        worker.terminate().catch(() => undefined)
        reject(err)
      })
      worker.once('exit', (code) => {
        if (settled || code === 0) return
        settled = true
        clearTimeout(timer)
        reject(new Error(`flash_script_worker_exit_${code}`))
      })
    })

    return normalizeScriptResult(raw, maxUpdates, capabilities, {
      allowedCardIds,
      maxLogLines,
    })
  }

  arenaScriptCapabilities(): Required<FlashScriptCapabilities> {
    return { ...ARENA_SCRIPT_CAPABILITIES }
  }
}
