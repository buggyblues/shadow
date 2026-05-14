import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'webflow',
  name: 'Webflow',
  description:
    'Webflow site operations for CMS updates, landing pages, SEO pages, component audits, publishing checks, and content workflows.',
  category: 'automation',
  icon: 'layout-template',
  website: 'https://developers.webflow.com',
  docs: 'https://developers.webflow.com/mcp/reference/overview',
  fields: [
    connectorField('WEBFLOW_TOKEN', 'Webflow access token', {
      description: 'Webflow API access token.',
      placeholder: 'Webflow token',
      helpUrl: 'https://developers.webflow.com/data/reference/token/authorized-by',
    }),
    connectorField('WEBFLOW_SITE_ID', 'Site ID', {
      description: 'Default Webflow site ID.',
      required: false,
      sensitive: false,
      placeholder: 'Site ID',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['webflow', 'cms', 'landing-pages', 'seo', 'publishing', 'mcp'],
  popularity: 86,
})

const skillSources = [
  {
    id: 'webflow-site-skills',
    kind: 'git' as const,
    url: 'https://github.com/webflow/webflow-skills.git',
    ref: 'main',
    from: 'plugins/webflow-skills/skills',
    targetPath: '/workspace/.agents/plugin-skills/webflow',
    includePattern: '*',
    description: 'Webflow site and CMS skills',
  },
  {
    id: 'webflow-cli-skills',
    kind: 'git' as const,
    url: 'https://github.com/webflow/webflow-skills.git',
    ref: 'main',
    from: 'plugins/webflow-cli-skills/skills',
    targetPath: '/workspace/.agents/plugin-skills/webflow',
    includePattern: '*',
    description: 'Webflow CLI workflow skills',
  },
  {
    id: 'webflow-code-component-skills',
    kind: 'git' as const,
    url: 'https://github.com/webflow/webflow-skills.git',
    ref: 'main',
    from: 'plugins/webflow-code-component-skills/skills',
    targetPath: '/workspace/.agents/plugin-skills/webflow',
    includePattern: '*',
    description: 'Webflow code component skills',
  },
]

const runtimeDependencies = [
  npmGlobalDependency('webflow-cli', ['@webflow/webflow-cli'], 'Webflow CLI runtime package'),
]

const verificationChecks = [
  installedCheck('webflow-cli-installed', 'Webflow CLI installed', ['webflow', '--version']),
  {
    id: 'webflow-skills-mounted',
    label: 'Webflow skills mounted',
    kind: 'command' as const,
    command: ['test', '-f', '/workspace/.agents/plugin-skills/webflow/site-audit/SKILL.md'],
    timeoutMs: 5_000,
    risk: 'safe' as const,
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'webflow',
      command: 'webflow',
      description: 'Webflow CLI for Cloud, DevLink, code components, and Designer extensions',
    },
  ],
  mcp: {
    id: 'webflow-mcp',
    transport: 'streamable-http',
    url: 'https://mcp.webflow.com/mcp',
    description: 'Webflow MCP server for Webflow API workflows',
    auth: { type: 'oauth2' },
    requiredEnv: ['WEBFLOW_TOKEN'],
  },
  skillSources,
  runtimeDependencies,
  verificationChecks,
  prompt:
    'Use Webflow for CMS operations, landing page generation, SEO page updates, component audits, publishing checks, and site content workflows. Ask before publishing or modifying live CMS items.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/webflow',
})
