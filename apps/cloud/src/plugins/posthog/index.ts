import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'posthog',
  name: 'PostHog',
  description:
    'PostHog ProductOps covers funnels, retention, feature flags, experiments, session replay, HogQL, logs, and product-growth diagnostics.',
  category: 'analytics',
  icon: 'line-chart',
  website: 'https://posthog.com',
  docs: 'https://posthog.com/docs/model-context-protocol',
  oauth: {
    authorizationUrl: 'https://oauth.posthog.com/oauth/authorize/',
    tokenUrl: 'https://oauth.posthog.com/oauth/token/',
    scopes: [
      'openid',
      'profile',
      'email',
      'user:read',
      'organization:read',
      'project:read',
      'query:read',
      'query:write',
      'insight:read',
      'insight:write',
      'dashboard:read',
      'dashboard:write',
      'event_definition:read',
      'event_definition:write',
      'property_definition:read',
      'property_definition:write',
      'annotation:read',
      'annotation:write',
      'cohort:read',
      'cohort:write',
      'person:read',
      'feature_flag:read',
      'feature_flag:write',
    ],
    pkce: true,
    accessTokenField: 'POSTHOG_API_KEY',
    authorizationParams: {
      response_mode: 'query',
      required_access_level: 'organization',
    },
    tokenEndpointAuthMethod: 'none',
    clientSecretOptional: true,
  },
  fields: [
    connectorField('POSTHOG_API_KEY', 'PostHog API key', {
      description: 'Personal or project API key for PostHog.',
      placeholder: 'phx_...',
      helpUrl: 'https://posthog.com/docs/api/overview',
    }),
    connectorField('POSTHOG_PROJECT_ID', 'Project ID', {
      description: 'Optional default project.',
      required: false,
      sensitive: false,
      placeholder: 'project id',
    }),
    connectorField('POSTHOG_HOST', 'PostHog host', {
      description: 'Optional PostHog host.',
      required: false,
      sensitive: false,
      placeholder: 'https://app.posthog.com',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['posthog', 'analytics', 'feature-flags', 'funnels', 'hogql', 'experiments'],
  popularity: 82,
})

const runtimeDependencies = [
  npmGlobalDependency('posthog', ['posthog-cli'], 'PostHog Endpoints CLI'),
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'posthog',
      command: 'posthog',
      description: 'PostHog CLI for endpoint and product analytics workflows',
      env: {
        POSTHOG_API_KEY: '${env:POSTHOG_API_KEY}',
        POSTHOG_PROJECT_ID: '${env:POSTHOG_PROJECT_ID}',
        POSTHOG_HOST: '${env:POSTHOG_HOST}',
      },
    },
  ],
  mcp: {
    id: 'posthog-mcp',
    transport: 'streamable-http',
    url: 'https://mcp.posthog.com/mcp',
    description: 'PostHog MCP server for analytics, flags, errors, logs, and session replay',
    auth: { type: 'bearer', tokenEnvKey: 'POSTHOG_API_KEY' },
    requiredEnv: ['POSTHOG_API_KEY'],
  },
  runtimeDependencies,
  verificationChecks: [
    installedCheck('posthog-cli-installed', 'PostHog CLI installed', ['posthog', '--help']),
  ],
  prompt:
    'Use PostHog for funnel diagnosis, retention, experiments, feature flag rollout checks, HogQL analysis, session replay, and product-growth reporting. Confirm before changing flags, experiments, or ingestion settings.',
})

export default attachConnectorRuntimeAssets(plugin, { runtimeDependencies })
