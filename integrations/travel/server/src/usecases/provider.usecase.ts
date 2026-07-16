import type { TravelProviderGateway } from '../gateways/travel-provider.gateway.js'
import { badRequest } from '../lib/errors.js'
import type { SettingsService } from '../services/settings.service.js'
import type { RequestContext, TravelCoordinates } from '../types.js'

function numberParam(value: string | undefined, label: string) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw badRequest(`${label} is required`)
  return number
}

function optionalNumberParam(value: string | undefined) {
  if (value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function coordinatesFromCsv(value: string | undefined) {
  if (!value) throw badRequest('coordinates are required')
  const points = value.split('|').map((chunk) => {
    const [latText, lngText] = chunk.split(',')
    const lat = Number(latText)
    const lng = Number(lngText)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw badRequest('coordinates are invalid')
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw badRequest('coordinates are invalid')
    return { lat, lng }
  })
  if (points.length < 2 || points.length > 50)
    throw badRequest('coordinates must contain 2-50 points')
  return points
}

function requireText(value: string | undefined, label: string) {
  const text = value?.trim()
  if (!text) throw badRequest(`${label} is required`)
  return text
}

function routeMode(value: string | undefined) {
  if (value === 'walking' || value === 'cycling' || value === 'driving') return value
  return 'driving'
}

interface ProviderHealthItem {
  source: string
  connected: boolean
  configured?: boolean
  latencyMs?: number
  warning?: string
  error?: string
  errorCode?: string | number
  missingSettings?: string[]
  message?: string
  details?: Record<string, unknown>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function missingConfigStatus(source: string, missingSettings: string[]) {
  return {
    source,
    connected: false,
    configured: false,
    errorCode: 'missing_config',
    missingSettings,
    message: `Provider settings ${missingSettings.join(', ')} are not configured`,
  }
}

export class ProviderUseCase {
  constructor(
    private readonly providerGateway: TravelProviderGateway,
    private readonly settingsService: SettingsService,
  ) {}

  async searchPlaces(
    ctx: RequestContext,
    input: { query?: string; lat?: string; lng?: string; radius?: string; lang?: string },
  ) {
    const query = requireText(input.query, 'query')
    const lat = optionalNumberParam(input.lat)
    const lng = optionalNumberParam(input.lng)
    const googleMapsApiKey = await this.settingsService.getProviderValue(ctx, 'google.maps_api_key')
    return this.providerGateway.searchPlaces({
      query,
      lang: input.lang,
      googleMapsApiKey,
      locationBias:
        lat !== undefined && lng !== undefined
          ? { lat, lng, radius: optionalNumberParam(input.radius) }
          : undefined,
    })
  }

  async autocompletePlaces(ctx: RequestContext, input: { query?: string; lang?: string }) {
    const query = requireText(input.query, 'query')
    const googleMapsApiKey = await this.settingsService.getProviderValue(ctx, 'google.maps_api_key')
    return this.providerGateway.autocompletePlaces({ query, lang: input.lang, googleMapsApiKey })
  }

  async placeDetails(
    ctx: RequestContext,
    input: { placeId?: string; lang?: string; expanded?: boolean },
  ) {
    const placeId = requireText(input.placeId, 'placeId')
    const googleMapsApiKey = await this.settingsService.getProviderValue(ctx, 'google.maps_api_key')
    return this.providerGateway.placeDetails({
      placeId,
      lang: input.lang,
      expanded: input.expanded,
      googleMapsApiKey,
    })
  }

  async reverseGeocode(ctx: RequestContext, input: { lat?: string; lng?: string; lang?: string }) {
    return this.providerGateway.reverseGeocode({
      coordinates: {
        lat: numberParam(input.lat, 'lat'),
        lng: numberParam(input.lng, 'lng'),
      },
      lang: input.lang,
    })
  }

  async searchPois(
    ctx: RequestContext,
    input: {
      category?: string
      south?: string
      west?: string
      north?: string
      east?: string
      limit?: string
    },
  ) {
    const category = requireText(input.category, 'category')
    const overpassUrl = await this.settingsService.getProviderValue(ctx, 'overpass.url')
    return this.providerGateway.searchPois({
      category,
      bbox: {
        south: numberParam(input.south, 'south'),
        west: numberParam(input.west, 'west'),
        north: numberParam(input.north, 'north'),
        east: numberParam(input.east, 'east'),
      },
      limit: optionalNumberParam(input.limit),
      overpassUrl,
    })
  }

  async resolveMapsUrl(_ctx: RequestContext, input: { url?: string }) {
    return this.providerGateway.resolveMapsUrl(requireText(input.url, 'url'))
  }

  async placePhoto(
    ctx: RequestContext,
    input: { placeId?: string; lat?: string; lng?: string; name?: string },
  ) {
    const googleMapsApiKey = await this.settingsService.getProviderValue(ctx, 'google.maps_api_key')
    return this.providerGateway.placePhoto({
      placeId: requireText(input.placeId, 'placeId'),
      coordinates: {
        lat: numberParam(input.lat, 'lat'),
        lng: numberParam(input.lng, 'lng'),
      },
      name: input.name,
      googleMapsApiKey,
    })
  }

  placePhotoBytes(cacheKey: string) {
    return this.providerGateway.placePhotoBytes(cacheKey)
  }

  weather(
    _ctx: RequestContext,
    input: { lat?: string; lng?: string; date?: string; lang?: string; detailed?: boolean },
  ) {
    return this.providerGateway.weather({
      coordinates: {
        lat: numberParam(input.lat, 'lat'),
        lng: numberParam(input.lng, 'lng'),
      },
      date: input.date,
      lang: input.lang,
      detailed: input.detailed,
    })
  }

  exchangeRate(_ctx: RequestContext, input: { from?: string; to?: string; date?: string }) {
    if (!input.from || !input.to) throw badRequest('from and to are required')
    return this.providerGateway.exchangeRate({
      from: input.from,
      to: input.to,
      date: input.date,
    })
  }

  exchangeRates(_ctx: RequestContext, input: { base?: string }) {
    return this.providerGateway.exchangeRates({ base: input.base ?? 'EUR' })
  }

  async transitGeocode(
    ctx: RequestContext,
    input: { query?: string; lang?: string; near?: string },
  ) {
    const transitApiUrl = await this.settingsService.getProviderValue(ctx, 'transit.api_url')
    return this.providerGateway.transitGeocode({
      query: requireText(input.query, 'query'),
      lang: input.lang,
      near: input.near,
      transitApiUrl,
    })
  }

  async transitPlan(
    ctx: RequestContext,
    input: {
      from?: string
      to?: string
      time?: string
      arriveBy?: boolean
      modes?: string
      maxTransfers?: string
    },
  ) {
    const from = requireText(input.from, 'from')
    const to = requireText(input.to, 'to')
    if (!/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(from)) throw badRequest('from is invalid')
    if (!/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(to)) throw badRequest('to is invalid')
    const transitApiUrl = await this.settingsService.getProviderValue(ctx, 'transit.api_url')
    return this.providerGateway.transitPlan({
      from,
      to,
      time: input.time,
      arriveBy: input.arriveBy,
      modes: input.modes,
      maxTransfers: optionalNumberParam(input.maxTransfers),
      transitApiUrl,
    })
  }

  routePlan(_ctx: RequestContext, input: { mode?: string; coordinates?: string }) {
    return this.providerGateway.routePlan({
      mode: routeMode(input.mode),
      coordinates: coordinatesFromCsv(input.coordinates) as TravelCoordinates[],
    })
  }

  async searchUnsplash(ctx: RequestContext, input: { query?: string; perPage?: string }) {
    const accessKey = await this.settingsService.getProviderValue(ctx, 'unsplash.access_key')
    return this.providerGateway.searchUnsplash({
      query: requireText(input.query, 'query'),
      perPage: optionalNumberParam(input.perPage),
      accessKey,
    })
  }

  async airtrailFlights(ctx: RequestContext) {
    const baseUrl = await this.settingsService.getRequiredProviderValue(ctx, 'airtrail.url')
    const apiKey = await this.settingsService.getRequiredProviderValue(ctx, 'airtrail.api_key')
    const allowInsecureTls =
      (await this.settingsService.getProviderValue(ctx, 'airtrail.allow_insecure_tls')) === 'true'
    return this.providerGateway.airtrailFlights({ baseUrl, apiKey, allowInsecureTls })
  }

  async airtrailStatus(ctx: RequestContext) {
    const baseUrl = await this.settingsService.getProviderValue(ctx, 'airtrail.url')
    const apiKey = await this.settingsService.getProviderValue(ctx, 'airtrail.api_key')
    const missingSettings = [
      !baseUrl ? 'airtrail.url' : null,
      !apiKey ? 'airtrail.api_key' : null,
    ].filter(Boolean) as string[]
    if (missingSettings.length) return missingConfigStatus('airtrail', missingSettings)
    if (!baseUrl || !apiKey) return missingConfigStatus('airtrail', missingSettings)
    const allowInsecureTls =
      (await this.settingsService.getProviderValue(ctx, 'airtrail.allow_insecure_tls')) === 'true'
    return {
      configured: true,
      ...(await this.providerGateway.airtrailStatus({ baseUrl, apiKey, allowInsecureTls })),
    }
  }

  async immichSearch(
    ctx: RequestContext,
    input: { from?: string; to?: string; page?: string; size?: string },
  ) {
    const baseUrl = await this.settingsService.getRequiredProviderValue(ctx, 'immich.url')
    const apiKey = await this.settingsService.getRequiredProviderValue(ctx, 'immich.api_key')
    return this.providerGateway.immichSearch({
      baseUrl,
      apiKey,
      from: input.from,
      to: input.to,
      page: optionalNumberParam(input.page),
      size: optionalNumberParam(input.size),
    })
  }

  async immichStatus(ctx: RequestContext) {
    const baseUrl = await this.settingsService.getProviderValue(ctx, 'immich.url')
    const apiKey = await this.settingsService.getProviderValue(ctx, 'immich.api_key')
    const missingSettings = [
      !baseUrl ? 'immich.url' : null,
      !apiKey ? 'immich.api_key' : null,
    ].filter(Boolean) as string[]
    if (missingSettings.length) return missingConfigStatus('immich', missingSettings)
    if (!baseUrl || !apiKey) return missingConfigStatus('immich', missingSettings)
    return { configured: true, ...(await this.providerGateway.immichStatus({ baseUrl, apiKey })) }
  }

  async immichAlbums(ctx: RequestContext) {
    const baseUrl = await this.settingsService.getRequiredProviderValue(ctx, 'immich.url')
    const apiKey = await this.settingsService.getRequiredProviderValue(ctx, 'immich.api_key')
    return this.providerGateway.immichAlbums({ baseUrl, apiKey })
  }

  async immichAssetInfo(ctx: RequestContext, assetId: string) {
    const baseUrl = await this.settingsService.getRequiredProviderValue(ctx, 'immich.url')
    const apiKey = await this.settingsService.getRequiredProviderValue(ctx, 'immich.api_key')
    return this.providerGateway.immichAssetInfo({ baseUrl, apiKey, assetId })
  }

  async immichAssetBytes(
    ctx: RequestContext,
    input: { assetId: string; kind: 'thumbnail' | 'original' },
  ) {
    const baseUrl = await this.settingsService.getRequiredProviderValue(ctx, 'immich.url')
    const apiKey = await this.settingsService.getRequiredProviderValue(ctx, 'immich.api_key')
    return this.providerGateway.immichAssetBytes({ baseUrl, apiKey, ...input })
  }

  async synologyStatus(ctx: RequestContext) {
    const baseUrl = await this.settingsService.getProviderValue(ctx, 'synology.url')
    const username = await this.settingsService.getProviderValue(ctx, 'synology.username')
    const password = await this.settingsService.getProviderValue(ctx, 'synology.password')
    const missingSettings = [
      !baseUrl ? 'synology.url' : null,
      !username ? 'synology.username' : null,
      !password ? 'synology.password' : null,
    ].filter(Boolean) as string[]
    if (missingSettings.length) return missingConfigStatus('synologyphotos', missingSettings)
    if (!baseUrl || !username || !password) {
      return missingConfigStatus('synologyphotos', missingSettings)
    }
    return {
      configured: true,
      ...(await this.providerGateway.synologyStatus({ baseUrl, username, password })),
    }
  }

  async synologySearch(
    ctx: RequestContext,
    input: { from?: string; to?: string; offset?: string; limit?: string },
  ) {
    const baseUrl = await this.settingsService.getRequiredProviderValue(ctx, 'synology.url')
    const username = await this.settingsService.getRequiredProviderValue(ctx, 'synology.username')
    const password = await this.settingsService.getRequiredProviderValue(ctx, 'synology.password')
    return this.providerGateway.synologySearch({
      baseUrl,
      username,
      password,
      from: input.from,
      to: input.to,
      offset: optionalNumberParam(input.offset),
      limit: optionalNumberParam(input.limit),
    })
  }

  async synologyAlbums(ctx: RequestContext) {
    const baseUrl = await this.settingsService.getRequiredProviderValue(ctx, 'synology.url')
    const username = await this.settingsService.getRequiredProviderValue(ctx, 'synology.username')
    const password = await this.settingsService.getRequiredProviderValue(ctx, 'synology.password')
    return this.providerGateway.synologyAlbums({ baseUrl, username, password })
  }

  async synologyAssetBytes(
    ctx: RequestContext,
    input: { assetId: string; kind: 'thumbnail' | 'original' },
  ) {
    const baseUrl = await this.settingsService.getRequiredProviderValue(ctx, 'synology.url')
    const username = await this.settingsService.getRequiredProviderValue(ctx, 'synology.username')
    const password = await this.settingsService.getRequiredProviderValue(ctx, 'synology.password')
    return this.providerGateway.synologyAssetBytes({ baseUrl, username, password, ...input })
  }

  async providerHealth(ctx: RequestContext) {
    const [
      googleMapsApiKey,
      unsplashAccessKey,
      llmProvider,
      llmModel,
      llmBaseUrl,
      llmApiKey,
      webhookUrl,
      ntfyServerUrl,
      ntfyTopic,
      ntfyToken,
    ] = await Promise.all([
      this.settingsService.getProviderValue(ctx, 'google.maps_api_key'),
      this.settingsService.getProviderValue(ctx, 'unsplash.access_key'),
      this.settingsService.getProviderValue(ctx, 'llm.provider'),
      this.settingsService.getProviderValue(ctx, 'llm.model'),
      this.settingsService.getProviderValue(ctx, 'llm.base_url'),
      this.settingsService.getProviderValue(ctx, 'llm.api_key'),
      this.settingsService.getProviderValue(ctx, 'webhook.url'),
      this.settingsService.getProviderValue(ctx, 'ntfy.server_url'),
      this.settingsService.getProviderValue(ctx, 'ntfy.topic'),
      this.settingsService.getProviderValue(ctx, 'ntfy.token'),
    ])

    const items = await Promise.all([
      this.healthCheck('exchange-rate', async () => {
        const data = await this.exchangeRates(ctx, { base: 'EUR' })
        return {
          connected: Boolean(data && Object.keys(data.rates ?? {}).length > 0),
          details: { provider: data?.provider, base: data?.base },
        }
      }),
      this.healthCheck('weather', async () => {
        const data = await this.weather(ctx, { lat: '48.8566', lng: '2.3522' })
        return { connected: Boolean(data), details: { provider: data?.provider, type: data?.type } }
      }),
      this.healthCheck('places', async () => {
        const data = await this.providerGateway.searchPlaces({
          query: 'Paris',
          googleMapsApiKey,
        })
        return {
          connected: data.source !== 'disabled',
          configured: Boolean(googleMapsApiKey) || data.source !== 'disabled',
          warning:
            data.source === 'disabled'
              ? 'Public providers are disabled and no Google key is configured'
              : undefined,
          details: { source: data.source, count: data.places.length },
        }
      }),
      this.healthCheck('overpass', async () => {
        const data = await this.providerGateway.searchPois({
          category: 'restaurant',
          bbox: { south: 48.85, west: 2.34, north: 48.86, east: 2.36 },
          limit: 1,
          overpassUrl: await this.settingsService.getProviderValue(ctx, 'overpass.url'),
        })
        const source = typeof data.source === 'string' ? data.source : 'unknown'
        const pois = Array.isArray(data.pois) ? data.pois : []
        const dataError = 'error' in data && typeof data.error === 'string' ? data.error : undefined
        return {
          connected: source !== 'disabled' && !dataError,
          configured: source !== 'disabled',
          warning: source === 'disabled' ? 'Public providers are disabled' : undefined,
          details: { source, count: pois.length, error: dataError },
        }
      }),
      this.healthCheck('transitous', async () => {
        const data = await this.transitGeocode(ctx, { query: 'Paris', lang: 'en' })
        return {
          connected: data.source !== 'disabled' && data.results.length > 0,
          details: { source: data.source, count: data.results.length },
        }
      }),
      this.healthCheck('osrm', async () => {
        const data = await this.providerGateway.routePlan({
          mode: 'driving',
          coordinates: [
            { lat: 48.8566, lng: 2.3522 },
            { lat: 48.8584, lng: 2.2945 },
          ],
        })
        return {
          connected: Boolean(data),
          details: { source: data?.source, distanceMeters: data?.distanceMeters },
        }
      }),
      this.healthCheck('unsplash', async () => {
        const data = await this.providerGateway.searchUnsplash({
          query: 'Paris',
          perPage: 1,
          accessKey: unsplashAccessKey,
        })
        return {
          connected: data.connected && data.photos.length > 0,
          configured: data.configured,
          warning:
            data.warning ??
            (data.photos.length === 0
              ? 'Unsplash returned no photos for the health query'
              : undefined),
          errorCode: data.errorCode,
          details: { source: data.source, count: data.photos.length },
        }
      }),
      this.healthCheck('airtrail', () => this.airtrailStatus(ctx)),
      this.healthCheck('immich', () => this.immichStatus(ctx)),
      this.healthCheck('synologyphotos', () => this.synologyStatus(ctx)),
      this.configHealth('llm', Boolean(llmProvider && llmModel), {
        provider: llmProvider,
        model: llmModel,
        baseUrl: llmBaseUrl,
        hasApiKey: Boolean(llmApiKey),
      }),
      this.configHealth('webhook', Boolean(webhookUrl), {
        configured: Boolean(webhookUrl),
        warning: 'Health check does not send a webhook delivery',
      }),
      this.configHealth('ntfy', Boolean(ntfyTopic), {
        configured: Boolean(ntfyTopic),
        serverUrl: ntfyServerUrl ?? 'https://ntfy.sh',
        hasToken: Boolean(ntfyToken),
        warning: 'Health check does not publish a ntfy message',
      }),
    ])
    return { generatedAt: new Date().toISOString(), items }
  }

  private async healthCheck(
    source: string,
    check: () => Promise<Partial<ProviderHealthItem> | null>,
  ): Promise<ProviderHealthItem> {
    const started = Date.now()
    try {
      const result = await check()
      return {
        source,
        connected: Boolean(result?.connected),
        latencyMs: Date.now() - started,
        ...result,
      }
    } catch (error) {
      return {
        source,
        connected: false,
        latencyMs: Date.now() - started,
        error: errorMessage(error),
      }
    }
  }

  private configHealth(
    source: string,
    connected: boolean,
    details: Record<string, unknown> & { configured?: boolean; warning?: string },
  ): ProviderHealthItem {
    const { configured, warning, ...rest } = details
    return {
      source,
      connected,
      configured: configured ?? connected,
      warning,
      details: rest,
    }
  }
}
