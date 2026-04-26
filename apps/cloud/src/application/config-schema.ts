import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveCloudPackageAssetDir } from '../utils/package-asset-path.js'

export function loadCloudConfigSchema(): Record<string, unknown> {
  const schemaPath = resolve(resolveCloudPackageAssetDir('schemas'), 'config.schema.json')

  if (!existsSync(schemaPath)) {
    return {}
  }

  return JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>
}
