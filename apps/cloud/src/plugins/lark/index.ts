import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { definePlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginRuntimeDependency,
  PluginRuntimeSource,
  PluginSecretField,
  PluginValidationResult,
} from '../types.js'

const PLUGIN_ID = 'lark'
const SKILLS_MOUNT = '/workspace/.agents/plugin-skills/lark'
const LARK_CONFIG_DIR = '/home/shadow/.lark-cli'
const LARK_CREDENTIALS_JSON_ENV = 'LARKSUITE_CLI_CREDENTIALS_JSON'
const FEISHU_APP_CONSOLE_URL = 'https://open.feishu.cn/app'
const MEEGLE_CLI_CONFIG_URL = 'https://github.com/larksuite/meegle-cli#configuration'
const LARK_CONFIG_PATHS = [
  `${LARK_CONFIG_DIR}/config.json`,
  `${LARK_CONFIG_DIR}/openclaw/config.json`,
  `${LARK_CONFIG_DIR}/hermes/config.json`,
  `${LARK_CONFIG_DIR}/lark-channel/config.json`,
]
const LARK_PROFILE_NAME = 'shadow-cloud'

const LARK_SECRET_KEYS = {
  appId: 'LARKSUITE_CLI_APP_ID',
  appSecret: 'LARKSUITE_CLI_APP_SECRET',
  brand: 'LARKSUITE_CLI_BRAND',
  defaultAs: 'LARKSUITE_CLI_DEFAULT_AS',
  strictMode: 'LARKSUITE_CLI_STRICT_MODE',
} as const

const MEEGLE_SECRET_KEYS = {
  host: 'MEEGLE_HOST',
  accessToken: 'MEEGLE_USER_ACCESS_TOKEN',
  accessTokenHeader: 'MEEGLE_ACCESS_TOKEN_HEADER',
  userAgent: 'MEEGLE_USER_AGENT',
} as const

const LARK_CONFIG_FIELD_KEYS = new Set<string>(Object.values(LARK_SECRET_KEYS))

const manifest = connectorManifest({
  id: PLUGIN_ID,
  name: 'Lark / Feishu',
  description:
    'Lark, Feishu, and Meegle workspace operations for messages, docs, Base, sheets, calendar, mail, tasks, meetings, approvals, projects, and weekly execution workflows.',
  category: 'communication',
  icon: 'messages-square',
  website: 'https://open.feishu.cn',
  docs: 'https://github.com/larksuite/cli',
  fields: [
    connectorField(LARK_SECRET_KEYS.appId, 'App ID', {
      description: 'Feishu or Lark app ID used by lark-cli. Get it from the app console.',
      sensitive: false,
      placeholder: 'cli_xxx',
      helpUrl: FEISHU_APP_CONSOLE_URL,
    }),
    connectorField(LARK_SECRET_KEYS.appSecret, 'App secret', {
      description:
        'App secret from the Feishu or Lark app console. Cloud writes this into lark-cli config.json instead of raw app env vars so bot CLI calls can mint tenant tokens correctly.',
      placeholder: 'App secret',
      helpUrl: FEISHU_APP_CONSOLE_URL,
    }),
    connectorField(LARK_SECRET_KEYS.brand, 'Workspace brand', {
      description: 'Use feishu for China tenants or lark for global tenants.',
      required: false,
      sensitive: false,
      placeholder: 'feishu',
      helpUrl: FEISHU_APP_CONSOLE_URL,
    }),
    connectorField(LARK_SECRET_KEYS.defaultAs, 'Default identity', {
      description: 'Default lark-cli identity: bot, user, or auto. Defaults to bot.',
      required: false,
      sensitive: false,
      placeholder: 'bot',
    }),
    connectorField(LARK_SECRET_KEYS.strictMode, 'Strict mode', {
      description: 'Restrict lark-cli to bot, user, or off. Defaults to bot.',
      required: false,
      sensitive: false,
      placeholder: 'bot',
    }),
    connectorField(MEEGLE_SECRET_KEYS.host, 'Meegle host', {
      description: 'Meegle site domain, such as project.feishu.cn, meegle.com, or a tenant host.',
      required: false,
      sensitive: false,
      placeholder: 'project.feishu.cn',
      helpUrl: MEEGLE_CLI_CONFIG_URL,
    }),
    connectorField(MEEGLE_SECRET_KEYS.accessToken, 'Meegle user access token', {
      description:
        'Optional Meegle user access token for direct CLI auth. Rotate this token when Meegle returns 401.',
      required: false,
      placeholder: 'u-...',
      helpUrl: MEEGLE_CLI_CONFIG_URL,
    }),
    connectorField(MEEGLE_SECRET_KEYS.accessTokenHeader, 'Meegle token header', {
      description: 'Optional custom Meegle token header. Empty uses Authorization: Bearer <token>.',
      required: false,
      sensitive: false,
      placeholder: 'x-meegle-auth',
      helpUrl: MEEGLE_CLI_CONFIG_URL,
    }),
    connectorField(MEEGLE_SECRET_KEYS.userAgent, 'Meegle user agent suffix', {
      description: 'Optional caller suffix appended to the Meegle CLI User-Agent.',
      required: false,
      sensitive: false,
      placeholder: 'shadow-cloud',
      helpUrl: MEEGLE_CLI_CONFIG_URL,
    }),
  ],
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: [
    'lark',
    'feishu',
    'meegle',
    'docs',
    'base',
    'calendar',
    'messenger',
    'projects',
    'skills',
    'cli',
  ],
  popularity: 99,
})

