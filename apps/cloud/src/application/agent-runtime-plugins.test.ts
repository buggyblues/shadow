import { beforeEach, describe, expect, it } from 'vitest'
import { resetPluginRegistry } from '../plugins/registry.js'
import { getAgentRuntimePlugin, listAgentRuntimePlugins } from './agent-runtime-plugins.js'

describe('Agent Runtime plugin catalog', () => {
  beforeEach(() => resetPluginRegistry())

  it('loads Runtime contributions through the plugin registry', async () => {
    const runtimes = await listAgentRuntimePlugins()
    expect(runtimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'openclaw',
          pluginId: 'shadow-agent-runtimes',
          supportsMultipleBuddies: true,
          persistentState: true,
        }),
      ]),
    )
    expect(await getAgentRuntimePlugin('codex')).toEqual(
      expect.objectContaining({ adapterId: 'codex', minimumResourceTier: 'lightweight' }),
    )
  })

  it('returns null for an unregistered Runtime id', async () => {
    expect(await getAgentRuntimePlugin('missing-runtime')).toBeNull()
  })
})
