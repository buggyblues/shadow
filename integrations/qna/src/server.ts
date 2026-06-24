import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  deliverShadowServerAppLaunchOutbox,
  fetchShadowServerAppLaunchInboxes,
  hasShadowServerAppPendingOutbox,
  resolveShadowServerAppLaunchCommandContext,
  type ShadowServerAppActorRef,
  type ShadowServerAppCommandContext,
  type ShadowServerAppCommandName,
  shadowServerAppIdentitySnapshot,
} from '@shadowob/sdk'
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
  publishArticle,
  recordImageAsset,
  removeQuestionFromList,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import type { QnaImageAsset, QnaPerson, QnaUploadFile } from './types.js'
import { shellPage } from './ui.js'

type QnaCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

export const app = new Hono()
const port = Number(process.env.PORT ?? 4210)
const imageMaxBytes = 5 * 1024 * 1024
const supportedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)
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
  return (process.env.SHADOWOB_SERVER_URL ?? 'http://localhost:3002').replace(/\/+$/u, '')
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

function qnaPerson(actor: ShadowServerAppActorRef): QnaPerson {
  const snapshot = shadowServerAppIdentitySnapshot(actor)
  if (!snapshot.avatarUrl?.startsWith('/')) return snapshot
  const shadowWebBaseUrl = (
    process.env.SHADOWOB_WEB_BASE_URL ??
    process.env.OAUTH_BASE_URL ??
    process.env.SHADOWOB_SERVER_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/u, '')
  return { ...snapshot, avatarUrl: `${shadowWebBaseUrl}${snapshot.avatarUrl}` }
}

function commandDefinition(command: QnaCommandName) {
  return shadowServerAppManifest.commands.find((item) => item.name === command)
}

function publicRuntimeContext(command: QnaCommandName): ShadowServerAppCommandContext {
  const definition = commandDefinition(command)
  return {
    protocol: 'shadow.app/1',
    serverId: 'public',
    serverAppId: 'answers-public',
    appKey: shadowServerAppManifest.appKey,
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
  const launchToken = shadowLaunchToken(c)
  if (launchToken) {
    const context = await resolveShadowServerAppLaunchCommandContext({
      launchToken,
      commandName: command,
      manifest: shadowServerAppManifest,
      shadowApiBaseUrl: shadowApiBaseUrl(),
    })
    if (!context) throw Object.assign(new Error('invalid_launch_token'), { status: 401 })
    return context
  }
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
    throw shadowApp.error(400, 'unsupported_image_type')
  }
  const buffer = Buffer.from(upload.dataBase64, 'base64')
  if (!buffer.byteLength || upload.size > imageMaxBytes || buffer.byteLength > imageMaxBytes) {
    throw shadowApp.error(400, 'image_too_large')
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

const commands = shadowApp.defineCommands({
  'questions.list': (input) => ({ questions: listQuestions(input) }),
  'questions.get': (input) => {
    const question = getQuestion(input.questionId)
    if (!question) throw shadowApp.error(404, 'question_not_found')
    return { question }
  },
  'articles.list': (input) => ({ articles: listArticles(input) }),
  'articles.get': (input) => {
    const article = getArticle(input.articleId)
    if (!article) throw shadowApp.error(404, 'article_not_found')
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
    if (!answer) throw shadowApp.error(404, 'question_not_found')
    return { answer }
  },
  'questions.delete': (input) => {
    const question = deleteQuestion(input)
    if (!question) throw shadowApp.error(404, 'question_not_found')
    return { question }
  },
  'answers.delete': (input) => {
    const answer = deleteAnswer(input)
    if (!answer) throw shadowApp.error(404, 'answer_not_found')
    return { answer }
  },
  'comments.create': (input, { actor }) => {
    const comment = createComment({ ...input, author: qnaPerson(actor) })
    if (!comment) throw shadowApp.error(404, 'target_not_found')
    return { comment }
  },
  'tags.list': () => ({ tags: listTags() }),
  'lists.list': (_input, { actor }) => ({ lists: listLists(qnaPerson(actor)) }),
  'lists.create': (input, { actor }) => ({
    list: createList({ ...input, owner: qnaPerson(actor) }),
  }),
  'lists.add_question': (input, { actor }) => {
    const list = addQuestionToList({ ...input, actor: qnaPerson(actor) })
    if (!list) throw shadowApp.error(404, 'list_or_question_not_found')
    return { list }
  },
  'lists.remove_question': (input, { actor }) => {
    const list = removeQuestionFromList({ ...input, actor: qnaPerson(actor) })
    if (!list) throw shadowApp.error(404, 'list_not_found')
    return { list }
  },
  'reading.batches': (_input, { actor }) => ({
    batches: listReadingBatches(qnaPerson(actor)),
  }),
  'reading.mark_read': (input, { actor }) => {
    const record = markReadingItemRead({ ...input, actor: qnaPerson(actor) })
    if (!record) throw shadowApp.error(404, 'reading_item_not_found')
    return { record }
  },
  'images.upload': async (input, { actor }) => {
    if (!input.upload) throw shadowApp.error(400, 'upload_required')
    const image = await storeImageUpload(input.upload, qnaPerson(actor))
    return { image }
  },
})

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) =>
  c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': iconCacheControl }),
)
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

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

app.post('/api/runtime/commands/:commandName', async (c) => {
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
    const result = await shadowApp.executeLocal(name, input ?? {}, context, commands)
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (error) {
    return errorResponse(c, error)
  }
}

app.get('/api/runtime/inboxes', async (c) => runtimeInboxes(c))

async function runtimeInboxes(c: Context) {
  const launchToken = shadowLaunchToken(c)
  if (!launchToken) return c.json({ ok: false, error: 'launch_required' }, 401)
  try {
    return c.json(
      await fetchShadowServerAppLaunchInboxes({
        launchToken,
        shadowApiBaseUrl: shadowApiBaseUrl(),
      }),
    )
  } catch (error) {
    return errorResponse(c, error)
  }
}

app.post('/api/shadow/commands/:commandName', async (c) => {
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

export function startStandalone() {
  serve({ fetch: app.fetch, port })
  console.log(`Answers listening on http://localhost:${port}`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startStandalone()
}
