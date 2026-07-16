import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations')

describe('cloud resource owner foreign-key compatibility migration', () => {
  it('repairs orphaned core resources and restores every legacy ownership relationship', () => {
    const migration = readFileSync(
      join(migrationsDir, '0118_restore_cloud_resource_owner_foreign_keys.sql'),
      'utf8',
    )
    const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }

    for (const expected of [
      'DELETE FROM "cloud_env_vars" resource',
      'DELETE FROM "cloud_activities" resource',
      'DELETE FROM "cloud_configs" resource',
      'DELETE FROM "cloud_clusters" resource',
      'DELETE FROM "cloud_env_groups" resource',
      'cloud_clusters_user_id_users_id_fk',
      'cloud_configs_user_id_users_id_fk',
      'cloud_env_groups_user_id_users_id_fk',
      'cloud_env_vars_user_id_users_id_fk',
      'cloud_env_vars_group_id_cloud_env_groups_id_fk',
      'cloud_activities_user_id_users_id_fk',
      'ON DELETE %s NOT VALID',
      'VALIDATE CONSTRAINT',
    ]) {
      expect(migration).toContain(expected)
    }

    expect(journal.entries.at(-1)).toEqual({
      idx: 118,
      version: '7',
      when: 1784062800000,
      tag: '0118_restore_cloud_resource_owner_foreign_keys',
      breakpoints: true,
    })
  })
})
