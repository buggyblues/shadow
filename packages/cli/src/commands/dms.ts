import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createDirectMessagesCommand(): Command {
  const dms = new Command('dms').description('Direct message commands')

  dms
    .command('list')
    .description('List direct channels')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const channels = await client.listDirectChannels()
        output(channels, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  dms
    .command('get')
    .description('Get direct channel details')
    .argument('<channel-id>', 'Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const channel = await client.getChannel(channelId)
        output(channel, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  dms
    .command('create')
    .description('Create a direct channel with a user')
    .requiredOption('--user-id <id>', 'User ID to message')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { userId: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const channel = await client.createDirectChannel(options.userId)
        output(channel, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  dms
    .command('messages')
    .description('List messages in a direct channel')
    .argument('<channel-id>', 'Channel ID')
    .option('--limit <n>', 'Number of messages', '50')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        channelId: string,
        options: { limit?: string; cursor?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const page = await client.getMessages(
            channelId,
            parseInt(options.limit ?? '50', 10),
            options.cursor,
          )
          output(page.messages, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  dms
    .command('send')
    .description('Send a direct message')
    .argument('<channel-id>', 'Channel ID')
    .requiredOption('--content <text>', 'Message content')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (channelId: string, options: { content: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const message = await client.sendMessage(channelId, options.content)
          output(message, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  dms
    .command('mark-read')
    .description('Mark direct channel as read')
    .argument('<channel-id>', 'Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.markScopeRead({ channelId })
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Direct channel marked as read', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return dms
}
