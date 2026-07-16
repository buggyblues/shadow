import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveShadowDeviceIdentitySync,
  shadowDeviceIdentityPath,
} from '../src/node/device-identity'

describe('resolveShadowDeviceIdentitySync', () => {
  it('creates one private identity and reuses it across callers', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-device-identity-'))
    const first = resolveShadowDeviceIdentitySync({
      rootDir,
      createdBy: 'desktop',
      randomId: () => 'first-id',
      now: () => new Date('2026-07-14T00:00:00.000Z'),
    })
    const second = resolveShadowDeviceIdentitySync({
      rootDir,
      createdBy: 'cli',
      randomId: () => 'second-id',
    })

    expect(first).toEqual(second)
    expect(first.fingerprint).toBe('device_first-id')
    expect(JSON.parse(readFileSync(shadowDeviceIdentityPath(rootDir), 'utf8'))).toEqual(first)
    expect(statSync(shadowDeviceIdentityPath(rootDir)).mode & 0o777).toBe(0o600)
  })

  it('adopts a valid legacy desktop installation id on first migration', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-device-identity-'))
    const identity = resolveShadowDeviceIdentitySync({
      rootDir,
      legacyFingerprint: 'legacy-installation-id',
      createdBy: 'desktop',
    })

    expect(identity.fingerprint).toBe('legacy-installation-id')
  })
})
