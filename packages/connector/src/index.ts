import {
  CC_CONNECT_FORK_DOCS_URL,
  CC_CONNECT_FORK_REPO,
  CC_CONNECT_FORK_SHORT_REF,
} from './cc-connect-fork.js'

export type ShadowConnectorTarget = 'openclaw' | 'hermes' | 'cc-connect'

export interface ShadowConnectorInput {
  target: ShadowConnectorTarget
  serverUrl: string
  token: string
  hermesHome?: string
  workDir?: string
  projectName?: string
  agentType?: 'codex' | 'claudecode' | 'opencode' | 'gemini' | 'cursor' | string
}

export interface ConnectorCommand {
  label: string
  command: string
}

export interface ConnectorConfigBlock {
  label: string
  language: 'bash' | 'json' | 'toml' | 'yaml' | 'text'
  content: string
}

export interface ConnectorPlan {
  target: ShadowConnectorTarget
  title: string
  summary: string
  connectCommand: string
  quickCommand: string
  commands: ConnectorCommand[]
  configBlocks: ConnectorConfigBlock[]
  aiPrompt: string
  docsUrl: string
  capabilities: string[]
}

const DEFAULT_SERVER_URL = 'https://shadowob.com'
const DEFAULT_WORK_DIR = '.'
const DEFAULT_PROJECT_NAME = 'shadow-buddy'
const DEFAULT_CC_AGENT = 'codex'

