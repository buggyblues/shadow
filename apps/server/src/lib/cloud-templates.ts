import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))

async function pathExists(candidate: string) {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export async function resolveCloudTemplatesDir() {
  const candidates = [
    process.env.CLOUD_TEMPLATES_DIR,
    path.resolve(process.cwd(), 'apps/cloud/templates'),
    path.resolve(process.cwd(), '../cloud/templates'),
    path.resolve(process.cwd(), '../../apps/cloud/templates'),
    path.resolve(process.cwd(), 'node_modules/@shadowob/cloud/templates'),
    path.resolve(CURRENT_DIR, '../../../cloud/templates'),
    path.resolve(CURRENT_DIR, '../../../../apps/cloud/templates'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }
  return candidates[0]!
}
