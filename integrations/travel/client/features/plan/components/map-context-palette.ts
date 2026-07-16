import {
  BagShopping,
  Bed,
  Bus,
  Castle,
  CupHot,
  FoodTray,
  Gallery,
  type IconComponent,
  Layer2,
  Tree2,
} from '../../../components/icons.js'
import type { MapContextCategory } from '../api/map-context.js'

export const contextCategoryIcons: Record<MapContextCategory, IconComponent> = {
  cafe: CupHot,
  essentials: Layer2,
  hotel: Bed,
  museum: Gallery,
  nature: Tree2,
  restaurant: FoodTray,
  shopping: BagShopping,
  sights: Castle,
  transport: Bus,
}

export const contextLayerOrder: MapContextCategory[] = [
  'sights',
  'transport',
  'restaurant',
  'cafe',
  'museum',
  'nature',
  'shopping',
  'hotel',
  'essentials',
]

const contextCategoryColors: Record<MapContextCategory, string> = {
  cafe: '#8a5b3b',
  essentials: '#2f7f7a',
  hotel: '#506f92',
  museum: '#79558f',
  nature: '#2f8052',
  restaurant: '#c66a2d',
  shopping: '#7659ad',
  sights: '#c84f43',
  transport: '#3274c8',
}

const contextCategoryLabelKeys: Record<MapContextCategory, string> = {
  cafe: 'map.cafes',
  essentials: 'map.essentials',
  hotel: 'map.stay',
  museum: 'map.museums',
  nature: 'map.parks',
  restaurant: 'map.food',
  shopping: 'map.shopping',
  sights: 'map.landmarks',
  transport: 'map.transit',
}

export function contextCategoryColor(category: MapContextCategory) {
  return contextCategoryColors[category]
}

export function contextCategoryLabel(
  category: MapContextCategory,
  translate: (key: string) => string,
) {
  return translate(contextCategoryLabelKeys[category])
}
