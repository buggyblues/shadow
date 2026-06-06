import { execFileSync, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

type JsonPayloadOptions = {
  jsonInput?: string
  file?: string
}

export function createCloudCommand(): Command {
  const cloud = new Command('cloud')
    .description('Shadow Cloud — deploy AI agent clusters to Kubernetes (via shadowob-cloud)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async (_, cmd) => {
      const args = cmd.args ?? []
      ensureCloudCliInstalled()
      spawnCloudCli(args)
    })

  const templates = new Command('templates').description('Manage Shadow Cloud templates')

  templates
    .command('create')
    .description('Create a Shadow Cloud template from JSON')
    .option('--profile <name>', 'Profile to use')
    .option('--json-input <json>', 'Template JSON payload')
    .option('--file <path>', 'Read template JSON payload from file')
    .option('--json', 'Output as JSON')
    .action(async (options: JsonPayloadOptions & { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }
      try {
        const payload = await parseJsonPayload(options, 'template')
        const client = await getClient(options.profile)
        const result = await client.createCloudTemplate(payload as never)
        output(result, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), outputOpts)
        process.exit(1)
      }
    })

  const deployments = new Command('deployments').description('Manage Shadow Cloud deployments')

  deployments
    .command('list')
    .description('List Shadow Cloud deployments')
    .option('--profile <name>', 'Profile to use')
    .option('--include-history', 'Include historical deployments')
    .option('--limit <count>', 'Maximum number of deployments to return')
    .option('--offset <count>', 'Number of deployments to skip')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        profile?: string
        includeHistory?: boolean
        limit?: string
        offset?: string
        json?: boolean
      }) => {
        const outputOpts: OutputOptions = { json: options.json }
        try {
          const client = await getClient(options.profile)
          const result = await client.listCloudDeployments({
            includeHistory: options.includeHistory,
            limit: parseOptionalInteger(options.limit, 'limit'),
            offset: parseOptionalInteger(options.offset, 'offset'),
          })
          output(result, outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), outputOpts)
          process.exit(1)
        }
      },
    )

  deployments
    .command('get')
    .description('Get a Shadow Cloud deployment')
    .argument('<deployment-id>', 'Cloud deployment ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (deploymentId: string, options: { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }
      try {
        const client = await getClient(options.profile)
        const result = await client.getCloudDeployment(deploymentId)
        output(result, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), outputOpts)
        process.exit(1)
      }
    })

  deployments
    .command('create')
    .description('Create a Shadow Cloud deployment from JSON')
    .option('--profile <name>', 'Profile to use')
    .option('--json-input <json>', 'Deployment JSON payload')
    .option('--file <path>', 'Read deployment JSON payload from file')
    .option('--json', 'Output as JSON')
    .action(async (options: JsonPayloadOptions & { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }
      try {
        const payload = await parseJsonPayload(options, 'deployment')
        const client = await getClient(options.profile)
        const result = await client.createCloudDeployment(payload as never)
        output(result, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), outputOpts)
        process.exit(1)
      }
    })

  deployments
    .command('destroy')
    .description('Queue destruction of a Shadow Cloud deployment')
    .argument('<deployment-id>', 'Cloud deployment ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (deploymentId: string, options: { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }
      try {
        const client = await getClient(options.profile)
        const result = await client.destroyCloudDeployment(deploymentId)
        if (options.json) {
          output(result, outputOpts)
          return
        }
        outputSuccess(
          `Destroy queued for deployment ${deploymentId} (${result.status})`,
          outputOpts,
        )
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), outputOpts)
        process.exit(1)
      }
    })

  cloud.addCommand(templates)
  cloud.addCommand(deployments)

  return cloud
}

async function parseJsonPayload(options: JsonPayloadOptions, label: string): Promise<unknown> {
  if (options.jsonInput && options.file) {
    throw new Error(`Use either --json-input or --file for ${label}, not both`)
  }
  if (!options.jsonInput && !options.file) {
    throw new Error(`Missing ${label} payload. Pass --json-input or --file.`)
  }

  const source = options.file ? await readFile(options.file, 'utf8') : options.jsonInput
  try {
    return JSON.parse(source ?? '')
  } catch (error) {
    throw new Error(
      `Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function parseOptionalInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return parsed
}

function ensureCloudCliInstalled(): void {
  try {
    execFileSync('shadowob-cloud', ['--version'], { stdio: 'ignore' })
  } catch {
    console.error('shadowob-cloud is not installed.')
    console.error('Install it with: npm install -g @shadowob/cloud')
    process.exit(1)
  }
}

function spawnCloudCli(args: string[]): void {
  const result = spawnSync('shadowob-cloud', args, { stdio: 'inherit' })
  if (result.status !== null) {
    process.exit(result.status)
  }
}
