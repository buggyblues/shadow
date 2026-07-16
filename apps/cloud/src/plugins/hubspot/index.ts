import { connectorField, connectorManifest } from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'hubspot',
  name: 'HubSpot',
  description:
    'HubSpot CRM and Marketing Ops workflows for lead routing, deal hygiene, automation diagnostics, workflow review, and sales operations.',
  category: 'crm',
  icon: 'workflow',
  website: 'https://developers.hubspot.com',
  docs: 'https://developers.hubspot.com/mcp',
  oauth: {
    authorizationUrl: 'https://mcp.hubspot.com/oauth/authorize/user',
    tokenUrl: 'https://mcp.hubspot.com/oauth/v3/token',
    refreshTokenUrl: 'https://mcp.hubspot.com/oauth/v3/token',
    scopes: [],
    pkce: true,
    accessTokenField: 'HUBSPOT_ACCESS_TOKEN',
    tokenEndpointAuthMethod: 'client-secret-post',
  },
  fields: [
    connectorField('HUBSPOT_ACCESS_TOKEN', 'HubSpot private app token', {
      description: 'Private app access token with the needed CRM and automation scopes.',
      placeholder: 'pat-...',
      helpUrl: 'https://developers.hubspot.com/docs/apps/private-apps',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'mcp'],
  tags: ['hubspot', 'crm', 'marketing-ops', 'workflows', 'sales', 'mcp'],
  popularity: 90,
})

export default defineConnectorPlugin(manifest, {
  mcp: {
    id: 'hubspot-mcp',
    transport: 'streamable-http',
    url: 'https://mcp.hubspot.com',
    description: 'HubSpot remote MCP server',
    auth: { type: 'oauth2' },
    requiredEnv: ['HUBSPOT_ACCESS_TOKEN'],
  },
  prompt:
    'Use HubSpot for CRM hygiene, lead routing, deal review, automation troubleshooting, workflow analysis, and sales or marketing operations. Ask before creating or updating CRM records or workflows.',
})
