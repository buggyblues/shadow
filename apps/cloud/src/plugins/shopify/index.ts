import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'shopify',
  name: 'Shopify',
  description:
    'Shopify store operations for product catalog work, orders, themes, subscriptions, app stack review, and store diagnostics.',
  category: 'automation',
  icon: 'shopping-bag',
  website: 'https://shopify.dev',
  docs: 'https://shopify.dev/docs/apps/build/ai-toolkit',
  fields: [
    connectorField('SHOPIFY_STORE_DOMAIN', 'Shopify store domain', {
      description: 'Your myshopify.com store domain.',
      sensitive: false,
      placeholder: 'example.myshopify.com',
      helpUrl: 'https://shopify.dev/docs/apps/build/cli-for-apps/authentication',
    }),
    connectorField('SHOPIFY_ADMIN_ACCESS_TOKEN', 'Admin API access token', {
      description: 'Admin API access token with the scopes your Buddy needs.',
      placeholder: 'shpat_...',
      helpUrl: 'https://shopify.dev/docs/api/admin-rest#authentication',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['commerce', 'shopify', 'orders', 'products', 'subscriptions', 'themes', 'mcp'],
  popularity: 98,
})

const runtimeDependencies = [
  npmGlobalDependency('shopify-cli', ['@shopify/cli'], 'Shopify CLI runtime package'),
]

const skillSources = [
  {
    id: 'shopify-ai-toolkit-skills',
    kind: 'git' as const,
    url: 'https://github.com/Shopify/shopify-ai-toolkit.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/shopify',
    includePattern: 'shopify-*',
    description: 'Shopify AI Toolkit skills',
  },
]

const verificationChecks = [
  installedCheck('shopify-cli-installed', 'Shopify CLI installed', ['shopify', '--version']),
  {
    id: 'shopify-skills-mounted',
    label: 'Shopify skills mounted',
    kind: 'command' as const,
    command: ['test', '-f', '/workspace/.agents/plugin-skills/shopify/shopify-admin/SKILL.md'],
    timeoutMs: 5_000,
    risk: 'safe' as const,
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'shopify',
      command: 'shopify',
      description: 'Shopify CLI for theme, app, and store development workflows',
    },
  ],
  mcp: {
    id: 'shopify-dev-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@shopify/dev-mcp@latest'],
    description: 'Shopify Dev MCP for Shopify platform documentation and development tools',
  },
  runtimeDependencies,
  skillSources,
  verificationChecks,
  prompt:
    'Use Shopify for store diagnostics, product and order analysis, app stack review, subscription troubleshooting, and theme workflows. Confirm write actions before changing products, orders, themes, subscriptions, or app settings.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/shopify',
})
