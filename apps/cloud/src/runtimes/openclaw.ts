/**
 * OpenClaw baseline runtime adapter.
 *
 * The OpenClaw runtime owns OpenClaw config generation. Native runners do not
 * call into this path and do not emit OpenClaw gateway artifacts.
 */

import { buildOpenClawConfig } from '../config/openclaw-builder.js'
import type { OpenClawConfig } from '../config/schema.js'
import { openclawContainerSpec } from './container.js'
import { defaultRunnerImage } from './images.js'
import { type RuntimeAdapter, registerRuntime } from './index.js'
import {
  addShadowobCliAuth,
  addShadowobSkill,
  hasRuntimeExtensions,
  json,
  OPENCLAW_SKILLS_DIR,
  SHADOW_SLASH_COMMANDS_PATH,
} from './package-common.js'
import { appendTemplateRoutineFiles } from './routines.js'
import { openClawSlashCommands } from './slash-commands/openclaw.js'

export const DEFAULT_OPENCLAW_RUNNER_IMAGE = defaultRunnerImage({
  runner: 'openclaw-runner',
  env: 'SHADOWOB_OPENCLAW_RUNNER_IMAGE',
})

function ensureOpenClawShadowobSkillConfig(openclawConfig: OpenClawConfig): void {
  openclawConfig.skills ??= {}
  openclawConfig.skills.load ??= {}
  const extraDirs = new Set(openclawConfig.skills.load.extraDirs ?? [])
  extraDirs.add(OPENCLAW_SKILLS_DIR)
  openclawConfig.skills.load.extraDirs = [...extraDirs]
}

const openclawAdapter: RuntimeAdapter = {
  id: 'openclaw',
  name: 'OpenClaw Gateway',
  runtimeKind: 'openclaw',
  defaultImage: DEFAULT_OPENCLAW_RUNNER_IMAGE,
  container: openclawContainerSpec(),

  buildPackage(context) {
    const openclawConfig = buildOpenClawConfig(
      context.agent,
      context.config,
      context.cwd,
      context.runtimeEnv,
      context.runtimeContext,
    )

    const workspaceFiles = (openclawConfig._workspaceFiles ?? {}) as Record<string, string>
    delete openclawConfig._workspaceFiles

    const pluginResources = (openclawConfig._pluginResources ?? []) as Record<string, unknown>[]
    delete openclawConfig._pluginResources

    const pluginProvisions = (openclawConfig._pluginProvisions ?? []) as Array<{
      pluginId: string
      secrets?: Record<string, string>
    }>
    delete openclawConfig._pluginProvisions

    ensureOpenClawShadowobSkillConfig(openclawConfig)
    const runtimeFiles: Record<string, string> = {
      [SHADOW_SLASH_COMMANDS_PATH]: json(openClawSlashCommands),
    }
    addShadowobSkill(runtimeFiles, 'openclaw', context.agent.runtime)
    addShadowobCliAuth(runtimeFiles, context.runtimeExtensions)
    appendTemplateRoutineFiles(
      runtimeFiles,
      context.config,
      context.agent,
      'openclaw',
      context.runtimeExtensions,
    )

    const configData: Record<string, string> = {
      'config.json': JSON.stringify(openclawConfig, null, 2),
      'runtime-files.json': json(runtimeFiles),
      ...workspaceFiles,
    }
    if (hasRuntimeExtensions(context.runtimeExtensions)) {
      configData['runtime-extensions.json'] = json(context.runtimeExtensions)
    }

    const provisionSecrets: Record<string, string> = {}
    for (const provision of pluginProvisions) {
      if (provision.secrets) {
        Object.assign(provisionSecrets, provision.secrets)
      }
    }

    return { openclawConfig, configData, pluginResources, provisionSecrets }
  },
}

registerRuntime(openclawAdapter)

export default openclawAdapter
