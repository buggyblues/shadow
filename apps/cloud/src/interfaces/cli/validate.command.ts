/**
 * CLI: shadowob-cloud validate — check config file for errors.
 */

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export function createValidateCommand(container: ServiceContainer) {
  return new Command('validate')
    .description('Validate an shadowob-cloud.json config file')
    .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
    .option('--strict', 'Fail on unresolvable env vars')
    .option('--dry-run', 'Validate structure without requiring env vars to be set')
    .action(async (options: { file: string; strict?: boolean; dryRun?: boolean }) => {
      const filePath = resolve(options.file)

      if (!(await pathExists(filePath))) {
        container.logger.error(`Config file not found: ${filePath}`)
        process.exit(1)
      }

      // 1. Parse and validate schema
      container.logger.step('Validating schema...')
      let config: Awaited<ReturnType<typeof container.config.parseFile>>
      try {
        config = await container.config.parseFile(filePath)
        container.logger.success('Schema valid')
      } catch (err) {
        container.logger.error((err as Error).message)
        process.exit(1)
      }

      // 2. Detect inline API keys (SEC-01)
      container.logger.step('Checking for inline API keys...')
      const violations = container.config.validateSecurity(config)
      if (violations.length > 0) {
        for (const v of violations) {
          container.logger.error(`Inline API key detected at ${v.path} (prefix: ${v.prefix})`)
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${env:...} syntax shown to user
          container.logger.dim('    → Use ${env:VAR_NAME} or ${secret:name} syntax instead')
        }
        container.logger.error(`${violations.length} inline key(s) found — config rejected`)
        process.exit(1)
      }
      container.logger.success('No inline API keys')

      // 3. Validate extends references
      container.logger.step('Checking extends references...')
      const configurations = config.registry?.configurations ?? []
      const configIds = new Set(configurations.map((c) => c.id))
      let extendsErrors = 0

      for (const agent of config.deployments?.agents ?? []) {
        if (agent.configuration.extends) {
          if (!configIds.has(agent.configuration.extends)) {
            container.logger.error(
              `Agent "${agent.id}" extends "${agent.configuration.extends}" ` +
                `but it's not in registry.configurations. ` +
                `Available: ${[...configIds].join(', ')}`,
            )
            extendsErrors++
          }
        }
      }

      if (extendsErrors === 0) {
        container.logger.success('Extends references valid')
      }

      // 4. Validate template references
      container.logger.step('Checking template references...')
      const refs = container.config.collectTemplateRefs(config)
      const envRefs = refs.filter((r: { type: string }) => r.type === 'env')
      const secretRefs = refs.filter((r: { type: string }) => r.type === 'secret')
      const fileRefs = refs.filter((r: { type: string }) => r.type === 'file')

      container.logger.dim(
        `  ${envRefs.length} env ref(s), ${secretRefs.length} secret ref(s), ${fileRefs.length} file ref(s)`,
      )

      if (!options.dryRun && options.strict) {
        let unresolvedCount = 0
        for (const ref of envRefs) {
          if (!process.env[ref.key]) {
            container.logger.error(`Unresolved env var: ${ref.key} (at ${ref.raw})`)
            unresolvedCount++
          }
        }
        if (unresolvedCount > 0) {
          container.logger.error(
            `${unresolvedCount} unresolved env var(s) — set them or use --dry-run`,
          )
          process.exit(1)
        }
      }

      container.logger.success('Template references valid')

      // Summary
      const agents = config.deployments?.agents ?? []
      console.log()
      container.logger.success(
        `Config is valid! ${agents.length} agent(s), ` +
          `${configurations.length} configuration(s), ` +
          `${envRefs.length} env ref(s)`,
      )
    })
}
