/**
 * CLI: shadowob-cloud templates — browse and manage the Shadow community template store.
 *
 * Subcommands:
 *   list               List all available templates
 *   search <query>     Search templates by keyword
 *   get <slug>         Print the raw config for a template
 *   install <slug>     Copy the template folder to the current directory
 */

import { mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

export function createTemplatesCommand(container: ServiceContainer) {
  const cmd = new Command('templates').description(
    'Browse and manage the Shadow community template store',
  )

  // ─────────────────────────────────────────────
  // templates list
  // ─────────────────────────────────────────────
  cmd.addCommand(
    new Command('list')
      .description('List all available templates')
      .option('--locale <locale>', 'Locale for display names (e.g. zh-CN)', 'en')
      .action(async (opts: { locale: string }) => {
        const templates = await container.template.list(opts.locale)
        if (templates.length === 0) {
          container.logger.warn('No templates found.')
          return
        }
        container.logger.info(`Available templates (${templates.length}):`)
        for (const t of templates) {
          container.logger.info(`  ${t.title} (${t.name})`)
          container.logger.dim(`    ${t.agentCount} agent(s) · ns: ${t.namespace}`)
          if (t.description) container.logger.dim(`    ${t.description}`)
        }
      }),
  )

  // ─────────────────────────────────────────────
  // templates search <query>
  // ─────────────────────────────────────────────
  cmd.addCommand(
    new Command('search')
      .description('Search templates by keyword')
      .argument('<query>', 'Search keyword(s)')
      .option('--locale <locale>', 'Locale for display names', 'en')
      .action(async (query: string, opts: { locale: string }) => {
        const lower = query.toLowerCase()
        const all = await container.template.list(opts.locale)
        const results = all.filter(
          (t) =>
            t.name.toLowerCase().includes(lower) ||
            t.title.toLowerCase().includes(lower) ||
            t.description.toLowerCase().includes(lower),
        )
        if (results.length === 0) {
          container.logger.warn(`No templates matched "${query}".`)
          return
        }
        container.logger.info(`Found ${results.length} template(s) matching "${query}":`)
        for (const t of results) {
          container.logger.info(`  ${t.title} (${t.name})`)
          container.logger.dim(`    ${t.agentCount} agent(s)`)
          if (t.description) container.logger.dim(`    ${t.description}`)
        }
      }),
  )

  // ─────────────────────────────────────────────
  // templates get <slug>
  // ─────────────────────────────────────────────
  cmd.addCommand(
    new Command('get')
      .description('Print the raw config for a template')
      .argument('<slug>', 'Template slug (from "templates list")')
      .action(async (slug: string) => {
        const content = await container.template.getTemplate(slug)
        if (!content) {
          container.logger.error(`Template not found: ${slug}`)
          container.logger.dim('Run "shadowob-cloud templates list" to see available templates.')
          process.exit(1)
        }
        process.stdout.write(JSON.stringify(content, null, 2) + '\n')
      }),
  )

  // ─────────────────────────────────────────────
  // templates install <slug>
  // ─────────────────────────────────────────────
  cmd.addCommand(
    new Command('install')
      .description('Copy a template folder to the current directory (or --output dir)')
      .argument('<slug>', 'Template slug')
      .option('-o, --output <dir>', 'Destination directory (default: ./<slug>)')
      .option('--overwrite', 'Overwrite destination if it already exists', false)
      .action(async (slug: string, opts: { output?: string; overwrite: boolean }) => {
        const templatePath = await container.template.getTemplatePath(slug)
        if (!templatePath) {
          container.logger.error(`Template not found: ${slug}`)
          container.logger.dim('Run "shadowob-cloud templates list" to see available templates.')
          process.exit(1)
        }

        const destDir = resolve(opts.output ?? slug)
        const isFolderBased = basename(templatePath) === 'shadowob-cloud.json'

        // Guard: don't overwrite without flag
        try {
          await (await import('node:fs/promises')).stat(destDir)
          if (!opts.overwrite) {
            container.logger.error(`Destination already exists: ${destDir}`)
            container.logger.dim('Use --overwrite to replace it.')
            process.exit(1)
          }
        } catch {
          // Directory doesn't exist — safe to create
        }

        try {
          if (isFolderBased) {
            const srcDir = resolve(templatePath, '..')
            await (await import('node:fs/promises')).cp(srcDir, destDir, { recursive: true })
            container.logger.info(`Installed template '${slug}' to: ${destDir}`)
          } else {
            await mkdir(destDir, { recursive: true })
            const dest = resolve(destDir, 'shadowob-cloud.json')
            await (await import('node:fs/promises')).cp(templatePath, dest)
            container.logger.info(`Installed template '${slug}' to: ${dest}`)
          }
          container.logger.dim('Next steps:')
          container.logger.dim(`  cd ${destDir}`)
          container.logger.dim(`  shadowob-cloud validate -f shadowob-cloud.json`)
        } catch (err) {
          container.logger.error(`Install failed: ${(err as Error).message}`)
          process.exit(1)
        }
      }),
  )

  return cmd
}
