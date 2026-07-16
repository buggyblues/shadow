import { connectorField, connectorManifest } from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'tencent-docs',
  name: 'Tencent Docs',
  description:
    'Tencent Docs document and spreadsheet workflows for searching, reading, organizing, editing, reporting, and cross-document question answering.',
  category: 'productivity',
  icon: 'file-text',
  website: 'https://docs.qq.com/open',
  docs: 'https://docs.qq.com/open/document/mcp/',
  oauth: {
    authorizationUrl: 'https://docs.qq.com/oauth/v2/authorize',
    tokenUrl: 'https://docs.qq.com/oauth/v2/token',
    scopes: [
      'scope.user.info.base',
      'scope.drive.creatable',
      'scope.drive.editable',
      'scope.drive.file.metadata',
      'scope.drive.file.metadata.readonly',
      'scope.drive.readonly',
      'scope.drive.exportable',
      'scope.doc',
      'scope.sheet',
      'scope.smartsheet.readonly',
      'scope.form',
    ],
    accessTokenField: 'TENCENT_DOCS_ACCESS_TOKEN',
    authorizationParams: { scope: 'all' },
    tokenEndpointAuthMethod: 'client-secret-post',
  },
  fields: [
    connectorField('TENCENT_DOCS_ACCESS_TOKEN', 'Access token', {
      description: 'Tencent Docs access token authorized by QQ or WeChat login.',
      placeholder: 'Access token',
      helpUrl: 'https://docs.qq.com/open/document/mcp/',
    }),
    connectorField('TENCENT_DOCS_CLIENT_ID', 'Client ID', {
      description: 'Optional Tencent Docs application client ID.',
      required: false,
      sensitive: false,
      placeholder: 'Client ID',
    }),
    connectorField('TENCENT_DOCS_CLIENT_SECRET', 'Client secret', {
      description: 'Optional Tencent Docs application client secret.',
      required: false,
      placeholder: 'Client secret',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'mcp'],
  tags: ['tencent-docs', 'docs', 'sheets', 'reports', 'knowledge', 'mcp'],
  popularity: 92,
})

export default defineConnectorPlugin(manifest, {
  prompt:
    'Use Tencent Docs for document search, spreadsheet cleanup, report generation, project document updates, and cross-document Q&A. Confirm write actions before editing or sharing documents.',
})
