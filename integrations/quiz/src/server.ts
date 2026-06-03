import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ShadowServerAppCommandContext, ShadowServerAppCommandName } from '@shadowob/sdk'
import { Hono } from 'hono'
import {
  getQuiz,
  gradeSubmission,
  listQuizzes,
  listSubmissions,
  publishQuiz,
  submitQuiz,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import { shellPage } from './ui.js'

type QuizCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4211)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

const commands = shadowApp.defineCommands({
  'quizzes.list': () => ({ quizzes: listQuizzes() }),
  'quizzes.get': (input) => {
    const quiz = getQuiz(input.quizId)
    if (!quiz) throw shadowApp.error(404, 'quiz_not_found')
    return quiz
  },
  'quizzes.publish': (input, { actor }) => ({
    quiz: publishQuiz({
      title: input.title,
      description: input.description,
      questions: input.questions as Parameters<typeof publishQuiz>[0]['questions'],
      author: actor,
    }),
  }),
  'submissions.submit': (input, { actor }) => {
    const submission = submitQuiz({
      quizId: input.quizId,
      answers: input.answers as Parameters<typeof submitQuiz>[0]['answers'],
      respondent: actor,
    })
    if (!submission) throw shadowApp.error(404, 'quiz_not_found')
    return { submission }
  },
  'submissions.list': (input) => ({ submissions: listSubmissions(input) }),
  'submissions.grade': (input, { actor }) => {
    const submission = gradeSubmission({ ...input, grader: actor })
    if (!submission) throw shadowApp.error(404, 'submission_not_found')
    return { submission }
  },
})

function commandName(value: string): QuizCommandName | null {
  return commandNames.has(value) ? (value as QuizCommandName) : null
}

function localContext(command: QuizCommandName): ShadowServerAppCommandContext {
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
  <rect width="96" height="96" rx="22" fill="#14b8a6"/>
  <path d="M24 25h48v46H24z" fill="#fff"/>
  <path d="M34 39h28M34 51h18" stroke="#0f766e" stroke-width="6" stroke-linecap="round"/>
  <circle cx="68" cy="68" r="15" fill="#0f766e"/>
  <path d="m61 68 5 5 10-12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/cover.png', serveStatic({ root: './public' }))
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

console.log(`Quiz listening on http://localhost:${port}`)
