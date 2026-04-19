/**
 * Verify the pre-generated JSON Schema file is valid and in sync with the
 * current TypeScript types.
 *
 * The schema is generated via: pnpm generate:schema
 * (uses typescript-json-schema, not vitest transform)
 *
 * Run `pnpm generate:schema` whenever CloudConfig types change, then commit
 * the updated schemas/config.schema.json.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as TJS from 'typescript-json-schema'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')
const schemaFile = resolve(projectRoot, 'src/config/schema/cloud.schema.ts')

const settings: TJS.PartialArgs = {
  required: true,
  noExtraProps: false,
  strictNullChecks: true,
}

const compilerOptions: TJS.CompilerOptions = {
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  moduleResolution: 100,
  module: 199,
  target: 99,
}

describe('generate-schema', () => {
  it('has a valid config.schema.json', () => {
    const schemaPath = resolve(projectRoot, 'schemas', 'config.schema.json')
    const written = JSON.parse(readFileSync(schemaPath, 'utf-8'))
    expect(written.$schema).toBe('http://json-schema.org/draft-07/schema#')
    expect(written.definitions).toBeDefined()
    expect(written.type).toBe('object')
  })

  it('config.schema.json is in sync with CloudConfig types (run pnpm generate:schema to update)', () => {
    const schemaPath = resolve(projectRoot, 'schemas', 'config.schema.json')
    const committed = JSON.parse(readFileSync(schemaPath, 'utf-8'))

    const program = TJS.getProgramFromFiles([schemaFile], compilerOptions)
    const generated = TJS.generateSchema(program, 'CloudConfig', settings)

    expect(generated).not.toBeNull()
    expect(JSON.stringify(committed, null, 2)).toBe(JSON.stringify(generated, null, 2))
  })
})
