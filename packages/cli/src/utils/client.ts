import { ShadowClient, ShadowSocket } from '@shadowob/sdk'
import { configManager } from '../config/manager.js'

interface Config {
  serverUrl: string
  token: string
}

async function getConfig(profile?: string): Promise<Config> {
  const config = await configManager.getProfile(profile)
  if (!config) {
    throw new Error(
      profile
        ? `Profile "${profile}" not found. Run: shadowob auth login --profile ${profile}`
        : 'Not authenticated. Run: shadowob auth login',
    )
  }
  return config
}

export async function getClient(profile?: string): Promise<ShadowClient> {
  const config = await getConfig(profile)
  return new ShadowClient(config.serverUrl, config.token)
}

export async function getSocket(profile?: string): Promise<ShadowSocket> {
  const config = await getConfig(profile)
  return new ShadowSocket({ serverUrl: config.serverUrl, token: config.token })
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Parse limit option with validation
 */
export function parseLimit(value: string | undefined, defaultValue = 50, maxValue = 100): number {
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1) return defaultValue
  return Math.min(parsed, maxValue)
}

/**
 * Parse price with validation
 */
export function parsePrice(value: string): number {
  const parsed = parseFloat(value)
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error('Price must be a non-negative number')
  }
  return parsed
}

/**
 * Parse integer with validation
 */
export function parseIntOrThrow(value: string, fieldName: string): number {
  const parsed = parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`${fieldName} must be a valid integer`)
  }
  return parsed
}

/**
 * Parse positive integer with validation
 */
export function parsePositiveInt(value: string, fieldName: string): number {
  const parsed = parseIntOrThrow(value, fieldName)
  if (parsed < 1) {
    throw new Error(`${fieldName} must be a positive integer`)
  }
  return parsed
}

/**
 * Parse non-negative integer with validation
 */
export function parseNonNegativeInt(value: string, fieldName: string): number {
  const parsed = parseIntOrThrow(value, fieldName)
  if (parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`)
  }
  return parsed
}

/**
 * Parse boolean from string
 */
export function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

/**
 * Validate required option
 */
export function requireOption<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required option: --${name}`)
  }
  return value
}

/**
 * Common error handler for commands
 */
export async function handleCommand<T>(
  fn: () => Promise<T>,
  options: { json?: boolean },
  outputFn: (data: T, json?: boolean) => void,
  errorFn: (message: string, json?: boolean) => void,
): Promise<void> {
  try {
    const result = await fn()
    outputFn(result, options.json)
    process.exit(0)
  } catch (error) {
    const message = formatError(error)
    errorFn(message, options.json)
    process.exit(1)
  }
}
