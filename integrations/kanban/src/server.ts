import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  hasShadowServerAppPendingOutbox,
  type ShadowServerAppCommandContext,
  type ShadowServerAppCommandName,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import {
  addCardArtifacts,
  assignCard,
  assignCardToPerson,
  commentCard,
  completeCard,
  createCard,
  dispatchCard,
  getBoard,
  getCard,
  linkCards,
  moveCard,
  rerunCard,
  updateCard,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import {
  buildCardDispatchInboxTask,
  enrichDispatchInputFromContext,
  normalizeDispatchInput,
} from './outbox.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import { shellPage } from './ui.js'

type KanbanCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>
type RuntimeErrorPayload = { ok: false; error: string; code?: string; params?: unknown }

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

function shadowApiBaseUrl() {
  return (process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002').replace(/\/$/, '')
}

function decodeLaunchTokenHint(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'sat_v1') return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      serverId?: unknown
      appKey?: unknown
    }
    if (typeof payload.serverId !== 'string' || typeof payload.appKey !== 'string') return null
    return { serverId: payload.serverId, appKey: payload.appKey }
  } catch {
    return null
  }
}

function shadowLaunchToken(c: Context) {
  return c.req.header('X-Shadow-Launch-Token') ?? ''
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    return recordValue(JSON.parse(value))
  } catch {
    return null
  }
}

function errorPayload(error: unknown): RuntimeErrorPayload {
  const record = recordValue(error)
  const payload = recordValue(record?.payload)
  const source = payload ?? record
  const message =
    (typeof source?.error === 'string' && source.error) ||
    (typeof source?.message === 'string' && source.message) ||
    (error instanceof Error ? error.message : 'Command failed')
  return {
    ok: false,
    error: message,
    ...(typeof source?.code === 'string' ? { code: source.code } : {}),
    ...(source?.params ? { params: source.params } : {}),
  }
}

function errorStatus(error: unknown) {
  const status = recordValue(error)?.status
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500
}

async function fetchLaunchInboxesFromShadow(token: string) {
  const hint = decodeLaunchTokenHint(token)
  if (!hint) return { inboxes: [] }
  const res = await fetch(
    `${shadowApiBaseUrl()}/api/servers/${encodeURIComponent(hint.serverId)}/apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/inboxes`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(await res.text().catch(() => 'Shadow launch inbox lookup failed'))
  return (await res.json()) as { inboxes: unknown[] }
}

async function deliverLaunchOutboxToShadow(token: string, commandName: string, result: unknown) {
  const hint = decodeLaunchTokenHint(token)
  if (!hint) return result
  const res = await fetch(
    `${shadowApiBaseUrl()}/api/servers/${encodeURIComponent(hint.serverId)}/apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/outbox`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandName, result }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const payload = parseJsonObject(text)
    const message =
      (typeof payload?.error === 'string' && payload.error) ||
      (typeof payload?.message === 'string' && payload.message) ||
      text ||
      'Shadow launch outbox failed'
    throw Object.assign(new Error(message), { status: res.status, payload: payload ?? undefined })
  }
  return res.json()
}

async function launchInboxes(c: Context) {
  const token = shadowLaunchToken(c)
  if (!token) return c.json({ inboxes: [] })
  try {
    return c.json(await fetchLaunchInboxesFromShadow(token))
  } catch (err) {
    return c.text(err instanceof Error ? err.message : 'Shadow launch inbox lookup failed', 502)
  }
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const token = shadowLaunchToken(c)
  if (!token || !hasShadowServerAppPendingOutbox(result.body)) return result.body
  return deliverLaunchOutboxToShadow(token, commandName, result.body)
}

export const app = new Hono()
const port = Number(process.env.PORT ?? 4201)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

