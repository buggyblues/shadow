import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ShadowServerAppCommandContext, ShadowServerAppCommandName } from '@shadowob/sdk'
import { Hono } from 'hono'
import {
  askQuestion,
  createAnswer,
  createComment,
  getQuestion,
  listQuestions,
  listTopics,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import { shellPage } from './ui.js'

type QnaCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4210)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

const commands = shadowApp.defineCommands({
  'questions.list': (input) => ({ questions: listQuestions(input) }),
  'questions.get': (input) => {
    const question = getQuestion(input.questionId)
    if (!question) throw shadowApp.error(404, 'question_not_found')
    return { question }
  },
  'questions.ask': (input, { actor }) => ({
    question: askQuestion({ ...input, author: actor }),
  }),
  'answers.create': (input, { actor }) => {
    const answer = createAnswer({ ...input, author: actor })
    if (!answer) throw shadowApp.error(404, 'question_not_found')
    return { answer }
  },
  'comments.create': (input, { actor }) => {
    const comment = createComment({ ...input, author: actor })
    if (!comment) throw shadowApp.error(404, 'target_not_found')
    return { comment }
  },
  'topics.list': () => ({ topics: listTopics() }),
})

function commandName(value: string): QnaCommandName | null {
  return commandNames.has(value) ? (value as QnaCommandName) : null
}

function localContext(command: QnaCommandName): ShadowServerAppCommandContext {
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
  <rect width="96" height="96" rx="22" fill="#0b63ce"/>
  <path d="M28 30h40a12 12 0 0 1 12 12v7a12 12 0 0 1-12 12H50L35 75V61h-7a12 12 0 0 1-12-12v-7a12 12 0 0 1 12-12Z" fill="#fff"/>
  <path d="M34 43h28M34 52h18" stroke="#0b63ce" stroke-width="6" stroke-linecap="round"/>
</svg>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/*', serveStatic({ root: './dist/client' }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

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

console.log(`Answers listening on http://localhost:${port}`)
