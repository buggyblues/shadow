/**
 * Google Workspace plugin — gws CLI, Workspace agent skills, and credential files.
 */

import { definePlugin } from '../helpers.js'
import { buildRuntimeAssetK8sProvider } from '../runtime-assets.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginManifest,
  PluginValidationResult,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const PLUGIN_ID = 'google-workspace'
const GWS_PACKAGE = '@googleworkspace/cli'
const GWS_REPO = 'https://github.com/googleworkspace/cli.git'
const RUNTIME_MOUNT = '/opt/shadow-plugin-deps/google-workspace'
const SKILLS_MOUNT = '/workspace/.agents/plugin-skills/google-workspace'
const CREDENTIALS_FILE = '/home/shadow/.config/gws/credentials.json'
const ADC_FILE = '/home/shadow/.config/gws/application-default-credentials.json'
const AUTH_ENV_KEYS = ['GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON', 'GOOGLE_WORKSPACE_CLI_TOKEN']
const SECRET_FIELD_KEYS = {
  credentialsJson: 'GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON',
  accessToken: 'GOOGLE_WORKSPACE_CLI_TOKEN',
} as const
const LEGACY_SECRET_FIELD_KEYS = {
  credentialsJson: 'GOOGLE_WORKSPACE_CREDENTIALS_JSON',
  adcJson: 'GOOGLE_WORKSPACE_ADC_JSON',
  applicationCredentialsJson: 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  cliToken: 'GOOGLE_WORKSPACE_CLI_TOKEN',
  accessToken: 'GOOGLE_WORKSPACE_ACCESS_TOKEN',
} as const
const RUNTIME_DEPENDENCIES = [
  {
    id: 'gws-cli',
    kind: 'npm-global' as const,
    packages: [GWS_PACKAGE],
    targetPath: '/runtime-deps',
    binPath: '/runtime-deps/bin/gws',
    description: 'Google Workspace CLI binary',
  },
]
const SKILL_SOURCES = [
  {
    id: 'google-workspace-cli-skills',
    kind: 'git' as const,
    url: GWS_REPO,
    ref: 'main',
    from: 'skills',
    targetPath: SKILLS_MOUNT,
    includePattern: 'gws-*',
    description: 'Google Workspace CLI agent skills',
  },
]

function isEnabledForAgent(agent: { use?: Array<{ plugin?: string }> }, configUse?: unknown) {
  const agentEnabled = agent.use?.some((entry) => entry.plugin === PLUGIN_ID)
  const globalEnabled =
    Array.isArray(configUse) &&
    configUse.some((entry) => entry && typeof entry === 'object' && entry.plugin === PLUGIN_ID)
  return Boolean(agentEnabled || globalEnabled)
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  )
  return items.length > 0 ? items : fallback
}

function firstSecret(context: PluginBuildContext, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = context.secrets[key]
    if (value) return value
  }
  return undefined
}

function hasWorkspaceCredential(context: PluginBuildContext): boolean {
  return Boolean(
    firstSecret(context, [
      SECRET_FIELD_KEYS.accessToken,
      LEGACY_SECRET_FIELD_KEYS.accessToken,
      LEGACY_SECRET_FIELD_KEYS.cliToken,
    ]) ||
      firstSecret(context, [
        SECRET_FIELD_KEYS.credentialsJson,
        LEGACY_SECRET_FIELD_KEYS.credentialsJson,
        LEGACY_SECRET_FIELD_KEYS.adcJson,
        LEGACY_SECRET_FIELD_KEYS.applicationCredentialsJson,
      ]),
  )
}

const googleWorkspaceK8sProvider = buildRuntimeAssetK8sProvider({
  pluginId: PLUGIN_ID,
  isEnabled: (agent, config) => isEnabledForAgent(agent, config.use),
  runtimeMountPath: RUNTIME_MOUNT,
  skillsMountPath: SKILLS_MOUNT,
  runtimeVolumeName: 'google-workspace-runtime',
  skillsVolumeName: 'google-workspace-skills',
  runtimeDependencies: RUNTIME_DEPENDENCIES,
  skillSources: SKILL_SOURCES,
  envVars: [{ name: 'GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE', value: CREDENTIALS_FILE }],
  sanityCommands: ['/runtime-deps/bin/gws --version', 'test -f /plugin-skills/gws-shared/SKILL.md'],
})

