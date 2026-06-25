import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  deliverShadowServerAppLaunchOutbox,
  hasShadowServerAppPendingOutbox,
  resolveShadowServerAppLaunchCommandContextResolution,
  SHADOW_SERVER_APP_PUBLIC_AVATAR_CACHE_CONTROL,
  type ShadowServerAppCommandName,
  shadowServerAppApiBaseUrl,
  shadowServerAppAvatarRedirectUrl,
} from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
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

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

export const app = new Hono()
const port = Number(process.env.PORT ?? 4211)
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

async function runtimeContext(command: QuizCommandName, c: Context) {
  const launchToken = shadowLaunchToken(c)
  if (!launchToken) return { context: null, error: 'launch_required' }
  const resolution = await resolveShadowServerAppLaunchCommandContextResolution({
    launchToken,
    commandName: command,
    manifest: shadowServerAppManifest,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
  return { context: resolution.context, error: resolution.error ?? 'invalid_launch_token' }
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
app.get('/assets/icon.svg', (c) =>
  c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': iconCacheControl }),
)
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/api/media/avatar/:bucket/:key{.+}', redirectShadowAvatar)
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

app.post('/api/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  const { context, error } = await runtimeContext(name, c)
  if (!context) return c.json({ ok: false, error }, 401)
  const result = await shadowApp.executeLocal(name, body.input ?? {}, context, commands)
  const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
  return c.json(bodyWithDeliveries, result.status as 200)
})

app.post('/.shadow/commands/:commandName', async (c) => {
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
  console.log(`Quiz listening on http://localhost:${port}`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startStandalone()
}
