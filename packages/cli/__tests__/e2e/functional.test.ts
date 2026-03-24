import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execa } from 'execa'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureCliBuilt } from '../helpers/test-utils.js'

const CLI_PATH = join(__dirname, '../../dist/index.js')

describe('CLI Functional Tests', () => {
  let tempDir: string

  beforeAll(async () => {
    await ensureCliBuilt()
    tempDir = mkdtempSync(join(tmpdir(), 'shadowob-cli-func-test-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('config command', () => {
    it('should show config path', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'config', 'path'])
      expect(stdout).toContain('shadowob.config.json')
    })

    it('should validate empty config', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'config', 'validate', '--json'], {
        cwd: tempDir,
        env: { ...process.env, HOME: tempDir },
        reject: false,
      })
      const result = JSON.parse(stdout)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Config file does not exist')
    })

    it('should fix empty config', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'config', 'fix', '--json'], {
        cwd: tempDir,
      })
      const result = JSON.parse(stdout)
      expect(result.fixed).toBe(false)
    })
  })

  describe('ping command', () => {
    it('should fail ping when not authenticated', async () => {
      try {
        await execa('node', [CLI_PATH, 'ping', '--json'], { cwd: tempDir })
        expect.fail('Should have thrown')
      } catch (error) {
        const execaError = error as { exitCode?: number; stdout?: string }
        expect(execaError.exitCode).toBe(1)
        const result = JSON.parse(execaError.stdout || '{}')
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
      }
    })
  })

  describe('status command', () => {
    it('should fail status when not authenticated', async () => {
      try {
        await execa('node', [CLI_PATH, 'status', '--json'], { cwd: tempDir })
        expect.fail('Should have thrown')
      } catch (error) {
        const execaError = error as { exitCode?: number; stdout?: string }
        expect(execaError.exitCode).toBe(1)
        const result = JSON.parse(execaError.stdout || '{}')
        expect(result.error).toBeDefined()
      }
    })
  })

  describe('auth commands', () => {
    it('should fail login with invalid credentials', async () => {
      try {
        await execa(
          'node',
          [
            CLI_PATH,
            'auth',
            'login',
            '--server-url',
            'https://invalid.shadowob.com',
            '--token',
            'invalid-token',
            '--json',
          ],
          { cwd: tempDir },
        )
        expect.fail('Should have thrown')
      } catch (error) {
        const execaError = error as { exitCode?: number; stderr?: string; stdout?: string }
        expect(execaError.exitCode).toBe(1)
        expect(execaError.stderr || execaError.stdout).toContain('error')
      }
    })

    it('should show auth list with no profiles', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'auth', 'list', '--json'], { cwd: tempDir })
      const result = JSON.parse(stdout)
      expect(Array.isArray(result.profiles)).toBe(true)
    })
  })

  describe('servers commands', () => {
    it('should fail to list servers when not authenticated', async () => {
      try {
        await execa('node', [CLI_PATH, 'servers', 'list', '--json'], { cwd: tempDir })
        expect.fail('Should have thrown')
      } catch (error) {
        const execaError = error as { exitCode?: number }
        expect(execaError.exitCode).toBe(1)
      }
    })

    it('should show servers help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'servers', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
      expect(stdout).toContain('join')
      expect(stdout).toContain('leave')
      expect(stdout).toContain('members')
      expect(stdout).toContain('homepage')
      expect(stdout).toContain('discover')
    })
  })

  describe('channels commands', () => {
    it('should show channels help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'channels', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
      expect(stdout).toContain('delete')
      expect(stdout).toContain('messages')
      expect(stdout).toContain('send')
      expect(stdout).toContain('edit')
      expect(stdout).toContain('delete-message')
      expect(stdout).toContain('react')
      expect(stdout).toContain('unreact')
      expect(stdout).toContain('pin')
      expect(stdout).toContain('unpin')
      expect(stdout).toContain('pinned')
    })
  })

  describe('threads commands', () => {
    it('should show threads help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'threads', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
      expect(stdout).toContain('delete')
      expect(stdout).toContain('messages')
      expect(stdout).toContain('send')
    })
  })

  describe('agents commands', () => {
    it('should show agents help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'agents', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
      expect(stdout).toContain('update')
      expect(stdout).toContain('delete')
      expect(stdout).toContain('start')
      expect(stdout).toContain('stop')
      expect(stdout).toContain('token')
      expect(stdout).toContain('config')
    })
  })

  describe('dms commands', () => {
    it('should show dms help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'dms', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
      expect(stdout).toContain('messages')
      expect(stdout).toContain('send')
      expect(stdout).toContain('mark-read')
    })
  })

  describe('workspace commands', () => {
    it('should show workspace help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'workspace', '--help'])
      expect(stdout).toContain('get')
      expect(stdout).toContain('tree')
      expect(stdout).toContain('stats')
      expect(stdout).toContain('children')
      expect(stdout).toContain('files')
      expect(stdout).toContain('folders')
    })

    it('should show workspace files help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'workspace', 'files', '--help'])
      expect(stdout).toContain('get')
      expect(stdout).toContain('update')
      expect(stdout).toContain('delete')
      expect(stdout).toContain('upload')
      expect(stdout).toContain('search')
    })

    it('should show workspace folders help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'workspace', 'folders', '--help'])
      expect(stdout).toContain('create')
      expect(stdout).toContain('update')
      expect(stdout).toContain('delete')
    })
  })

  describe('shop commands', () => {
    it('should show shop help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'shop', '--help'])
      expect(stdout).toContain('get')
      expect(stdout).toContain('products')
      expect(stdout).toContain('cart')
      expect(stdout).toContain('orders')
      expect(stdout).toContain('wallet')
    })

    it('should show shop categories help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'shop', 'categories', '--help'])
      expect(stdout).toContain('Shop commands')
    })

    it('should show shop products help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'shop', 'products', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
    })

    it('should show shop cart help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'shop', 'cart', '--help'])
      expect(stdout).toContain('list')
    })

    it('should show shop orders help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'shop', 'orders', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
    })

    it('should show shop wallet help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'shop', 'wallet', '--help'])
      expect(stdout).toContain('balance')
    })
  })

  describe('apps commands', () => {
    it('should show apps help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'apps', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
      expect(stdout).toContain('update')
      expect(stdout).toContain('delete')
      expect(stdout).toContain('publish')
    })
  })

  describe('notifications commands', () => {
    it('should show notifications help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'notifications', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('mark-read')
      expect(stdout).toContain('mark-all-read')
    })

    it('should show notifications preferences help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'notifications', 'preferences', '--help'])
      expect(stdout).toContain('Notification commands')
    })
  })

  describe('friends commands', () => {
    it('should show friends help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'friends', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('requests')
      expect(stdout).toContain('add')
      expect(stdout).toContain('accept')
      expect(stdout).toContain('reject')
      expect(stdout).toContain('remove')
    })
  })

  describe('invites commands', () => {
    it('should show invites help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'invites', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('create')
      expect(stdout).toContain('deactivate')
      expect(stdout).toContain('delete')
    })
  })

  describe('oauth commands', () => {
    it('should show oauth help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'oauth', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('create')
      expect(stdout).toContain('update')
      expect(stdout).toContain('delete')
    })

    it('should show oauth tokens help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'oauth', 'tokens', '--help'])
      expect(stdout).toContain('OAuth management commands')
    })
  })

  describe('marketplace commands', () => {
    it('should show marketplace help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'marketplace', '--help'])
      expect(stdout).toContain('listings')
      expect(stdout).toContain('contracts')
    })

    it('should show marketplace listings help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'marketplace', 'listings', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
      expect(stdout).toContain('update')
      expect(stdout).toContain('delete')
    })

    it('should show marketplace contracts help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'marketplace', 'contracts', '--help'])
      expect(stdout).toContain('list')
      expect(stdout).toContain('get')
      expect(stdout).toContain('create')
      expect(stdout).toContain('cancel')
    })
  })

  describe('media commands', () => {
    it('should show media help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'media', '--help'])
      expect(stdout).toContain('upload')
      expect(stdout).toContain('download')
    })
  })

  describe('search commands', () => {
    it('should show search help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'search', '--help'])
      expect(stdout).toContain('messages')
    })
  })

  describe('listen commands', () => {
    it('should show listen help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'listen', '--help'])
      expect(stdout).toContain('channel')
      expect(stdout).toContain('dm')
    })

    it('should show listen channel help', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'listen', 'channel', '--help'])
      expect(stdout).toContain('--mode')
      expect(stdout).toContain('--timeout')
      expect(stdout).toContain('--count')
      expect(stdout).toContain('--event-type')
    })
  })

  describe('version', () => {
    it('should show version', async () => {
      const { stdout } = await execa('node', [CLI_PATH, '--version'])
      expect(stdout).toMatch(/^\d+\.\d+\.\d+$/)
    })
  })
})
