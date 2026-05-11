import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

export function createDiscoverCommand(): Command {
  const discover = new Command('discover').description('Discover popular servers and channels')

  discover
    .command('feed')
    .description('Get the discovery feed')
    .option('--type <type>', 'Filter by type (all, servers, channels, rentals)', 'all')
    .option('--limit <n>', 'Number of results', '20')
    .option('--offset <n>', 'Offset for pagination', '0')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: Record<string, unknown>) => {
      try {
        const client = await getClient(options.profile as string)
        const result = await client.discoverFeed({
          type: options.type as 'all' | 'servers' | 'channels' | 'rentals',
          limit: Number(options.limit),
          offset: Number(options.offset),
        })
        output(result, { json: options.json as boolean })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json as boolean,
        })
        process.exit(1)
      }
    })

  discover
    .command('search')
    .description('Search the discovery index')
    .requiredOption('--query <text>', 'Search query')
    .option('--type <type>', 'Filter by type (all, servers, channels, rentals)', 'all')
    .option('--limit <n>', 'Number of results', '20')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: Record<string, unknown>) => {
      try {
        const client = await getClient(options.profile as string)
        const result = await client.discoverSearch({
          q: options.query as string,
          type: options.type as 'all' | 'servers' | 'channels' | 'rentals',
          limit: Number(options.limit),
        })
        output(result, { json: options.json as boolean })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json as boolean,
        })
        process.exit(1)
      }
    })

  return discover
}
