/**
 * CLI: shadowob-cloud init — generate an shadowob-cloud.json config template.
 */

import { cp, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Command } from 'commander'
import { collectRuntimeEnvRequirements } from '../../application/runtime-env-requirements.js'
import type { ServiceContainer } from '../../services/container.js'

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export function createInitCommand(container: ServiceContainer) {
  return new Command('init')
    .description('Generate an shadowob-cloud.json config template')
    .option('-o, --output <path>', 'Output file path', 'shadowob-cloud.json')
    .option('-t, --template <name>', 'Template name (use --list to see all)', 'shadowob-cloud')
    .option('-l, --list', 'List all available templates and exit')
    .option('--force', 'Overwrite existing file')
    .option('--quick', 'Quick init: read .env, pick default template, no prompts')
    .action(
      async (options: {
        output: string
        template: string
        list?: boolean
        force?: boolean
        quick?: boolean
      }) => {
        const templates = await container.template.discover()

        // --list mode
        if (options.list) {
          console.log('\nAvailable templates:\n')
          const maxName = Math.max(...templates.map((t) => t.name.length), 6)
          const maxTitle = Math.min(Math.max(...templates.map((t) => t.title.length), 5), 32)
          const header = `  ${'TEMPLATE'.padEnd(maxName)}  ${'TITLE'.padEnd(maxTitle)}  AGENTS  DESCRIPTION`
          console.log(header)
          console.log(`  ${'-'.repeat(maxName)}  ${'-'.repeat(maxTitle)}  ------  -----------`)
          for (const t of templates) {
            const nameStr = t.name.padEnd(maxName)
            const title = t.title.length > maxTitle ? `${t.title.slice(0, maxTitle - 1)}…` : t.title
            const titleStr = title.padEnd(maxTitle)
            const agentStr = String(t.agentCount).padStart(6)
            const desc =
              t.description.length > 60 ? `${t.description.slice(0, 57)}...` : t.description
            console.log(`  ${nameStr}  ${titleStr}  ${agentStr}  ${desc}`)
          }
          console.log()
          console.log('  Use: shadowob-cloud init --template <name> [-o output.json]')
          console.log()
          return
        }

        // --quick mode
        if (options.quick) {
          const outputPath = resolve(options.output)
          if ((await fileExists(outputPath)) && !options.force) {
            container.logger.error(`File already exists: ${outputPath}`)
            container.logger.dim('Use --force to overwrite')
            process.exit(1)
          }

          const templateName = templates[0]?.name ?? 'shadowob-cloud'
          const content =
            (await container.template.getTemplate(templateName)) ??
            ({
              version: '1.0.0',
              environment: 'production',
              plugins: { shadowob: { servers: [], buddies: [], bindings: [] } },
              registry: { providers: [], configurations: [] },
              deployments: { namespace: 'shadowob-cloud', agents: [] },
            } as unknown)

          const envKeys = await collectRuntimeEnvRequirements(content)
          const detected = envKeys.filter((key) => process.env[key])
          if (detected.length > 0) {
            container.logger.info(
              `Detected ${detected.length} provider env var(s) — config will reference them via \${env:...}`,
            )
            for (const key of detected) container.logger.dim(`  ${key}`)
          } else {
            container.logger.warn('No API keys found in environment. Add them to .env and re-run.')
          }

          await writeFile(outputPath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8')
          container.logger.success(`Quick init from "${templateName}": ${outputPath}`)
          container.logger.dim(
            `Edit the file and run: shadowob-cloud validate -f ${options.output}`,
          )
          return
        }

        const outputPath = resolve(options.output)

        if ((await fileExists(outputPath)) && !options.force) {
          container.logger.error(`File already exists: ${outputPath}`)
          container.logger.dim('Use --force to overwrite')
          process.exit(1)
        }

        const templateName = options.template
        const meta = templates.find((t) => t.name === templateName)

        if (!meta && templates.length > 0) {
          container.logger.error(`Unknown template: ${templateName}`)
          container.logger.dim(`Available: ${templates.map((t) => t.name).join(', ')}`)
          container.logger.dim('Run: shadowob-cloud init --list')
          process.exit(1)
        }

        const templateFilePath = meta ? await container.template.getTemplatePath(meta.name) : null

        if (!templateFilePath || !(await fileExists(templateFilePath))) {
          await writeFile(
            outputPath,
            `${JSON.stringify(
              {
                version: '1.0.0',
                environment: 'production',
                plugins: { shadowob: { servers: [], buddies: [], bindings: [] } },
                registry: { providers: [], configurations: [] },
                deployments: { namespace: 'shadowob-cloud', agents: [] },
              },
              null,
              2,
            )}\n`,
            'utf-8',
          )
          container.logger.success(`Created: ${outputPath}`)
          return
        }

        await cp(templateFilePath, outputPath)
        container.logger.success(`Created config from "${templateName}" template: ${outputPath}`)
        container.logger.dim(
          `Edit the file, then run: shadowob-cloud validate -f ${options.output}`,
        )
      },
    )
}
