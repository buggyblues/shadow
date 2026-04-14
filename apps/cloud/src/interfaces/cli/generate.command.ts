/**
 * CLI: shadowob-cloud generate — generate K8s manifests or OpenClaw configs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

export function createGenerateCommand(container: ServiceContainer) {
  const cmd = new Command('generate').description('Generate K8s manifests or OpenClaw configs')

  cmd.addCommand(
    new Command('manifests')
      .description('Generate K8s YAML/JSON manifests')
      .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
      .option('-o, --output <dir>', 'Output directory', '.shadowob-manifests')
      .option('-n, --namespace <ns>', 'Kubernetes namespace')
      .option('--provision-url <url>', 'Shadow server URL (for NetworkPolicy egress)')
      .action(
        (options: { file: string; output: string; namespace?: string; provisionUrl?: string }) => {
          const filePath = resolve(options.file)
          if (!existsSync(filePath)) {
            container.logger.error(`Config file not found: ${filePath}`)
            process.exit(1)
          }

          const config = container.config.parseFile(filePath)
          const resolved = container.config.resolve(config)
          const namespace = options.namespace ?? config.deployments?.namespace ?? 'shadowob-cloud'
          const shadowServerUrl = options.provisionUrl ?? process.env.SHADOW_SERVER_URL

          const manifests = container.manifest.build({
            config: resolved,
            namespace,
            shadowServerUrl,
          })

          const outDir = resolve(options.output)
          mkdirSync(outDir, { recursive: true })

          for (let i = 0; i < manifests.length; i++) {
            const m = manifests[i]!
            const kind = ((m.kind as string) ?? 'resource').toLowerCase()
            const name =
              ((m.metadata as Record<string, unknown>)?.name as string) ?? `resource-${i}`
            writeFileSync(
              resolve(outDir, `${name}-${kind}.json`),
              `${JSON.stringify(m, null, 2)}\n`,
              'utf-8',
            )
          }

          container.logger.success(`Generated ${manifests.length} resource file(s) in ${outDir}`)
        },
      ),
  )

  cmd.addCommand(
    new Command('openclaw-config')
      .description('Generate OpenClaw config.json for a specific agent')
      .argument('<agent>', 'Agent ID')
      .option('-f, --file <path>', 'Config file path', 'shadowob-cloud.json')
      .option('-o, --output <path>', 'Output file path')
      .action((agent: string, options: { file: string; output?: string }) => {
        const filePath = resolve(options.file)
        if (!existsSync(filePath)) {
          container.logger.error(`Config file not found: ${filePath}`)
          process.exit(1)
        }

        const config = container.config.parseFile(filePath)
        const resolved = container.config.resolve(config)

        const agentDef = resolved.deployments?.agents?.find((a) => a.id === agent)
        if (!agentDef) {
          container.logger.error(`Agent "${agent}" not found in deployments.agents`)
          process.exit(1)
        }

        const openclawConfig = container.config.buildOpenClawConfig(agentDef, resolved)
        delete openclawConfig._workspaceFiles

        if (options.output) {
          writeFileSync(
            resolve(options.output),
            `${JSON.stringify(openclawConfig, null, 2)}\n`,
            'utf-8',
          )
          container.logger.success(`Config written to: ${options.output}`)
        } else {
          console.log(JSON.stringify(openclawConfig, null, 2))
        }
      }),
  )

  cmd.addCommand(
    new Command('schema')
      .description('Generate JSON Schema for shadowob-cloud.json (for IDE autocomplete)')
      .option('-o, --output <path>', 'Output file path', 'shadowob-cloud.schema.json')
      .action((options: { output: string }) => {
        // Read pre-generated schema from the package's schemas/ directory
        const schemaPath = resolve(
          fileURLToPath(import.meta.url),
          '..',
          '..',
          '..',
          'schemas',
          'config.schema.json',
        )

        if (!existsSync(schemaPath)) {
          container.logger.error(
            'Schema file not found. Run `pnpm generate:schema` in the cloud package first.',
          )
          process.exit(1)
        }

        const schema = readFileSync(schemaPath, 'utf-8')
        const outPath = resolve(options.output)
        mkdirSync(dirname(outPath), { recursive: true })
        writeFileSync(outPath, schema, 'utf-8')

        container.logger.success(`JSON Schema written to: ${options.output}`)
        container.logger.dim(
          'Add to your VS Code settings.json:\n' +
            '  "json.schemas": [{ "fileMatch": ["shadowob-cloud.json"], "url": "./shadowob-cloud.schema.json" }]',
        )
      }),
  )

  return cmd
}
