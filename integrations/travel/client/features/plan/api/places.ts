export type PlaceCategory = 'Sights' | 'Food' | 'Museums'

export interface Place {
  id: string
  serverId?: string
  title: string
  category: PlaceCategory
  address: string
  meta: string
  status: 'saved' | 'scheduled' | 'booking' | 'idea' | 'near-hotel'
  statusLabel: string
  distance?: string
  distanceKm?: number
  image: string
  hero?: string
  latitude: number
  longitude: number
  selected?: boolean
  rating?: string
  hours?: string
  cost?: string
  costAmount?: number
  costCurrency?: string
  costUnitKey?: string
  description?: string
  notes?: string
  attachmentId?: string
  attachmentName?: string
}
