import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'figma',
  name: 'Figma',
  description:
    'Figma Design-to-Code Pro helps Buddies inspect design files, implement UI, maintain design-system rules, publish Code Connect mappings, and run design QA.',
  category: 'media',
  icon: 'figma',
  website: 'https://www.figma.com',
  docs: 'https://developers.figma.com/docs/figma-mcp-server/',
  fields: [
    connectorField('FIGMA_ACCESS_TOKEN', 'Figma access token', {
      description: 'Token for Figma REST API and Code Connect workflows.',
      placeholder: 'figd_...',
      helpUrl: 'https://www.figma.com/developers/api#access-tokens',
    }),
    connectorField('FIGMA_TEAM_ID', 'Team ID', {
      description: 'Optional default Figma team.',
      required: false,
      sensitive: false,
      placeholder: 'team id',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: ['figma', 'design-to-code', 'design-system', 'code-connect', 'ui-qa', 'mcp'],
  popularity: 99,
})

const runtimeDependencies = [
  npmGlobalDependency('figma', ['@figma/code-connect'], 'Figma Code Connect CLI'),
]

const skillSources = [
  {
    id: 'figma-mcp-skills',
    kind: 'git' as const,
    url: 'https://github.com/figma/mcp-server-guide.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/figma',
    include: [
      'figma-code-connect',
      'figma-create-design-system-rules',
      'figma-implement-design',
      'figma-use',
      'figma-generate-design',
      'figma-generate-diagram',
    ],
    description: 'Figma MCP and Code Connect agent skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'figma',
      command: 'figma',
      description: 'Figma Code Connect CLI for mapping design components to code',
      env: {
        FIGMA_ACCESS_TOKEN: '${env:FIGMA_ACCESS_TOKEN}',
      },
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('figma-code-connect-installed', 'Figma Code Connect CLI installed', [
      'figma',
      '--help',
    ]),
    {
      id: 'figma-skills-mounted',
      label: 'Figma skills mounted',
      kind: 'command',
      command: [
        'test',
        '-f',
        '/workspace/.agents/plugin-skills/figma/figma-implement-design/SKILL.md',
      ],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Figma for design-to-code, design-system rules, Code Connect mappings, UI implementation, diagram generation, and design QA. Confirm before publishing Code Connect mappings or changing shared design assets.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/figma',
})
