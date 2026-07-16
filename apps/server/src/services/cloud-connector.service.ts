import { createHash, randomBytes } from 'node:crypto'
import {
  getPluginLibraryEntry,
  listPluginLibrary,
  normalizeConnectorPresentationLocale,
  type PluginLibraryEntry,
} from '@shadowob/cloud'
import type { CloudConnectorDao } from '../dao/cloud-connector.dao'
import type { CloudConnectorProfile } from '../db/schema'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { decrypt, encrypt } from '../lib/kms'

const HIDDEN_PLUGIN_IDS = new Set([
  'agent-pack',
  'claude-plugin',
  'model-provider',
  'shadowob',
  'skills',
])
const CONNECTOR_SECRET_PREFIX = '__SHADOW_CLOUD_CONNECTOR__'
const OAUTH_REFRESH_TOKEN_KEY = '__SHADOW_OAUTH_REFRESH_TOKEN'
const OAUTH_EXPIRES_AT_KEY = '__SHADOW_OAUTH_EXPIRES_AT'
const OAUTH_SCOPE_KEY = '__SHADOW_OAUTH_SCOPE'
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000

type PluginOAuth = NonNullable<PluginLibraryEntry['manifest']['auth']['oauth']> & {
  refreshTokenUrl?: string
  accessTokenField?: string
  refreshTokenField?: string
  authorizationParams?: Record<string, string>
  scopeSeparator?: string
  tokenEndpointAuthMethod?: 'client-secret-post' | 'client-secret-basic' | 'none'
  tokenRequestFormat?: 'form' | 'json'
  clientSecretOptional?: boolean
  tokenResponseFieldMap?: Record<string, string>
}

type ConnectorOptionField = {
  key: string
  type: 'string' | 'boolean' | 'number' | 'string-array'
  label: string
  description?: string
  defaultValue?: unknown
}

export type CloudConnectorCatalogItem = {
  id: string
  name: string
  description: string
  category: string
  icon: string
  iconDataUrl?: string
  iconSource?: PluginLibraryEntry['iconSource']
  website?: string
  docs?: string
  authType: string
  capabilities: string[]
  tags: string[]
  popularity: number
  authFields: Array<{
    key: string
    label: string
    description?: string
    required: boolean
    sensitive: boolean
    placeholder?: string
    helpUrl?: string
  }>
  optionFields: ConnectorOptionField[]
  oauth: {
    available: boolean
    configured: boolean
    scopes: string[]
  } | null
}

type VerificationResult = {
  verified: boolean
  profile: CloudConnectorProfile | null
}

