import {
  attachConnectorRuntimeAssets,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'opencli',
  name: 'OpenCLI',
  description:
    'OpenCLI turns websites, browser sessions, Electron apps, and local tools into deterministic CLI commands for agent workflows.',
  category: 'automation',
  icon: 'terminal',
  website: 'https://github.com/jackwener/opencli',
  docs: 'https://github.com/jackwener/opencli/tree/main/docs',
  fields: [],
  authType: 'none',
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: ['opencli', 'browser', 'automation', 'cli', 'adapter', 'electron'],
  popularity: 84,
})

const runtimeDependencies = [
  npmGlobalDependency('opencli', ['@jackwener/opencli'], 'OpenCLI browser and adapter CLI'),
]

const skillSources = [
  {
    id: 'opencli-skills',
    kind: 'git' as const,
    url: 'https://github.com/jackwener/opencli.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/opencli',
    include: [
      'opencli-adapter-author',
      'opencli-autofix',
      'opencli-browser',
      'opencli-usage',
      'smart-search',
    ],
    description: 'OpenCLI agent skills for browser automation, adapter authoring, and usage',
  },
]

const verificationChecks = [
  installedCheck('opencli-cli-installed', 'OpenCLI CLI installed', ['opencli', '--version']),
  {
    id: 'opencli-skills-mounted',
    label: 'OpenCLI skills mounted',
    kind: 'command' as const,
    command: ['test', '-f', '/workspace/.agents/plugin-skills/opencli/opencli-usage/SKILL.md'],
    timeoutMs: 5_000,
    risk: 'safe' as const,
  },
  {
    id: 'opencli-skill-discovered',
    label: 'OpenCLI skill discovered by AgentRuntime',
    kind: 'command' as const,
    command: [
      'sh',
      '-c',
      `if test -f /app/node_modules/openclaw/openclaw.mjs; then output=$(OPENCLAW_CONFIG_PATH=/tmp/openclaw/config/openclaw.json node /app/node_modules/openclaw/openclaw.mjs skills info opencli-usage --json) && printf '%s' "$output" | grep -q '"eligible": true'; else test -f /workspace/.agents/skills/opencli-usage/SKILL.md; fi`,
    ],
    timeoutMs: 15_000,
    risk: 'safe' as const,
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'opencli',
      command: 'opencli',
      description:
        'OpenCLI command hub for website adapters, browser bridge operations, and local tool wrappers',
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks,
  prompt:
    'Use OpenCLI for deterministic website adapters, browser bridge workflows, Electron app control, and local CLI hub tasks. Prefer built-in adapters for read-only public data. Ask before browser-backed actions that require a user session, account state, or writes.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/opencli',
})
