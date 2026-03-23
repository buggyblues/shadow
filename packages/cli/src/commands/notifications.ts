import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createNotificationsCommand(): Command {
  const notifications = new Command('notifications').description('Notification commands')

  notifications
    .command('list')
    .description('List notifications')
    .option('--limit <n>', 'Number of notifications (1-100)', '50')
    .option('--offset <n>', 'Offset for pagination', '0')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: { limit?: string; offset?: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const limit = Math.min(Math.max(parseInt(options.limit ?? '50', 10), 1), 100)
          const offset = Math.max(parseInt(options.offset ?? '0', 10), 0)
          const notificationsData = await client.listNotifications(limit, offset)
          output(notificationsData, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  notifications
    .command('get')
    .description('Get notification details')
    .argument('<notification-id>', 'Notification ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (notificationId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const notification = await client.getNotification(notificationId)
        output(notification, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

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

  // Note: SDK doesn't have deleteNotification, only mark-as-read
  // Removing delete command as it's not supported by API

  // Preferences
  const prefs = notifications.command('preferences').description('Notification preferences')

  prefs
    .command('get')
    .description('Get notification preferences')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const preferences = await client.getNotificationPreferences()
        output(preferences, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  prefs
    .command('update')
    .description('Update notification preferences')
    .option('--email-enabled <bool>', 'Enable email notifications')
    .option('--push-enabled <bool>', 'Enable push notifications')
    .option('--mentions-only <bool>', 'Only notify on mentions')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        emailEnabled?: string
        pushEnabled?: string
        mentionsOnly?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const preferences = await client.updateNotificationPreferences({
            emailEnabled: options.emailEnabled ? options.emailEnabled === 'true' : undefined,
            pushEnabled: options.pushEnabled ? options.pushEnabled === 'true' : undefined,
            mentionsOnly: options.mentionsOnly ? options.mentionsOnly === 'true' : undefined,
          })
          output(preferences, { json: options.json })
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
