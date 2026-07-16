import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../client/services/api-client.js', () => ({
  apiGet: vi.fn(),
}))

import {
  createDefaultMapContextLayers,
  createMapContextGridPlan,
  dedupeMapContextPois,
  fetchMapContextPoiDetails,
  fetchMapContextPoiPhoto,
  fetchMapContextPois,
  MIN_CONTEXT_POI_ZOOM,
  mapContextCategoryToPlaceCategory,
} from '../client/features/plan/api/map-context.js'
import { providerResultToPlace } from '../client/features/plan/api/place-search.js'
import { apiGet } from '../client/services/api-client.js'
import { isMeaningfulTravelImage } from '../client/utils/travel-images.js'
import {
  formatTravelAddress,
  formatTravelOpeningHours,
} from '../client/utils/travel-place-format.js'
import {
  photoTitleScore,
  TravelProviderGateway,
} from '../server/src/gateways/travel-provider.gateway.js'

const mockedApiGet = vi.mocked(apiGet)

describe('Travel map context', () => {
  beforeEach(() => {
    mockedApiGet.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the most useful nearby place categories by default', () => {
    expect(createDefaultMapContextLayers()).toMatchObject({
      cafe: true,
      restaurant: true,
      sights: true,
      transport: true,
    })
    expect(mapContextCategoryToPlaceCategory('restaurant')).toBe('Food')
    expect(mapContextCategoryToPlaceCategory('museum')).toBe('Museums')
    expect(mapContextCategoryToPlaceCategory('transport')).toBe('Sights')
  })

  it('merges provider duplicates and keeps the richer nearby record', () => {
    const pois = dedupeMapContextPois([
      {
        id: 'synthetic-1',
        title: 'Gare Montparnasse',
        category: 'transport',
        coordinates: { lat: 48.841, lng: 2.32 },
      },
      {
        id: 'node:2',
        title: 'Gare  Montparnasse',
        category: 'transport',
        coordinates: { lat: 48.8411, lng: 2.3201 },
        address: '17 Boulevard de Vaugirard, Paris',
        externalRefs: { osmId: 'node:2' },
      },
    ])
    expect(pois).toHaveLength(1)
    expect(pois[0]?.id).toBe('node:2')
  })

  it('formats verbose provider metadata for a compact travel card', () => {
    expect(formatTravelAddress('Paris, Île-de-France, Paris, France')).toBe(
      'Paris, Île-de-France, France',
    )
    expect(
      formatTravelOpeningHours('Mo 09:00-18:00; Tu 09:00-18:00; We 09:00-18:00; Th 09:00-18:00'),
    ).toBe('Mo 09:00-18:00 · Tu 09:00-18:00 · We 09:00-18:00…')
  })

  it('uses semantic placeholders instead of presenting the app logo as a place photo', () => {
    expect(providerResultToPlace({ title: 'Nearby place' }).image).toBe('')
    expect(isMeaningfulTravelImage('/travel-icon.svg')).toBe(false)
    expect(isMeaningfulTravelImage('https://images.example/place.jpg')).toBe(true)
  })

  it('plans stable buffered grid cells around the visible map', () => {
    const firstBounds = { south: 48.851, west: 2.341, north: 48.856, east: 2.346 }
    const shiftedBounds = { south: 48.8513, west: 2.3413, north: 48.8563, east: 2.3463 }
    const firstPlan = createMapContextGridPlan({ bounds: firstBounds, zoom: 15 })
    const shiftedPlan = createMapContextGridPlan({ bounds: shiftedBounds, zoom: 15 })

    expect(firstPlan.bounds).toMatchObject({
      east: expect.any(Number),
      north: expect.any(Number),
      south: expect.any(Number),
      west: expect.any(Number),
    })
    expect(firstPlan.bounds.south).toBeLessThan(firstBounds.south)
    expect(firstPlan.bounds.west).toBeLessThan(firstBounds.west)
    expect(firstPlan.bounds.north).toBeGreaterThan(firstBounds.north)
    expect(firstPlan.bounds.east).toBeGreaterThan(firstBounds.east)
    expect(firstPlan.key).toBe(shiftedPlan.key)
  })

  it('reuses cached grid cells instead of refetching after a small map pan', async () => {
    mockedApiGet.mockResolvedValueOnce({
      pois: [
        {
          title: 'Grid landmark',
          category: 'sights',
          coordinates: { lat: 35.683, lng: 139.763 },
        },
      ],
      source: 'openstreetmap',
    })
    const firstBounds = { south: 35.68, west: 139.76, north: 35.686, east: 139.768 }
    const shiftedBounds = { south: 35.6802, west: 139.7602, north: 35.6862, east: 139.7682 }

    await fetchMapContextPois({ bounds: firstBounds, categories: ['sights'], zoom: 15 })
    await fetchMapContextPois({ bounds: shiftedBounds, categories: ['sights'], zoom: 15 })

    expect(mockedApiGet).toHaveBeenCalledTimes(1)
  })

  it('does not request or return nearby places below the readable zoom level', async () => {
    await expect(
      fetchMapContextPois({
        bounds: { south: 51.49, west: -0.14, north: 51.52, east: -0.1 },
        categories: ['sights'],
        zoom: MIN_CONTEXT_POI_ZOOM - 1,
      }),
    ).resolves.toEqual({ pois: [], sources: [], unavailableCategoryCount: 0 })
    expect(mockedApiGet).not.toHaveBeenCalled()
  })

  it('loads provider details and a proxied photo for a selected map place', async () => {
    const poi = {
      id: 'node:123',
      title: 'Nearby landmark',
      category: 'sights' as const,
      coordinates: { lat: 48.85, lng: 2.35 },
      externalRefs: { osmId: 'node:123', provider: 'openstreetmap' },
    }
    mockedApiGet
      .mockResolvedValueOnce({
        source: 'openstreetmap',
        address: 'Paris',
        openingHours: '10:00-18:00',
      })
      .mockResolvedValueOnce({ photoUrl: '/api/providers/places/photo/example/bytes' })

    await expect(fetchMapContextPoiDetails(poi, 'zh-CN')).resolves.toMatchObject({
      address: 'Paris',
    })
    await expect(fetchMapContextPoiPhoto(poi)).resolves.toBe(
      '/api/providers/places/photo/example/bytes',
    )
    expect(mockedApiGet).toHaveBeenNthCalledWith(
      1,
      '/api/providers/places/details',
      expect.objectContaining({ expanded: true, placeId: 'node:123' }),
    )
  })

  it('keeps successful categories when another nearby provider request fails', async () => {
    mockedApiGet
      .mockResolvedValueOnce({
        pois: [
          {
            title: 'Nearby landmark',
            category: 'sights',
            coordinates: { lat: 48.85, lng: 2.35 },
          },
        ],
        source: 'openstreetmap',
      })
      .mockRejectedValueOnce(new Error('temporary provider failure'))

    await expect(
      fetchMapContextPois({
        bounds: { south: 48.8401, west: 2.3301, north: 48.8701, east: 2.3701 },
        categories: ['sights', 'restaurant'],
      }),
    ).resolves.toMatchObject({
      pois: [{ title: 'Nearby landmark' }],
      unavailableCategoryCount: 1,
    })
  })

  it('limits nearby category requests so map movement cannot exhaust the browser pool', async () => {
    let activeRequests = 0
    let maximumConcurrency = 0
    mockedApiGet.mockImplementation(async () => {
      activeRequests += 1
      maximumConcurrency = Math.max(maximumConcurrency, activeRequests)
      await new Promise((resolve) => setTimeout(resolve, 15))
      activeRequests -= 1
      return { pois: [], source: 'test' }
    })

    await fetchMapContextPois({
      bounds: { south: 37.7701, west: -122.4301, north: 37.7801, east: -122.4101 },
      categories: ['sights', 'restaurant', 'museum', 'transport'],
      zoom: 15,
    })

    expect(mockedApiGet).toHaveBeenCalledTimes(4)
    expect(maximumConcurrency).toBeLessThanOrEqual(2)
  })

  it('surfaces a total provider failure so React Query can retry it', async () => {
    mockedApiGet.mockRejectedValueOnce(new Error('temporary provider failure'))

    await expect(
      fetchMapContextPois({
        bounds: { south: 40.7002, west: -74.0202, north: 40.7302, east: -73.9802 },
        categories: ['sights'],
      }),
    ).rejects.toThrow('temporary provider failure')
  })

  it('does not turn a failed Overpass request into a cacheable empty result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const gateway = new TravelProviderGateway()

    await expect(
      gateway.searchPois({
        category: 'sights',
        bbox: { south: 48.8403, west: 2.3303, north: 48.8703, east: 2.3703 },
        limit: 12,
      }),
    ).rejects.toBeInstanceOf(AggregateError)

    expect(fetchMock).toHaveBeenCalled()
    fetchMock.mockRestore()
  })

  it('coalesces identical POI requests and cancels the losing Overpass hedge', async () => {
    const originalHedgeDelay = process.env.OVERPASS_HEDGE_DELAY_MS
    process.env.OVERPASS_HEDGE_DELAY_MS = '1'
    let activeRequests = 0
    let maximumConcurrency = 0
    let requestCount = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      requestCount += 1
      activeRequests += 1
      maximumConcurrency = Math.max(maximumConcurrency, activeRequests)
      if (requestCount === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              activeRequests -= 1
              reject(init.signal?.reason)
            },
            { once: true },
          )
        })
      }
      activeRequests -= 1
      return Promise.resolve(
        new Response(JSON.stringify({ elements: [] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
    })
    const gateway = new TravelProviderGateway()
    const input = {
      category: 'nature',
      bbox: { south: 34.0501, west: -118.2601, north: 34.0701, east: -118.2401 },
      limit: 12,
    }

    const [first, duplicate] = await Promise.all([
      gateway.searchPois(input),
      gateway.searchPois(input),
    ])

    expect(first).toEqual(duplicate)
    expect(requestCount).toBe(2)
    expect(maximumConcurrency).toBeLessThanOrEqual(2)
    expect(activeRequests).toBe(0)
    fetchMock.mockRestore()
    if (originalHedgeDelay === undefined) delete process.env.OVERPASS_HEDGE_DELAY_MS
    else process.env.OVERPASS_HEDGE_DELAY_MS = originalHedgeDelay
  })

  it('coalesces and caches identical server-side route provider requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'Ok',
          routes: [
            {
              distance: 1234,
              duration: 456,
              geometry: {
                coordinates: [
                  [2.31, 48.81],
                  [2.32, 48.82],
                ],
              },
              legs: [{ distance: 1234, duration: 456 }],
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    )
    const gateway = new TravelProviderGateway()
    const input = {
      coordinates: [
        { lat: 48.81011, lng: 2.31011 },
        { lat: 48.82022, lng: 2.32022 },
      ],
      mode: 'walking' as const,
    }

    const [first, duplicate] = await Promise.all([
      gateway.routePlan(input),
      gateway.routePlan(input),
    ])
    const cached = await gateway.routePlan(input)

    expect(first).toEqual(duplicate)
    expect(cached).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRestore()
  })

  it('serves persisted stale provider data while refreshing it in the background', async () => {
    const input = {
      coordinates: [
        { lat: 12.34567, lng: 76.54321 },
        { lat: 12.35567, lng: 76.55321 },
      ],
      mode: 'walking' as const,
    }
    const value = {
      source: 'osrm',
      mode: 'walking',
      distanceMeters: 800,
      durationSeconds: 600,
      coordinates: input.coordinates,
      legs: [],
    }
    const cacheDao = {
      find: vi.fn(async () => ({
        id: 'pcache-stale-route',
        serverId: 'local',
        key: 'route:v2:walking:12.34567,76.54321;12.35567,76.55321',
        provider: 'osrm',
        value,
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
        staleAt: new Date(Date.now() + 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      upsert: vi.fn(),
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const gateway = new TravelProviderGateway(cacheDao as never)

    await expect(gateway.routePlan(input)).resolves.toEqual(value)
    expect(cacheDao.find).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRestore()
  })

  it('prefers a Wikimedia photo whose title matches the selected place', () => {
    expect(
      photoTitleScore(
        'File:Point zéro des routes de France.svg',
        'Point zéro des Routes de France',
      ),
    ).toBeGreaterThan(
      photoTitleScore('File:Tour Eiffel Paris.jpg', 'Point zéro des Routes de France'),
    )
  })
})
