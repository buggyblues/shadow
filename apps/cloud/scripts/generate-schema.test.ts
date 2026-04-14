/**
 * Verify the pre-generated JSON Schema file is valid.
 *
 * The schema is generated via: pnpm generate:schema
 * (uses typescript-json-schema, not vitest transform)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('generate-schema', () => {
  it('has a valid config.schema.json', () => {
    const schemaPath = resolve(import.meta.dirname, '..', 'schemas', 'config.schema.json')
    const written = JSON.parse(readFileSync(schemaPath, 'utf-8'))
    expect(written.$schema).toBe('http://json-schema.org/draft-07/schema#')
    expect(written.definitions).toBeDefined()
    expect(written.type).toBe('object')
  })
})
