import { EventEmitter } from 'node:events'
import { nowIso } from '../lib/time.js'
import type { TravelEvent } from '../types.js'

export class TravelEventBus {
  private readonly emitter = new EventEmitter()
  private readonly history = new Map<string, TravelEvent[]>()
  private sequence = 0
  private readonly historyLimit = Number(process.env.TRAVEL_EVENT_HISTORY_LIMIT ?? 500)

  emit(
    event: Omit<TravelEvent, 'emittedAt' | 'id' | 'sequence'>,
    options: { recordHistory?: boolean } = {},
  ) {
    const sequence = (this.sequence += 1)
    const payload: TravelEvent = {
      ...event,
      id: String(sequence),
      sequence,
      emittedAt: nowIso(),
    }
    if (payload.tripId && options.recordHistory !== false) {
      const events = [...(this.history.get(payload.tripId) ?? []), payload].slice(
        -this.historyLimit,
      )
      this.history.set(payload.tripId, events)
    }
    this.emitter.emit('event', payload)
    if (payload.tripId) this.emitter.emit(`trip:${payload.tripId}`, payload)
  }

  recentTripEvents(tripId: string, sinceSequence = 0) {
    return (this.history.get(tripId) ?? []).filter((event) => event.sequence > sinceSequence)
  }

  currentSequence() {
    return this.sequence
  }

  onTrip(tripId: string, listener: (event: TravelEvent) => void) {
    const eventName = `trip:${tripId}`
    this.emitter.on(eventName, listener)
    return () => this.emitter.off(eventName, listener)
  }
}
