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
          const notifications = (Array.isArray(result) ? result : []).filter(
            (item) => !options.unreadOnly || item.isRead === false,
          )
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

  const preferences = notifications.command('preferences').description('Notification preferences')

  preferences
    .command('get')
    .description('Get notification preferences')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        output(await client.getNotificationPreferences(), { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  preferences
    .command('update')
    .description('Update notification preferences')
    .option('--strategy <strategy>', 'all | mention_only | none')
    .option('--muted-server-ids <ids>', 'Comma-separated server IDs')
    .option('--muted-channel-ids <ids>', 'Comma-separated channel IDs')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        strategy?: string
        mutedServerIds?: string
        mutedChannelIds?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          if (options.strategy && !['all', 'mention_only', 'none'].includes(options.strategy)) {
            throw new Error('Invalid --strategy. Expected all, mention_only, or none')
          }
          const client = await getClient(options.profile)
          const data = {
            ...(options.strategy
              ? { strategy: options.strategy as 'all' | 'mention_only' | 'none' }
              : {}),
            ...(options.mutedServerIds !== undefined
              ? { mutedServerIds: splitIds(options.mutedServerIds) }
              : {}),
            ...(options.mutedChannelIds !== undefined
              ? { mutedChannelIds: splitIds(options.mutedChannelIds) }
              : {}),
          }
          output(await client.updateNotificationPreferences(data), { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return notifications
}

function splitIds(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
