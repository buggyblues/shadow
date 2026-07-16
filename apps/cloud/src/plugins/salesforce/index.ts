import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'salesforce',
  name: 'Salesforce',
  description:
    'Salesforce admin and DevOps workflows for metadata, Flow, Apex tests, LWC, CRM data hygiene, and release diagnostics.',
  category: 'crm',
  icon: 'cloud-cog',
  website: 'https://developer.salesforce.com',
  docs: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_mcp.htm',
  authType: 'oauth2',
  oauth: {
    authorizationUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: ['api', 'refresh_token'],
    accessTokenField: 'SALESFORCE_ACCESS_TOKEN',
    refreshTokenField: 'SALESFORCE_REFRESH_TOKEN',
    authorizationParams: { prompt: 'login consent' },
    tokenEndpointAuthMethod: 'client-secret-post',
    tokenResponseFieldMap: { instance_url: 'SALESFORCE_INSTANCE_URL' },
  },
  fields: [
    connectorField('SALESFORCE_INSTANCE_URL', 'Instance URL', {
      description: 'Salesforce instance URL.',
      sensitive: false,
      placeholder: 'https://your-domain.my.salesforce.com',
    }),
    connectorField('SALESFORCE_ACCESS_TOKEN', 'Access token', {
      description: 'OAuth access token for Salesforce APIs.',
      placeholder: 'Salesforce access token',
    }),
    connectorField('SALESFORCE_CLIENT_ID', 'Connected app client ID', {
      description: 'Connected app client ID for refresh-token flows.',
      required: false,
      sensitive: false,
      placeholder: 'Client ID',
    }),
    connectorField('SALESFORCE_CLIENT_SECRET', 'Connected app client secret', {
      description: 'Connected app client secret for refresh-token flows.',
      required: false,
      placeholder: 'Client secret',
    }),
    connectorField('SALESFORCE_REFRESH_TOKEN', 'Refresh token', {
      description: 'Refresh token for long-running Salesforce access.',
      required: false,
      placeholder: 'Refresh token',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['salesforce', 'crm', 'apex', 'lwc', 'metadata', 'devops', 'mcp'],
  popularity: 86,
})

const runtimeDependencies = [npmGlobalDependency('sf', ['@salesforce/cli'], 'Salesforce CLI')]
const verificationChecks = [
  installedCheck('salesforce-cli-installed', 'Salesforce CLI installed', ['sf', '--version']),
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'sf',
      command: 'sf',
      description: 'Salesforce CLI for org, metadata, Apex, Flow, and deployment workflows',
    },
  ],
  mcp: {
    id: 'salesforce-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@salesforce/mcp'],
    description: 'Salesforce DX MCP server and tools',
    requiredEnv: ['SALESFORCE_INSTANCE_URL'],
  },
  runtimeDependencies,
  verificationChecks,
  prompt:
    'Use Salesforce for metadata, Flow, Apex test, LWC, CRM data hygiene, and release diagnostics. Ask before deploying metadata, mutating CRM data, changing automations, or running destructive operations.',
})

export default attachConnectorRuntimeAssets(plugin, { runtimeDependencies })
