import { Command } from 'commander'
import { getClient, resolveServerFlag } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export const CHANNEL_SEND_DISABLED_ENV = 'SHADOWOB_CLI_DISABLE_CHANNEL_SEND'

export function isChannelSendDisabled(): boolean {
  const value = process.env[CHANNEL_SEND_DISABLED_ENV]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

export function createChannelsCommand(): Command {
  const channels = new Command('channels').description('Channel commands')

  channels
    .command('list')
    .description('List channels in a server')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { server: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const channels = await client.getServerChannels(resolveServerFlag(options.server))
        output(channels, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  channels
    .command('get')
    .description('Get channel details')
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

  channels
    .command('create')
    .description('Create a channel')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--name <name>', 'Channel name')
    .option('--type <type>', 'Channel type', 'text')
    .option('--description <desc>', 'Channel description')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server: string
        name: string
        type?: string
        description?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const channel = await client.createChannel(resolveServerFlag(options.server), {
            name: options.name,
            type: options.type,
            description: options.description,
          })
          output(channel, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  channels
    .command('delete')
    .description('Delete a channel')
    .argument('<channel-id>', 'Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteChannel(channelId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Channel deleted', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  // Messages subcommand
  channels
    .command('messages')
    .description('List messages in a channel')
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
          const result = await client.getMessages(
            channelId,
            parseInt(options.limit ?? '50', 10),
            options.cursor,
          )
          output(result.messages, { json: options.json })
          if (!options.json && result.hasMore) {
            console.log('(has more messages)')
          }
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Send message
  channels
    .command('send')
    .description('Send a message to a channel')
    .argument('<channel-id>', 'Channel ID')
    .requiredOption('--content <text>', 'Message content')
    .option('--reply-to <id>', 'Reply to message ID')
    .option('--thread-id <id>', 'Send to thread')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        channelId: string,
        options: {
          content: string
          replyTo?: string
          threadId?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          if (isChannelSendDisabled()) {
            outputError(
              'shadowob channels send is disabled in this runtime; use the Shadow platform adapter so channel policy metadata is preserved.',
              { json: options.json },
            )
            process.exit(1)
          }

          const client = await getClient(options.profile)
          const message = await client.sendMessage(channelId, options.content, {
            replyToId: options.replyTo,
            threadId: options.threadId,
          })
          output(message, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Edit message
  channels
    .command('edit')
    .description('Edit a message')
    .argument('<message-id>', 'Message ID')
    .requiredOption('--content <text>', 'New content')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (messageId: string, options: { content: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const message = await client.editMessage(messageId, options.content)
          output(message, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Delete message
  channels
    .command('delete-message')
    .description('Delete a message')
    .argument('<message-id>', 'Message ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (messageId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteMessage(messageId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Message deleted', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  // React to message
  channels
    .command('react')
    .description('Add a reaction to a message')
    .argument('<message-id>', 'Message ID')
    .requiredOption('--emoji <emoji>', 'Emoji to react with')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (messageId: string, options: { emoji: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          await client.addReaction(messageId, options.emoji)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('Reaction added', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Unreact to message
  channels
    .command('unreact')
    .description('Remove a reaction from a message')
    .argument('<message-id>', 'Message ID')
    .requiredOption('--emoji <emoji>', 'Emoji to remove')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (messageId: string, options: { emoji: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          await client.removeReaction(messageId, options.emoji)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('Reaction removed', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Pin message
  channels
    .command('pin')
    .description('Pin a message')
    .argument('<message-id>', 'Message ID')
    .requiredOption('--channel-id <id>', 'Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        messageId: string,
        options: { channelId: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          await client.pinMessage(messageId, options.channelId)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('Message pinned', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Unpin message
  channels
    .command('unpin')
    .description('Unpin a message')
    .argument('<message-id>', 'Message ID')
    .requiredOption('--channel-id <id>', 'Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        messageId: string,
        options: { channelId: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          await client.unpinMessage(messageId, options.channelId)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('Message unpinned', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // List pinned messages
  channels
    .command('pinned')
    .description('List pinned messages in a channel')
    .argument('<channel-id>', 'Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const messages = await client.getPinnedMessages(channelId)
        output(messages, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return channels
}
