import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execa } from 'execa'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const CLI_PATH = join(__dirname, '../../dist/index.js')

describe('CLI E2E Tests', () => {
  let tempDir: string
  let _configDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shadowob-cli-e2e-'))
    _configDir = join(tempDir, 'config')
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('auth commands', () => {
    it('should show help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--help'])
      expect(stdout).toContain('Shadow CLI')
      expect(stdout).toContain('auth')
      expect(stdout).toContain('servers')
      expect(stdout).toContain('channels')
    })

    it('should show auth help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'auth', '--help'])
      expect(stdout).toContain('Authentication commands')
      expect(stdout).toContain('login')
      expect(stdout).toContain('logout')
    })

    it('should show config path', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'config', 'path'])
      expect(stdout).toContain('shadowob.config.json')
    })
  })

  describe('servers commands', () => {
    it('should show servers help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'servers', '--help'])
      expect(stdout).toContain('Server management commands')
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
    })
  })

  describe('channels commands', () => {
    it('should show channels help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'channels', '--help'])
      expect(stdout).toContain('Channel commands')
      expect(stdout).toContain('list')
      expect(stdout).toContain('send')
      expect(stdout).toContain('messages')
    })
  })

  describe('agents commands', () => {
    it('should show agents help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'agents', '--help'])
      expect(stdout).toContain('Agent management commands')
      expect(stdout).toContain('list')
      expect(stdout).toContain('create')
      expect(stdout).toContain('start')
    })
  })

  describe('listen commands', () => {
    it('should show listen help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'listen', '--help'])
      expect(stdout).toContain('Listen to real-time events')
      expect(stdout).toContain('channel')
      expect(stdout).toContain('dm')
    })
  })

  describe('threads commands', () => {
    it('should show threads help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'threads', '--help'])
      expect(stdout).toContain('Thread commands')
      expect(stdout).toContain('list')
      expect(stdout).toContain('create')
      expect(stdout).toContain('send')
    })
  })
})