const plugin = definePlugin(manifest as PluginManifest, (api) => {
  api.addSecretFields([
    {
      key: SECRET_FIELD_KEYS.credentialsJson,
      label: 'Google Workspace credentials.json',
      description:
        'Paste credentials.json from `gws auth export --unmasked`, or a service-account JSON.',
      sensitive: true,
      placeholder: '{"installed":{"client_id":"..."}}',
      aliases: [
        LEGACY_SECRET_FIELD_KEYS.credentialsJson,
        LEGACY_SECRET_FIELD_KEYS.adcJson,
        LEGACY_SECRET_FIELD_KEYS.applicationCredentialsJson,
      ],
    },
    {
      key: SECRET_FIELD_KEYS.accessToken,
      label: 'Google Workspace access token',
      description:
        'Optional OAuth2 access token. The Cloud Computer account authorization flow fills this automatically.',
      sensitive: true,
      placeholder: 'ya29...',
      aliases: [LEGACY_SECRET_FIELD_KEYS.accessToken, LEGACY_SECRET_FIELD_KEYS.cliToken],
    },
  ])

  api.addCLI([
    {
      name: 'gws',
      command: 'gws',
      description: 'Google Workspace CLI for Gmail, Calendar, Drive, Docs, Sheets, Chat, Admin',
      env: {
        GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: CREDENTIALS_FILE,
      },
    },
  ])

  api.addRuntimeDependencies(RUNTIME_DEPENDENCIES)
  api.addSkillSources(SKILL_SOURCES)
  api.addCredentialFiles([
    {
      envKey: 'GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON',
      path: CREDENTIALS_FILE,
      mode: '0600',
    },
    {
      envKey: 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
      path: ADC_FILE,
      mode: '0600',
    },
  ])
  api.addVerificationChecks([
    {
      id: 'google-workspace-cli-installed',
      label: 'Google Workspace CLI installed',
      kind: 'command',
      command: ['gws', '--version'],
      timeoutMs: 10_000,
      risk: 'safe',
    },
    {
      id: 'google-workspace-auth',
      label: 'Google Workspace auth status',
      kind: 'command',
      command: ['gws', 'auth', 'status'],
      timeoutMs: 15_000,
      risk: 'safe',
      requiredEnvAny: AUTH_ENV_KEYS,
    },
    {
      id: 'google-workspace-drive-read',
      label: 'Google Drive read smoke test',
      kind: 'command',
      command: ['gws', 'drive', 'files', 'list', '--params', '{"pageSize": 1}'],
      timeoutMs: 20_000,
      risk: 'read',
      requiredEnvAny: AUTH_ENV_KEYS,
    },
    {
      id: 'google-workspace-calendar-agenda',
      label: 'Google Calendar agenda smoke test',
      kind: 'command',
      command: ['gws', 'calendar', '+agenda'],
      timeoutMs: 20_000,
      risk: 'read',
      requiredEnvAny: AUTH_ENV_KEYS,
    },
  ])

  api.onBuildConfig((context: PluginBuildContext): PluginConfigFragment => {
    const services = stringArray(context.agentConfig.services, [
      'gmail',
      'calendar',
      'drive',
      'docs',
      'sheets',
    ])

    return {
      skills: {
        load: { extraDirs: [SKILLS_MOUNT] },
        entries: {
          [PLUGIN_ID]: {
            enabled: true,
            config: {
              services,
              skillSources: [SKILLS_MOUNT],
            },
            env: {
              GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: CREDENTIALS_FILE,
              GOOGLE_WORKSPACE_SERVICES: services.join(','),
            },
          },
        },
      },
    }
  })

  api.onBuildEnv((context) => {
    const env: Record<string, string> = {
      GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: CREDENTIALS_FILE,
      GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND: 'file',
    }

    const credentialsJson = firstSecret(context, [
      SECRET_FIELD_KEYS.credentialsJson,
      LEGACY_SECRET_FIELD_KEYS.credentialsJson,
      LEGACY_SECRET_FIELD_KEYS.adcJson,
      LEGACY_SECRET_FIELD_KEYS.applicationCredentialsJson,
    ])
    const adcJson = firstSecret(context, [
      LEGACY_SECRET_FIELD_KEYS.adcJson,
      LEGACY_SECRET_FIELD_KEYS.applicationCredentialsJson,
    ])
    const accessToken = firstSecret(context, [
      SECRET_FIELD_KEYS.accessToken,
      LEGACY_SECRET_FIELD_KEYS.accessToken,
      LEGACY_SECRET_FIELD_KEYS.cliToken,
    ])
    if (credentialsJson) env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON = credentialsJson
    if (adcJson) env.GOOGLE_APPLICATION_CREDENTIALS_JSON = adcJson
    if (accessToken) env.GOOGLE_WORKSPACE_CLI_TOKEN = accessToken

    for (const key of ['GOOGLE_WORKSPACE_CLI_SANITIZE_TEMPLATE', 'GOOGLE_WORKSPACE_PROJECT_ID']) {
      const value = context.secrets[key] ?? context.agentConfig[key]
      if (typeof value === 'string' && value) env[key] = value
    }

    if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      env.GOOGLE_APPLICATION_CREDENTIALS = ADC_FILE
    }
    return env
  })

  api.onBuildPrompt((context) => {
    const readOnlyByDefault = context.agentConfig.readOnlyByDefault !== false
    return [
      'Google Workspace is available through the `gws` CLI and the mounted gws agent skills.',
      'Prefer structured JSON output and cite the exact Gmail, Calendar, Drive, Docs, Sheets, or Chat command used.',
      readOnlyByDefault
        ? 'Read-only commands are safe by default. Ask for explicit approval before sending email, creating calendar events, editing docs or sheets, uploading files, deleting, or sharing.'
        : 'Write actions are enabled by configuration, but still summarize the exact action before executing it.',
      'Use `--dry-run` when gws supports it for drafts, sends, uploads, shares, or destructive changes.',
    ].join('\n')
  })

  api.onValidate((context): PluginValidationResult => {
    if (hasWorkspaceCredential(context)) return { valid: true, errors: [] }
    return {
      valid: true,
      errors: [
        {
          path: `secrets.${SECRET_FIELD_KEYS.credentialsJson}`,
          message:
            'Connect a Google account or provide credentials.json from gws auth export or a service-account JSON.',
          severity: 'warning',
        },
      ],
    }
  })

  api.onHealthCheck(async (context) => {
    return hasWorkspaceCredential(context)
      ? { healthy: true, message: 'Google Workspace account credentials are configured' }
      : { healthy: false, message: 'Missing Google Workspace account credentials' }
  })
})

plugin.k8s = googleWorkspaceK8sProvider

export default plugin