const shellQuote = (value: string): string => {
  if (!value) return "''"
  return `'${value.replace(/'/g, `'\\''`)}'`
}

const normalizeServerUrl = (value: string): string => {
  const trimmed = value.trim() || DEFAULT_SERVER_URL
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed.replace(/\/$/, '')
}

const tokenOrPlaceholder = (token: string): string => token.trim() || '<BUDDY_TOKEN>'

function buildOpenClawPlan(input: RequiredCoreInput): ConnectorPlan {
  const token = tokenOrPlaceholder(input.token)
  const serverUrl = normalizeServerUrl(input.serverUrl)
  const jsonConfig = JSON.stringify(
    {
      channels: {
        shadowob: {
          token,
          serverUrl,
        },
      },
    },
    null,
    2,
  )
  const commands = [
    {
      label: 'Install plugin',
      command: 'openclaw plugins install @shadowob/openclaw-shadowob',
    },
    {
      label: 'Set Buddy token',
      command: `openclaw config set channels.shadowob.token ${shellQuote(token)}`,
    },
    {
      label: 'Set Shadow server URL',
      command: `openclaw config set channels.shadowob.serverUrl ${shellQuote(serverUrl)}`,
    },
    {
      label: 'Restart gateway',
      command: 'openclaw gateway restart',
    },
  ]
  const quickCommand = commands.map((item) => item.command).join(' && ')
  const connectCommand = [
    'npx @shadowob/connector@latest connect',
    '--target openclaw',
    `--server-url ${shellQuote(serverUrl)}`,
    `--token ${shellQuote(token)}`,
  ].join(' ')

  return {
    target: 'openclaw',
    title: 'OpenClaw',
    summary:
      'Install the Shadow channel plugin, Shadow CLI bin/skills, and a Buddy CLI profile for OpenClaw.',
    connectCommand,
    quickCommand,
    commands,
    configBlocks: [{ label: '~/.openclaw/openclaw.json', language: 'json', content: jsonConfig }],
    aiPrompt: [
      'Configure this Shadow Buddy in OpenClaw.',
      '',
      `Shadow server URL: ${serverUrl}`,
      `Buddy token: ${token}`,
      '',
      `Preferred one-line setup: ${connectCommand}`,
      'The connector installs/configures the Shadow CLI, official Shadow skill files, and the Buddy profile before applying the OpenClaw channel config.',
      '',
      'Run these steps in order:',
      ...commands.map((item, index) => `${index + 1}. ${item.command}`),
      '',
      'Confirm each step and then verify the gateway is running.',
    ].join('\n'),
    docsUrl: '/product/index.html',
    capabilities: [
      'channelMessages',
      'dms',
      'threads',
      'mentions',
      'attachments',
      'images',
      'interactive',
      'slashCommands',
      'onlineStatus',
      'typing',
      'activityStatus',
      'reactions',
      'editDelete',
      'statusChecks',
      'usageCosts',
      'multiAgentBinding',
      'shadowCliLogin',
      'notifications',
      'officialSkills',
      'cronTasks',
    ],
  }
}

function buildHermesPlan(input: RequiredCoreInput): ConnectorPlan {
  const token = tokenOrPlaceholder(input.token)
  const serverUrl = normalizeServerUrl(input.serverUrl)
  const envBlock = [
    `SHADOW_BASE_URL=${shellQuote(serverUrl)}`,
    `SHADOW_TOKEN=${shellQuote(token)}`,
    'SHADOW_ALLOW_ALL_USERS=true',
    'SHADOW_HEARTBEAT_INTERVAL_SECONDS=30',
    `SHADOW_SLASH_COMMANDS_JSON=${shellQuote('[]')}`,
  ].join('\n')
  const yamlConfig = [
    'plugins:',
    '  enabled:',
    '    - shadowob',
    '',
    'platforms:',
    '  shadowob:',
    '    enabled: true',
    `    token: "${token}"`,
    '    extra:',
    `      base_url: "${serverUrl}"`,
    '      mention_only: false',
    '      rest_only: false',
    '      catchup_minutes: 0',
    '      download_media: true',
    '      slash_commands: []',
  ].join('\n')
  const commands = [
    {
      label: 'Copy plugin directory',
      command:
        'mkdir -p ~/.hermes/plugins && cp -R ./packages/connector/hermes-shadowob-plugin ~/.hermes/plugins/shadowob',
    },
    {
      label: 'Install plugin dependencies',
      command: 'python -m pip install -r ~/.hermes/plugins/shadowob/requirements.txt',
    },
    {
      label: 'Enable plugin',
      command: 'hermes plugins enable shadowob',
    },
    {
      label: 'Start gateway',
      command: 'hermes gateway',
    },
  ]
  const connectCommand = [
    'npx @shadowob/connector@latest connect',
    '--target hermes',
    `--server-url ${shellQuote(serverUrl)}`,
    `--token ${shellQuote(token)}`,
  ].join(' ')

  return {
    target: 'hermes',
    title: 'Hermes Agent',
    summary:
      'Install the ShadowOB Hermes platform plugin, Shadow CLI bin/skills, and a Buddy CLI profile.',
    connectCommand,
    quickCommand: commands.map((item) => item.command).join(' && '),
    commands,
    configBlocks: [
      { label: '~/.hermes/.env', language: 'bash', content: envBlock },
      { label: '~/.hermes/config.yaml', language: 'yaml', content: yamlConfig },
    ],
    aiPrompt: [
      'Configure this Shadow Buddy in Hermes Agent.',
      '',
      `Shadow server URL: ${serverUrl}`,
      `Buddy token: ${token}`,
      '',
      `Preferred one-line setup: ${connectCommand}`,
      'The connector installs/configures the Shadow CLI, official Shadow skill files, and the Buddy profile before writing Hermes config. The plugin resolves the Buddy agent id and channel policy from Shadow at runtime.',
    ].join('\n'),
    docsUrl: 'https://hermes-agent.nousresearch.com/docs/user-guide/messaging',
    capabilities: [
      'channelMessages',
      'dms',
      'threads',
      'attachments',
      'images',
      'interactive',
      'slashCommands',
      'onlineStatus',
      'typing',
      'activityStatus',
      'cronDelivery',
      'statusChecks',
      'usageCosts',
      'shadowCliLogin',
      'notifications',
      'officialSkills',
    ],
  }
}

function buildCcConnectPlan(input: RequiredCoreInput): ConnectorPlan {
  const token = tokenOrPlaceholder(input.token)
  const serverUrl = normalizeServerUrl(input.serverUrl)
  const projectName = input.projectName?.trim() || DEFAULT_PROJECT_NAME
  const workDir = input.workDir?.trim() || DEFAULT_WORK_DIR
  const agentType = input.agentType?.trim() || DEFAULT_CC_AGENT
  const tomlConfig = [
    'language = "zh"',
    '',
    '[[projects]]',
    `name = "${projectName}"`,
    '',
    '[projects.agent]',
    `type = "${agentType}"`,
    '',
    '[projects.agent.options]',
    `work_dir = "${workDir}"`,
    '',
    '[[projects.platforms]]',
    'type = "shadowob"',
    '',
    '[projects.platforms.options]',
    `token = "${token}"`,
    `server_url = "${serverUrl}"`,
    'allow_from = "*"',
    'listen_dms = true',
    'share_session_in_channel = false',
    'progress_style = "compact"',
  ].join('\n')
  const connectCommand = [
    'npx @shadowob/connector@latest connect',
    '--target cc-connect',
    `--server-url ${shellQuote(serverUrl)}`,
    `--token ${shellQuote(token)}`,
    `--work-dir ${shellQuote(workDir)}`,
    `--project-name ${shellQuote(projectName)}`,
    `--agent-type ${shellQuote(agentType)}`,
  ].join(' ')
  const installCommand = `${connectCommand} --install`
  const startCommand = `${connectCommand} --install --start`
  const commands = [
    {
      label: 'Install ShadowOB cc-connect fork',
      command: installCommand,
    },
    { label: 'Create config directory', command: 'mkdir -p ~/.cc-connect' },
    {
      label: 'Edit config',
      command: '$EDITOR ~/.cc-connect/config.toml',
    },
    { label: 'Start ShadowOB cc-connect fork', command: startCommand },
  ]

  return {
    target: 'cc-connect',
    title: 'cc-connect',
    summary: `Use ${CC_CONNECT_FORK_REPO}@${CC_CONNECT_FORK_SHORT_REF} with ShadowOB Socket.IO support, Shadow CLI bin/skills, and a Buddy CLI profile.`,
    connectCommand: startCommand,
    quickCommand: startCommand,
    commands,
    configBlocks: [{ label: '~/.cc-connect/config.toml', language: 'toml', content: tomlConfig }],
    aiPrompt: [
      'Configure this Shadow Buddy in cc-connect.',
      '',
      `Shadow server URL: ${serverUrl}`,
      `Buddy token: ${token}`,
      `Project work_dir: ${workDir}`,
      `Agent type: ${agentType}`,
      '',
      `Preferred one-line setup: ${startCommand}`,
      `Install ${CC_CONNECT_FORK_REPO}@${CC_CONNECT_FORK_SHORT_REF}, install/configure the Shadow CLI and official Shadow skill files, add the TOML platform block, and start cc-connect.`,
    ].join('\n'),
    docsUrl: CC_CONNECT_FORK_DOCS_URL,
    capabilities: [
      'channelMessages',
      'dms',
      'attachments',
      'images',
      'interactive',
      'slashCommands',
      'typing',
      'streamingPreviews',
      'forms',
      'statusChecks',
      'usageCosts',
      'multiAgentBinding',
      'shadowCliLogin',
      'notifications',
    ],
  }
}

type RequiredCoreInput = ShadowConnectorInput

export function createConnectorPlan(input: ShadowConnectorInput): ConnectorPlan {
  if (input.target === 'openclaw') return buildOpenClawPlan(input)
  if (input.target === 'hermes') return buildHermesPlan(input)
  if (input.target === 'cc-connect') return buildCcConnectPlan(input)
  throw new Error(`Unsupported connector target: ${String(input.target)}`)
}

export function createConnectorPlans(input: Omit<ShadowConnectorInput, 'target'>): ConnectorPlan[] {
  return (['openclaw', 'hermes', 'cc-connect'] as const).map((target) =>
    createConnectorPlan({ ...input, target }),
  )
}
