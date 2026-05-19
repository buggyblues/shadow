import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createBuddiesCommand(): Command {
  const buddies = new Command('buddies').description('Buddy management commands')

  buddies
    .command('list')
    .description('List your buddies')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const agents = await client.listAgents()
        output(agents, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  buddies
    .command('get')
    .description('Get buddy details')
    .argument('<buddy-id>', 'Buddy ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (buddyId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const agent = await client.getAgent(buddyId)
        output(agent, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  buddies
    .command('create')
    .description('Create a new buddy')
    .requiredOption('--name <name>', 'Buddy name')
    .requiredOption('--username <username>', 'Buddy username')
    .option('--display-name <name>', 'Display name')
    .option('--avatar-url <url>', 'Avatar URL')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        name: string
        username: string
        displayName?: string
        avatarUrl?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const agent = await client.createAgent({
            name: options.name,
            username: options.username,
            displayName: options.displayName,
            avatarUrl: options.avatarUrl,
          })
          output(agent, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  buddies
    .command('update')
    .description('Update a buddy')
    .argument('<buddy-id>', 'Buddy ID')
    .option('--name <name>', 'New name')
    .option('--display-name <name>', 'New display name')
    .option('--avatar-url <url>', 'New avatar URL')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        buddyId: string,
        options: {
          name?: string
          displayName?: string
          avatarUrl?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const agent = await client.updateAgent(buddyId, {
            name: options.name,
            displayName: options.displayName,
            avatarUrl: options.avatarUrl,
          })
          output(agent, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  buddies
    .command('delete')
    .description('Delete a buddy')
    .argument('<buddy-id>', 'Buddy ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (buddyId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteAgent(buddyId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Buddy deleted', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  buddies
    .command('start')
    .description('Start a buddy')
    .argument('<buddy-id>', 'Buddy ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (buddyId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.startAgent(buddyId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Buddy started', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  buddies
    .command('stop')
    .description('Stop a buddy')
    .argument('<buddy-id>', 'Buddy ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (buddyId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.stopAgent(buddyId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Buddy stopped', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  buddies
    .command('token')
    .description('Generate a new token for a buddy')
    .argument('<buddy-id>', 'Buddy ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (buddyId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const result = await client.generateAgentToken(buddyId)
        if (options.json) {
          output(result, { json: true })
        } else {
          console.log(result.token)
        }
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  buddies
    .command('config')
    .description('Get buddy remote config')
    .argument('<buddy-id>', 'Buddy ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (buddyId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const config = await client.getAgentConfig(buddyId)
        output(config, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return buddies
}
