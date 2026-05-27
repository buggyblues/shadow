import { EventEmitter } from 'node:events'
import type { ShadowServerAppCommandEventType } from '@shadowob/sdk'

export interface ServerAppRuntimeEvent {
  type: ShadowServerAppCommandEventType
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
