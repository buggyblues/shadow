import type { FlashRealtimeEvent } from '@shadowob/flash-types/space-app'
import { createClient, type RedisClientType } from 'redis'

function channel(boardId: string) {
  return `flash:board:${boardId}`
}

export class FlashRealtimeService {
  private client: RedisClientType | null = null

  async connect(redisUrl?: string | null) {
    if (!redisUrl) return
    this.client = createClient({ url: redisUrl })
    this.client.on('error', (error) => {
      console.error('Flash Redis error', error)
    })
    await this.client.connect()
  }

  async publish(event: FlashRealtimeEvent) {
    if (!this.client) return
    await this.client.publish(channel(event.boardId), JSON.stringify(event))
  }

  async subscribe(boardId: string, onEvent: (event: FlashRealtimeEvent) => void) {
    if (!this.client) return async () => {}
    const subscriber = this.client.duplicate()
    await subscriber.connect()
    await subscriber.subscribe(channel(boardId), (message) => {
      try {
        onEvent(JSON.parse(message) as FlashRealtimeEvent)
      } catch {
        // Ignore malformed redis messages from manual test traffic.
      }
    })
    return async () => {
      await subscriber.unsubscribe(channel(boardId)).catch(() => undefined)
      await subscriber.quit().catch(() => undefined)
    }
  }
}
