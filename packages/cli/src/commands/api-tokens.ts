import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

export function createApiTokensCommand(): Command {
  const tokens = new Command('api-tokens').description('API token management commands')

  tokens
    .command('list')
    .description('List all API tokens')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const tokens = await client.listApiTokens()
        output(tokens, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  tokens
    .command('create')
    .description('Create a new API token')
    .requiredOption('--name <name>', 'Token name')
    .option('--scope <scope>', 'Token scope')
    .option('--expires-in-days <days>', 'Expiration in days')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: Record<string, unknown>) => {
      try {
        const client = await getClient(options.profile as string)
        const token = await client.createApiToken({
          name: options.name as string,
          scope: options.scope as string | undefined,
          expiresInDays: options.expiresInDays ? Number(options.expiresInDays) : undefined,
        })
        output(token, { json: options.json as boolean })
        if (!options.json) {
          console.log("\n⚠️  Save this token now — it won't be shown again!")
        }
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json as boolean,
        })
        process.exit(1)
      }
    })

  tokens
    .command('delete')
    .description('Delete an API token')
    .argument('<token-id>', 'Token ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (tokenId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteApiToken(tokenId)
        output({ ok: true }, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  return tokens
}
