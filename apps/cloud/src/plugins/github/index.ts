/**
 * GitHub plugin — skills + CLI first, MCP as fallback.
 *
 * Provides repository management, issues, PRs, code search via:
 * - Bundled 'github' skill for structured operations
 * - `gh` CLI for direct GitHub API access
 * - MCP server for real-time integration (fallback)
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(
  manifest as PluginManifest,
  {
    skills: {
      bundled: ['github'],
      entries: [
        {
          id: 'github',
          name: 'GitHub',
          description: 'Repository management, issues, PRs, code search',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${env:GITHUB_PERSONAL_ACCESS_TOKEN}' },
        },
      ],
      install: { npmPackages: ['@modelcontextprotocol/server-github'] },
    },
    cli: [
      {
        name: 'gh',
        command: 'gh',
        description: 'GitHub CLI — create issues, PRs, manage repos',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { GH_TOKEN: '${env:GITHUB_PERSONAL_ACCESS_TOKEN}' },
      },
    ],
    mcp: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${env:GITHUB_PERSONAL_ACCESS_TOKEN}' },
    },
  },
  (api) => {
    api.onHealthCheck(async (context) => {
      const token = context.secrets.GITHUB_PERSONAL_ACCESS_TOKEN
      if (!token) {
        return { healthy: false, message: 'GITHUB_PERSONAL_ACCESS_TOKEN not configured' }
      }
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${token}` },
        })
        if (res.ok) {
          const user = (await res.json()) as { login: string }
          return { healthy: true, message: `Authenticated as ${user.login}` }
        }
        return { healthy: false, message: `GitHub API returned ${res.status}` }
      } catch (err) {
        return { healthy: false, message: `GitHub API unreachable: ${err}` }
      }
    })
  },
)
