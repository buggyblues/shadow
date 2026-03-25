import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface Profile {
  serverUrl: string
  token: string
}

export interface Config {
  profiles: Record<string, Profile>
  currentProfile?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  profileResults: Record<string, { valid: boolean; error?: string }>
}

const DEFAULT_CONFIG_DIR = join(homedir(), '.shadowob')
const _DEFAULT_CONFIG_FILE = join(DEFAULT_CONFIG_DIR, 'shadowob.config.json')

export class ConfigManager {
  private config: Config | null = null
  private configFile: string

  constructor(configDir?: string) {
    const dir = configDir ?? DEFAULT_CONFIG_DIR
    this.configFile = join(dir, 'shadowob.config.json')
  }

  private async load(): Promise<Config> {
    if (this.config) return this.config

    if (!existsSync(this.configFile)) {
      this.config = { profiles: {} }
      return this.config
    }

    try {
      const content = await readFile(this.configFile, 'utf-8')
      this.config = JSON.parse(content) as Config
      return this.config
    } catch {
      this.config = { profiles: {} }
      return this.config
    }
  }

  private async save(): Promise<void> {
    if (!this.config) return
    await mkdir(dirname(this.configFile), { recursive: true })
    await writeFile(this.configFile, JSON.stringify(this.config, null, 2))
  }

  async getProfile(name?: string): Promise<Profile | null> {
    const config = await this.load()
    const profileName = name ?? config.currentProfile
    if (!profileName) return null
    return config.profiles[profileName] ?? null
  }

  async getCurrentProfileName(): Promise<string | null> {
    const config = await this.load()
    return config.currentProfile ?? null
  }

  async setProfile(name: string, profile: Profile): Promise<void> {
    const config = await this.load()
    config.profiles[name] = profile
    await this.save()
  }

  async deleteProfile(name: string): Promise<boolean> {
    const config = await this.load()
    if (!config.profiles[name]) return false
    delete config.profiles[name]
    if (config.currentProfile === name) {
      delete config.currentProfile
    }
    await this.save()
    return true
  }

  async switchProfile(name: string): Promise<boolean> {
    const config = await this.load()
    if (!config.profiles[name]) return false
    config.currentProfile = name
    await this.save()
    return true
  }

  async listProfiles(): Promise<string[]> {
    const config = await this.load()
    return Object.keys(config.profiles)
  }

  getConfigPath(): string {
    return this.configFile
  }

  async validate(): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      profileResults: {},
    }

    // Check if config file exists
    if (!existsSync(this.configFile)) {
      result.valid = false
      result.errors.push('Config file does not exist')
      return result
    }

    // Try to load and parse config
    let config: Config
    try {
      const content = await readFile(this.configFile, 'utf-8')
      config = JSON.parse(content) as Config
    } catch (error) {
      result.valid = false
      result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
      return result
    }

    // Validate structure
    if (!config.profiles || typeof config.profiles !== 'object') {
      result.valid = false
      result.errors.push('Missing or invalid "profiles" field')
      return result
    }

    // Check current profile
    if (config.currentProfile) {
      if (!config.profiles[config.currentProfile]) {
        result.valid = false
        result.errors.push(`Current profile "${config.currentProfile}" does not exist`)
      }
    } else {
      result.warnings.push('No current profile set')
    }

    // Validate each profile
    for (const [name, profile] of Object.entries(config.profiles)) {
      const profileResult = { valid: true }

      if (!profile.serverUrl) {
        profileResult.valid = false
        result.errors.push(`Profile "${name}" missing serverUrl`)
      } else {
        try {
          new URL(profile.serverUrl)
        } catch {
          profileResult.valid = false
          result.errors.push(`Profile "${name}" has invalid serverUrl: ${profile.serverUrl}`)
        }
      }

      if (!profile.token) {
        profileResult.valid = false
        result.errors.push(`Profile "${name}" missing token`)
      } else if (!profile.token.includes('.')) {
        result.warnings.push(`Profile "${name}" token does not look like a JWT`)
      }

      result.profileResults[name] = profileResult
      if (!profileResult.valid) {
        result.valid = false
      }
    }

    return result
  }

  async fix(): Promise<{ fixed: boolean; changes: string[] }> {
    const changes: string[] = []
    const config = await this.load()

    // Remove profiles with missing required fields
    for (const [name, profile] of Object.entries(config.profiles)) {
      if (!profile.serverUrl || !profile.token) {
        delete config.profiles[name]
        changes.push(`Removed invalid profile "${name}"`)
      }
    }

    // Reset current profile if it doesn't exist
    if (config.currentProfile && !config.profiles[config.currentProfile]) {
      const remainingProfiles = Object.keys(config.profiles)
      if (remainingProfiles.length > 0) {
        config.currentProfile = remainingProfiles[0]
        changes.push(`Reset current profile to "${config.currentProfile}"`)
      } else {
        delete config.currentProfile
        changes.push('Removed invalid current profile reference')
      }
    }

    // Ensure profiles object exists
    if (!config.profiles) {
      config.profiles = {}
      changes.push('Created empty profiles object')
    }

    await this.save()

    return { fixed: changes.length > 0, changes }
  }
}

export const configManager = new ConfigManager()
