import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  deliverShadowSpaceAppLaunchOutbox,
  fetchShadowSpaceAppLaunchInboxes,
  hasShadowSpaceAppPendingOutbox,
  SHADOW_SPACE_APP_PUBLIC_AVATAR_CACHE_CONTROL,
  type ShadowSpaceAppActorRef,
  type ShadowSpaceAppCommandContext,
  type ShadowSpaceAppCommandName,
  shadowSpaceAppApiBaseUrl,
  shadowSpaceAppAvatarRedirectUrl,
  shadowSpaceAppIdentitySnapshot,
} from '@shadowob/sdk'
import { createShadowSpaceAppSessionManager } from '@shadowob/sdk/space-app/node'
import { type Context, Hono } from 'hono'
import {
  addQuestionToList,
  askQuestion,
  createAnswer,
  createComment,
  createList,
  deleteAnswer,
  deleteQuestion,
  getArticle,
  getImageAsset,
  getQuestion,
  listArticles,
  listLists,
  listQuestions,
  listReadingBatches,
  listTags,
  markReadingItemRead,
  normalizeQnaAvatarUrl,
  publishArticle,
  recordImageAsset,
  removeQuestionFromList,
} from './data.js'
import { manifest, shadowSpaceApp } from './manifest.js'
import { shadowSpaceAppManifest } from './space-app.generated.js'
import type { QnaImageAsset, QnaPerson, QnaUploadFile } from './types.js'
import { shellPage } from './ui.js'

type QnaCommandName = ShadowSpaceAppCommandName<typeof shadowSpaceAppManifest>

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

export const app = new Hono()
const port = Number(process.env.PORT ?? 4210)
const imageMaxBytes = 5 * 1024 * 1024
const supportedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const commandNames = new Set<string>(shadowSpaceAppManifest.commands.map((command) => command.name))
const publicRuntimeCommands = new Set<QnaCommandName>([
  'questions.list',
  'questions.get',
  'articles.list',
  'articles.get',
  'tags.list',
  'lists.list',
  'reading.batches',
])
const iconCacheControl = 'public, max-age=3600'

const imageId = () => `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`

function shadowApiBaseUrl() {
  return shadowSpaceAppApiBaseUrl(process.env)
}

const appSessions = createShadowSpaceAppSessionManager({
  appKey: shadowSpaceAppManifest.appKey,
  shadowApiBaseUrl: shadowApiBaseUrl(),
})

function redirectShadowAvatar(c: Context) {
  const response = c.redirect(shadowSpaceAppAvatarRedirectUrl(c.req.url, process.env), 302)
  response.headers.set('Cache-Control', SHADOW_SPACE_APP_PUBLIC_AVATAR_CACHE_CONTROL)
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}