const runtimeDependencies: PluginRuntimeDependency[] = [
  npmGlobalDependency('lark-cli', ['@larksuite/cli'], 'Lark / Feishu CLI runtime package'),
  npmGlobalDependency('meegle', ['@lark-project/meegle'], 'Meegle CLI runtime package'),
]

const skillSources: PluginRuntimeSource[] = [
  {
    id: 'lark-cli-skills',
    kind: 'git',
    url: 'https://github.com/larksuite/cli.git',
    ref: 'main',
    from: 'skills',
    targetPath: SKILLS_MOUNT,
    includePattern: 'lark-*',
    description: 'Official Lark CLI agent skills, including bundled references and scripts',
  },
  {
    id: 'meegle-cli-skills',
    kind: 'git',
    url: 'https://github.com/larksuite/meegle-cli.git',
    ref: 'main',
    from: 'skills',
    targetPath: SKILLS_MOUNT,
    include: ['meegle'],
    description: 'Official Meegle CLI agent skill and references',
  },
]

const secretFields: PluginSecretField[] = manifest.auth.fields.map((field) => ({
  key: field.key,
  label: field.label,
  description: field.description,
  required: field.required,
  sensitive: field.sensitive,
  placeholder: field.placeholder,
  helpUrl: field.helpUrl,
  ...(LARK_CONFIG_FIELD_KEYS.has(field.key) ? { runtime: false } : {}),
}))

