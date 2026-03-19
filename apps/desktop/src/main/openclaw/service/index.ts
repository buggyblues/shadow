/**
 * OpenClaw Service — Unified Entry Point
 *
 * This is THE single entry point for all OpenClaw operations in the main process.
 * It composes all sub-services and guarantees strict isolation:
 *
 *   1. All paths are resolved via OpenClawPaths (never system PATH)
 *   2. Data is scoped to ~/.shadowob exclusively
 *   3. Gateway is spawned from bundled/dev package only
 *   4. Config changes propagate to running gateway via SIGHUP
 *
 * Usage:
 *   const service = createOpenClawService()
 *   service.init()
 *   // ... use service.gateway, service.config, etc.
 *   service.cleanup()
 */

import { getChannelMeta, getChannelRegistry } from '../channel-registry'
import type { ChannelMeta } from '../types'
import { BuddyService } from './buddy'
import { ConfigService } from './config'
import { CronService } from './cron'
import { GatewayService } from './gateway'
import { OpenClawPaths } from './paths'
import { SkillHubService } from './skillhub'

export class OpenClawService {
  readonly paths: OpenClawPaths
  readonly config: ConfigService
  readonly gateway: GatewayService
  readonly cron: CronService
  readonly buddy: BuddyService
  readonly skillHub: SkillHubService

  constructor() {
    this.paths = new OpenClawPaths()
    this.config = new ConfigService(this.paths)
    this.gateway = new GatewayService(this.paths, this.config)
    this.cron = new CronService(this.paths)
    this.buddy = new BuddyService(this.paths, this.config)
    this.skillHub = new SkillHubService(this.paths, this.config)
  }

  /** Initialize all services. Call from app.ready. */
  init(): void {
    this.paths.ensureDirs()
    this.config.read() // Eager read: triggers migration on every startup
    this.config.startWatcher()
    this.buddy.init()

    // Propagate config changes to running gateway
    this.config.onChange(() => {
      this.gateway.signalConfigReload()
    })

    // Auto-start gateway if configured (desktop setting, not in openclaw.json)
    const settings = this.config.readDesktopSettings()
    if (settings.autoStart) {
      this.gateway.start().catch(() => {})
    }
  }

  /** Cleanup all services. Call from app.will-quit. */
  cleanup(): void {
    this.config.stopWatcher()
    this.gateway.cleanup()
    this.buddy.cleanup()
  }

  // ─── Channel Registry (static metadata) ───────────────────────────────────

  getChannelRegistry(): ChannelMeta[] {
    return getChannelRegistry()
  }

  getChannelMeta(channelId: string): ChannelMeta | null {
    return getChannelMeta(channelId)
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: OpenClawService | null = null

export function getOpenClawService(): OpenClawService {
  if (!_instance) {
    _instance = new OpenClawService()
  }
  return _instance
}

export function createOpenClawService(): OpenClawService {
  _instance = new OpenClawService()
  return _instance
}
