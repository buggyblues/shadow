import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations')

describe('Space App storage compatibility migration', () => {
  it('normalizes every persisted legacy table and cross-domain reference', () => {
    const migration = readFileSync(
      join(migrationsDir, '0116_normalize_space_app_storage_names.sql'),
      'utf8',
    )
    const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }

    for (const expected of [
      "['server_app_integrations', 'space_app_installations']",
      "['server_app_catalog_entries', 'space_app_catalog_entries']",
      "['server_app_command_tokens', 'space_app_command_tokens']",
      "['server_app_command_consents', 'space_app_command_consents']",
      "['server_app_buddy_grants', 'space_app_buddy_grants']",
      "['app_notification_topics', 'space_app_notification_topics']",
      "['app_notification_preferences', 'space_app_notification_preferences']",
      "['cloud_app_instances', 'server_app_integration_id', 'space_app_installation_id']",
      "['cloud_app_releases', 'server_app_integration_id', 'space_app_installation_id']",
      "['notifications', 'source_app_id', 'source_space_app_id']",
    ]) {
      expect(migration).toContain(expected)
    }

    expect(
      journal.entries.find((entry) => entry.tag === '0116_normalize_space_app_storage_names'),
    ).toEqual({
      idx: 116,
      version: '7',
      when: 1784055600000,
      tag: '0116_normalize_space_app_storage_names',
      breakpoints: true,
    })
  })
})
