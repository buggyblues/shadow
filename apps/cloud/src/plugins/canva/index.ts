import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'canva',
  name: 'Canva',
  description:
    'Canva CreativeOps supports brand templates, bulk creative generation, Autofill data mapping, asset export, and lightweight design review.',
  category: 'media',
  icon: 'palette',
  website: 'https://www.canva.com',
  docs: 'https://www.canva.dev/docs/connect/mcp-server/',
  oauth: {
    authorizationUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    scopes: [
      'design:meta:read',
      'design:content:read',
      'design:content:write',
      'asset:read',
      'asset:write',
      'folder:read',
      'folder:write',
      'profile:read',
    ],
    pkce: true,
    accessTokenField: 'CANVA_ACCESS_TOKEN',
    tokenEndpointAuthMethod: 'client-secret-basic',
  },
  fields: [
    connectorField('CANVA_ACCESS_TOKEN', 'Canva access token', {
      description: 'Token for Canva Connect API workflows.',
      placeholder: 'Canva access token',
      helpUrl: 'https://www.canva.dev/docs/connect/authentication/',
    }),
    connectorField('CANVA_BRAND_TEMPLATE_ID', 'Brand template ID', {
      description: 'Optional default brand template.',
      required: false,
      sensitive: false,
      placeholder: 'DAF...',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: ['canva', 'creativeops', 'brand', 'autofill', 'bulk-export', 'design'],
  popularity: 91,
})

const runtimeDependencies = [npmGlobalDependency('canva', ['@canva/cli'], 'Canva CLI')]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'canva',
      command: 'canva',
      description: 'Canva CLI for Apps SDK and design automation workflows',
      env: {
        CANVA_ACCESS_TOKEN: '${env:CANVA_ACCESS_TOKEN}',
      },
    },
  ],
  runtimeDependencies,
  verificationChecks: [
    installedCheck('canva-cli-installed', 'Canva CLI installed', ['canva', '--version']),
  ],
  prompt:
    'Use Canva for brand templates, Autofill, creative batch generation, brand asset checks, export workflows, and design review. Confirm before publishing designs, exporting large batches, or changing brand assets.',
})

export default attachConnectorRuntimeAssets(plugin, { runtimeDependencies })
