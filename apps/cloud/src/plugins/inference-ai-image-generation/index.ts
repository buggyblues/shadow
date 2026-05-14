import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'
import type { PluginRuntimeDependency } from '../types.js'

const manifest = connectorManifest({
  id: 'inference-ai-image-generation',
  name: 'AI Image Generation',
  description:
    'AI Image Generation uses inference.sh models for text-to-image, image editing, inpainting, LoRA, upscaling, product mockups, concept art, and marketing visuals.',
  category: 'media',
  icon: 'image',
  website: 'https://skills.sh/infsh-skills/skills/ai-image-generation',
  docs: 'https://github.com/infsh-skills/skills/tree/main/tools/image/ai-image-generation',
  fields: [
    connectorField('INFSH_API_KEY', 'inference.sh API key', {
      description: 'API key used by the belt CLI.',
      placeholder: 'infsh_...',
      helpUrl: 'https://inference.sh/docs/api/authentication',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: ['image-generation', 'inference-sh', 'gpt-image', 'flux', 'gemini', 'grok', 'upscaling'],
  popularity: 86,
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
    id: 'infsh-ai-image-skills',
    kind: 'git' as const,
    url: 'https://github.com/infsh-skills/skills.git',
    ref: 'main',
    from: 'tools/image',
    targetPath: '/workspace/.agents/plugin-skills/inference-ai-image-generation',
    include: [
      'ai-image-generation',
      'gpt-image',
      'flux-image',
      'p-image',
      'p-image-edit',
      'image-upscaling',
      'background-removal',
    ],
    description: 'inference.sh image generation and editing skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'belt',
      command: 'belt',
      description: 'inference.sh CLI for image generation and editing apps',
      env: {
        INFSH_API_KEY: '${env:INFSH_API_KEY}',
      },
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('belt-image-cli-installed', 'belt CLI installed', ['belt', '--help']),
    {
      id: 'infsh-ai-image-skill-mounted',
      label: 'AI Image Generation skill mounted',
      kind: 'command',
      command: [
        'test',
        '-f',
        '/workspace/.agents/plugin-skills/inference-ai-image-generation/ai-image-generation/SKILL.md',
      ],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use AI Image Generation for product mockups, concept art, social graphics, marketing visuals, image editing, inpainting, LoRA workflows, and upscaling through inference.sh. Confirm cost-heavy runs or public asset publishing before execution.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/inference-ai-image-generation',
})
