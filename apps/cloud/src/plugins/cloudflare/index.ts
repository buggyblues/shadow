import {
  attachConnectorRuntimeAssets,
  commandCheck,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'cloudflare',
  name: 'Cloudflare',
  description:
    'Cloudflare operations for DNS, WAF, caching, Workers, access rules, security review, and edge performance diagnostics.',
  category: 'devops',
  icon: 'cloud',
  website: 'https://developers.cloudflare.com',
  docs: 'https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/',
  fields: [
    connectorField('CLOUDFLARE_API_TOKEN', 'Cloudflare API token', {
      description: 'API token scoped to the account or zone tasks.',
      placeholder: 'Cloudflare API token',
      helpUrl: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
    }),
    connectorField('CLOUDFLARE_ACCOUNT_ID', 'Account ID', {
      description: 'Default Cloudflare account ID.',
      required: false,
      sensitive: false,
      placeholder: 'Account ID',
    }),
    connectorField('CLOUDFLARE_ZONE_ID', 'Zone ID', {
      description: 'Default Cloudflare zone ID.',
      required: false,
      sensitive: false,
      placeholder: 'Zone ID',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['cloudflare', 'dns', 'waf', 'workers', 'cache', 'security', 'mcp'],
  popularity: 94,
})

const runtimeDependencies = [
  npmGlobalDependency('wrangler', ['wrangler'], 'Cloudflare Wrangler CLI'),
]
const skillSources = [
  {
    id: 'cloudflare-agent-skills',
    kind: 'git' as const,
    url: 'https://github.com/cloudflare/skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/cloudflare',
    include: [
      'cloudflare',
      'wrangler',
      'workers-best-practices',
      'durable-objects',
      'web-perf',
      'agents-sdk',
    ],
    description: 'Cloudflare official agent skills',
  },
]
const verificationChecks = [
  installedCheck('wrangler-installed', 'Wrangler CLI installed', ['wrangler', '--version']),
  {
    id: 'cloudflare-skills-mounted',
    label: 'Cloudflare skills mounted',
    kind: 'command' as const,
    command: ['test', '-f', '/workspace/.agents/plugin-skills/cloudflare/cloudflare/SKILL.md'],
    timeoutMs: 5_000,
    risk: 'safe' as const,
  },
  commandCheck(
    'cloudflare-whoami',
    'Cloudflare token smoke test',
    ['wrangler', 'whoami'],
    ['CLOUDFLARE_API_TOKEN'],
  ),
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'wrangler',
      command: 'wrangler',
      description: 'Cloudflare Wrangler CLI for Workers, Pages, R2, and account workflows',
    },
  ],
  mcp: {
    id: 'cloudflare-mcp',
    transport: 'streamable-http',
    url: 'https://mcp.cloudflare.com/mcp',
    description: 'Cloudflare managed remote MCP servers',
    auth: { type: 'oauth2' },
    requiredEnv: ['CLOUDFLARE_API_TOKEN'],
  },
  runtimeDependencies,
  skillSources,
  verificationChecks,
  prompt:
    'Use Cloudflare for DNS, WAF, cache, Workers, access, logs, and edge performance diagnostics. Ask before changing DNS records, firewall rules, routes, Workers, or account settings.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/cloudflare',
})
