import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupTestContext,
  createInvalidConfig,
  createMockConfig,
  createTestContext,
  parseJsonOutput,
  runCli,
} from '../helpers/test-utils.js'

describe('Config Validation and Fix', () => {
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(() => {
    ctx = createTestContext()
  })

  afterEach(() => {
    cleanupTestContext(ctx)
  })

  describe('config validate', () => {
    it('should report missing config file', async () => {
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; errors: string[] }

      expect(output.valid).toBe(false)
      expect(output.errors).toContain('Config file does not exist')
    })

    it('should report invalid JSON', async () => {
      createInvalidConfig(ctx, '{ invalid json }')
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; errors: string[] }

      expect(output.valid).toBe(false)
      expect(output.errors.some((e) => e.includes('Invalid JSON'))).toBe(true)
    })

    it('should report missing profiles field', async () => {
      createInvalidConfig(ctx, '{ "currentProfile": "default" }')
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; errors: string[] }

      expect(output.valid).toBe(false)
      expect(output.errors).toContain('Missing or invalid "profiles" field')
    })

    it('should report invalid current profile', async () => {
      createMockConfig(
        ctx,
        { default: { serverUrl: 'https://test.com', token: 'test-token' } },
        'nonexistent',
      )
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; errors: string[] }

      expect(output.valid).toBe(false)
      expect(output.errors).toContain('Current profile "nonexistent" does not exist')
    })

    it('should report missing serverUrl in profile', async () => {
      createMockConfig(ctx, { default: { serverUrl: '', token: 'test' } })
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; errors: string[] }

      expect(output.valid).toBe(false)
      expect(output.errors).toContain('Profile "default" missing serverUrl')
    })

    it('should report invalid serverUrl', async () => {
      createMockConfig(ctx, { default: { serverUrl: 'not-a-url', token: 'test' } })
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; errors: string[] }

      expect(output.valid).toBe(false)
      expect(output.errors.some((e) => e.includes('invalid serverUrl'))).toBe(true)
    })

    it('should report missing token', async () => {
      createMockConfig(ctx, { default: { serverUrl: 'https://test.com', token: '' } })
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; errors: string[] }

      expect(output.valid).toBe(false)
      expect(output.errors).toContain('Profile "default" missing token')
    })

    it('should warn about non-JWT token', async () => {
      createMockConfig(ctx, { default: { serverUrl: 'https://test.com', token: 'simple-token' } })
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; warnings: string[] }

      expect(output.valid).toBe(true)
      expect(output.warnings).toContain('Profile "default" token does not look like a JWT')
    })

    it('should validate valid config', async () => {
      createMockConfig(ctx, { default: { serverUrl: 'https://test.com', token: 'eyJ.test.token' } })
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean }

      expect(output.valid).toBe(true)
    })

    it('should warn about no current profile', async () => {
      createInvalidConfig(
        ctx,
        JSON.stringify({
          profiles: { default: { serverUrl: 'https://test.com', token: 'eyJ.test.token' } },
        }),
      )
      const result = await runCli(['config', 'validate', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { valid: boolean; warnings: string[] }

      expect(output.valid).toBe(true)
      expect(output.warnings).toContain('No current profile set')
    })
  })

  describe('config fix', () => {
    it('should remove profiles with missing fields', async () => {
      createInvalidConfig(
        ctx,
        JSON.stringify({
          profiles: {
            valid: { serverUrl: 'https://test.com', token: 'test' },
            invalid1: { serverUrl: '', token: 'test' },
            invalid2: { serverUrl: 'https://test.com', token: '' },
          },
          currentProfile: 'valid',
        }),
      )

      const result = await runCli(['config', 'fix', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { fixed: boolean; changes: string[] }

      expect(output.fixed).toBe(true)
      expect(output.changes).toContain('Removed invalid profile "invalid1"')
      expect(output.changes).toContain('Removed invalid profile "invalid2"')

      // Verify fix worked
      const validateResult = await runCli(['config', 'validate', '--json'], ctx)
      const validateOutput = parseJsonOutput(validateResult.stdout) as { valid: boolean }
      expect(validateOutput.valid).toBe(true)
    })

    it('should reset current profile if invalid', async () => {
      createMockConfig(
        ctx,
        { default: { serverUrl: 'https://test.com', token: 'test' } },
        'nonexistent',
      )

      const result = await runCli(['config', 'fix', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { fixed: boolean; changes: string[] }

      expect(output.fixed).toBe(true)
      expect(output.changes).toContain('Reset current profile to "default"')
    })

    it('should remove invalid current profile reference', async () => {
      createInvalidConfig(
        ctx,
        JSON.stringify({
          profiles: {},
          currentProfile: 'nonexistent',
        }),
      )

      const result = await runCli(['config', 'fix', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { fixed: boolean; changes: string[] }

      expect(output.fixed).toBe(true)
      expect(output.changes).toContain('Removed invalid current profile reference')
    })

    it('should report no changes when config is valid', async () => {
      createMockConfig(ctx, { default: { serverUrl: 'https://test.com', token: 'test' } })

      const result = await runCli(['config', 'fix', '--json'], ctx)
      const output = parseJsonOutput(result.stdout) as { fixed: boolean; changes: string[] }

      expect(output.fixed).toBe(false)
      expect(output.changes).toHaveLength(0)
    })
  })
})
