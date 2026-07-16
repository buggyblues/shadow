import { connectorField, connectorManifest } from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'linear',
  name: 'Linear',
  description:
    'Linear ProjectOps helps Buddies create and triage issues, summarize cycles, connect PRs to work, and keep engineering roadmaps moving.',
  category: 'project-management',
  icon: 'list-checks',
  website: 'https://linear.app',
  docs: 'https://linear.app/docs/mcp',
  oauth: {
    authorizationUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    scopes: ['read', 'write', 'issues:create', 'comments:create'],
    scopeSeparator: ',',
    accessTokenField: 'LINEAR_API_KEY',
    tokenEndpointAuthMethod: 'client-secret-post',
  },
  fields: [
    connectorField('LINEAR_API_KEY', 'Linear API key', {
      description: 'Linear API key for issue and workspace operations.',
      placeholder: 'lin_api_...',
      helpUrl: 'https://linear.app/docs/api-and-webhooks',
    }),
    connectorField('LINEAR_WORKSPACE_ID', 'Workspace ID', {
      description: 'Optional default workspace.',
      required: false,
      sensitive: false,
      placeholder: 'workspace id',
    }),
    connectorField('LINEAR_TEAM_ID', 'Team ID', {
      description: 'Optional default team.',
      required: false,
      sensitive: false,
      placeholder: 'team id',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'mcp'],
  tags: ['linear', 'issues', 'cycles', 'roadmap', 'project-management', 'mcp'],
  popularity: 86,
})

export default defineConnectorPlugin(manifest, {
  mcp: {
    id: 'linear-mcp',
    transport: 'sse',
    url: 'https://mcp.linear.app/sse',
    description: 'Linear MCP server for issues, teams, projects, and cycles',
    auth: { type: 'bearer', tokenEnvKey: 'LINEAR_API_KEY' },
    requiredEnv: ['LINEAR_API_KEY'],
  },
  prompt:
    'Use Linear for issue triage, ticket creation, cycle summaries, roadmap checks, project status, and PR-to-issue workflows. Confirm before creating, assigning, closing, or reprioritizing issues.',
})
