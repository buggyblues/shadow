import { Command } from 'commander'
import { getSocket } from '../utils/client.js'
import { outputError } from '../utils/output.js'

export function createListenCommand(): Command {
  const listen = new Command('listen').description('Listen to real-time events')

  listen
    .command('channel')
    .description('Listen to events in a channel')
    .argument('<channel-id>', 'Channel ID')
    .option('--mode <mode>', 'Listen mode: stream or poll', 'stream')
    .option('--timeout <seconds>', 'Timeout in seconds (stream mode)', '60')
    .option('--count <n>', 'Stop after N events (stream mode)')
    .option('--since <duration>', 'Poll events since duration (e.g., 5m, 1h)', '5m')
    .option('--last <n>', 'Poll last N messages', '50')
    .option('--event-type <type>', 'Filter by event type (comma-separated)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON (one per line)')
    .action(
      async (
        channelId: string,
        options: {
          mode: string
          timeout?: string
          count?: string
          since?: string
          last?: string
          eventType?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const eventTypes = options.eventType?.split(',').map((t) => t.trim())

          if (options.mode === 'poll') {
            // Poll mode: fetch recent messages and exit
            const { getClient } = await import('../utils/client.js')
            const client = await getClient(options.profile)
            const limit = parseInt(options.last ?? '50', 10)
            const result = await client.getMessages(channelId, limit)

            if (options.json) {
              for (const msg of result.messages) {
                console.log(JSON.stringify({ type: 'message:new', data: msg }))
              }
            } else {
              for (const msg of result.messages) {
                console.log(
                  `[${msg.createdAt}] ${msg.author?.username ?? 'unknown'}: ${msg.content}`,
                )
              }
            }
            return
          }

          // Stream mode: connect via WebSocket and listen
          const socket = await getSocket(options.profile)
          const timeoutMs = parseInt(options.timeout ?? '60', 10) * 1000
          const maxCount = options.count ? parseInt(options.count, 10) : undefined

          let count = 0
          let timeoutId: NodeJS.Timeout | undefined

          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId)
            socket.disconnect()
          }

          // Set up timeout
          timeoutId = setTimeout(() => {
            if (!options.json) {
              console.error('(timeout reached)')
            }
            cleanup()
            process.exit(0)
          }, timeoutMs)

          // Handle events
          const shouldOutput = (eventType: string) => {
            if (!eventTypes) return true
            return eventTypes.includes(eventType)
          }

          const outputEvent = (type: string, data: unknown) => {
            if (!shouldOutput(type)) return

            count++
            if (options.json) {
              console.log(JSON.stringify({ type, data, timestamp: new Date().toISOString() }))
            } else {
              const timestamp = new Date().toLocaleTimeString()
              if (type === 'message:new') {
                const msg = data as { author?: { username?: string }; content?: string }
                console.log(
                  `[${timestamp}] ${msg.author?.username ?? 'unknown'}: ${msg.content ?? ''}`,
                )
              } else {
                console.log(`[${timestamp}] ${type}:`, JSON.stringify(data))
              }
            }

            if (maxCount && count >= maxCount) {
              cleanup()
              process.exit(0)
            }
          }

          // Register event handlers - use unknown cast to avoid type issues
          socket.on('message:new', ((msg: { channelId?: string }) => {
            if (msg.channelId === channelId) {
              outputEvent('message:new', msg)
            }
          }) as unknown as () => void)

          socket.on('message:updated', ((msg: { channelId?: string }) => {
            if (msg.channelId === channelId) {
              outputEvent('message:updated', msg)
            }
          }) as unknown as () => void)

          socket.on('message:deleted', ((payload: { channelId?: string }) => {
            if (payload.channelId === channelId) {
              outputEvent('message:deleted', payload)
            }
          }) as unknown as () => void)

          socket.on('reaction:add', ((payload: unknown) => {
            outputEvent('reaction:add', payload)
          }) as unknown as () => void)

          socket.on('reaction:remove', ((payload: unknown) => {
            outputEvent('reaction:remove', payload)
          }) as unknown as () => void)

          socket.on('member:typing', ((payload: { channelId?: string }) => {
            if (payload.channelId === channelId) {
              outputEvent('member:typing', payload)
            }
          }) as unknown as () => void)

          socket.on('member:join', ((payload: { channelId?: string }) => {
            if (payload.channelId === channelId) {
              outputEvent('member:join', payload)
            }
          }) as unknown as () => void)

          socket.on('member:leave', ((payload: { channelId?: string }) => {
            if (payload.channelId === channelId) {
              outputEvent('member:leave', payload)
            }
          }) as unknown as () => void)

          // Connect and join channel
          socket.connect()
          await socket.waitForConnect(5000)
          await socket.joinChannel(channelId)

          if (!options.json) {
            console.error(`(listening to channel ${channelId}, timeout: ${timeoutMs}ms)`)
          }

          // Keep process alive
          await new Promise(() => {
            // Never resolves, waits for timeout or signal
          })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  listen
    .command('dm')
    .description('Listen to DM events')
    .argument('<dm-channel-id>', 'DM Channel ID')
    .option('--timeout <seconds>', 'Timeout in seconds', '60')
    .option('--count <n>', 'Stop after N events')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON (one per line)')
    .action(
      async (
        dmChannelId: string,
        options: {
          timeout?: string
          count?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const socket = await getSocket(options.profile)
          const timeoutMs = parseInt(options.timeout ?? '60', 10) * 1000
          const maxCount = options.count ? parseInt(options.count, 10) : undefined

          let count = 0
          let timeoutId: NodeJS.Timeout | undefined

          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId)
            socket.disconnect()
          }

          timeoutId = setTimeout(() => {
            cleanup()
            process.exit(0)
          }, timeoutMs)

          socket.on('dm:message:new', ((msg: {
            dmChannelId?: string
            createdAt?: string
            author?: { username?: string }
            content?: string
          }) => {
            if (msg.dmChannelId !== dmChannelId) return

            count++
            if (options.json) {
              console.log(JSON.stringify({ type: 'dm:message:new', data: msg }))
            } else {
              const timestamp = new Date(msg.createdAt ?? Date.now()).toLocaleTimeString()
              console.log(
                `[${timestamp}] ${msg.author?.username ?? 'unknown'}: ${msg.content ?? ''}`,
              )
            }

            if (maxCount && count >= maxCount) {
              cleanup()
              process.exit(0)
            }
          }) as unknown as () => void)

          // Connect and join DM channel
          socket.connect()
          await socket.waitForConnect(5000)
          socket.joinDmChannel(dmChannelId)

          if (!options.json) {
            console.error(`(listening to DM channel ${dmChannelId}, timeout: ${timeoutMs}ms)`)
          }

          // Keep process alive
          await new Promise(() => {
            // Never resolves, waits for timeout or signal
          })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return listen
}
