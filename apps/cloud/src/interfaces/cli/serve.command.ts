/**
 * CLI: shadowob-cloud serve — start the console API server.
 */

import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'
import { startHttpServer } from '../http/server.js'

export function createServeCommand(container: ServiceContainer) {
  return new Command('serve')
    .description('Start the shadowob-cloud console API server')
    .option('-p, --port <number>', 'Port to listen on', '3004')
    .option('-n, --namespace <ns...>', 'Kubernetes namespace(s) to watch', ['shadowob-cloud'])
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--auth-token <token>', 'Bearer token for API authentication')
    .action(
      async (options: { port: string; namespace: string[]; host: string; authToken?: string }) => {
        const port = Number.parseInt(options.port, 10)
        const namespaces = Array.isArray(options.namespace)
          ? options.namespace
          : [options.namespace]

        await startHttpServer(container, {
          port,
          host: options.host,
          namespaces,
          authToken: options.authToken,
        })
      },
    )
}
