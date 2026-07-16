import 'dotenv/config'
import type { Server as HttpServer } from 'node:http'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createAppContainer } from './container.js'
import { logger } from './lib/logger.js'
import { attachTravelWebSocketServer } from './ws/websocket.js'

export async function startServer() {
  const container = await createAppContainer()
  const app = createApp(container)
  const port = Number(process.env.PORT ?? 4224)

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      logger.info('Travel server started', { port: info.port })
    },
  )
  attachTravelWebSocketServer(server as HttpServer, container)
  const reconcile = async () => {
    const result = await container.channelMembershipSyncService.reconcileAll().catch((error) => {
      logger.warn('Travel channel reconciliation failed', { error })
      return null
    })
    if (result && result.attempted > 0) logger.info('Travel channels reconciled', result)
  }
  const reconciliationTimer = setInterval(reconcile, 30_000)
  reconciliationTimer.unref()
  void reconcile()
}

// Keep startup explicit so the development watcher can restart after domain changes.
await startServer()
