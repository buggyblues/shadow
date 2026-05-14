import { connectorField, connectorManifest } from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'google-ads',
  name: 'Google Ads',
  description:
    'Google Ads analysis for PMax diagnosis, search terms, conversion tracking, budget anomalies, ROAS, and campaign reporting.',
  category: 'analytics',
  icon: 'badge-dollar-sign',
  website: 'https://developers.google.com/google-ads',
  docs: 'https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server',
  fields: [
    connectorField('GOOGLE_PROJECT_ID', 'Google Cloud project ID', {
      description: 'Google Cloud project used by the Google Ads MCP server.',
      sensitive: false,
      placeholder: 'my-gcp-project',
    }),
    connectorField('GOOGLE_ADS_DEVELOPER_TOKEN', 'Developer token', {
      description: 'Google Ads API developer token.',
      placeholder: 'Developer token',
    }),
    connectorField('GOOGLE_ADS_MCP_OAUTH_CLIENT_ID', 'OAuth client ID', {
      description: 'OAuth client ID for installed-app Google Ads access.',
      required: false,
      sensitive: false,
      placeholder: 'OAuth client ID',
    }),
    connectorField('GOOGLE_ADS_MCP_OAUTH_CLIENT_SECRET', 'OAuth client secret', {
      description: 'OAuth client secret for installed-app Google Ads access.',
      required: false,
      placeholder: 'OAuth client secret',
    }),
    connectorField('GOOGLE_APPLICATION_CREDENTIALS_JSON', 'Application credentials JSON', {
      description: 'Service-account or application-default credentials JSON for Google APIs.',
      required: false,
      placeholder: '{"type":"service_account","project_id":"..."}',
    }),
    connectorField('GOOGLE_ADS_LOGIN_CUSTOMER_ID', 'Login customer ID', {
      description: 'Manager account customer ID, when applicable.',
      required: false,
      sensitive: false,
      placeholder: '1234567890',
    }),
  ],
  capabilities: ['tool', 'data-source', 'mcp'],
  tags: ['ads', 'google-ads', 'ppc', 'pmax', 'roas', 'mcp'],
  popularity: 96,
})

export default defineConnectorPlugin(manifest, {
  mcp: {
    id: 'google-ads-mcp',
    transport: 'stdio',
    command: 'pipx',
    args: [
      'run',
      '--spec',
      'git+https://github.com/googleads/google-ads-mcp.git',
      'google-ads-mcp',
    ],
    description: 'Google Ads MCP server for read-oriented Google Ads API workflows',
    requiredEnv: ['GOOGLE_PROJECT_ID', 'GOOGLE_ADS_DEVELOPER_TOKEN'],
  },
  credentialFiles: [
    {
      envKey: 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
      path: '/home/shadow/.config/google/application-default-credentials.json',
      mode: '0600',
    },
  ],
  env: (context) => {
    if (!context.secrets.GOOGLE_APPLICATION_CREDENTIALS_JSON) return undefined
    return {
      GOOGLE_APPLICATION_CREDENTIALS:
        '/home/shadow/.config/google/application-default-credentials.json',
    }
  },
  prompt:
    'Use Google Ads for campaign audits, PMax diagnosis, search term analysis, conversion tracking checks, spend anomaly detection, and read-only reporting. Avoid mutating campaigns unless the user explicitly approves.',
})
