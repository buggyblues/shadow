import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))

export const CLOUD_ROOT = resolve(__dir, '..', '..')
const PACKAGE_JSON = resolve(CLOUD_ROOT, 'package.json')

interface CloudPackageJson {
  bin?: string | Record<string, string>
}

function resolveCliBinRelativePath(): string {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8')) as CloudPackageJson
  const binField = packageJson.bin

  if (typeof binField === 'string') {
    return binField
  }

  const cliEntry = binField?.['shadowob-cloud']
  if (typeof cliEntry === 'string' && cliEntry.length > 0) {
    return cliEntry
  }

  throw new Error(`Unable to resolve shadowob-cloud bin entry from ${PACKAGE_JSON}`)
}

export const CLI_BIN = resolve(CLOUD_ROOT, resolveCliBinRelativePath())

export function assertCliBuilt(): void {
  if (!existsSync(CLI_BIN)) {
    throw new Error(`CLI binary not found at ${CLI_BIN}. Run 'pnpm build:cli' in apps/cloud first.`)
  }
}
