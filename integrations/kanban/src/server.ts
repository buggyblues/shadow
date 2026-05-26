import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ShadowServerAppCommandContext, ShadowServerAppCommandName } from '@shadowob/sdk'
import { Hono } from 'hono'
import {
  assignCard,
  assignCardToPerson,
  commentCard,
  createCard,
  getBoard,
  getCard,
  moveCard,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import { shellPage } from './ui.js'

type KanbanCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
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
  'cards.comment': (input, { actor }) => {
    const card = commentCard(input.cardId, input.body, actor)
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
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
app.get('/assets/*', serveStatic({ root: './dist/client' }))
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

serve({ fetch: app.fetch, port })

console.log(`Shadow Kanban listening on http://localhost:${port}`)
