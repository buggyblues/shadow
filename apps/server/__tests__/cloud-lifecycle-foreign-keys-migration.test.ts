import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations')

describe('cloud lifecycle foreign-key compatibility migration', () => {
  it('restores ownership and cascading lifecycle relationships without duplicating them', () => {
    const migration = readFileSync(
      join(migrationsDir, '0117_restore_cloud_lifecycle_foreign_keys.sql'),
      'utf8',
    )
    const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }

    for (const expected of [
      "constraint_record.conrelid = 'public.cloud_deployments'::regclass",
      "constraint_record.confrelid = 'public.users'::regclass",
      'FOREIGN KEY ("user_id") REFERENCES "users"("id")',
      'ON DELETE CASCADE NOT VALID',
      'FOREIGN KEY ("cluster_id") REFERENCES "cloud_clusters"("id")',
      'ON DELETE SET NULL NOT VALID',
      'FOREIGN KEY ("deployment_id") REFERENCES "cloud_deployments"("id")',
    ]) {
      expect(migration).toContain(expected)
    }

    expect(
      journal.entries.find((entry) => entry.tag === '0117_restore_cloud_lifecycle_foreign_keys'),
    ).toEqual({
      idx: 117,
      version: '7',
      when: 1784059200000,
      tag: '0117_restore_cloud_lifecycle_foreign_keys',
      breakpoints: true,
    })
  })
})