async function shadowLaunchToken(c: Context, requireCsrf = true) {
  const session = await appSessions.authorizedSession({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
    requireCsrf,
  })
  return session?.launchToken ?? ''
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const launchToken = await shadowLaunchToken(c)
  if (!launchToken || !hasShadowSpaceAppPendingOutbox(result.body)) return result.body
  return deliverShadowSpaceAppLaunchOutbox({
    launchToken,
    commandName,
    result: result.body,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
}

function commandName(value: string): QnaCommandName | null {
  return commandNames.has(value) ? (value as QnaCommandName) : null
}

function uploadDirectory() {
  return resolve(process.env.QNA_UPLOAD_DIR ?? './data/qna-uploads')
}

function safeUploadFilename(filename: string) {
  const normalized = basename(filename || 'image').replace(/[^a-zA-Z0-9._-]+/g, '-')
  return normalized.replace(/^-+|-+$/g, '').slice(0, 160) || 'image'
}

function assetPath(asset: QnaImageAsset) {
  return join(uploadDirectory(), `${asset.id}-${asset.filename}`)
}

function qnaPerson(actor: ShadowSpaceAppActorRef): QnaPerson {
  const snapshot = shadowSpaceAppIdentitySnapshot(actor)
  return { ...snapshot, avatarUrl: normalizeQnaAvatarUrl(snapshot.avatarUrl) }
}

function commandDefinition(command: QnaCommandName) {
  return shadowSpaceAppManifest.commands.find((item) => item.name === command)
}

function publicRuntimeContext(command: QnaCommandName): ShadowSpaceAppCommandContext {
  const definition = commandDefinition(command)
  return {
    protocol: 'shadow.space-app/1',
    serverId: 'public',
    spaceAppId: 'answers-public',
    appKey: shadowSpaceAppManifest.appKey,
    command,
    actor: {
      kind: 'local',
      userId: null,
      ownerId: 'qna-public',
      profile: {
        id: 'qna-public',
        displayName: 'Public reader',
        avatarUrl: null,
      },
    },
    permission: definition?.permission ?? 'qna.questions:read',
    action: definition?.action ?? 'read',
    dataClass: definition?.dataClass ?? 'public',
  }
}

async function runtimeContext(command: QnaCommandName, c: Context) {
  const resolution = await appSessions.commandContext({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
    commandName: command,
    manifest: shadowSpaceAppManifest,
  })
  if (resolution.context) return resolution.context
  if (publicRuntimeCommands.has(command)) return publicRuntimeContext(command)
  throw Object.assign(new Error('launch_required'), { status: 401 })
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="24" fill="#0052ff"/>
  <path d="M26 28h44a10 10 0 0 1 10 10v18a10 10 0 0 1-10 10H51L36 78V66H26a10 10 0 0 1-10-10V38a10 10 0 0 1 10-10Z" fill="#fff"/>
  <path d="M33 43h30M33 53h20" stroke="#0052ff" stroke-width="6" stroke-linecap="round"/>
</svg>`
}

function textField(value: unknown) {
  if (Array.isArray(value)) return textField(value[0])
  return typeof value === 'string' ? value : undefined
}

function parseJsonField(value: unknown) {
  const text = textField(value)
  if (!text?.trim()) return {}
  return JSON.parse(text)
}

async function uploadedFileInput(file: File, field = 'file'): Promise<QnaUploadFile> {
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
  const uploads: QnaUploadFile[] = []
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

async function storeImageUpload(upload: QnaUploadFile, uploadedBy: QnaPerson) {
  if (!supportedImageTypes.has(upload.contentType)) {
    throw shadowSpaceApp.error(400, 'unsupported_image_type')
  }
  const buffer = Buffer.from(upload.dataBase64, 'base64')
  if (!buffer.byteLength || upload.size > imageMaxBytes || buffer.byteLength > imageMaxBytes) {
    throw shadowSpaceApp.error(400, 'image_too_large')
  }
  const id = imageId()
  const filename = safeUploadFilename(upload.filename)
  const asset = recordImageAsset({
    id,
    filename,
    contentType: upload.contentType,
    size: buffer.byteLength,
    url: `/uploads/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`,
    uploadedBy,
  })
  await mkdir(uploadDirectory(), { recursive: true })
  await writeFile(assetPath(asset), buffer)
  return asset
}

function errorResponse(c: Context, error: unknown) {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : 500
  const message = error instanceof Error ? error.message : 'internal_error'
  return c.json({ ok: false, error: message }, (Number.isInteger(status) ? status : 500) as 500)
}

const commands = shadowSpaceApp.defineCommands({
  'questions.list': (input) => ({ questions: listQuestions(input) }),
  'questions.get': (input) => {
    const question = getQuestion(input.questionId)
    if (!question) throw shadowSpaceApp.error(404, 'question_not_found')
    return { question }
  },
  'articles.list': (input) => ({ articles: listArticles(input) }),
  'articles.get': (input) => {
    const article = getArticle(input.articleId)
    if (!article) throw shadowSpaceApp.error(404, 'article_not_found')
    return { article }
  },
  'articles.publish': (input, { actor }) => ({
    article: publishArticle({ ...input, author: qnaPerson(actor) }),
  }),
  'questions.ask': (input, { actor }) => ({
    question: askQuestion({ ...input, author: qnaPerson(actor) }),
  }),
  'answers.create': (input, { actor }) => {
    const answer = createAnswer({ ...input, author: qnaPerson(actor) })
    if (!answer) throw shadowSpaceApp.error(404, 'question_not_found')
    return { answer }
  },
  'questions.delete': (input) => {
    const question = deleteQuestion(input)
    if (!question) throw shadowSpaceApp.error(404, 'question_not_found')
    return { question }
  },
  'answers.delete': (input) => {
    const answer = deleteAnswer(input)
    if (!answer) throw shadowSpaceApp.error(404, 'answer_not_found')
    return { answer }
  },
  'comments.create': (input, { actor }) => {
    const comment = createComment({ ...input, author: qnaPerson(actor) })
    if (!comment) throw shadowSpaceApp.error(404, 'target_not_found')
    return { comment }
  },
  'tags.list': () => ({ tags: listTags() }),
  'lists.list': (_input, { actor }) => ({ lists: listLists(qnaPerson(actor)) }),
  'lists.create': (input, { actor }) => ({
    list: createList({ ...input, owner: qnaPerson(actor) }),
  }),
  'lists.add_question': (input, { actor }) => {
    const list = addQuestionToList({ ...input, actor: qnaPerson(actor) })
    if (!list) throw shadowSpaceApp.error(404, 'list_or_question_not_found')
    return { list }
  },
  'lists.remove_question': (input, { actor }) => {
    const list = removeQuestionFromList({ ...input, actor: qnaPerson(actor) })
    if (!list) throw shadowSpaceApp.error(404, 'list_not_found')
    return { list }
  },
  'reading.batches': (_input, { actor }) => ({
    batches: listReadingBatches(qnaPerson(actor)),
  }),
  'reading.mark_read': (input, { actor }) => {
    const record = markReadingItemRead({ ...input, actor: qnaPerson(actor) })
    if (!record) throw shadowSpaceApp.error(404, 'reading_item_not_found')
    return { record }
  },
  'images.upload': async (input, { actor }) => {
    if (!input.upload) throw shadowSpaceApp.error(400, 'upload_required')
    const image = await storeImageUpload(input.upload, qnaPerson(actor))
    return { image }
  },
})

app.get('/.well-known/space-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) =>
  c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': iconCacheControl }),
)
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/api/media/avatar/:bucket/:key{.+}', redirectShadowAvatar)
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

app.post('/api/shadow/session', async (c) => {
  const result = await appSessions.exchange({
    authorizationHeader: c.req.header('authorization'),
    cookieHeader: c.req.header('cookie'),
    requestUrl: c.req.url,
  })
  if (result.ok) c.header('Set-Cookie', result.setCookie)
  return c.json(result.body, result.status)
})

app.get('/api/shadow/events', async (c) => {
  const response = await appSessions.eventStream({
    cookieHeader: c.req.header('cookie'),
    lastEventId: c.req.header('last-event-id'),
  })
  return response ?? c.json({ ok: false, error: 'session_required' }, 401)
})

app.get('/uploads/:assetId/:filename', async (c) => {
  const assetId = c.req.param('assetId')
  const filename = c.req.param('filename')
  const asset = assetId ? getImageAsset(assetId) : null
  if (!asset || asset.filename !== filename) return c.text('Not found', 404)
  try {
    const body = await readFile(assetPath(asset))
    return c.body(body, 200, {
      'Content-Type': asset.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
  } catch {
    return c.text('Not found', 404)
  }
})

app.post('/api/commands/:commandName', async (c) => {
  return runtimeCommand(c)
})

async function runtimeCommand(c: Context) {
  const name = commandName(c.req.param('commandName') ?? '')
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  try {
    const context = await runtimeContext(name, c)
    const contentType = c.req.header('content-type') ?? ''
    const input = contentType.includes('multipart/form-data')
      ? await parseMultipartCommandInput(c)
      : ((await c.req.json().catch(() => ({}))) as { input?: unknown }).input
    const result = await shadowSpaceApp.executeLocal(name, input ?? {}, context, commands)
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (error) {
    return errorResponse(c, error)
  }
}

app.get('/api/inboxes', async (c) => runtimeInboxes(c))

async function runtimeInboxes(c: Context) {
  const launchToken = await shadowLaunchToken(c, false)
  if (!launchToken) return c.json({ ok: false, error: 'launch_required' }, 401)
  try {
    return c.json(
      await fetchShadowSpaceAppLaunchInboxes({
        launchToken,
        shadowApiBaseUrl: shadowApiBaseUrl(),
      }),
    )
  } catch (error) {
    return errorResponse(c, error)
  }
}

app.post('/.shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const contentType = c.req.header('content-type') ?? ''
  const requestInput = contentType.includes('multipart/form-data')
    ? await parseMultipartCommandInput(c)
    : undefined
  const result = await shadowSpaceApp.executeCommand(
    name,
    {
      authorizationHeader: c.req.header('authorization'),
      requestBody: requestInput === undefined ? await c.req.text() : undefined,
      requestInput,
    },
    commands,
  )
  return c.json(result.body, result.status as 200)
})

export function startStandalone() {
  serve({ fetch: app.fetch, port })
  console.log(`Answers listening on http://localhost:${port}`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startStandalone()
}
