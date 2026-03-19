import manifest from './openclaw.plugin.json'
import { shadowPlugin } from './src/plugin.js'
import { setShadowRuntime } from './src/runtime.js'
import type { OpenClawPluginApi, OpenClawPluginDefinition } from './src/types.js'

export { ShadowClient } from '@shadowob/sdk'
export { monitorShadowProvider } from './src/monitor.js'
export { shadowPlugin } from './src/plugin.js'

const plugin: OpenClawPluginDefinition = {
  id: manifest.id,
  name: manifest.name,
  description: manifest.description,
  configSchema: {
    safeParse: (v: unknown) => ({ success: true as const, data: v }),
    jsonSchema: manifest.configSchema,
  },
  register(api: OpenClawPluginApi) {
    setShadowRuntime(api.runtime)
    api.registerChannel({ plugin: shadowPlugin })
  },
}

export default plugin
