import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createServersCommand(): Command {
  const servers = new Command('servers').description('Server management commands')

  servers
    .command('list')
    .description('List all servers you have joined')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const servers = await client.listServers()
        output(servers, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  servers
    .command('get')
    .description('Get server details')
    .argument('<server-id>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const server = await client.getServer(serverId)
        output(server, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  servers
    .command('create')
    .description('Create a new server')
    .requiredOption('--name <name>', 'Server name')
    .option('--slug <slug>', 'Server slug')
    .option('--description <desc>', 'Server description')
    .option('--public', 'Make server public')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        name: string
        slug?: string
        description?: string
        public?: boolean
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const server = await client.createServer({
            name: options.name,
            slug: options.slug,
            description: options.description,
            isPublic: options.public,
          })
          output(server, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  servers
    .command('join')
    .description('Join a server')
    .argument('<server-id>', 'Server ID or slug')
    .option('--invite-code <code>', 'Invite code (if required)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: { inviteCode?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.joinServer(serverId, options.inviteCode)
          const outputOpts: OutputOptions = { json: options.json }
          if (options.json) {
            output(result, outputOpts)
          } else {
            outputSuccess('Joined server', outputOpts)
          }
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  servers
    .command('leave')
    .description('Leave a server')
    .argument('<server-id>', 'Server ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.leaveServer(serverId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Left server', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  servers
    .command('members')
    .description('List server members')
    .argument('<server-id>', 'Server ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const members = await client.getMembers(serverId)
        output(members, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  servers
    .command('homepage')
    .description('Get or set server homepage')
    .argument('<server-id>', 'Server ID or slug')
    .option('--set <file>', 'Set homepage from HTML file (use "-" for stdin)')
    .option('--clear', 'Clear homepage (reset to default)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: { set?: string; clear?: boolean; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)

          if (options.clear) {
            const result = await client.updateServerHomepage(serverId, null)
            output(result, { json: options.json })
            return
          }

          if (options.set) {
            let html: string
            if (options.set === '-') {
              // Read from stdin
              const chunks: Buffer[] = []
              for await (const chunk of process.stdin) {
                chunks.push(Buffer.from(chunk))
              }
              html = Buffer.concat(chunks).toString('utf-8')
            } else {
              const { readFile } = await import('node:fs/promises')
              html = await readFile(options.set, 'utf-8')
            }
            const result = await client.updateServerHomepage(serverId, html)
            output(result, { json: options.json })
            return
          }

          // Get homepage
          const server = await client.getServer(serverId)
          if (options.json) {
            output({ homepageHtml: server.homepageHtml }, { json: true })
          } else {
            console.log(server.homepageHtml ?? '(default homepage)')
          }
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  servers
    .command('discover')
    .description('Discover public servers')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const servers = await client.discoverServers()
        output(servers, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return servers
}