function readString(context: PluginBuildContext, key: string): string | undefined {
  const value = context.secrets[key] ?? context.agentConfig[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function larkBrand(context: PluginBuildContext): 'feishu' | 'lark' {
  return oneOf(readString(context, LARK_SECRET_KEYS.brand), ['feishu', 'lark'] as const, 'feishu')
}

function larkDefaultAs(context: PluginBuildContext): 'bot' | 'user' | 'auto' {
  return oneOf(
    readString(context, LARK_SECRET_KEYS.defaultAs),
    ['bot', 'user', 'auto'] as const,
    'bot',
  )
}

function larkStrictMode(context: PluginBuildContext): 'bot' | 'user' | 'off' {
  return oneOf(
    readString(context, LARK_SECRET_KEYS.strictMode),
    ['bot', 'user', 'off'] as const,
    'bot',
  )
}

function buildLarkCredentialsJson(context: PluginBuildContext): string | undefined {
  const appId = readString(context, LARK_SECRET_KEYS.appId)
  const appSecret = readString(context, LARK_SECRET_KEYS.appSecret)
  if (!appId || !appSecret) return undefined

  return `${JSON.stringify(
    {
      strictMode: larkStrictMode(context),
      currentApp: LARK_PROFILE_NAME,
      apps: [
        {
          name: LARK_PROFILE_NAME,
          appId,
          appSecret,
          brand: larkBrand(context),
          defaultAs: larkDefaultAs(context),
          strictMode: larkStrictMode(context),
          users: [],
        },
      ],
    },
    null,
    2,
  )}\n`
}

function buildSkillConfig(context: PluginBuildContext): PluginConfigFragment {
  return {
    skills: {
      load: { extraDirs: [SKILLS_MOUNT] },
      entries: {
        [PLUGIN_ID]: {
          enabled: true,
          config: {
            larkConfigDir: LARK_CONFIG_DIR,
            skillSources: [SKILLS_MOUNT],
            cli: {
              lark: 'lark-cli',
              meegle: 'meegle',
            },
          },
          env: {
            LARKSUITE_CLI_CONFIG_DIR: LARK_CONFIG_DIR,
            LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
            LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
            ...(readString(context, MEEGLE_SECRET_KEYS.host)
              ? { MEEGLE_HOST: readString(context, MEEGLE_SECRET_KEYS.host) }
              : {}),
          },
        },
      },
    },
  }
}

function buildRuntimeEnv(context: PluginBuildContext): Record<string, string> {
  const env: Record<string, string> = {
    LARKSUITE_CLI_CONFIG_DIR: LARK_CONFIG_DIR,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
  }

  const credentialsJson = buildLarkCredentialsJson(context)
  if (credentialsJson) env[LARK_CREDENTIALS_JSON_ENV] = credentialsJson

  for (const key of Object.values(MEEGLE_SECRET_KEYS)) {
    const value = readString(context, key)
    if (value) env[key] = value
  }

  return env
}

function validateLarkConfig(context: PluginBuildContext): PluginValidationResult {
  const errors: PluginValidationResult['errors'] = []
  if (!readString(context, LARK_SECRET_KEYS.appId)) {
    errors.push({
      path: `secrets.${LARK_SECRET_KEYS.appId}`,
      message: 'Lark / Feishu App ID is required',
      severity: 'error',
    })
  }
  if (!readString(context, LARK_SECRET_KEYS.appSecret)) {
    errors.push({
      path: `secrets.${LARK_SECRET_KEYS.appSecret}`,
      message: 'Lark / Feishu App secret is required',
      severity: 'error',
    })
  }

  const brand = readString(context, LARK_SECRET_KEYS.brand)
  if (brand && !['feishu', 'lark'].includes(brand)) {
    errors.push({
      path: `secrets.${LARK_SECRET_KEYS.brand}`,
      message: 'Workspace brand must be feishu or lark',
      severity: 'error',
    })
  }
  const defaultAs = readString(context, LARK_SECRET_KEYS.defaultAs)
  if (defaultAs && !['bot', 'user', 'auto'].includes(defaultAs)) {
    errors.push({
      path: `secrets.${LARK_SECRET_KEYS.defaultAs}`,
      message: 'Default identity must be bot, user, or auto',
      severity: 'error',
    })
  }
  const strictMode = readString(context, LARK_SECRET_KEYS.strictMode)
  if (strictMode && !['bot', 'user', 'off'].includes(strictMode)) {
    errors.push({
      path: `secrets.${LARK_SECRET_KEYS.strictMode}`,
      message: 'Strict mode must be bot, user, or off',
      severity: 'error',
    })
  }

  return { valid: errors.filter((error) => error.severity === 'error').length === 0, errors }
}

const plugin = definePlugin(manifest, (api) => {
  api.addSecretFields(secretFields)
  api.addSkills({
    entries: [
      {
        id: PLUGIN_ID,
        name: manifest.name,
        description: manifest.description,
        env: {
          LARKSUITE_CLI_CONFIG_DIR: LARK_CONFIG_DIR,
        },
      },
    ],
  })
  api.addCLI([
    {
      name: 'lark-cli',
      command: 'lark-cli',
      description: 'Lark / Feishu CLI for workspace docs, messages, Base, and workflow commands',
      env: {
        LARKSUITE_CLI_CONFIG_DIR: LARK_CONFIG_DIR,
      },
    },
    {
      name: 'meegle',
      command: 'meegle',
      description: 'Meegle CLI for Lark Project work items, schedules, views, and workflows',
    },
  ])
  api.addRuntimeDependencies(runtimeDependencies)
  api.addSkillSources(skillSources)
  api.addCredentialFiles(
    LARK_CONFIG_PATHS.map((path) => ({
      envKey: LARK_CREDENTIALS_JSON_ENV,
      path,
      mode: '0600',
    })),
  )
  api.addVerificationChecks([
    installedCheck('lark-cli-installed', 'Lark CLI installed', ['lark-cli', '--version']),
    installedCheck('meegle-cli-installed', 'Meegle CLI installed', ['meegle', 'version']),
    {
      id: 'lark-cli-auth-status',
      label: 'Lark CLI auth status',
      kind: 'command',
      command: ['lark-cli', 'auth', 'status'],
      timeoutMs: 15_000,
      risk: 'safe',
      requiredEnv: [LARK_CREDENTIALS_JSON_ENV],
    },
    {
      id: 'lark-skills-mounted',
      label: 'Lark skills mounted',
      kind: 'command',
      command: ['test', '-f', `${SKILLS_MOUNT}/lark-im/SKILL.md`],
      timeoutMs: 5_000,
      risk: 'safe',
    },
    {
      id: 'meegle-skill-mounted',
      label: 'Meegle skill mounted',
      kind: 'command',
      command: ['test', '-f', `${SKILLS_MOUNT}/meegle/SKILL.md`],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ])

  api.onBuildConfig(buildSkillConfig)
  api.onBuildEnv(buildRuntimeEnv)
  api.onBuildPrompt(
    () =>
      'Use Lark / Feishu through `lark-cli` and the mounted lark-* skills. Use Meegle through the `meegle` CLI and the mounted meegle skill. Prefer read-only lookups first, cite the exact command used, and ask for explicit approval before sending messages, editing docs, updating Base records, changing project work items, or taking destructive actions.',
  )
  api.onValidate(validateLarkConfig)
  api.onHealthCheck(async (context) =>
    buildLarkCredentialsJson(context)
      ? { healthy: true, message: 'Lark CLI config is ready for runtime injection' }
      : { healthy: false, message: 'Missing Lark CLI App ID or App secret' },
  )
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: SKILLS_MOUNT,
  sanityCommands: [
    '/runtime-deps/bin/lark-cli --version',
    '/runtime-deps/bin/meegle version',
    `test -f /plugin-skills/lark-im/SKILL.md`,
    `test -f /plugin-skills/meegle/SKILL.md`,
  ],
})
