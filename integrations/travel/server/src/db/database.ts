import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { nowIso } from '../lib/time.js'
import type { TravelState } from '../types.js'
import { normalizeTravelState } from './schema.js'

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

export interface TravelDatabaseOptions {
  filePath: string
  legacyFilePath?: string
}

export interface TravelDataStore {
  init(): Promise<void>
  snapshot(): TravelState
  read<T>(reader: (state: TravelState) => T | Promise<T>): Promise<T>
  write<T>(writer: (state: TravelState) => T): Promise<T>
}

export class TravelDatabase implements TravelDataStore {
  private state: TravelState | null = null
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: TravelDatabaseOptions) {}

  async init() {
    await mkdir(dirname(this.options.filePath), { recursive: true })
    try {
      const raw = await readFile(this.options.filePath, 'utf8')
      this.state = normalizeTravelState(JSON.parse(raw) as Partial<TravelState>)
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        (error as NodeJS.ErrnoException).code !== 'ENOENT'
      ) {
        throw error
      }
      this.state = normalizeTravelState(null)
      await this.persist(this.state)
    }
  }

  snapshot() {
    return cloneValue(this.requireState())
  }

  async read<T>(reader: (state: TravelState) => T | Promise<T>) {
    return cloneValue(await reader(this.requireState()))
  }

  async write<T>(writer: (state: TravelState) => T) {
    const run = async () => {
      const state = cloneValue(this.requireState())
      const result = writer(state)
      state.updatedAt = nowIso()
      await this.persist(state)
      this.state = state
      return cloneValue(result)
    }

    const task = this.writeChain.then(run, run)
    this.writeChain = task.then(
      () => undefined,
      () => undefined,
    )
    return task
  }

  private requireState() {
    if (!this.state) throw new Error('Travel database is not initialized')
    return this.state
  }

  private async persist(state: TravelState) {
    const tmpPath = `${this.options.filePath}.tmp`
    await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(tmpPath, this.options.filePath)
  }
}

export class TravelSqliteDatabase implements TravelDataStore {
  private revision: number | null = null
  private state: TravelState | null = null
  private sqlite: DatabaseSync | null = null
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly sqliteOptions: TravelDatabaseOptions) {}

  async init() {
    await mkdir(dirname(this.sqliteOptions.filePath), { recursive: true })
    this.sqlite = new DatabaseSync(this.sqliteOptions.filePath)
    this.sqlite.exec('pragma journal_mode = WAL')
    this.sqlite.exec('pragma synchronous = NORMAL')
    this.sqlite.exec('pragma busy_timeout = 5000')
    this.sqlite.exec(`
      create table if not exists travel_state (
        id integer primary key check (id = 1),
        state_json text not null,
        updated_at text not null,
        revision integer not null default 0
      );
      create table if not exists travel_meta (
        key text primary key,
        value text not null
      );
    `)

    const columns = this.sqlite.prepare('pragma table_info(travel_state)').all() as Array<{
      name?: string
    }>
    if (!columns.some((column) => column.name === 'revision')) {
      this.sqlite.exec('alter table travel_state add column revision integer not null default 0')
    }
    const row = this.loadRow()
    if (row?.state_json) {
      this.state = normalizeTravelState(JSON.parse(row.state_json))
      this.revision = row.revision ?? 0
      return
    }
    this.state = await this.readLegacyState()
    await this.persist(this.state)
  }

  snapshot() {
    this.refreshState()
    return cloneValue(this.requireState())
  }

  async read<T>(reader: (state: TravelState) => T | Promise<T>) {
    this.refreshState()
    return cloneValue(await reader(this.requireState()))
  }

  async write<T>(writer: (state: TravelState) => T) {
    const run = async () => {
      if (!this.sqlite) throw new Error('Travel SQLite database is not initialized')
      this.sqlite.exec('begin immediate')
      try {
        const row = this.loadRow()
        const state = normalizeTravelState(row?.state_json ? JSON.parse(row.state_json) : null)
        const result = writer(state)
        state.updatedAt = nowIso()
        this.sqlite
          .prepare(
            `
            insert into travel_state (id, state_json, updated_at, revision)
            values (1, @stateJson, @updatedAt, 1)
            on conflict(id) do update set
              state_json = excluded.state_json,
              updated_at = excluded.updated_at,
              revision = travel_state.revision + 1
          `,
          )
          .run({ stateJson: JSON.stringify(state), updatedAt: state.updatedAt })
        this.sqlite.exec('commit')
        this.state = state
        this.revision = (row?.revision ?? 0) + 1
        return cloneValue(result)
      } catch (error) {
        this.sqlite.exec('rollback')
        throw error
      }
    }

    const task = this.writeChain.then(run, run)
    this.writeChain = task.then(
      () => undefined,
      () => undefined,
    )
    return task
  }

  private requireState() {
    if (!this.state) throw new Error('Travel database is not initialized')
    return this.state
  }

  private loadRow() {
    if (!this.sqlite) throw new Error('Travel SQLite database is not initialized')
    return this.sqlite
      .prepare('select state_json, revision from travel_state where id = 1')
      .get() as { state_json?: string; revision?: number } | undefined
  }

  private loadRevision() {
    if (!this.sqlite) throw new Error('Travel SQLite database is not initialized')
    return (
      this.sqlite.prepare('select revision from travel_state where id = 1').get() as
        | { revision?: number }
        | undefined
    )?.revision
  }

  private refreshState() {
    const revision = this.loadRevision()
    if (revision === undefined || revision === this.revision) return
    const row = this.loadRow()
    if (!row?.state_json) return
    this.state = normalizeTravelState(JSON.parse(row.state_json))
    this.revision = revision
  }

  private async readLegacyState() {
    if (!this.sqliteOptions.legacyFilePath) return normalizeTravelState(null)
    try {
      const raw = await readFile(this.sqliteOptions.legacyFilePath, 'utf8')
      return normalizeTravelState(JSON.parse(raw) as Partial<TravelState>)
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return normalizeTravelState(null)
      }
      throw error
    }
  }

  private async persist(state: TravelState) {
    if (!this.sqlite) throw new Error('Travel SQLite database is not initialized')
    this.sqlite
      .prepare(
        `
        insert into travel_state (id, state_json, updated_at, revision)
        values (1, @stateJson, @updatedAt, 0)
        on conflict(id) do update set
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      )
      .run({
        stateJson: JSON.stringify(state),
        updatedAt: state.updatedAt,
      })
    this.revision = this.loadRow()?.revision ?? 0
  }
}

export function travelDatabaseFromEnv() {
  const dataDir = join(process.cwd(), process.env.TRAVEL_DATA_DIR ?? 'data')
  const driver = (process.env.TRAVEL_DB_DRIVER ?? '').toLowerCase()
  if (driver === 'json' || (!driver && process.env.TRAVEL_DATA_FILE)) {
    const filePath = process.env.TRAVEL_DATA_FILE ?? join(dataDir, 'travel-state.json')
    return new TravelDatabase({ filePath })
  }
  if (!driver || driver === 'sqlite') {
    const filePath = process.env.TRAVEL_SQLITE_FILE ?? join(dataDir, 'travel.sqlite')
    const legacyFilePath = process.env.TRAVEL_LEGACY_DATA_FILE ?? join(dataDir, 'travel-state.json')
    return new TravelSqliteDatabase({ filePath, legacyFilePath })
  }
  throw new Error(`Unsupported TRAVEL_DB_DRIVER: ${driver}`)
}
