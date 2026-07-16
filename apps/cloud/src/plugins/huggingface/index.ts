import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'
import type { PluginRuntimeDependency } from '../types.js'

const manifest = connectorManifest({
  id: 'huggingface',
  name: 'Hugging Face',
  description:
    'Hugging Face ModelOps and DatasetOps covers model search, datasets, Spaces, Jobs, evaluations, training workflows, and Hub publishing.',
  category: 'ai-provider',
  icon: 'bot',
  website: 'https://huggingface.co',
  docs: 'https://huggingface.co/docs/hub/agents-skills',
  oauth: {
    authorizationUrl: 'https://huggingface.co/oauth/authorize',
    tokenUrl: 'https://huggingface.co/oauth/token',
    scopes: ['openid', 'profile', 'inference-api', 'read-repos'],
    accessTokenField: 'HF_TOKEN',
    tokenEndpointAuthMethod: 'client-secret-post',
  },
  fields: [
    connectorField('HF_TOKEN', 'Hugging Face token', {
      description: 'Token for Hub, model, dataset, Space, and Jobs workflows.',
      placeholder: 'hf_...',
      helpUrl: 'https://huggingface.co/settings/tokens',
    }),
    connectorField('HF_ORG', 'Organization', {
      description: 'Optional default organization.',
      required: false,
      sensitive: false,
      placeholder: 'org name',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['huggingface', 'models', 'datasets', 'spaces', 'jobs', 'evaluation', 'skills'],
  popularity: 88,
})

const runtimeDependencies: PluginRuntimeDependency[] = [
  {
    id: 'hf-cli-prereqs',
    kind: 'system-package',
    packages: ['python3', 'py3-pip', 'py3-virtualenv'],
    description: 'Python runtime for the Hugging Face CLI',
  },
  {
    id: 'hf-cli',
    kind: 'shell',
    command: [
      'python3 -m venv /runtime-deps/hf-venv && /runtime-deps/hf-venv/bin/pip install --no-cache-dir -U "huggingface_hub[cli]" && mkdir -p /runtime-deps/bin && ln -sf /runtime-deps/hf-venv/bin/hf /runtime-deps/bin/hf',
    ],
    description: 'Hugging Face CLI for AI agents',
  },
]

const skillSources = [
  {
    id: 'huggingface-skills',
    kind: 'git' as const,
    url: 'https://github.com/huggingface/skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/huggingface',
    include: [
      'hf-cli',
      'huggingface-best',
      'huggingface-datasets',
      'huggingface-llm-trainer',
      'huggingface-vision-trainer',
      'huggingface-gradio',
      'huggingface-papers',
    ],
    description: 'Hugging Face official agent skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'hf',
      command: 'hf',
      description: 'Hugging Face CLI for Hub, models, datasets, Spaces, and Jobs',
      env: {
        HF_TOKEN: '${env:HF_TOKEN}',
      },
    },
  ],
  mcp: {
    id: 'huggingface-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'huggingface-mcp-server@latest'],
    description: 'Hugging Face MCP server for Hub resources and agent integrations',
    requiredEnv: ['HF_TOKEN'],
  },
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('hf-cli-installed', 'Hugging Face CLI installed', ['hf', '--help']),
    {
      id: 'huggingface-skills-mounted',
      label: 'Hugging Face skills mounted',
      kind: 'command',
      command: ['test', '-f', '/workspace/.agents/plugin-skills/huggingface/hf-cli/SKILL.md'],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Hugging Face for model and dataset search, training setup, Spaces, Jobs, evaluations, Gradio apps, paper workflows, and Hub publishing. Confirm before uploading models, modifying datasets, launching paid jobs, or publishing Spaces.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/huggingface',
})
