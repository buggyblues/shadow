import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

export function createProfileCommentsCommand(): Command {
  const comments = new Command('profile-comments').description(
    'Profile comment management commands',
  )

  comments
    .command('get')
    .description('Get comments for a user profile')
    .argument('<user-id>', 'Profile user ID')
    .option('--limit <n>', 'Number of results', '20')
    .option('--offset <n>', 'Offset for pagination', '0')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (userId: string, options: Record<string, unknown>) => {
      try {
        const client = await getClient(options.profile as string)
        const result = await client.getProfileComments(userId, {
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

  comments
    .command('create')
    .description('Create a profile comment')
    .requiredOption('--user-id <id>', 'Profile user ID')
    .requiredOption('--content <text>', 'Comment content')
    .option('--parent-id <id>', 'Parent comment ID (for replies)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: Record<string, unknown>) => {
      try {
        const client = await getClient(options.profile as string)
        const result = await client.createProfileComment({
          profileUserId: options.userId as string,
          content: options.content as string,
          parentId: options.parentId as string | undefined,
        })
        output(result, { json: options.json as boolean })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json as boolean,
        })
        process.exit(1)
      }
    })

  comments
    .command('delete')
    .description('Delete a profile comment')
    .argument('<comment-id>', 'Comment ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (commentId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteProfileComment(commentId)
        output({ ok: true }, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  return comments
}
