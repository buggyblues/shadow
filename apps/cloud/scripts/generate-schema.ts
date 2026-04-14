/**
 * Generate JSON Schema from CloudConfig TypeScript interfaces.
 *
 * Usage: pnpm generate:schema
 * Output: schemas/config.schema.json
 *
 * Uses typescript-json-schema to produce JSON Schema directly from
 * TypeScript source (no build step required).
 *
 * Users can reference this schema in their shadowob-cloud.json:
 *   { "$schema": "./schemas/config.schema.json" }
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as TJS from 'typescript-json-schema'

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
  moduleResolution: 100, // NodeNext
  module: 199, // NodeNext
  target: 99, // ESNext
}

const program = TJS.getProgramFromFiles([schemaFile], compilerOptions)
const schema = TJS.generateSchema(program, 'CloudConfig', settings)

if (!schema) {
  console.error('Failed to generate JSON Schema for CloudConfig')
  process.exit(1)
}

const outDir = resolve(projectRoot, 'schemas')
mkdirSync(outDir, { recursive: true })

const outPath = resolve(outDir, 'config.schema.json')
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf-8')

console.log(`✓ Generated JSON Schema: ${outPath}`)
