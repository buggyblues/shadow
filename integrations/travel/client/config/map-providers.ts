export interface RasterTileProvider {
  attribution: string
  id: string
  maxZoom: number
  tileUrl: string
}

const cartoVoyagerProvider: RasterTileProvider = {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  id: 'carto-voyager',
  maxZoom: 19,
  tileUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
}

export function getRasterTileProvider(): RasterTileProvider {
  const customTileUrl = import.meta.env.VITE_TRAVEL_MAP_TILE_URL as string | undefined
  if (!customTileUrl) return cartoVoyagerProvider

  return {
    attribution:
      (import.meta.env.VITE_TRAVEL_MAP_TILE_ATTRIBUTION as string | undefined) ??
      cartoVoyagerProvider.attribution,
    id: (import.meta.env.VITE_TRAVEL_MAP_TILE_PROVIDER as string | undefined) ?? 'custom-raster',
    maxZoom: Number(import.meta.env.VITE_TRAVEL_MAP_TILE_MAX_ZOOM ?? cartoVoyagerProvider.maxZoom),
    tileUrl: customTileUrl,
  }
}
