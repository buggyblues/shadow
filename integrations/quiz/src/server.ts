import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  deliverShadowSpaceAppLaunchOutbox,
  hasShadowSpaceAppPendingOutbox,
  SHADOW_SPACE_APP_PUBLIC_AVATAR_CACHE_CONTROL,
  type ShadowSpaceAppCommandName,
  shadowSpaceAppApiBaseUrl,
  shadowSpaceAppAvatarRedirectUrl,
} from '@shadowob/sdk'
import { createShadowSpaceAppSessionManager } from '@shadowob/sdk/space-app/node'
import { type Context, Hono } from 'hono'
import {
  getQuiz,
  gradeSubmission,
  listQuizzes,
  listSubmissions,
  publishQuiz,
  submitQuiz,
} from './data.js'
import { manifest, shadowSpaceApp } from './manifest.js'
import { shadowSpaceAppManifest } from './space-app.generated.js'
import { shellPage } from './ui.js'

type QuizCommandName = ShadowSpaceAppCommandName<typeof shadowSpaceAppManifest>

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

export const app = new Hono()
const port = Number(process.env.PORT ?? 4211)
const commandNames = new Set<string>(shadowSpaceAppManifest.commands.map((command) => command.name))
const iconCacheControl = 'public, max-age=3600'

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

const commands = shadowSpaceApp.defineCommands({
  'quizzes.list': () => ({ quizzes: listQuizzes() }),
  'quizzes.get': (input) => {
    const quiz = getQuiz(input.quizId)
    if (!quiz) throw shadowSpaceApp.error(404, 'quiz_not_found')
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
    if (!submission) throw shadowSpaceApp.error(404, 'quiz_not_found')
    return { submission }
  },
  'submissions.list': (input) => ({ submissions: listSubmissions(input) }),
  'submissions.grade': (input, { actor }) => {
    const submission = gradeSubmission({ ...input, grader: actor })
    if (!submission) throw shadowSpaceApp.error(404, 'submission_not_found')
    return { submission }
  },
})

function commandName(value: string): QuizCommandName | null {
  return commandNames.has(value) ? (value as QuizCommandName) : null
}

async function runtimeContext(command: QuizCommandName, c: Context) {
  const resolution = await appSessions.commandContext({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
    commandName: command,
    manifest: shadowSpaceAppManifest,
  })
  return { context: resolution.context, error: resolution.error }
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

app.post('/api/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  const { context, error } = await runtimeContext(name, c)
  if (!context) return c.json({ ok: false, error }, 401)
  const result = await shadowSpaceApp.executeLocal(name, body.input ?? {}, context, commands)
  const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
  return c.json(bodyWithDeliveries, result.status as 200)
})

app.post('/.shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const result = await shadowSpaceApp.executeCommand(
    name,
    {
      authorizationHeader: c.req.header('authorization'),
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
