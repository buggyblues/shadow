import type { PluginRuntime } from 'openclaw/plugin-sdk/runtime-store'
import { shadowPlugin } from './src/channel.js'
import { setShadowRuntime } from './src/runtime.js'

export { ShadowClient } from '@shadowob/sdk'
export { shadowPlugin } from './src/channel.js'
export { monitorShadowProvider } from './src/monitor.js'
export { getShadowRuntime, tryGetShadowRuntime } from './src/runtime.js'

const emptyChannelConfigSchema = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  runtime: {
    safeParse(value: unknown) {
      if (value === undefined) return { success: true, data: undefined }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {
          success: false,
          issues: [{ path: [], message: 'expected config object' }],
        }
      }
      if (Object.keys(value).length > 0) {
        return {
          success: false,
          issues: [{ path: [], message: 'config must be empty' }],
        }
      }
      return { success: true, data: value }
    },
  },
}

interface ChannelRegistrationApi {
  registrationMode?: string
  registerChannel(entry: { plugin: typeof shadowPlugin }): void
  runtime: PluginRuntime
}

export default {
  id: 'openclaw-shadowob',
  name: 'ShadowOwnBuddy',
  description:
    'Shadow server channel plugin — enables AI agents to chat in Shadow channels with threads, reactions, and media support',
  configSchema: emptyChannelConfigSchema,
  register(api: ChannelRegistrationApi) {
    if (api.registrationMode === 'cli-metadata') {
      return
    }
    if (api.registrationMode === 'tool-discovery') {
      return
    }
    api.registerChannel({ plugin: shadowPlugin })
    setShadowRuntime(api.runtime)
    if (api.registrationMode !== 'full') return
  },
  channelPlugin: shadowPlugin,
  setChannelRuntime: setShadowRuntime,
  registerFull(_api: unknown) {
    // Full-mode registrations (CLI commands, background services, etc.)
    // can be added here. They are skipped during setup-only loading.
  },
}
