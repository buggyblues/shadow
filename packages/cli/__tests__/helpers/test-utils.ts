import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ExecaReturnValue, execa } from 'execa'

const CLI_PATH = join(__dirname, '../../dist/index.js')

export interface TestContext {
  tempDir: string
  configDir: string
}

export interface TestUser {
  id: string
  username: string
  token: string
}

/**
 * Create a temporary test directory with isolated config
 */
export function createTestContext(): TestContext {
  const tempDir = mkdtempSync(join(tmpdir(), 'shadowob-cli-test-'))
  const configDir = join(tempDir, '.shadowob')
  mkdirSync(configDir, { recursive: true })

  return { tempDir, configDir }
}

/**
 * Clean up test directory
 */
export function cleanupTestContext(ctx: TestContext): void {
  rmSync(ctx.tempDir, { recursive: true, force: true })
}

/**
 * Create a mock config file for testing
 */
export function createMockConfig(
  ctx: TestContext,
  profiles: Record<string, { serverUrl: string; token: string }>,
  current?: string,
): void {
  const configPath = join(ctx.configDir, 'shadowob.config.json')
  const config = {
    profiles,
    currentProfile: current ?? Object.keys(profiles)[0],
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

/**
 * Create an invalid config file for testing validation
 */
export function createInvalidConfig(ctx: TestContext, content: string): void {
  const configPath = join(ctx.configDir, 'shadowob.config.json')
  writeFileSync(configPath, content)
}

/**
 * Run CLI command with isolated environment
 */
export async function runCli(
  args: string[],
  ctx: TestContext,
  options: { expectError?: boolean } = {},
): Promise<ExecaReturnValue<string>> {
  const env = {
    ...process.env,
    HOME: ctx.tempDir,
  }

  try {
    const result = await execa('node', [CLI_PATH, ...args], { env })
    if (options.expectError) {
      throw new Error('Expected command to fail but it succeeded')
    }
    return result
  } catch (error) {
    if (options.expectError) {
      return error as ExecaReturnValue<string>
    }
    throw error
  }
}

/**
 * Parse JSON output from CLI
 */
export function parseJsonOutput(stdout: string): unknown {
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(`Failed to parse JSON: ${stdout}`)
  }
}

/**
 * Assert that command exits with code 1 and contains error
 */
export function assertCommandFailed(
  result: ExecaReturnValue<string>,
  expectedError?: string,
): void {
  if (result.exitCode === 0) {
    throw new Error('Expected command to fail but it succeeded')
  }
  if (expectedError) {
    const output = result.stdout || result.stderr || ''
    if (!output.toLowerCase().includes(expectedError.toLowerCase())) {
      throw new Error(`Expected error containing "${expectedError}" but got: ${output}`)
    }
  }
}

/**
 * Common test data generators
 */
export function generateUniqueId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function generateTestUsername(): string {
  return `testuser${Date.now()}${Math.floor(Math.random() * 1000)}`
}

export function generateTestServerName(): string {
  return `Test Server ${Date.now()}`
}

export function generateTestChannelName(): string {
  return `test-channel-${Date.now()}`
}

export function generateTestAgentName(): string {
  return `test-agent-${Date.now()}`
}
