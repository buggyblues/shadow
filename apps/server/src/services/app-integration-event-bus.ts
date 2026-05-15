import { EventEmitter } from 'node:events'

export interface ServerAppRuntimeEvent {
  type: 'server_app.command.completed' | 'server_app.command.failed'
  serverId: string
  serverAppId: string
  appKey: string
  command: string
  actorKind: string
  dataClass?: string
  action?: string
  timestamp: string
}

export class AppIntegrationEventBus {
  private readonly emitter = new EventEmitter()

  publish(event: ServerAppRuntimeEvent) {
    this.emitter.emit(this.key(event.serverAppId), event)
  }

  subscribe(serverAppId: string, handler: (event: ServerAppRuntimeEvent) => void) {
    const key = this.key(serverAppId)
    this.emitter.on(key, handler)
    return () => this.emitter.off(key, handler)
  }

  private key(serverAppId: string) {
    return `server-app:${serverAppId}`
  }
}
