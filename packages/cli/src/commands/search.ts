import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

export function createSearchCommand(): Command {
  const search = new Command('search').description('Search commands')

  // Note: SDK only has searchMessages, not global search or user/server search
  search
    .command('messages')
    .description('Search messages')
    .requiredOption('--query <text>', 'Search query')
    .option('--server-id <id>', 'Limit to server')
    .option('--channel-id <id>', 'Limit to channel')
    .option('--limit <n>', 'Number of results (1-100)', '20')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        query: string
        serverId?: string
        channelId?: string
        limit?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const limit = Math.min(Math.max(parseInt(options.limit ?? '20', 10), 1), 100)
          const results = await client.searchMessages({
            q: options.query,
            serverId: options.serverId,
            channelId: options.channelId,
            limit,
          })
          output(results, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return search
}
