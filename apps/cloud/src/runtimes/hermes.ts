/**
 * Hermes Agent runtime adapter.
 *
 * Architecture: Hermes gateway -> ShadowOB Hermes platform plugin.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stringify as stringifyYaml } from 'yaml'
import type { AgentDeployment } from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import { hermesContainerSpec } from './container.js'
import { type RuntimeAdapter, type RuntimeFiles, registerRuntime } from './index.js'
import { hermesMcpServers } from './mcp.js'
import type { ShadowRuntimeBinding } from './package-common.js'
import {
  addShadowobCliAuth,
  addShadowobSkill,
  buildIdentityWorkspaceFiles,
  envPlaceholder,
  HOME_DIR,
  hasRuntimeExtensions,
  json,
  nativePermissionMode,
  runtimeExtensionsForKind,
  SHADOW_SLASH_COMMANDS_PATH,
  shadowBinding,
} from './package-common.js'
import { hermesSlashCommands } from './slash-commands/hermes.js'

function readHermesPluginFile(cwd: string | undefined, file: string, fallback: string): string {
  const root = resolve(cwd ?? process.cwd(), 'packages/connector/hermes-shadowob-plugin')
  const path = resolve(root, file)
  return existsSync(path) ? readFileSync(path, 'utf-8') : fallback
}

function buildHermesConfig(options: {
  agent: AgentDeployment
  shadow: ShadowRuntimeBinding
  runtimeExtensions: PluginRuntimeExtension
}): string {
  const { agent, shadow } = options
  const mcpServers = hermesMcpServers(options.runtimeExtensions)
  return stringifyYaml({
    approvals: {
      mode: nativePermissionMode(agent) === 'allow' ? 'manual' : 'manual',
    },
    ...(Object.keys(mcpServers).length > 0 ? { mcp_servers: mcpServers } : {}),
    plugins: {
      enabled: ['shadowob'],
    },
    platforms: {
      shadowob: {
        enabled: true,
        token: envPlaceholder(shadow.tokenEnvKey),
        extra: {
          base_url: envPlaceholder(shadow.serverUrlEnvKey),
          mention_only: false,
          rest_only: false,
          catchup_minutes: 0,
          download_media: true,
          slash_commands: hermesSlashCommands,
        },
      },
    },
  })
}

const hermesAdapter: RuntimeAdapter = {
  id: 'hermes',
  name: 'Hermes Agent',
  runtimeKind: 'hermes',
  defaultImage: 'ghcr.io/buggyblues/hermes-runner:latest',
  container: hermesContainerSpec(),

  buildPackage(context) {
    const nativeRuntimeExtensions = runtimeExtensionsForKind(context.runtimeExtensions, 'hermes')
    const shadow = shadowBinding(context.runtimeExtensions)
    const files: RuntimeFiles = {
      ...buildIdentityWorkspaceFiles(context.agent),
      [`${HOME_DIR}/.hermes/config.yaml`]: buildHermesConfig({
        agent: context.agent,
        shadow,
        runtimeExtensions: nativeRuntimeExtensions,
      }),
      [`${HOME_DIR}/.hermes/.env`]: [
        `SHADOW_BASE_URL=${envPlaceholder(shadow.serverUrlEnvKey)}`,
        `SHADOW_TOKEN=${envPlaceholder(shadow.tokenEnvKey)}`,
        'SHADOW_ALLOW_ALL_USERS=true',
        'SHADOW_HEARTBEAT_INTERVAL_SECONDS=30',
        '',
      ].join('\n'),
      [SHADOW_SLASH_COMMANDS_PATH]: json(hermesSlashCommands),
    }
    addShadowobSkill(files, 'hermes', 'hermes')
    addShadowobCliAuth(files, context.runtimeExtensions)

    const pluginRoot = `${HOME_DIR}/.hermes/plugins/shadowob`
    files[`${pluginRoot}/plugin.yaml`] = readHermesPluginFile(
      context.cwd,
      'plugin.yaml',
      'name: shadowob\n',
    )
    files[`${pluginRoot}/adapter.py`] = readHermesPluginFile(
      context.cwd,
      'adapter.py',
      '# ShadowOB Hermes adapter placeholder.\n',
    )
    files[`${pluginRoot}/shadow_sdk.py`] = readHermesPluginFile(
      context.cwd,
      'shadow_sdk.py',
      '# Shadow SDK placeholder.\n',
    )
    files[`${pluginRoot}/__init__.py`] = readHermesPluginFile(context.cwd, '__init__.py', '')
    files[`${pluginRoot}/requirements.txt`] = readHermesPluginFile(
      context.cwd,
      'requirements.txt',
      '',
    )

    return {
      configData: {
        'runtime-files.json': json(files),
        'workspace-files.json': json(buildIdentityWorkspaceFiles(context.agent)),
        'shadowob-runtime.json': json({
          cli: 'shadowob',
          connector: 'shadowob-connector',
          transport: 'hermes',
          shadow,
        }),
        ...(hasRuntimeExtensions(nativeRuntimeExtensions)
          ? { 'runtime-extensions.json': json(nativeRuntimeExtensions) }
          : {}),
      },
      pluginResources: [],
    }
  },
}

registerRuntime(hermesAdapter)

export default hermesAdapter