function httpError(message: string, status = 422) {
  return Object.assign(new Error(message), { status })
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function connectorOptionFields(plugin: PluginLibraryEntry): ConnectorOptionField[] {
  const config = recordValue(plugin.manifest.config)
  const properties = recordValue(config?.properties)
  if (!properties) return []

  return Object.entries(properties).flatMap(([key, raw]) => {
    const property = recordValue(raw)
    const type = stringValue(property?.type)
    const itemType = stringValue(recordValue(property?.items)?.type)
    const fieldType =
      type === 'boolean' || type === 'number' || type === 'string'
        ? type
        : type === 'array' && itemType === 'string'
          ? 'string-array'
          : null
    if (!fieldType) return []
    return [
      {
        key,
        type: fieldType,
        label: key,
        ...(stringValue(property?.description)
          ? { description: stringValue(property?.description) ?? undefined }
          : {}),
        ...(property && 'default' in property ? { defaultValue: property.default } : {}),
      } satisfies ConnectorOptionField,
    ]
  })
}

function oauthEnvPrefix(pluginId: string) {
  return `CLOUD_CONNECTOR_OAUTH_${pluginId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

function pluginOAuth(plugin: PluginLibraryEntry): PluginOAuth | null {
  return (plugin.manifest.auth.oauth as PluginOAuth | undefined) ?? null
}

function oauthClientConfig(plugin: PluginLibraryEntry) {
  const oauth = pluginOAuth(plugin)
  if (!oauth?.accessTokenField) return null
  const prefix = oauthEnvPrefix(plugin.id)
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim()
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim()
  if (clientId && (clientSecret || oauth.clientSecretOptional)) {
    return { clientId, clientSecret: clientSecret ?? '', callbackPath: null }
  }

  // Reuse the platform GitHub OAuth app when a connector-specific app is not configured.
  // Both login and connector authorization then share the registered platform callback.
  if (plugin.id === 'github') {
    const platformClientId = process.env.GITHUB_CLIENT_ID?.trim()
    const platformClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim()
    if (platformClientId && platformClientSecret) {
      return {
        clientId: platformClientId,
        clientSecret: platformClientSecret,
        callbackPath: '/api/auth/oauth/github/callback',
      }
    }
  }

  return null
}

function toCatalogItem(plugin: PluginLibraryEntry, locale?: string): CloudConnectorCatalogItem {
  const oauth = pluginOAuth(plugin)
  const presentationLocale = normalizeConnectorPresentationLocale(locale)
  const presentation = plugin.localizations[presentationLocale] ?? {
    name: plugin.name,
    description: plugin.description,
  }
  return {
    id: plugin.id,
    name: presentation.name,
    description: presentation.description,
    category: plugin.category,
    icon: plugin.manifest.icon,
    iconDataUrl: plugin.iconDataUrl,
    iconSource: plugin.iconSource,
    website: plugin.website,
    docs: plugin.docs,
    authType: plugin.authType,
    capabilities: plugin.capabilities,
    tags: plugin.tags,
    popularity: plugin.popularity ?? 0,
    authFields: plugin.manifest.auth.fields.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description,
      required: field.required,
      sensitive: field.sensitive,
      placeholder: field.placeholder,
      helpUrl: field.helpUrl,
    })),
    optionFields: connectorOptionFields(plugin),
    oauth: oauth?.accessTokenField
      ? {
          available: true,
          configured: Boolean(oauthClientConfig(plugin)),
          scopes: oauth.scopes,
        }
      : null,
  }
}

function sanitizeCredentials(plugin: PluginLibraryEntry, input: Record<string, unknown>) {
  const credentials: Record<string, string> = {}
  for (const field of plugin.manifest.auth.fields) {
    const value = input[field.key]
    if (typeof value === 'string' && value.trim()) {
      if (value.length > 32_768) throw httpError(`${field.label} is too long`)
      credentials[field.key] = value.trim()
    } else if (field.required) {
      throw httpError(`${field.label} is required`)
    }
  }
  return credentials
}

function sanitizeOptions(plugin: PluginLibraryEntry, input: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const field of connectorOptionFields(plugin)) {
    const value = input[field.key]
    if (value === undefined) {
      if (field.defaultValue !== undefined) result[field.key] = field.defaultValue
      continue
    }
    if (field.type === 'string' && typeof value === 'string')
      result[field.key] = value.slice(0, 4096)
    if (field.type === 'boolean' && typeof value === 'boolean') result[field.key] = value
    if (field.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      result[field.key] = value
    }
    if (field.type === 'string-array' && Array.isArray(value)) {
      result[field.key] = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 100)
    }
  }
  return result
}

async function readJson(response: Response) {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null
}

export function connectorSecretRef(connectionId: string, field: string) {
  return `${CONNECTOR_SECRET_PREFIX}:${connectionId}:${field}`
}

export function parseConnectorSecretRef(value: string) {
  if (!value.startsWith(`${CONNECTOR_SECRET_PREFIX}:`)) return null
  const [, connectionId, field, ...extra] = value.slice(CONNECTOR_SECRET_PREFIX.length).split(':')
  if (
    !connectionId ||
    !field ||
    extra.length > 0 ||
    !/^[0-9a-f-]{36}$/i.test(connectionId) ||
    !/^[A-Z][A-Z0-9_]*$/.test(field)
  ) {
    return null
  }
  return { connectionId, field }
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function base64Url(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

function expiresAtFromTokenResponse(payload: Record<string, unknown>) {
  const expiresIn = Number(payload.expires_in)
  return Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null
}

async function parseTokenResponse(response: Response) {
  const text = await response.text()
  let payload: Record<string, unknown> | null = null
  try {
    payload = recordValue(JSON.parse(text))
  } catch {
    payload = Object.fromEntries(new URLSearchParams(text))
  }
  return payload ?? {}
}

export class CloudConnectorService {
  constructor(
    private deps: {
      cloudConnectorDao: CloudConnectorDao
      safeHttpClient: SafeHttpClient
    },
  ) {}

  listCatalog(locale?: string) {
    return listPluginLibrary()
      .filter((plugin) => !HIDDEN_PLUGIN_IDS.has(plugin.id))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.name.localeCompare(b.name))
      .map((plugin) => toCatalogItem(plugin, locale))
  }

  getOAuthCallbackPath(pluginId: string) {
    const plugin = this.requirePlugin(pluginId)
    return oauthClientConfig(plugin)?.callbackPath ?? '/api/cloud-computers/oauth/callback'
  }

  async hasOAuthAuthorizationState(state: string) {
    if (!state) return false
    return Boolean(await this.deps.cloudConnectorDao.findOAuthStateByHash(sha256(state)))
  }

  requirePlugin(pluginId: string) {
    const plugin = getPluginLibraryEntry(pluginId)
    if (!plugin || HIDDEN_PLUGIN_IDS.has(plugin.id)) throw httpError('Connector not found', 404)
    return plugin
  }

  sanitizeOptions(pluginId: string, input: Record<string, unknown>) {
    return sanitizeOptions(this.requirePlugin(pluginId), input)
  }

  async saveConnection(
    userId: string,
    pluginId: string,
    inputCredentials?: Record<string, unknown>,
  ) {
    const plugin = this.requirePlugin(pluginId)
    const existing = await this.deps.cloudConnectorDao.findConnection(userId, pluginId)
    let credentials: Record<string, string>
    if (inputCredentials) {
      credentials = sanitizeCredentials(plugin, inputCredentials)
    } else if (existing) {
      credentials = this.decryptConnectionCredentials(existing.credentialsEncrypted)
    } else {
      credentials = sanitizeCredentials(plugin, {})
    }

    const verification = await this.verifyProvider(plugin, credentials)
    const connection = await this.deps.cloudConnectorDao.upsertConnection({
      userId,
      pluginId,
      authType: !inputCredentials && existing ? existing.authType : plugin.authType,
      credentialsEncrypted: encrypt(JSON.stringify(credentials)),
      credentialFields: plugin.manifest.auth.fields
        .map((field) => field.key)
        .filter((field) => Boolean(credentials[field]))
        .sort(),
      profile: verification.profile,
      status: 'active',
      verified: verification.verified,
    })
    if (!connection) throw new Error('Failed to save connector credentials')
    return { connection, verification }
  }

  async startOAuthAuthorization(input: {
    userId: string
    pluginId: string
    cloudComputerId: string
    redirectUri: string
  }) {
    const plugin = this.requirePlugin(input.pluginId)
    const oauth = pluginOAuth(plugin)
    if (!oauth?.accessTokenField) throw httpError('OAuth is not supported for this connector', 422)
    const client = oauthClientConfig(plugin)
    if (!client) throw httpError('OAuth client is not configured for this connector', 503)

    const state = base64Url(32)
    const codeVerifier = oauth.pkce ? base64Url(48) : null
    const pending = await this.deps.cloudConnectorDao.createOAuthState({
      userId: input.userId,
      pluginId: plugin.id,
      cloudComputerId: input.cloudComputerId,
      stateHash: sha256(state),
      codeVerifierEncrypted: codeVerifier ? encrypt(codeVerifier) : null,
      redirectUri: input.redirectUri,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    })
    if (!pending) throw new Error('Failed to create OAuth authorization state')

    const authorizationUrl = new URL(oauth.authorizationUrl)
    for (const [key, value] of Object.entries(oauth.authorizationParams ?? {})) {
      authorizationUrl.searchParams.set(key, value)
    }
    authorizationUrl.searchParams.set('client_id', client.clientId)
    authorizationUrl.searchParams.set('redirect_uri', input.redirectUri)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('state', state)
    if (oauth.scopes.length > 0) {
      authorizationUrl.searchParams.set('scope', oauth.scopes.join(oauth.scopeSeparator ?? ' '))
    }
    if (codeVerifier) {
      authorizationUrl.searchParams.set('code_challenge', pkceChallenge(codeVerifier))
      authorizationUrl.searchParams.set('code_challenge_method', 'S256')
    }
    return {
      flowId: pending.id,
      authorizationUrl: authorizationUrl.toString(),
      expiresAt: pending.expiresAt.toISOString(),
    }
  }

  async getOAuthFlow(userId: string, flowId: string) {
    const flow = await this.deps.cloudConnectorDao.findOAuthStateForUser(flowId, userId)
    if (!flow) throw httpError('OAuth flow not found', 404)
    const status =
      flow.status === 'pending' && flow.expiresAt.getTime() <= Date.now() ? 'expired' : flow.status
    return {
      id: flow.id,
      pluginId: flow.pluginId,
      cloudComputerId: flow.cloudComputerId,
      status,
      error: flow.error,
      expiresAt: flow.expiresAt.toISOString(),
    }
  }

  async completeOAuthAuthorization(input: { state: string; code?: string; error?: string }) {
    const pending = await this.deps.cloudConnectorDao.claimOAuthState(sha256(input.state))
    if (!pending) throw httpError('OAuth state is missing or expired', 400)
    try {
      if (input.error) throw httpError(`OAuth authorization failed: ${input.error}`, 400)
      if (!input.code) throw httpError('OAuth authorization code is missing', 400)
      const plugin = this.requirePlugin(pending.pluginId)
      const oauth = pluginOAuth(plugin)
      if (!oauth?.accessTokenField) throw httpError('OAuth is not supported for this connector')
      const client = oauthClientConfig(plugin)
      if (!client) throw httpError('OAuth client is not configured for this connector', 503)
      const codeVerifier = pending.codeVerifierEncrypted
        ? decrypt(pending.codeVerifierEncrypted)
        : undefined
      const token = await this.requestOAuthToken(plugin, oauth, client, {
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: pending.redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      })
      const accessToken = stringValue(token.access_token)
      if (!accessToken) throw httpError('OAuth token response did not include an access token')

      const existing = await this.deps.cloudConnectorDao.findConnection(pending.userId, plugin.id)
      const credentials = existing
        ? this.decryptConnectionCredentials(existing.credentialsEncrypted)
        : {}
      credentials[oauth.accessTokenField] = accessToken
      const refreshToken = stringValue(token.refresh_token)
      if (refreshToken) credentials[OAUTH_REFRESH_TOKEN_KEY] = refreshToken
      const expiresAt = expiresAtFromTokenResponse(token)
      if (expiresAt) credentials[OAUTH_EXPIRES_AT_KEY] = expiresAt
      const scope = stringValue(token.scope)
      if (scope) credentials[OAUTH_SCOPE_KEY] = scope
      if (oauth.refreshTokenField && refreshToken) {
        credentials[oauth.refreshTokenField] = refreshToken
      }
      for (const [responseField, credentialField] of Object.entries(
        oauth.tokenResponseFieldMap ?? {},
      )) {
        const value = stringValue(token[responseField])
        if (value) credentials[credentialField] = value
      }

      const verification = await this.verifyProvider(plugin, credentials)
      const credentialFields = plugin.manifest.auth.fields
        .map((field) => field.key)
        .filter((field) => Boolean(credentials[field]))
      const connection = await this.deps.cloudConnectorDao.upsertConnection({
        userId: pending.userId,
        pluginId: plugin.id,
        authType: 'oauth2',
        credentialsEncrypted: encrypt(JSON.stringify(credentials)),
        credentialFields,
        profile: verification.profile,
        status: 'active',
        verified: verification.verified,
      })
      if (!connection) throw new Error('Failed to save OAuth connection')
      await this.deps.cloudConnectorDao.finishOAuthState(pending.id, { status: 'completed' })
      return {
        flowId: pending.id,
        pluginId: pending.pluginId,
        cloudComputerId: pending.cloudComputerId,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth authorization failed'
      await this.deps.cloudConnectorDao.finishOAuthState(pending.id, {
        status: 'error',
        error: message,
      })
      throw error
    }
  }

  async verifySavedConnection(userId: string, pluginId: string) {
    const plugin = this.requirePlugin(pluginId)
    const connection = await this.deps.cloudConnectorDao.findConnection(userId, pluginId)
    if (!connection) throw httpError('Connector account is not configured', 404)
    const credentials = this.decryptConnectionCredentials(connection.credentialsEncrypted)
    try {
      const verification = await this.verifyProvider(plugin, credentials)
      await this.deps.cloudConnectorDao.updateConnectionVerification(userId, pluginId, {
        profile: verification.profile,
        status: 'active',
        verified: verification.verified,
      })
      return verification
    } catch (error) {
      await this.deps.cloudConnectorDao.updateConnectionVerification(userId, pluginId, {
        profile: connection.profile,
        status: 'invalid',
        verified: false,
      })
      throw error
    }
  }

  decryptConnectionCredentials(encrypted: string): Record<string, string> {
    const parsed = JSON.parse(decrypt(encrypted)) as unknown
    const record = recordValue(parsed)
    if (!record) throw new Error('Invalid encrypted connector credentials')
    return Object.fromEntries(
      Object.entries(record).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  }

  async resolveRuntimeEnvVars(
    userId: string,
    envVars: Record<string, string>,
  ): Promise<Record<string, string>> {
    const next = { ...envVars }
    const cache = new Map<string, Record<string, string>>()
    for (const [key, value] of Object.entries(next)) {
      const reference = parseConnectorSecretRef(value)
      if (!reference) continue
      let credentials = cache.get(reference.connectionId)
      if (!credentials) {
        const connection = await this.deps.cloudConnectorDao.findConnectionByIdForUser(
          reference.connectionId,
          userId,
        )
        if (!connection || connection.status !== 'active') {
          throw new Error(`Connector credential is unavailable for ${key}`)
        }
        credentials = await this.resolveFreshConnectionCredentials(connection, userId)
        cache.set(reference.connectionId, credentials)
        await this.deps.cloudConnectorDao.touchConnection(connection.id)
      }
      const resolved = credentials[reference.field]
      if (!resolved) throw new Error(`Connector credential field is unavailable for ${key}`)
      next[key] = resolved
    }
    return next
  }

  private async resolveFreshConnectionCredentials(
    connection: {
      id: string
      pluginId: string
      authType: string
      credentialsEncrypted: string
    },
    userId: string,
  ) {
    const credentials = this.decryptConnectionCredentials(connection.credentialsEncrypted)
    if (connection.authType !== 'oauth2') return credentials
    const expiresAt = Date.parse(credentials[OAUTH_EXPIRES_AT_KEY] ?? '')
    if (!Number.isFinite(expiresAt) || expiresAt - Date.now() > 60_000) return credentials

    const refreshToken = credentials[OAUTH_REFRESH_TOKEN_KEY]
    if (!refreshToken) throw new Error(`OAuth connection for ${connection.pluginId} has expired`)
    const plugin = this.requirePlugin(connection.pluginId)
    const oauth = pluginOAuth(plugin)
    if (!oauth?.accessTokenField) throw new Error('OAuth connector metadata is unavailable')
    const client = oauthClientConfig(plugin)
    if (!client) throw new Error(`OAuth client is not configured for ${connection.pluginId}`)
    const token = await this.requestOAuthToken(plugin, oauth, client, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
    const accessToken = stringValue(token.access_token)
    if (!accessToken) throw new Error('OAuth refresh response did not include an access token')
    credentials[oauth.accessTokenField] = accessToken
    credentials[OAUTH_REFRESH_TOKEN_KEY] = stringValue(token.refresh_token) ?? refreshToken
    const nextExpiresAt = expiresAtFromTokenResponse(token)
    if (nextExpiresAt) credentials[OAUTH_EXPIRES_AT_KEY] = nextExpiresAt
    if (oauth.refreshTokenField)
      credentials[oauth.refreshTokenField] = credentials[OAUTH_REFRESH_TOKEN_KEY]
    for (const [responseField, credentialField] of Object.entries(
      oauth.tokenResponseFieldMap ?? {},
    )) {
      const value = stringValue(token[responseField])
      if (value) credentials[credentialField] = value
    }
    await this.deps.cloudConnectorDao.updateConnectionCredentials(
      connection.id,
      userId,
      encrypt(JSON.stringify(credentials)),
    )
    return credentials
  }

  private async requestOAuthToken(
    plugin: PluginLibraryEntry,
    oauth: PluginOAuth,
    client: { clientId: string; clientSecret: string },
    fields: Record<string, string>,
  ) {
    const tokenUrl =
      fields.grant_type === 'refresh_token'
        ? (oauth.refreshTokenUrl ?? oauth.tokenUrl)
        : oauth.tokenUrl
    const values: Record<string, string> = { ...fields }
    const authMethod = oauth.tokenEndpointAuthMethod ?? 'client-secret-post'
    if (authMethod === 'client-secret-post') {
      values.client_id = client.clientId
      if (client.clientSecret) values.client_secret = client.clientSecret
    } else if (authMethod === 'none') {
      values.client_id = client.clientId
    }
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (authMethod === 'client-secret-basic') {
      headers.Authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`
    }
    const body =
      oauth.tokenRequestFormat === 'json'
        ? JSON.stringify(values)
        : new URLSearchParams(values).toString()
    headers['Content-Type'] =
      oauth.tokenRequestFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded'
    const response = await this.deps.safeHttpClient.fetch(tokenUrl, {
      method: 'POST',
      headers,
      body,
    })
    const payload = await parseTokenResponse(response)
    if (!response.ok || payload.error) {
      throw httpError(
        `OAuth token request failed for ${plugin.name}: ${stringValue(payload.error_description) ?? stringValue(payload.error) ?? response.status}`,
        422,
      )
    }
    return payload
  }

  private async verifyProvider(
    plugin: PluginLibraryEntry,
    credentials: Record<string, string>,
  ): Promise<VerificationResult> {
    if (plugin.id === 'google-workspace' && credentials.GOOGLE_WORKSPACE_CLI_TOKEN) {
      const response = await this.deps.safeHttpClient.fetch(
        'https://openidconnect.googleapis.com/v1/userinfo',
        {
          headers: { Authorization: `Bearer ${credentials.GOOGLE_WORKSPACE_CLI_TOKEN}` },
        },
      )
      const body = await readJson(response)
      if (!response.ok) throw httpError('Google rejected this Workspace access token')
      return {
        verified: true,
        profile: {
          accountId: stringValue(body?.sub),
          accountName: stringValue(body?.name) ?? stringValue(body?.email),
          avatarUrl: stringValue(body?.picture),
        },
      }
    }

    if (plugin.id === 'github') {
      const response = await this.deps.safeHttpClient.fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${credentials.GITHUB_PERSONAL_ACCESS_TOKEN}`,
          'User-Agent': 'shadow-cloud-connector',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      const body = await readJson(response)
      if (!response.ok) throw httpError('GitHub rejected this personal access token')
      return {
        verified: true,
        profile: {
          accountId: body?.id !== undefined ? String(body.id) : null,
          accountName: stringValue(body?.login),
          avatarUrl: stringValue(body?.avatar_url),
          scopes: (response.headers.get('x-oauth-scopes') ?? '')
            .split(',')
            .map((scope) => scope.trim())
            .filter(Boolean),
        },
      }
    }

    if (plugin.id === 'notion') {
      const response = await this.deps.safeHttpClient.fetch('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${credentials.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
        },
      })
      const body = await readJson(response)
      if (!response.ok) throw httpError('Notion rejected this integration token')
      const bot = recordValue(body?.bot)
      const owner = recordValue(bot?.owner)
      const ownerUser = recordValue(owner?.user)
      return {
        verified: true,
        profile: {
          accountId: stringValue(body?.id),
          accountName: stringValue(body?.name) ?? stringValue(ownerUser?.name),
          avatarUrl: stringValue(body?.avatar_url) ?? stringValue(ownerUser?.avatar_url),
        },
      }
    }

    if (plugin.id === 'stripe') {
      const key = credentials.STRIPE_SECRET_KEY
      const response = await this.deps.safeHttpClient.fetch('https://api.stripe.com/v1/account', {
        headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
      })
      const body = await readJson(response)
      if (!response.ok) throw httpError('Stripe rejected this API key')
      return {
        verified: true,
        profile: {
          accountId: stringValue(body?.id),
          accountName: stringValue(body?.business_profile) ?? stringValue(body?.email),
        },
      }
    }

    if (plugin.id === 'google-workspace' && credentials.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON) {
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = recordValue(JSON.parse(credentials.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON))
      } catch {
        throw httpError('Google Workspace credentials must be valid JSON')
      }
      if (!parsed) throw httpError('Google Workspace credentials must be a JSON object')
      const installed = recordValue(parsed.installed) ?? recordValue(parsed.web) ?? parsed
      const accountName = stringValue(installed.client_email) ?? stringValue(installed.client_id)
      return { verified: false, profile: { accountName } }
    }

    return { verified: false, profile: null }
  }
}
