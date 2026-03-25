import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createDmsCommand(): Command {
  const dms = new Command('dms').description('Direct message commands')

  dms
    .command('list')
    .description('List DM channels')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const channels = await client.listDmChannels()
        output(channels, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  dms
    .command('get')
    .description('Get DM channel details')
    .argument('<dm-channel-id>', 'DM Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (dmChannelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const channel = await client.getChannel(dmChannelId)
        output(channel, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  dms
    .command('create')
    .description('Create a DM channel with a user')
    .requiredOption('--user-id <id>', 'User ID to DM with')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { userId: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const channel = await client.createDmChannel(options.userId)
        output(channel, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  dms
    .command('messages')
    .description('List messages in a DM channel')
    .argument('<dm-channel-id>', 'DM Channel ID')
    .option('--limit <n>', 'Number of messages', '50')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        dmChannelId: string,
        options: { limit?: string; cursor?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const messages = await client.getDmMessages(
            dmChannelId,
            parseInt(options.limit ?? '50', 10),
            options.cursor,
          )
          output(messages, { json: options.json })
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
    .description('Send a DM message')
    .argument('<dm-channel-id>', 'DM Channel ID')
    .requiredOption('--content <text>', 'Message content')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        dmChannelId: string,
        options: { content: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const message = await client.sendDmMessage(dmChannelId, options.content)
          output(message, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Note: SDK markScopeRead doesn't support dmChannelId, marking channel as read instead
  dms
    .command('mark-read')
    .description('Mark DM channel as read')
    .argument('<dm-channel-id>', 'DM Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (dmChannelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.markScopeRead({ channelId: dmChannelId })
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('DM channel marked as read', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return dms
}
