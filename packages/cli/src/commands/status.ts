import { Command } from 'commander'
import { configManager } from '../config/manager.js'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createStatusCommand(): Command {
  const status = new Command('status').description('Show detailed status information')

  status
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      const outputOpts: OutputOptions = { json: options.json }

      try {
        const profileName = options.profile ?? (await configManager.getCurrentProfileName())
        const profile = await configManager.getProfile(options.profile)

        if (!profile) {
          outputError(
            profileName
              ? `Profile "${profileName}" not found`
              : 'Not authenticated. Run: shadowob auth login',
            { json: options.json },
          )
          process.exit(1)
        }

        const client = await getClient(options.profile)

        // Gather all status information
        const user = await client.getMe()
        const notifications = await client.listNotifications(1).catch(() => [] as unknown[])

        const statusInfo = {
          profile: {
            name: profileName,
            serverUrl: profile.serverUrl,
          },
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          },
          stats: {
            unreadNotifications: Array.isArray(notifications) ? notifications.length : 0,
          },
          connection: {
            status: 'connected',
            timestamp: new Date().toISOString(),
          },
        }

        if (options.json) {
          output(statusInfo, outputOpts)
        } else {
          outputSuccess(`Connected as ${user.username}`, outputOpts)
          console.log('')
          console.log('Profile:')
          console.log(`  Name: ${profileName}`)
          console.log(`  Server: ${profile.serverUrl}`)
          console.log('')
          console.log('User:')
          console.log(`  ID: ${user.id}`)
          console.log(`  Username: ${user.username}`)
          if (user.displayName && user.displayName !== user.username) {
            console.log(`  Display Name: ${user.displayName}`)
          }
          console.log('')
          console.log('Stats:')
          console.log(`  Unread Notifications: ${statusInfo.stats.unreadNotifications}`)
        }
        process.exit(0)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (options.json) {
          output(
            {
              error: errorMessage,
              connection: {
                status: 'disconnected',
                timestamp: new Date().toISOString(),
              },
            },
            outputOpts,
          )
        } else {
          outputError(errorMessage, outputOpts)
        }
        process.exit(1)
      }
    })

  return status
}
