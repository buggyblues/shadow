import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigManager } from '../src/config/manager.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('ConfigManager', () => {
  let tempDir: string
  let configManager: ConfigManager

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shadowob-cli-test-'))
    configManager = new ConfigManager(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should set and get a profile', async () => {
    await configManager.setProfile('default', {
      serverUrl: 'https://test.shadowob.com',
      token: 'test-token',
    })

    const profile = await configManager.getProfile('default')
    expect(profile).toEqual({
      serverUrl: 'https://test.shadowob.com',
      token: 'test-token',
    })
  })

  it('should switch between profiles', async () => {
    await configManager.setProfile('work', {
      serverUrl: 'https://work.shadowob.com',
      token: 'work-token',
    })
    await configManager.setProfile('personal', {
      serverUrl: 'https://personal.shadowob.com',
      token: 'personal-token',
    })

    await configManager.switchProfile('work')
    const current = await configManager.getCurrentProfileName()
    expect(current).toBe('work')

    const profile = await configManager.getProfile()
    expect(profile?.serverUrl).toBe('https://work.shadowob.com')
  })

  it('should list all profiles', async () => {
    await configManager.setProfile('profile1', { serverUrl: 'https://1.com', token: 't1' })
    await configManager.setProfile('profile2', { serverUrl: 'https://2.com', token: 't2' })

    const profiles = await configManager.listProfiles()
    expect(profiles).toContain('profile1')
    expect(profiles).toContain('profile2')
  })

  it('should delete a profile', async () => {
    await configManager.setProfile('to-delete', { serverUrl: 'https://test.com', token: 't' })
    const deleted = await configManager.deleteProfile('to-delete')
    expect(deleted).toBe(true)

    const profile = await configManager.getProfile('to-delete')
    expect(profile).toBeNull()
  })

  it('should return null for non-existent profile', async () => {
    const profile = await configManager.getProfile('non-existent')
    expect(profile).toBeNull()
  })
})
