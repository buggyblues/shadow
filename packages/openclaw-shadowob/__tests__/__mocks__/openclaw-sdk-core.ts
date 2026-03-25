/**
 * Mock: openclaw/plugin-sdk/core
 *
 * Provides test-compatible implementations of the OpenClaw SDK core helpers.
 * At runtime, these are provided by the OpenClaw host.
 */

export function defineChannelPluginEntry(opts: {
  id: string
  name: string
  description: string
  plugin: any
  configSchema?: any
  setRuntime?: (runtime: any) => void
  registerFull?: (api: any) => void
}) {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    register(api: any) {
      if (opts.setRuntime) opts.setRuntime(api.runtime)
      api.registerChannel({ plugin: opts.plugin })
      if (api.registrationMode === 'full' && opts.registerFull) {
        opts.registerFull(api)
      }
    },
  }
}

export function defineSetupPluginEntry(plugin: any) {
  return { plugin }
}

export function buildChannelConfigSchema(schema: any) {
  return schema
}

/**
 * Mock createChatChannelPlugin — spreads the full base object (including config,
 * meta, capabilities, etc.) and merges with adapters, matching the real SDK.
 */
export function createChatChannelPlugin<T = any>(options: {
  base: any
  security?: any
  threading?: any
  outbound?: any
}): any {
  const base = options.base ?? {}
  const plugin: Record<string, any> = {
    ...base,
    security: options.security,
    threading: options.threading,
    outbound: options.outbound,
  }
  return plugin
}

export function createChannelPluginBase(options: {
  id: string
  config?: any
  setup?: any
  [key: string]: any
}): any {
  return {
    id: options.id,
    ...(options.config ? { config: options.config } : {}),
    setup: options.setup,
  }
}

// Type stubs
export type OpenClawConfig = Record<string, any>
