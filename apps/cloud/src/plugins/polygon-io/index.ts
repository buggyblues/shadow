/**
 * Polygon.io plugin — Financial market data via REST API.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['market-data'],
    entries: [
      {
        id: 'market-data',
        name: 'Polygon.io',
        description:
          'Real-time and historical financial market data — stocks, options, forex, crypto',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { POLYGON_API_KEY: '${env:POLYGON_API_KEY}' },
      },
    ],
  },
})

export default plugin
