/**
 * OpenClaw Desktop Integration — Main Process Module
 *
 * Re-exports the unified service and IPC setup.
 * The old individual managers are preserved for backward compatibility
 * but all new code should use the OpenClawService.
 */

export { cleanupOpenClaw, initOpenClaw } from './ipc-handlers'
export { createOpenClawService, getOpenClawService, OpenClawService } from './service'
export type {
  AgentConfig,
  BuddyConnection,
  ChannelMeta,
  CronTask,
  GatewayLogEntry,
  GatewayState,
  GatewayStatus,
  ModelProviderEntry,
  OpenClawConfig,
  SkillHubEntry,
  SkillHubSearchResult,
  SkillManifest,
} from './types'
