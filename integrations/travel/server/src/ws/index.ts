import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContainer } from '../container.js'
import type { TravelHonoEnv } from '../types.js'

export function createTravelRealtimeHandler(container: AppContainer) {
  const app = new Hono<TravelHonoEnv>()

  app.get('/trips/:tripId/events', async (c) => {
    const tripId = c.req.param('tripId')
    await container.accessPolicy.requireTripRead(c.get('requestContext'), tripId)
    const sinceRaw =
      c.req.query('since') ?? c.req.query('lastEventId') ?? c.req.header('Last-Event-ID')
    const since = sinceRaw ? Number(sinceRaw) : 0
    return streamSSE(c, async (stream) => {
      const unsubscribe = container.eventBus.onTrip(tripId, (event) => {
        void stream.writeSSE({
          id: event.id,
          event: event.type,
          data: JSON.stringify(event),
        })
      })

      for (const event of container.eventBus.recentTripEvents(
        tripId,
        Number.isFinite(since) ? since : 0,
      )) {
        await stream.writeSSE({
          id: event.id,
          event: event.type,
          data: JSON.stringify(event),
        })
      }

      await stream.writeSSE({
        event: 'ready',
        data: JSON.stringify({ ok: true, tripId }),
      })

      const heartbeat = setInterval(() => {
        void stream.writeSSE({
          event: 'heartbeat',
          data: JSON.stringify({ ok: true, tripId }),
        })
      }, 25000)

      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve())
      })
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  return app
}
