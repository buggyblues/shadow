import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'
import type { PluginRuntimeDependency } from '../types.js'

const manifest = connectorManifest({
  id: 'inference-sh',
  name: 'inference.sh',
  description:
    'inference.sh lets Buddies run cloud AI apps for images, videos, LLMs, search, audio, 3D, and automation through the belt CLI.',
  category: 'automation',
  icon: 'cpu',
  website: 'https://inference.sh/skills',
  docs: 'https://inference.sh/docs/extend/cli-setup',
  fields: [
    connectorField('INFSH_API_KEY', 'inference.sh API key', {
      description: 'API key used by the belt CLI.',
      placeholder: 'infsh_...',
      helpUrl: 'https://inference.sh/docs/api/authentication',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: ['inference-sh', 'belt', 'ai-apps', 'image', 'video', 'llm', 'search', 'skills'],
  popularity: 88,
})

const runtimeDependencies: PluginRuntimeDependency[] = [
  {
    id: 'inference-cli-prereqs',
    kind: 'system-package',
    packages: ['curl', 'ca-certificates', 'tar'],
    description: 'System tools required by the inference.sh CLI installer',
  },
  {
    id: 'inference-cli',
    kind: 'shell',
    command: [
      'mkdir -p /runtime-deps/bin && curl -fsSL https://cli.inference.sh | INSTALL_DIR=/runtime-deps/bin sh',
    ],
    description: 'inference.sh belt CLI installer',
  },
]

const skillSources = [
  {
    id: 'infsh-cli-skill',
    kind: 'git' as const,
    url: 'https://github.com/infsh-skills/skills.git',
    ref: 'main',
    from: 'tools',
    targetPath: '/workspace/.agents/plugin-skills/inference-sh',
    include: ['infsh-cli'],
    description: 'inference.sh CLI skill',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'belt',
      command: 'belt',
      description: 'inference.sh CLI for running cloud AI apps',
      env: {
        INFSH_API_KEY: '${env:INFSH_API_KEY}',
      },
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('belt-cli-installed', 'belt CLI installed', ['belt', '--help']),
    {
      id: 'infsh-cli-skill-mounted',
      label: 'inference.sh skill mounted',
      kind: 'command',
      command: ['test', '-f', '/workspace/.agents/plugin-skills/inference-sh/infsh-cli/SKILL.md'],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use inference.sh for cloud AI app workflows across image generation, video generation, LLM calls, web search, audio, 3D, and automation. Confirm actions before publishing content, posting to social platforms, or running cost-heavy jobs.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/inference-sh',
})
