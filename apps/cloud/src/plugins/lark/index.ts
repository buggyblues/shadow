import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'lark',
  name: 'Lark / Feishu',
  description:
    'Lark and Feishu workspace operations for messages, docs, Base, sheets, calendar, mail, tasks, meetings, approvals, and weekly execution workflows.',
  category: 'communication',
  icon: 'messages-square',
  website: 'https://open.feishu.cn',
  docs: 'https://github.com/larksuite/cli',
  fields: [
    connectorField('LARKSUITE_CLI_APP_ID', 'App ID', {
      description: 'Feishu or Lark app ID used by lark-cli and Lark MCP.',
      sensitive: false,
      placeholder: 'cli_xxx',
      helpUrl:
        'https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process',
    }),
    connectorField('LARKSUITE_CLI_APP_SECRET', 'App secret', {
      description: 'App secret from the Feishu or Lark developer console.',
      placeholder: 'App secret',
      helpUrl:
        'https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process',
    }),
    connectorField('LARKSUITE_CLI_BRAND', 'Workspace brand', {
      description: 'Use feishu for China tenants or lark for global tenants.',
      required: false,
      sensitive: false,
      placeholder: 'feishu',
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli', 'mcp'],
  tags: ['lark', 'feishu', 'docs', 'base', 'calendar', 'messenger', 'skills', 'mcp'],
  popularity: 99,
})

const runtimeDependencies = [
  npmGlobalDependency('lark-cli', ['@larksuite/cli'], 'Lark / Feishu CLI runtime package'),
]

const skillSources = [
  {
    id: 'lark-cli-skills',
    kind: 'git' as const,
    url: 'https://github.com/larksuite/cli.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/lark',
    includePattern: 'lark-*',
    description: 'Official Lark CLI agent skills',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'lark-cli',
      command: 'lark-cli',
      description: 'Lark / Feishu CLI for workspace docs, messages, Base, and workflow commands',
    },
  ],
  mcp: {
    id: 'lark-mcp',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@larksuiteoapi/lark-mcp@latest'],
    description: 'Official Lark OpenAPI MCP server',
    requiredEnv: ['LARKSUITE_CLI_APP_ID', 'LARKSUITE_CLI_APP_SECRET'],
  },
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('lark-cli-installed', 'Lark CLI installed', ['lark-cli', '--version']),
    {
      id: 'lark-skills-mounted',
      label: 'Lark skills mounted',
      kind: 'command',
      command: ['test', '-f', '/workspace/.agents/plugin-skills/lark/lark-im/SKILL.md'],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  env: (context) => ({
    LARKSUITE_CLI_BRAND: context.secrets.LARKSUITE_CLI_BRAND || 'feishu',
  }),
  prompt:
    'Use Lark / Feishu for enterprise execution workflows: search and update docs, Base records, sheets, messages, calendars, tasks, meetings, approvals, and weekly reports. Confirm write actions before sending messages, changing records, or editing documents.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/lark',
})
