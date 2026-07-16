import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'supabase',
  name: 'Supabase',
  description:
    'Supabase operations for Auth, RLS, schema design, migrations, logs, storage, edge functions, and database troubleshooting.',
  category: 'database',
  icon: 'database',
  website: 'https://supabase.com',
  docs: 'https://supabase.com/docs/guides/getting-started/mcp',
  oauth: {
    authorizationUrl: 'https://api.supabase.com/v1/oauth/authorize',
    tokenUrl: 'https://api.supabase.com/v1/oauth/token',
    scopes: [
      'organizations:read',
      'projects:read',
      'secrets:read',
      'secrets:write',
      'database:read',
      'storage:read',
      'edge_functions:read',
    ],
    accessTokenField: 'SUPABASE_ACCESS_TOKEN',
    tokenEndpointAuthMethod: 'client-secret-basic',
  },
  fields: [
    connectorField('SUPABASE_ACCESS_TOKEN', 'Supabase access token', {
      description: 'Personal access token for Supabase management APIs.',
      placeholder: 'sbp_...',
      helpUrl: 'https://supabase.com/docs/guides/platform/access-control/personal-access-tokens',
    }),
    connectorField('SUPABASE_PROJECT_REF', 'Project ref', {
      description: 'Default project ref.',
      required: false,
      sensitive: false,
      placeholder: 'abcdefghijklmnopqrst',
    }),
    connectorField('SUPABASE_DB_PASSWORD', 'Database password', {
      description: 'Database password for migration and SQL tasks.',
      required: false,
      placeholder: 'Database password',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['supabase', 'postgres', 'auth', 'rls', 'migrations', 'mcp'],
  popularity: 94,
})

const runtimeDependencies = [npmGlobalDependency('supabase', ['supabase'], 'Supabase CLI')]
const skillSources = [
  {
    id: 'supabase-agent-skills',
    kind: 'git' as const,
    url: 'https://github.com/supabase/agent-skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/supabase',
    include: ['supabase', 'supabase-postgres-best-practices'],
    description: 'Supabase official agent skills',
  },
]
const verificationChecks = [
  installedCheck('supabase-cli-installed', 'Supabase CLI installed', ['supabase', '--version']),
  {
    id: 'supabase-skills-mounted',
    label: 'Supabase skills mounted',
    kind: 'command' as const,
    command: ['test', '-f', '/workspace/.agents/plugin-skills/supabase/supabase/SKILL.md'],
    timeoutMs: 5_000,
    risk: 'safe' as const,
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'supabase',
      command: 'supabase',
      description: 'Supabase CLI for projects, migrations, functions, and local development',
    },
  ],
  mcp: {
    id: 'supabase-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase@latest'],
    description: 'Supabase MCP server for project and database operations',
    requiredEnv: ['SUPABASE_ACCESS_TOKEN'],
  },
  runtimeDependencies,
  skillSources,
  verificationChecks,
  prompt:
    'Use Supabase for Auth, RLS, schema, migrations, logs, storage, edge functions, and database diagnostics. Confirm destructive SQL, migration, auth, or policy changes before running them.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/supabase',
})
