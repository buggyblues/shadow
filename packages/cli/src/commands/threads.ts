import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createThreadsCommand(): Command {
  const threads = new Command('threads').description('Thread commands')

  threads
    .command('list')
    .description('List threads in a channel')
    .argument('<channel-id>', 'Channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const threads = await client.listThreads(channelId)
        output(threads, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  threads
    .command('get')
    .description('Get thread details')
    .argument('<thread-id>', 'Thread ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (threadId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const thread = await client.getThread(threadId)
        output(thread, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  threads
    .command('create')
    .description('Create a thread')
    .argument('<channel-id>', 'Channel ID')
    .requiredOption('--name <name>', 'Thread name')
    .requiredOption('--parent-message <id>', 'Parent message ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        channelId: string,
        options: {
          name: string
          parentMessage: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const thread = await client.createThread(channelId, options.name, options.parentMessage)
          output(thread, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  threads
    .command('delete')
    .description('Delete a thread')
    .argument('<thread-id>', 'Thread ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (threadId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteThread(threadId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Thread deleted', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  threads
    .command('messages')
    .description('List messages in a thread')
    .argument('<thread-id>', 'Thread ID')
    .option('--limit <n>', 'Number of messages', '50')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        threadId: string,
        options: { limit?: string; cursor?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const messages = await client.getThreadMessages(
            threadId,
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

  threads
    .command('send')
    .description('Send a message to a thread')
    .argument('<thread-id>', 'Thread ID')
    .requiredOption('--content <text>', 'Message content')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (threadId: string, options: { content: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const message = await client.sendToThread(threadId, options.content)
          output(message, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return threads
}
