import { EventEmitter } from 'node:events'
import type { ShadowSpaceAppCommandEventType } from '@shadowob/sdk'

export interface SpaceAppRuntimeEvent {
  type: ShadowSpaceAppCommandEventType
  serverId: string
  spaceAppId: string
  appKey: string
  command: string
  actorKind: string
  dataClass?: string
  action?: string
  timestamp: string
}

export class SpaceAppEventBus {
  private readonly emitter = new EventEmitter()

  publish(event: SpaceAppRuntimeEvent) {
    this.emitter.emit(this.key(event.spaceAppId), event)
  }

  subscribe(spaceAppId: string, handler: (event: SpaceAppRuntimeEvent) => void) {
    const key = this.key(spaceAppId)
    this.emitter.on(key, handler)
    return () => this.emitter.off(key, handler)
  }

  private key(spaceAppId: string) {
    return `space-app:${spaceAppId}`
  }
}
