import type { ShadowFriendship } from '@shadowob/sdk'
import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createFriendsCommand(): Command {
  const friends = new Command('friends').description('Friendship management commands')

  friends
    .command('list')
    .description('List friends')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const friendsData = await client.listFriends()
        output(friendsData, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  friends
    .command('requests')
    .description('List friend requests')
    .option('--incoming', 'Show only incoming requests')
    .option('--outgoing', 'Show only outgoing requests')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        incoming?: boolean
        outgoing?: boolean
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          let requests: ShadowFriendship[]
          if (options.incoming) {
            requests = await client.listPendingFriendRequests()
          } else if (options.outgoing) {
            requests = await client.listSentFriendRequests()
          } else {
            const [incoming, outgoing] = await Promise.all([
              client.listPendingFriendRequests(),
              client.listSentFriendRequests(),
            ])
            requests = [...incoming, ...outgoing]
          }
          output(requests, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  friends
    .command('add')
    .description('Send friend request by username')
    .argument('<username>', 'Username to add as friend')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (username: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const result = await client.sendFriendRequest(username)
        output(result, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  friends
    .command('accept')
    .description('Accept friend request')
    .argument('<request-id>', 'Friend request ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (requestId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const result = await client.acceptFriendRequest(requestId)
        output(result, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  friends
    .command('reject')
    .description('Reject friend request')
    .argument('<request-id>', 'Friend request ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (requestId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.rejectFriendRequest(requestId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Friend request rejected', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  friends
    .command('remove')
    .description('Remove friend')
    .argument('<friendship-id>', 'Friendship ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (friendshipId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.removeFriend(friendshipId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Friend removed', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return friends
}
