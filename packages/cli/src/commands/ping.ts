import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createPingCommand(): Command {
  const ping = new Command('ping').description('Test connection to Shadow server')

  ping
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      const startTime = Date.now()
      const outputOpts: OutputOptions = { json: options.json }

      try {
        const client = await getClient(options.profile)
        const user = await client.getMe()
        const latency = Date.now() - startTime

        const result = {
          success: true,
          latency: `${latency}ms`,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
          },
          timestamp: new Date().toISOString(),
        }

        if (options.json) {
          output(result, outputOpts)
        } else {
          outputSuccess(`Connected to Shadow server (${latency}ms)`, outputOpts)
          console.log(`User: ${user.username} (${user.id})`)
        }
        process.exit(0)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const result = {
          success: false,
          error: errorMessage,
          latency: `${Date.now() - startTime}ms`,
          timestamp: new Date().toISOString(),
        }

        if (options.json) {
          output(result, outputOpts)
        } else {
          outputError(`Failed to connect: ${errorMessage}`, outputOpts)
          console.log('\nTroubleshooting:')
          console.log('  - Check your server URL')
          console.log('  - Verify your token is valid')
          console.log('  - Run: shadowob config validate')
        }
        process.exit(1)
      }
    })

  return ping
}
