import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const SKILLS_MOUNT = '/workspace/.agents/plugin-skills/lovart'

const manifest = connectorManifest({
  id: 'lovart',
  name: 'Lovart',
  description:
    'Lovart connects Buddies to the Lovart AI design agent for image, video, audio, project, thread, and canvas workflows through the official OpenClaw skill.',
  category: 'media',
  icon: 'palette',
  website: 'https://www.lovart.ai',
  docs: 'https://clawhub.ai/lovart-admin/lovart-skill',
  fields: [
    connectorField('LOVART_ACCESS_KEY', 'Access key', {
      description: 'Lovart access key used by the OpenClaw skill.',
      placeholder: 'ak_xxx',
      helpUrl: 'https://clawhub.ai/lovart-admin/lovart-skill',
    }),
    connectorField('LOVART_SECRET_KEY', 'Secret key', {
      description: 'Lovart secret key used by the OpenClaw skill.',
      placeholder: 'sk_xxx',
      helpUrl: 'https://clawhub.ai/lovart-admin/lovart-skill',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action'],
  tags: [
    'lovart',
    'design-agent',
    'image-generation',
    'video-generation',
    'audio-generation',
    'openclaw',
    'skill',
  ],
  popularity: 88,
})

const skillSources = [
  {
    id: 'lovart-openclaw-skill',
    kind: 'git' as const,
    url: 'https://github.com/lovartai/lovart-skill.git',
    ref: 'main',
    from: 'skills',
    targetPath: SKILLS_MOUNT,
    include: ['lovart-skill'],
    description: 'Lovart OpenClaw skill for design generation and project workflows',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  skills: {
    entries: [
      {
        id: 'lovart-skill',
        name: 'Lovart Skill',
        description:
          'Generate images, videos, audio, and manage Lovart projects and threads through Lovart AI.',
        env: {
          LOVART_ACCESS_KEY: '${env:LOVART_ACCESS_KEY}',
          LOVART_SECRET_KEY: '${env:LOVART_SECRET_KEY}',
        },
      },
    ],
  },
  skillSources,
  verificationChecks: [
    {
      id: 'lovart-skill-mounted',
      label: 'Lovart OpenClaw skill mounted',
      kind: 'command',
      command: ['test', '-f', `${SKILLS_MOUNT}/lovart-skill/SKILL.md`],
      timeoutMs: 5_000,
      risk: 'safe',
    },
    {
      id: 'lovart-agent-skill-python-mounted',
      label: 'Lovart agent skill command mounted',
      kind: 'command',
      command: ['test', '-f', `${SKILLS_MOUNT}/lovart-skill/agent_skill.py`],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Lovart for image, video, audio, music, poster, logo, design asset, canvas, project, and thread workflows. Interact with Lovart only through the mounted Lovart OpenClaw skill commands; do not call Lovart APIs directly. Before the first generation in a conversation, follow the skill state checks for config and threads. Ask for explicit user confirmation before running any high-cost pending confirmation.',
})

export default attachConnectorRuntimeAssets(plugin, {
  skillSources,
  skillsMountPath: SKILLS_MOUNT,
})
