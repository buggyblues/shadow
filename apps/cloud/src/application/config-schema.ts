import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolveCloudPackageAssetDir } from '../utils/package-asset-path.js'

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export async function loadCloudConfigSchema(): Promise<Record<string, unknown>> {
  const schemaPath = resolve(resolveCloudPackageAssetDir('schemas'), 'config.schema.json')

  if (!(await pathExists(schemaPath))) {
    return {}
  }

  return JSON.parse(await readFile(schemaPath, 'utf-8')) as Record<string, unknown>
}
