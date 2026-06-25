import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  deliverShadowServerAppLaunchOutbox,
  hasShadowServerAppPendingOutbox,
  resolveShadowServerAppLaunchCommandContextResolution,
  SHADOW_SERVER_APP_PUBLIC_AVATAR_CACHE_CONTROL,
  type ShadowServerAppActorRef,
  type ShadowServerAppCommandName,
  shadowServerAppApiBaseUrl,
  shadowServerAppAvatarRedirectUrl,
  shadowServerAppIdentitySnapshot,
} from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import { id, SpaceDao } from './dao/space.dao.js'
import { createDatabase } from './db/client.js'
import { migrate } from './db/migrate.js'
import { manifest, shadowApp } from './manifest.js'
import { completeSpaceOAuth, oauthSessionPayload, startSpaceOAuth } from './oauth.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import {
  contentTypeForPath,
  readStoredObject,
  storeCoverImage,
  storeWebPackage,
} from './storage.js'
import type { SpaceCommentContext, SpaceUploadFile, SpaceVisibility } from './types.js'
import { shellPage } from './ui.js'

type SpaceCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4217)
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.SPACE_DATABASE_URL ??
  'postgres://space:space@localhost:5435/space'
const database = createDatabase(databaseUrl)
await migrate(database.db)
const dao = new SpaceDao(database.db)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)
const iconCacheControl = 'public, max-age=3600'

function shadowApiBaseUrl() {
  return shadowServerAppApiBaseUrl(process.env)
}

function redirectShadowAvatar(c: Context) {
  const response = c.redirect(shadowServerAppAvatarRedirectUrl(c.req.url, process.env), 302)
  response.headers.set('Cache-Control', SHADOW_SERVER_APP_PUBLIC_AVATAR_CACHE_CONTROL)
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}

