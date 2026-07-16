import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'sentry',
  name: 'Sentry',
  description:
    'Sentry DebugOps turns production issues into root-cause analysis, observability setup, SDK fixes, code-review checks, and patch plans.',
  category: 'devops',
  icon: 'bug',
  website: 'https://sentry.io',
  docs: 'https://docs.sentry.io/ai/agent-skills/',
  oauth: {
    authorizationUrl: 'https://sentry.io/oauth/authorize/',
    tokenUrl: 'https://sentry.io/oauth/token/',
    scopes: ['org:read', 'project:read', 'project:releases', 'event:read', 'event:write'],
    accessTokenField: 'SENTRY_AUTH_TOKEN',
    tokenEndpointAuthMethod: 'client-secret-post',
  },
  fields: [
    connectorField('SENTRY_AUTH_TOKEN', 'Sentry auth token', {
      description: 'Token for Sentry issues, projects, traces, and releases.',
      placeholder: 'sntrys_...',
      helpUrl: 'https://docs.sentry.io/api/auth/',
    }),
    connectorField('SENTRY_ORG', 'Organization slug', {
      description: 'Optional default organization.',
      required: false,
      sensitive: false,
      placeholder: 'my-org',
    }),
    connectorField('SENTRY_PROJECT', 'Project slug', {
      description: 'Optional default project.',
      required: false,
      sensitive: false,
      placeholder: 'my-project',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['sentry', 'debugging', 'observability', 'errors', 'production', 'skills'],
  popularity: 88,
})

const runtimeDependencies = [npmGlobalDependency('sentry-cli', ['@sentry/cli'], 'Sentry CLI')]

const skillSources = [
  {
    id: 'sentry-agent-skills',
    kind: 'git' as const,
    url: 'https://github.com/getsentry/agent-skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/sentry',
    include: [
      'sentry-fix-issues',
      'sentry-pr-code-review',
      'sentry-create-alert',
      'sentry-setup-ai-monitoring',
      'sentry-nextjs-sdk',
      'sentry-react-sdk',
      'sentry-python-sdk',
    ],
    description: 'Sentry official agent skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'sentry-cli',
      command: 'sentry-cli',
      description: 'Sentry CLI for releases, projects, issues, and sourcemaps',
      env: {
        SENTRY_AUTH_TOKEN: '${env:SENTRY_AUTH_TOKEN}',
        SENTRY_ORG: '${env:SENTRY_ORG}',
        SENTRY_PROJECT: '${env:SENTRY_PROJECT}',
      },
    },
  ],
  mcp: {
    id: 'sentry-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@sentry/mcp-server@latest'],
    description: 'Sentry MCP server for issues, errors, projects, and Seer analysis',
    requiredEnv: ['SENTRY_AUTH_TOKEN'],
  },
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('sentry-cli-installed', 'Sentry CLI installed', ['sentry-cli', '--version']),
    {
      id: 'sentry-skills-mounted',
      label: 'Sentry skills mounted',
      kind: 'command',
      command: ['test', '-f', '/workspace/.agents/plugin-skills/sentry/sentry-fix-issues/SKILL.md'],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Sentry for production issue triage, root cause analysis, SDK setup, alerting, release checks, and PR review. Confirm before creating alerts, changing project settings, uploading sourcemaps, or applying fixes.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/sentry',
})
