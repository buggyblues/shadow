import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'airtable',
  name: 'Airtable',
  description:
    'Airtable DataOps helps Buddies inspect base schemas, query records and views, prepare bulk updates, debug webhooks, and keep creative or ops data clean.',
  category: 'database',
  icon: 'table',
  website: 'https://airtable.com',
  docs: 'https://support.airtable.com/docs/using-the-airtable-mcp-server',
  fields: [
    connectorField('AIRTABLE_API_KEY', 'Airtable API key', {
      description: 'Personal access token or service token for Airtable.',
      placeholder: 'pat...',
      helpUrl: 'https://airtable.com/developers/web/guides/personal-access-tokens',
    }),
    connectorField('AIRTABLE_BASE_ID', 'Base ID', {
      description: 'Optional default base.',
      required: false,
      sensitive: false,
      placeholder: 'app...',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'mcp'],
  tags: ['airtable', 'base-schema', 'records', 'views', 'webhooks', 'dataops'],
  popularity: 86,
})

const skillSources = [
  {
    id: 'airtable-skills',
    kind: 'git' as const,
    url: 'https://github.com/Airtable/skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/airtable',
    include: ['airtable-overview', 'airtable-filters'],
    description: 'Airtable official agent skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  mcp: {
    id: 'airtable-mcp',
    transport: 'streamable-http',
    url: 'https://mcp.airtable.com/mcp',
    description: 'Airtable MCP server for bases, records, views, and schema inspection',
    auth: { type: 'bearer', tokenEnvKey: 'AIRTABLE_API_KEY' },
    requiredEnv: ['AIRTABLE_API_KEY'],
  },
  skillSources,
  verificationChecks: [
    {
      id: 'airtable-skills-mounted',
      label: 'Airtable skills mounted',
      kind: 'command',
      command: [
        'test',
        '-f',
        '/workspace/.agents/plugin-skills/airtable/airtable-overview/SKILL.md',
      ],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Airtable for base schema audits, record queries, view inspection, bulk update previews, webhook debugging, and data quality checks. Confirm before writing records, changing schema, or modifying automations.',
})

export default attachConnectorRuntimeAssets(plugin, {
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/airtable',
})
