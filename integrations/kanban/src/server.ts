import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  type ShadowServerAppCommandContext,
  type ShadowServerAppCommandName,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
import { Hono } from 'hono'
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

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

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

app.post('/api/local/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  const result = await shadowApp.executeLocal(name, body.input ?? {}, localContext(name), commands)
  return c.json(result.body, result.status as 200)
})

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
