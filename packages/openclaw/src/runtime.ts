/**
 * Shadow PluginRuntime store.
 *
 * Stores the OpenClaw PluginRuntime reference provided at registration time.
 * All adapters access runtime functions through this module.
 */

import type { PluginRuntime } from './types.js'

let runtime: PluginRuntime | null = null

export function setShadowRuntime(next: PluginRuntime): void {
  runtime = next
}

export function getShadowRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error('Shadow runtime not initialized — plugin not registered yet')
  }
  return runtime
}
