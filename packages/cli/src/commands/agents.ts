import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { output, outputSuccess, outputError, type OutputOptions } from '../utils/output.js'

export function createAgentsCommand(): Command {
  const agents = new Command('agents').description('Agent management commands')

  agents
    .command('list')
    .description('List your agents')
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

  agents
    .command('get')
    .description('Get agent details')
    .argument('<agent-id>', 'Agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (agentId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const agent = await client.getAgent(agentId)
        output(agent, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  agents
    .command('create')
    .description('Create a new agent')
    .requiredOption('--name <name>', 'Agent name')
    .option('--display-name <name>', 'Display name')
    .option('--avatar-url <url>', 'Avatar URL')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        name: string
        displayName?: string
        avatarUrl?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const agent = await client.createAgent({
            name: options.name,
            displayName: options.displayName,
            avatarUrl: options.avatarUrl,
          })
          output(agent, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), { json: options.json })
          process.exit(1)
        }
      }
    )

  agents
    .command('update')
    .description('Update an agent')
    .argument('<agent-id>', 'Agent ID')
    .option('--name <name>', 'New name')
    .option('--display-name <name>', 'New display name')
    .option('--avatar-url <url>', 'New avatar URL')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        agentId: string,
        options: {
          name?: string
          displayName?: string
          avatarUrl?: string
          profile?: string
          json?: boolean
        }
      ) => {
        try {
          const client = await getClient(options.profile)
          const agent = await client.updateAgent(agentId, {
            name: options.name,
            displayName: options.displayName,
            avatarUrl: options.avatarUrl,
          })
          output(agent, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), { json: options.json })
          process.exit(1)
        }
      }
    )

  agents
    .command('delete')
    .description('Delete an agent')
    .argument('<agent-id>', 'Agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (agentId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteAgent(agentId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Agent deleted', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  agents
    .command('start')
    .description('Start an agent')
    .argument('<agent-id>', 'Agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (agentId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.startAgent(agentId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Agent started', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  agents
    .command('stop')
    .description('Stop an agent')
    .argument('<agent-id>', 'Agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (agentId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.stopAgent(agentId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Agent stopped', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  agents
    .command('token')
    .description('Generate a new token for an agent')
    .argument('<agent-id>', 'Agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (agentId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const result = await client.generateAgentToken(agentId)
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

  agents
    .command('config')
    .description('Get agent remote config')
    .argument('<agent-id>', 'Agent ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (agentId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const config = await client.getAgentConfig(agentId)
        output(config, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return agents
}