const commands = shadowApp.defineCommands({
  'boards.get': (_input, { actor }) => ({ board: getBoard(), calledBy: actor }),
  'cards.get': (input) => {
    const card = getCard(input.cardId)
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.create': (input, { actor }) => ({
    card: createCard({ ...input, createdBy: actor }),
  }),
  'cards.update': (input) => {
    const card = updateCard(input)
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.move': (input) => {
    const card = moveCard(input.cardId, input.columnId)
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.assign': (input, { actor }) => {
    const card = input.assignee
      ? assignCard(input.cardId, input.assignee)
      : assignCardToPerson(input.cardId, actor)
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.dispatch': (input, context) => {
    const normalizedInput = enrichDispatchInputFromContext(
      normalizeDispatchInput(input),
      context.context,
    )
    const { actor } = context
    const result = dispatchCard(normalizedInput, actor)
    if (!result) throw shadowApp.error(404, 'card_not_found')
    const { card, assignee } = result
    if ('deferred' in result && result.deferred) {
      return { card, deferred: result.deferred }
    }
    const outbox = new ShadowServerAppOutbox().enqueueInboxTask(
      buildCardDispatchInboxTask({ dispatch: normalizedInput, card, assignee }),
    )
    return outbox.attachTo({ card })
  },
  'cards.comment': (input, { actor }) => {
    const card = commentCard(input.cardId, input.body, actor)
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.complete': (input, { actor }) => {
    const result = completeCard(input, actor)
    if (!result) throw shadowApp.error(404, 'card_not_found')
    if ('blocked' in result && result.blocked) {
      throw shadowApp.error(409, 'card_completion_blocked', result.blocked)
    }
    return result
  },
  'cards.link': (input, { actor }) => {
    const result = linkCards(input, actor)
    if (!result) throw shadowApp.error(404, 'card_not_found')
    return result
  },
  'cards.rerun': (input) => {
    const result = rerunCard(input.cardId, {
      prompt: input.prompt,
      reason: input.reason,
    })
    if (!result) throw shadowApp.error(404, 'card_not_found')
    return result
  },
  'cards.artifacts.add': (input, { actor }) => {
    const result = addCardArtifacts(input, actor)
    if (!result) throw shadowApp.error(404, 'card_not_found')
    return result
  },
})

function commandName(value: string): KanbanCommandName | null {
  return commandNames.has(value) ? (value as KanbanCommandName) : null
}

function localContext(command: KanbanCommandName): ShadowServerAppCommandContext {
  const manifestCommand = shadowServerAppManifest.commands.find((item) => item.name === command)
  return {
    protocol: 'shadow.app/1',
    serverId: 'local',
    serverAppId: 'local',
    appKey: shadowServerAppManifest.appKey,
    command,
    actor: {
      kind: 'local',
      userId: 'local',
      profile: {
        id: 'local',
        displayName: 'Local User',
        avatarUrl: null,
      },
    },
    permission: manifestCommand?.permission ?? 'local',
    action: manifestCommand?.action ?? 'read',
    dataClass: manifestCommand?.dataClass ?? 'server-private',
  }
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#0f172a"/>
  <rect x="18" y="22" width="18" height="52" rx="5" fill="#60a5fa"/>
  <rect x="40" y="22" width="18" height="52" rx="5" fill="#22c55e"/>
  <rect x="62" y="22" width="18" height="52" rx="5" fill="#f97316"/>
  <path d="M24 34h6M46 34h6M68 34h6M24 46h6M46 46h6M68 46h6" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>
</svg>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/artifacts/*', serveStatic({ root: fromAppRoot('data') }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))
app.get('/api/board', (c) => c.json(getBoard()))
app.get('/api/runtime/inboxes', launchInboxes)
app.get('/api/local/inboxes', launchInboxes)

async function runtimeCommand(c: Context) {
  const rawName = c.req.param('commandName')
  if (!rawName) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const name = commandName(rawName)
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  try {
    const result = await shadowApp.executeLocal(
      name,
      body.input ?? {},
      localContext(name),
      commands,
    )
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (err) {
    return c.json(errorPayload(err), errorStatus(err) as 500)
  }
}

app.post('/api/runtime/commands/:commandName', runtimeCommand)
app.post('/api/local/commands/:commandName', runtimeCommand)

app.post('/api/shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const result = await shadowApp.executeCommand(
    name,
    {
      authorizationHeader: c.req.header('authorization'),
      serverIdHeader: c.req.header('X-Shadow-Server-Id'),
      appKeyHeader: c.req.header('X-Shadow-App-Key'),
      requestBody: await c.req.text(),
    },
    commands,
  )
  return c.json(result.body, result.status as 200)
})

export function startStandalone() {
  serve({ fetch: app.fetch, port })
  console.log(`Kanban listening on http://localhost:${port}`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startStandalone()
}
