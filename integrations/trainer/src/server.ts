import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ShadowServerAppCommandContext, ShadowServerAppCommandName } from '@shadowob/sdk'
import { Hono } from 'hono'
import {
  createSubmission,
  getChallenge,
  getSubmission,
  judgeSubmission,
  listChallenges,
  listSubmissions,
  pendingSubmissions,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import { shellPage } from './ui.js'

type TrainerCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4213)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

const commands = shadowApp.defineCommands({
  'challenges.list': (input) => ({ challenges: listChallenges(input) }),
  'challenges.get': (input) => {
    const result = getChallenge(input.challengeId)
    if (!result) throw shadowApp.error(404, 'challenge_not_found')
    return result
  },
  'submissions.create': (input, context) => {
    const submission = createSubmission({ ...input, author: context.actor })
    if (!submission) throw shadowApp.error(404, 'challenge_not_found')
    return { submission }
  },
  'submissions.list': (input) => ({ submissions: listSubmissions(input) }),
  'submissions.get': (input) => {
    const result = getSubmission(input.submissionId)
    if (!result) throw shadowApp.error(404, 'submission_not_found')
    return result
  },
  'submissions.pending': (input) => ({ submissions: pendingSubmissions(input) }),
  'submissions.judge': (input, context) => {
    const submission = judgeSubmission({ ...input, grader: context.actor })
    if (!submission) throw shadowApp.error(404, 'submission_not_found')
    return { submission }
  },
})

function commandName(value: string): TrainerCommandName | null {
  return commandNames.has(value) ? (value as TrainerCommandName) : null
}

function localContext(command: TrainerCommandName): ShadowServerAppCommandContext {
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
        displayName: 'Local Coder',
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
  <rect width="96" height="96" rx="22" fill="#2563eb"/>
  <path d="m34 32-14 16 14 16M62 32l14 16-14 16" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m53 24-10 48" stroke="#bfdbfe" stroke-width="7" stroke-linecap="round"/>
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

console.log(`Code Trainer listening on http://localhost:${port}`)
