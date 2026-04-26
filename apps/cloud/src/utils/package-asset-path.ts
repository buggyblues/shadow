import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function uniqueCandidates(candidates: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const resolved: string[] = []

  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = resolve(candidate)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    resolved.push(normalized)
  }

  return resolved
}

/**
 * Resolve an asset directory inside the cloud package without relying on
 * import.meta, so the path also works in the worker's CommonJS bundle.
 */
export function resolveCloudPackageAssetDir(assetName: string): string {
  const entryFile =
    typeof process.argv[1] === 'string' && process.argv[1].length > 0
      ? resolve(process.argv[1])
      : undefined
  const entryDir = entryFile ? dirname(entryFile) : undefined

  const candidates = uniqueCandidates([
    entryDir ? resolve(entryDir, '..', assetName) : undefined,
    entryDir ? resolve(entryDir, assetName) : undefined,
    resolve(process.cwd(), assetName),
    resolve(process.cwd(), 'apps/cloud', assetName),
    resolve(process.cwd(), 'node_modules', '@shadowob', 'cloud', assetName),
  ])

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0] ?? resolve(process.cwd(), 'apps/cloud', assetName)
}
