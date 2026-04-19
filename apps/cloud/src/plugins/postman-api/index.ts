/**
 * Postman API plugin — API testing and development platform.
 * Uses the official Postman CLI (postman-cli npm package).
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['postman'],
    entries: [
      {
        id: 'postman',
        name: 'Postman API Testing',
        description: 'Run API tests, manage collections, and monitor endpoints',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        apiKey: '${env:POSTMAN_API_KEY}',
      },
    ],
    install: { npmPackages: ['postman-cli'] },
  },
  cli: [
    {
      name: 'postman',
      command: 'postman',
      description: 'Postman CLI — run collections, tests, and API monitoring',
      npmPackage: 'postman-cli',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { POSTMAN_API_KEY: '${env:POSTMAN_API_KEY}' },
    },
  ],
})
