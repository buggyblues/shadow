import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TravelDatabase, TravelSqliteDatabase } from '../server/src/db/database.js'
import { emptyTravelState } from '../server/src/db/schema.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('travel databases', () => {
  it('does not expose mutable state through read results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-json-read-isolation-'))
    directories.push(directory)
    const db = new TravelDatabase({ filePath: join(directory, 'travel-state.json') })
    await db.init()
    await db.write((state) => state.clientStates.push({ id: 'persisted' } as never))

    const result = await db.read((state) => state.clientStates)
    result.push({ id: 'local-only' } as never)

    expect(await db.read((state) => state.clientStates.map((item) => item.id))).toEqual([
      'persisted',
    ])
  })

  it('keeps the last persisted JSON state when a write fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-json-rollback-'))
    directories.push(directory)
    const filePath = join(directory, 'travel-state.json')
    const db = new TravelDatabase({ filePath })
    await db.init()
    await mkdir(`${filePath}.tmp`)

    await expect(
      db.write((state) => state.clientStates.push({ id: 'uncommitted' } as never)),
    ).rejects.toThrow()
    expect(await db.read((state) => state.clientStates)).toEqual([])
  })

  it('imports a legacy JSON state on first startup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-sqlite-migration-'))
    directories.push(directory)
    const legacyFilePath = join(directory, 'travel-state.json')
    const state = emptyTravelState()
    state.clientStates.push({ id: 'legacy' } as never)
    await writeFile(legacyFilePath, JSON.stringify(state), 'utf8')
    const db = new TravelSqliteDatabase({
      filePath: join(directory, 'travel.sqlite'),
      legacyFilePath,
    })
    await db.init()
    expect(await db.read((current) => current.clientStates.map((item) => item.id))).toEqual([
      'legacy',
    ])
    expect(await readFile(legacyFilePath, 'utf8')).toContain('legacy')
  })

  it('reloads the latest state before writes from different database instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-sqlite-concurrency-'))
    directories.push(directory)
    const filePath = join(directory, 'travel.sqlite')
    const first = new TravelSqliteDatabase({ filePath })
    const second = new TravelSqliteDatabase({ filePath })
    await first.init()
    await second.init()
    await Promise.all([
      first.write((state) => state.clientStates.push({ id: 'first' } as never)),
      second.write((state) => state.clientStates.push({ id: 'second' } as never)),
    ])
    expect((await first.read((state) => state.clientStates.map((item) => item.id))).sort()).toEqual(
      ['first', 'second'],
    )
  })

  it('returns isolated SQLite snapshots and observes revision changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-sqlite-read-cache-'))
    directories.push(directory)
    const filePath = join(directory, 'travel.sqlite')
    const first = new TravelSqliteDatabase({ filePath })
    const second = new TravelSqliteDatabase({ filePath })
    await first.init()
    await second.init()

    const firstRead = await first.read((state) => state)
    const secondRead = await first.read((state) => state)
    expect(secondRead).toEqual(firstRead)
    expect(secondRead).not.toBe(firstRead)

    firstRead.clientStates.push({ id: 'local-only' } as never)
    expect(await first.read((state) => state.clientStates)).toEqual([])

    await second.write((state) => state.clientStates.push({ id: 'external-change' } as never))
    const refreshed = await first.read((state) => state)
    expect(refreshed).not.toBe(firstRead)
    expect(refreshed.clientStates.map((item) => item.id)).toContain('external-change')
  })
})
