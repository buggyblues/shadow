import { Hono } from 'hono'
import type { AppContainer } from '../container.js'
import { badRequest } from '../lib/errors.js'
import { ok } from '../lib/json.js'
import type { RequestContext, TravelContext, TravelHonoEnv } from '../types.js'
import { parseBooleanQuery, parseJsonBody } from '../validators/http.js'
import {
  resolveProviderUrlSchema,
  upsertProviderSettingsSchema,
} from '../validators/travel.schema.js'

function requestContext(c: TravelContext): RequestContext {
  return c.get('requestContext')
}

export function createProviderApiHandler(container: AppContainer) {
  const app = new Hono<TravelHonoEnv>()

  app.get('/providers/places/search', async (c) => {
    const data = await container.providerUseCase.searchPlaces(requestContext(c), {
      query: c.req.query('query'),
      lat: c.req.query('lat'),
      lng: c.req.query('lng'),
      radius: c.req.query('radius'),
      lang: c.req.query('lang'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/places/autocomplete', async (c) => {
    const data = await container.providerUseCase.autocompletePlaces(requestContext(c), {
      query: c.req.query('query'),
      lang: c.req.query('lang'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/places/details', async (c) => {
    const data = await container.providerUseCase.placeDetails(requestContext(c), {
      placeId: c.req.query('placeId'),
      lang: c.req.query('lang'),
      expanded: parseBooleanQuery(c.req.query('expanded')),
    })
    return c.json(ok(data))
  })

  app.get('/providers/places/reverse-geocode', async (c) => {
    const data = await container.providerUseCase.reverseGeocode(requestContext(c), {
      lat: c.req.query('lat'),
      lng: c.req.query('lng'),
      lang: c.req.query('lang'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/places/pois', async (c) => {
    const data = await container.providerUseCase.searchPois(requestContext(c), {
      category: c.req.query('category'),
      south: c.req.query('south'),
      west: c.req.query('west'),
      north: c.req.query('north'),
      east: c.req.query('east'),
      limit: c.req.query('limit'),
    })
    return c.json(ok(data))
  })

  app.post('/providers/places/resolve-url', async (c) => {
    const input = await parseJsonBody(c, resolveProviderUrlSchema)
    const data = await container.providerUseCase.resolveMapsUrl(requestContext(c), {
      url: input.url,
    })
    return c.json(ok(data))
  })

  app.get('/providers/places/photo', async (c) => {
    const data = await container.providerUseCase.placePhoto(requestContext(c), {
      placeId: c.req.query('placeId'),
      lat: c.req.query('lat'),
      lng: c.req.query('lng'),
      name: c.req.query('name'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/places/photo/:cacheKey/bytes', async (c) => {
    const result = await container.providerUseCase.placePhotoBytes(c.req.param('cacheKey'))
    if (!result) throw badRequest('Photo is not cached')
    return c.body(result.bytes, 200, {
      'content-type': result.contentType,
      'cache-control': 'public, max-age=604800',
    })
  })

  app.get('/providers/weather', async (c) => {
    const data = await container.providerUseCase.weather(requestContext(c), {
      lat: c.req.query('lat'),
      lng: c.req.query('lng'),
      date: c.req.query('date'),
      lang: c.req.query('lang'),
      detailed: parseBooleanQuery(c.req.query('detailed')),
    })
    return c.json(ok(data))
  })

  app.get('/providers/exchange-rate', async (c) => {
    const data = await container.providerUseCase.exchangeRate(requestContext(c), {
      from: c.req.query('from'),
      to: c.req.query('to'),
      date: c.req.query('date'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/exchange-rates', async (c) => {
    const data = await container.providerUseCase.exchangeRates(requestContext(c), {
      base: c.req.query('base'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/transit/geocode', async (c) => {
    const data = await container.providerUseCase.transitGeocode(requestContext(c), {
      query: c.req.query('query') ?? c.req.query('q'),
      lang: c.req.query('lang'),
      near: c.req.query('near'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/transit/plan', async (c) => {
    const data = await container.providerUseCase.transitPlan(requestContext(c), {
      from: c.req.query('from'),
      to: c.req.query('to'),
      time: c.req.query('time'),
      arriveBy: parseBooleanQuery(c.req.query('arriveBy')),
      modes: c.req.query('modes'),
      maxTransfers: c.req.query('maxTransfers'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/routes/plan', async (c) => {
    const data = await container.providerUseCase.routePlan(requestContext(c), {
      mode: c.req.query('mode'),
      coordinates: c.req.query('coordinates'),
    })
    return c.json(ok(data))
  })

  app.get('/providers/unsplash/search', async (c) => {
    const data = await container.providerUseCase.searchUnsplash(requestContext(c), {
      query: c.req.query('query'),
      perPage: c.req.query('perPage'),
    })
    return c.json(ok(data))
  })

  app.get('/integrations/airtrail/flights', async (c) => {
    const data = await container.providerUseCase.airtrailFlights(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/integrations/airtrail/status', async (c) => {
    const data = await container.providerUseCase.airtrailStatus(requestContext(c))
    return c.json(ok(data))
  })

  app.post('/integrations/airtrail/test', async (c) => {
    const data = await container.providerUseCase.airtrailStatus(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/integrations/immich/photos', async (c) => {
    const data = await container.providerUseCase.immichSearch(requestContext(c), {
      from: c.req.query('from'),
      to: c.req.query('to'),
      page: c.req.query('page'),
      size: c.req.query('size'),
    })
    return c.json(ok(data))
  })

  app.get('/integrations/immich/status', async (c) => {
    const data = await container.providerUseCase.immichStatus(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/integrations/immich/albums', async (c) => {
    const data = await container.providerUseCase.immichAlbums(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/integrations/immich/assets/:assetId/info', async (c) => {
    const data = await container.providerUseCase.immichAssetInfo(
      requestContext(c),
      c.req.param('assetId'),
    )
    return c.json(ok(data))
  })

  app.get('/integrations/immich/assets/:assetId/:kind', async (c) => {
    const kind = c.req.param('kind') === 'original' ? 'original' : 'thumbnail'
    const result = await container.providerUseCase.immichAssetBytes(requestContext(c), {
      assetId: c.req.param('assetId'),
      kind,
    })
    if (!result) throw badRequest('Immich asset is unavailable')
    return c.body(result.bytes, 200, {
      'content-type': result.contentType ?? 'application/octet-stream',
      'cache-control': kind === 'thumbnail' ? 'public, max-age=86400' : 'private, max-age=300',
    })
  })

  app.get('/integrations/synology/status', async (c) => {
    const data = await container.providerUseCase.synologyStatus(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/integrations/synology/photos', async (c) => {
    const data = await container.providerUseCase.synologySearch(requestContext(c), {
      from: c.req.query('from'),
      to: c.req.query('to'),
      offset: c.req.query('offset'),
      limit: c.req.query('limit'),
    })
    return c.json(ok(data))
  })

  app.get('/integrations/synology/albums', async (c) => {
    const data = await container.providerUseCase.synologyAlbums(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/integrations/synology/assets/:assetId/:kind', async (c) => {
    const kind = c.req.param('kind') === 'original' ? 'original' : 'thumbnail'
    const result = await container.providerUseCase.synologyAssetBytes(requestContext(c), {
      assetId: c.req.param('assetId'),
      kind,
    })
    if (!result) throw badRequest('Synology asset is unavailable')
    return c.body(result.bytes, 200, {
      'content-type': result.contentType ?? 'application/octet-stream',
      'cache-control': kind === 'thumbnail' ? 'public, max-age=86400' : 'private, max-age=300',
    })
  })

  app.get('/provider-health', async (c) => {
    const data = await container.providerUseCase.providerHealth(requestContext(c))
    return c.json(ok(data))
  })

  app.get('/provider-settings', async (c) => {
    const data = await container.settingsUseCase.listProviderSettings(requestContext(c))
    return c.json(ok(data))
  })

  app.put('/provider-settings', async (c) => {
    const input = await parseJsonBody(c, upsertProviderSettingsSchema)
    const data = await container.settingsUseCase.upsertProviderSettings(requestContext(c), input)
    return c.json(ok(data))
  })

  return app
}
