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
