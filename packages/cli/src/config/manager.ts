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
}

export const configManager = new ConfigManager()
