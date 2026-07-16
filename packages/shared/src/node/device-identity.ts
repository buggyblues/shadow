import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const SHADOW_DEVICE_IDENTITY_VERSION = 1 as const
export const SHADOW_DEVICE_IDENTITY_FILENAME = 'device-identity.json'

export interface ShadowDeviceIdentity {
  version: typeof SHADOW_DEVICE_IDENTITY_VERSION
  fingerprint: string
  createdAt: string
  createdBy: 'cli' | 'desktop' | 'unknown'
}

export interface ResolveShadowDeviceIdentityOptions {
  rootDir?: string
  legacyFingerprint?: string | null
  createdBy?: ShadowDeviceIdentity['createdBy']
  now?: () => Date
  randomId?: () => string
}

const LOCK_RETRY_COUNT = 100
const LOCK_RETRY_MS = 20
const STALE_LOCK_MS = 10_000
const waitBuffer = new Int32Array(new SharedArrayBuffer(4))

function wait(ms: number) {
  Atomics.wait(waitBuffer, 0, 0, ms)
}

export function normalizeShadowDeviceFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const fingerprint = value.trim()
  if (fingerprint.length < 8 || fingerprint.length > 128 || /\s/.test(fingerprint)) return null
  return fingerprint
}

export function shadowStateRoot(rootDir?: string): string {
  const configured = rootDir ?? process.env.SHADOWOB_HOME?.trim()
  return configured ? resolve(configured) : join(homedir(), '.shadowob')
}

export function shadowDeviceIdentityPath(rootDir?: string): string {
  return join(shadowStateRoot(rootDir), SHADOW_DEVICE_IDENTITY_FILENAME)
}

function parseIdentity(path: string): ShadowDeviceIdentity {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error
    throw new Error(
      `Shadow device identity is unreadable at ${path}. Repair or remove it before reconnecting.`,
      { cause: error },
    )
  }
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  const fingerprint = normalizeShadowDeviceFingerprint(record?.fingerprint)
  const createdAt = typeof record?.createdAt === 'string' ? record.createdAt : ''
  const createdBy = record?.createdBy
  if (
    record?.version !== SHADOW_DEVICE_IDENTITY_VERSION ||
    !fingerprint ||
    !createdAt ||
    (createdBy !== 'cli' && createdBy !== 'desktop' && createdBy !== 'unknown')
  ) {
    throw new Error(
      `Shadow device identity is invalid at ${path}. Repair or remove it before reconnecting.`,
    )
  }
  return {
    version: SHADOW_DEVICE_IDENTITY_VERSION,
    fingerprint,
    createdAt,
    createdBy,
  }
}

function acquireIdentityLock(lockPath: string) {
  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
    try {
      mkdirSync(lockPath, { mode: 0o700 })
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
          rmSync(lockPath, { recursive: true, force: true })
          continue
        }
      } catch {
        continue
      }
      wait(LOCK_RETRY_MS)
    }
  }
  throw new Error(`Timed out waiting for the Shadow device identity lock at ${lockPath}`)
}

/**
 * Resolve the random, machine-local Shadow identity shared by Desktop and CLI.
 *
 * The identity intentionally does not derive from a serial number, MAC address, or platform UUID.
 * The lock plus atomic rename guarantees that concurrent first launches converge on one value.
 */
export function resolveShadowDeviceIdentitySync(
  options: ResolveShadowDeviceIdentityOptions = {},
): ShadowDeviceIdentity {
  const root = shadowStateRoot(options.rootDir)
  const path = shadowDeviceIdentityPath(root)
  const lockPath = join(root, '.device-identity.lock')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  chmodSync(root, 0o700)
  acquireIdentityLock(lockPath)
  try {
    try {
      const identity = parseIdentity(path)
      chmodSync(path, 0o600)
      return identity
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    const legacy = normalizeShadowDeviceFingerprint(options.legacyFingerprint)
    const fingerprint = legacy ?? `device_${(options.randomId ?? randomUUID)()}`
    const identity: ShadowDeviceIdentity = {
      version: SHADOW_DEVICE_IDENTITY_VERSION,
      fingerprint,
      createdAt: (options.now ?? (() => new Date()))().toISOString(),
      createdBy: options.createdBy ?? 'unknown',
    }
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(identity, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    renameSync(temporaryPath, path)
    chmodSync(path, 0o600)
    return identity
  } finally {
    rmSync(lockPath, { recursive: true, force: true })
  }
}