function shadowLaunchToken(c: Context) {
  return c.req.header('X-Shadow-Launch-Token') ?? ''
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const launchToken = shadowLaunchToken(c)
  if (!launchToken || !hasShadowServerAppPendingOutbox(result.body)) return result.body
  return deliverShadowServerAppLaunchOutbox({
    launchToken,
    commandName,
    result: result.body,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
}

function commandName(value: string): SpaceCommandName | null {
  return commandNames.has(value) ? (value as SpaceCommandName) : null
}

function runtimeError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

async function runtimeContext(command: SpaceCommandName, c: Context) {
  const launchToken = shadowLaunchToken(c)
  if (!launchToken) throw runtimeError(401, 'launch_required')
  const resolution = await resolveShadowServerAppLaunchCommandContextResolution({
    launchToken,
    commandName: command,
    manifest: shadowServerAppManifest,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
  const context = resolution.context
  if (!context) throw runtimeError(401, resolution.error ?? 'invalid_launch_token')
  return context
}

async function runtimeActor(
  command: SpaceCommandName,
  c: Context,
): Promise<ShadowServerAppActorRef> {
  return shadowServerAppIdentitySnapshot(await runtimeContext(command, c))
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="24" fill="#111318"/>
  <path d="M63 24H40c-10.5 0-17.5 5.8-17.5 14.5 0 7.6 5.6 12.2 16.5 14.9l14.7 3.6C64 59.5 69.5 63.9 69.5 71.5 69.5 80 62.4 85 51.8 85H30" fill="none" stroke="#f7f7f5" stroke-width="6.5" stroke-linecap="square" stroke-linejoin="round"/>
  <path d="M74 19v20M22 57v20" fill="none" stroke="#2f5cff" stroke-width="5" stroke-linecap="square"/>
</svg>`
}

function textField(value: unknown) {
  if (Array.isArray(value)) return textField(value[0])
  return typeof value === 'string' ? value : undefined
}

function parseTags(value: unknown) {
  const raw = textField(value)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    return raw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  return undefined
}

function parseJsonField(value: unknown) {
  const text = textField(value)
  if (!text?.trim()) return {}
  return JSON.parse(text)
}

function commentContext(value: unknown): SpaceCommentContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return (value as { kind?: string }).kind === 'selection'
    ? (value as SpaceCommentContext)
    : undefined
}

async function uploadedFileInput(file: File, field = 'file'): Promise<SpaceUploadFile> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return {
    field,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: buffer.byteLength,
    dataBase64: buffer.toString('base64'),
  }
}

async function parseMultipartCommandInput(c: Context) {
  const body = await c.req.parseBody({ all: true })
  let input = parseJsonField(body.input ?? body.payload) as Record<string, unknown>
  const uploads = []
  for (const [key, raw] of Object.entries(body)) {
    const values = Array.isArray(raw) ? raw : [raw]
    for (const value of values) {
      if (value instanceof File) uploads.push(await uploadedFileInput(value, key))
    }
  }
  if (uploads.length === 1 && !input.upload) input = { ...input, upload: uploads[0] }
  if (uploads.length > 1 && !input.uploads) input = { ...input, uploads }
  return input
}

async function uploadArtwork(input: {
  artworkId?: string
  title: string
  description?: string
  tags?: string[]
  visibility?: SpaceVisibility
  versionTitle?: string
  notes?: string
  upload: SpaceUploadFile
  owner: ShadowServerAppActorRef
}) {
  const artworkId = input.artworkId?.trim() || id('art')
  const versionId = id('ver')
  const stored = await storeWebPackage({ artworkId, versionId, upload: input.upload })
  return dao.saveUploadedVersion({
    artworkId,
    versionId,
    title: input.title,
    description: input.description,
    tags: input.tags,
    visibility: input.visibility,
    versionTitle: input.versionTitle,
    notes: input.notes,
    sourceKind: stored.sourceKind,
    entryPath: stored.entryPath,
    cdnProvider: stored.cdnProvider,
    cdnBaseUrl: stored.cdnBaseUrl,
    files: stored.files,
    owner: input.owner,
  })
}

async function uploadCover(input: {
  targetType: 'profile' | 'artwork'
  artworkId?: string
  upload: SpaceUploadFile
}) {
  const targetId = input.targetType === 'profile' ? 'profile' : input.artworkId
  if (!targetId) throw shadowApp.error(400, 'artwork_id_required')
  const file = await storeCoverImage({
    targetType: input.targetType,
    targetId,
    upload: input.upload,
  })
  if (input.targetType === 'profile') return { profile: await dao.setProfileCover(file) }
  const artwork = await dao.setArtworkCover({ artworkId: targetId, file })
  if (!artwork) throw shadowApp.error(404, 'artwork_not_found')
  return { artwork }
}

const commands = shadowApp.defineCommands({
  'profile.get': async () => ({ profile: await dao.getProfile() }),
  'profile.update': async (input) => ({ profile: await dao.updateProfile(input) }),
  'artworks.list': async (input) => ({
    artworks: await dao.listArtworks({
      ...input,
      visibility: (input.visibility ?? 'all') as SpaceVisibility | 'all',
    }),
  }),
  'artworks.get': async (input) => {
    const artwork = await dao.getArtwork(input.artworkId)
    if (!artwork) throw shadowApp.error(404, 'artwork_not_found')
    return { artwork }
  },
  'artworks.update': async (input) => {
    const artwork = await dao.updateArtwork({
      artworkId: input.artworkId,
      patch: {
        title: input.title,
        description: input.description,
        tags: input.tags,
        visibility: input.visibility as SpaceVisibility | undefined,
      },
    })
    if (!artwork) throw shadowApp.error(404, 'artwork_not_found')
    return { artwork }
  },
  'artworks.upload': async (input, { actor }) => {
    if (!input.upload) throw shadowApp.error(400, 'upload_required')
    const artwork = await uploadArtwork({
      artworkId: input.artworkId,
      title: input.title,
      description: input.description,
      tags: input.tags,
      visibility: input.visibility as SpaceVisibility | undefined,
      versionTitle: input.versionTitle,
      notes: input.notes,
      upload: input.upload,
      owner: actor,
    })
    return { artwork }
  },
  'covers.upload': async (input) => {
    if (!input.upload) throw shadowApp.error(400, 'upload_required')
    return uploadCover({
      targetType: input.targetType as 'profile' | 'artwork',
      artworkId: input.artworkId,
      upload: input.upload,
    })
  },
  'artworks.comment': async (input, { actor }) => {
    const comment = await dao.addComment({
      artworkId: input.artworkId,
      body: input.body,
      context: commentContext(input.context),
      author: actor,
    })
    if (!comment) throw shadowApp.error(404, 'artwork_not_found')
    return { comment }
  },
  'artworks.like': async (input, { actor }) => {
    const result = await dao.toggleLike({ artworkId: input.artworkId, actor })
    if (!result) throw shadowApp.error(404, 'artwork_not_found')
    return result
  },
  'artworks.favorite': async (input, { actor }) => {
    const result = await dao.toggleFavorite({ artworkId: input.artworkId, actor })
    if (!result) throw shadowApp.error(404, 'artwork_not_found')
    return result
  },
  'artworks.remix': async (input, { actor }) => {
    const artwork = await dao.remixArtwork({ artworkId: input.artworkId, actor })
    if (!artwork) throw shadowApp.error(404, 'artwork_not_found')
    return { artwork }
  },
  'versions.rollback': async (input, { actor }) => {
    const artwork = await dao.rollbackVersion({
      artworkId: input.artworkId,
      versionId: input.versionId,
      actor,
    })
    if (!artwork) throw shadowApp.error(404, 'version_not_found')
    return { artwork }
  },
  'favorites.list': async () => ({ favorites: await dao.listFavorites() }),
  'tags.list': async () => ({ tags: await dao.listTags() }),
})

function errorResponse(c: Context, error: unknown) {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : 500
  const message = error instanceof Error ? error.message : 'internal_error'
  return c.json({ ok: false, error: message }, (Number.isInteger(status) ? status : 500) as 500)
}

async function servePreview(c: Context) {
  const artworkId = c.req.param('artworkId')
  const versionId = c.req.param('versionId')
  if (!artworkId || !versionId) return c.text('Not found', 404)
  const prefix = `/preview/${artworkId}/${versionId}/`
  const path = c.req.path.startsWith(prefix)
    ? decodeURIComponent(c.req.path.slice(prefix.length))
    : undefined
  const resolved = await dao.resolveVersionFile({ artworkId, versionId, path })
  if (!resolved) return c.text('Not found', 404)
  await dao.recordView(artworkId)
  const body = await readStoredObject(resolved.version.cdnProvider, resolved.file.key)
  const headers: Record<string, string> = {
    'Content-Type': resolved.file.contentType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': resolved.file.contentType.startsWith('text/html')
      ? 'no-store'
      : 'public, max-age=31536000, immutable',
  }
  if (resolved.file.contentType.startsWith('text/html')) {
    headers['Content-Security-Policy'] = [
      'sandbox allow-same-origin allow-scripts allow-forms allow-popups allow-modals',
      "default-src 'self' data: blob: https: http:",
      "img-src 'self' data: blob: https: http:",
      "media-src 'self' data: blob: https: http:",
      "style-src 'self' 'unsafe-inline' data: https: http:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https: http:",
    ].join('; ')
  }
  return c.body(body, 200, headers)
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) =>
  c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': iconCacheControl }),
)
app.get('/assets/cover.png', serveStatic({ root: './public' }))
app.get('/assets/*', serveStatic({ root: './dist/client' }))
app.get('/api/media/avatar/:bucket/:key{.+}', redirectShadowAvatar)
app.get('/api/oauth/session', (c) => c.json(oauthSessionPayload(c)))
app.get('/shadow/oauth/start', startSpaceOAuth)
app.get('/shadow/oauth/callback', completeSpaceOAuth)
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

app.get('/preview/:artworkId/:versionId', (c) => {
  const artworkId = c.req.param('artworkId')
  const versionId = c.req.param('versionId')
  if (!artworkId || !versionId) return c.text('Not found', 404)
  return c.redirect(`/preview/${encodeURIComponent(artworkId)}/${encodeURIComponent(versionId)}/`)
})
app.get('/preview/:artworkId/:versionId/*', servePreview)

app.get('/cdn/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/cdn\/?/, ''))
  if (!key || key.includes('..')) return c.text('Not found', 404)
  try {
    const body = await readStoredObject('local', key)
    return c.body(body, 200, {
      'Content-Type': contentTypeForPath(key),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
  } catch {
    return c.text('Not found', 404)
  }
})

app.post('/api/uploads', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true })
    const rawFile = Array.isArray(body.file) ? body.file[0] : body.file
    if (!(rawFile instanceof File)) return c.json({ ok: false, error: 'file_required' }, 400)
    const artwork = await uploadArtwork({
      artworkId: textField(body.artworkId),
      title: textField(body.title) || rawFile.name.replace(/\.(html?|zip)$/i, ''),
      description: textField(body.description),
      tags: parseTags(body.tags),
      visibility: (textField(body.visibility) as SpaceVisibility | undefined) ?? 'public',
      versionTitle: textField(body.versionTitle),
      notes: textField(body.notes),
      upload: await uploadedFileInput(rawFile),
      owner: await runtimeActor('artworks.upload', c),
    })
    return c.json({ ok: true, artwork })
  } catch (error) {
    return errorResponse(c, error)
  }
})

app.post('/api/covers', async (c) => {
  try {
    await runtimeContext('covers.upload', c)
    const body = await c.req.parseBody({ all: true })
    const rawFile = Array.isArray(body.file) ? body.file[0] : body.file
    if (!(rawFile instanceof File)) return c.json({ ok: false, error: 'file_required' }, 400)
    const targetType = textField(body.targetType) === 'profile' ? 'profile' : 'artwork'
    const result = await uploadCover({
      targetType,
      artworkId: textField(body.artworkId),
      upload: await uploadedFileInput(rawFile),
    })
    return c.json({ ok: true, ...result })
  } catch (error) {
    return errorResponse(c, error)
  }
})

app.post('/api/commands/:commandName', async (c) => {
  try {
    const name = commandName(c.req.param('commandName'))
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
    const context = await runtimeContext(name, c)
    const result = await shadowApp.executeLocal(name, body.input ?? {}, context, commands)
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (error) {
    return errorResponse(c, error)
  }
})

app.post('/.shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const contentType = c.req.header('content-type') ?? ''
  const requestInput = contentType.includes('multipart/form-data')
    ? await parseMultipartCommandInput(c)
    : undefined
  const result = await shadowApp.executeCommand(
    name,
    {
      authorizationHeader: c.req.header('authorization'),
      serverIdHeader: c.req.header('X-Shadow-Server-Id'),
      appKeyHeader: c.req.header('X-Shadow-App-Key'),
      requestBody: requestInput === undefined ? await c.req.text() : undefined,
      requestInput,
    },
    commands,
  )
  return c.json(result.body, result.status as 200)
})

serve({ fetch: app.fetch, port })

console.log(`Space listening on http://localhost:${port}`)
