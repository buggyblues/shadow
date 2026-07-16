export const travelClientStateEventName = 'travel:client-state-updated'

export interface TravelClientStateEventDetail {
  key?: string
  revision?: number
  scope?: string
  tripId?: string
}
