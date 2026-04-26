import { collectTemplateRefs, validateCloudConfig } from '../config/index.js'
import { validateNoInlineKeys } from '../config/security.js'

export interface CloudConfigValidationSummary {
  valid: boolean
  agents: number
  configurations: number
  violations: Array<{ path: string; prefix: string }>
  extendsErrors: string[]
  templateRefs: { env: number; secret: number; file: number }
}

export function summarizeCloudConfigValidation(configData: unknown): CloudConfigValidationSummary {
  const parsed = validateCloudConfig(configData)
  if (!parsed.success) {
    return {
      valid: false,
      agents: 0,
      configurations: 0,
      violations: parsed.errors.map((error) => ({
        path: error.path,
        prefix: error.expected,
      })),
      extendsErrors: [],
      templateRefs: { env: 0, secret: 0, file: 0 },
    }
  }

  const config = parsed.data
  const violations = validateNoInlineKeys(config).map((violation) => ({
    path: violation.path,
    prefix: violation.prefix,
  }))
  const refs = collectTemplateRefs(config)
  const agents = config.deployments?.agents ?? []
  const configurations = config.registry?.configurations ?? []
  const configurationIds = new Set(configurations.map((cfg) => cfg.id))
  const extendsErrors: string[] = []

  for (const agent of agents) {
    if (agent.configuration.extends && !configurationIds.has(agent.configuration.extends)) {
      extendsErrors.push(
        `Agent "${agent.id}" extends "${agent.configuration.extends}" not in registry.configurations`,
      )
    }
  }

  return {
    valid: violations.length === 0 && extendsErrors.length === 0,
    agents: agents.length,
    configurations: configurations.length,
    violations,
    extendsErrors,
    templateRefs: {
      env: refs.filter((ref) => ref.type === 'env').length,
      secret: refs.filter((ref) => ref.type === 'secret').length,
      file: refs.filter((ref) => ref.type === 'file').length,
    },
  }
}
