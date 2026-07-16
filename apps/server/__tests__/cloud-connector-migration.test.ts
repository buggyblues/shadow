import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations')

describe('cloud connector OAuth migrations', () => {
  it('keeps OAuth additions in a forward migration for databases that already applied 0107', () => {
    const initial = readFileSync(join(migrationsDir, '0107_cloud_computer_connectors.sql'), 'utf8')
    const oauth = readFileSync(join(migrationsDir, '0108_cloud_connector_oauth_compat.sql'), 'utf8')
    const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>
    }

    expect(initial).not.toContain('"auth_type"')
    expect(initial).not.toContain('cloud_connector_oauth_states')
    expect(oauth).toContain('ADD COLUMN IF NOT EXISTS "auth_type"')
    expect(oauth).toContain('CREATE TABLE IF NOT EXISTS "cloud_connector_oauth_states"')
    expect(journal.entries.some((entry) => entry.tag === '0108_cloud_connector_oauth_compat')).toBe(
      true,
    )
  })
})
