import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'wonda',
  name: 'Wonda',
  description:
    'Wonda gives Buddies a content-production CLI for images, videos, music, audio, editing, social research, social publishing, and mobile-device automation.',
  category: 'media',
  icon: 'wand-sparkles',
  website: 'https://skills.sh/degausai/wonda/wonda-cli',
  docs: 'https://github.com/degausai/wonda',
  fields: [
    connectorField('WONDA_API_KEY', 'Wonda API key', {
      description: 'Optional API key for authenticated Wonda generation and account features.',
      required: false,
      placeholder: 'Wonda API key',
      helpUrl: 'https://app.wondercat.ai/settings/billing',
    }),
  ],
  authType: 'api-key',
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: ['wonda', 'content', 'image', 'video', 'audio', 'social', 'publishing', 'automation'],
  popularity: 85,
})

const runtimeDependencies = [
  npmGlobalDependency('wonda', ['@degausai/wonda'], 'Wonda content-production CLI'),
]

const skillSources = [
  {
    id: 'wonda-cli-skill',
    kind: 'git' as const,
    url: 'https://github.com/degausai/wonda.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/wonda',
    include: ['wonda-cli'],
    description: 'Wonda CLI skill',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'wonda',
      command: 'wonda',
      description: 'Wonda CLI for media generation, editing, research, publishing, and devices',
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('wonda-cli-installed', 'Wonda CLI installed', ['wonda', '--version']),
    {
      id: 'wonda-cli-skill-mounted',
      label: 'Wonda skill mounted',
      kind: 'command',
      command: ['test', '-f', '/workspace/.agents/plugin-skills/wonda/wonda-cli/SKILL.md'],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Wonda for content creation, media editing, image/video/audio/music generation, social research, social publishing, credential workflows, and mobile-device automation. Confirm before publishing, accepting terms, using credentials, spending credits, or taking actions that affect external accounts.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/wonda',
})
