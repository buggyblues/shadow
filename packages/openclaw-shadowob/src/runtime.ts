/**
 * Shadow PluginRuntime store.
 *
 * Uses the OpenClaw SDK's createPluginRuntimeStore for a standard,
 * host-compatible runtime store.
 */

import type { PluginRuntime } from 'openclaw/plugin-sdk/runtime-store'
import { createPluginRuntimeStore } from 'openclaw/plugin-sdk/runtime-store'

const store = createPluginRuntimeStore<PluginRuntime>(
  'Shadow runtime not initialized — plugin not registered yet',
)

export const setShadowRuntime = store.setRuntime
export const getShadowRuntime = store.getRuntime
export const tryGetShadowRuntime = store.tryGetRuntime
