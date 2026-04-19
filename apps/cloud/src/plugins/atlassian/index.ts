/**
 * Atlassian plugin — Jira + Confluence for issues, projects, wiki, and search.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['atlassian'],
    entries: [
      {
        id: 'atlassian',
        name: 'Atlassian',
        description: 'Jira issues, projects, sprints, Confluence wiki pages, search',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          ATLASSIAN_API_TOKEN: '${env:ATLASSIAN_API_TOKEN}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          ATLASSIAN_EMAIL: '${env:ATLASSIAN_EMAIL}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          ATLASSIAN_URL: '${env:ATLASSIAN_URL}',
        },
      },
    ],
    install: {
      npmPackages: [
        '@aashari/mcp-server-atlassian-jira',
        '@aashari/mcp-server-atlassian-confluence',
      ],
    },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-remote'],
    env: {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      ATLASSIAN_API_TOKEN: '${env:ATLASSIAN_API_TOKEN}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      ATLASSIAN_USER_EMAIL: '${env:ATLASSIAN_EMAIL}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      ATLASSIAN_SITE_NAME: '${env:ATLASSIAN_URL}',
    },
  },
})
