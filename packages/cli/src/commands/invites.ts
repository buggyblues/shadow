import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createInvitesCommand(): Command {
  const invites = new Command('invites').description('Invite code management commands')

  invites
    .command('list')
    .description('List your invite codes')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const invitesData = await client.listInvites()
        output(invitesData, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  invites
    .command('create')
    .description('Create invite codes')
    .requiredOption('--count <n>', 'Number of invites to create', '1')
    .option('--note <text>', 'Note for the invites')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: { count?: string; note?: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const count = Math.min(Math.max(parseInt(options.count ?? '1', 10), 1), 10)
          const invites = await client.createInvites(count, options.note)
          output(invites, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  invites
    .command('deactivate')
    .description('Deactivate invite code')
    .argument('<invite-id>', 'Invite ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (inviteId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const invite = await client.deactivateInvite(inviteId)
        output(invite, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  invites
    .command('delete')
    .description('Delete invite code')
    .argument('<invite-id>', 'Invite ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (inviteId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteInvite(inviteId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Invite deleted', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return invites
}
