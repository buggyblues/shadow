import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createNotificationsCommand(): Command {
  const notifications = new Command('notifications').description('Notification commands')

  notifications
    .command('list')
    .description('List notifications')
    .option('--unread-only', 'Show only unread notifications')
    .option('--limit <n>', 'Number of notifications', '20')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        unreadOnly?: boolean
        limit?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const limit = parseInt(options.limit ?? '20', 10)
          const result = await client.listNotifications(limit)
          const notifications = Array.isArray(result) ? result : []
          output(notifications, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  notifications
    .command('mark-read')
    .description('Mark notification as read')
    .argument('<notification-id>', 'Notification ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (notificationId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.markNotificationRead(notificationId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Notification marked as read', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  notifications
    .command('mark-all-read')
    .description('Mark all notifications as read')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.markAllNotificationsRead()
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('All notifications marked as read', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return notifications
}
