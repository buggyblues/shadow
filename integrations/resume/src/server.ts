import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  deliverShadowServerAppLaunchOutbox,
  hasShadowServerAppPendingOutbox,
  type ShadowServerAppCommandContext,
  type ShadowServerAppCommandName,
} from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import {
  createResume,
  deleteResume,
  generateResume,
  getResume,
  listResumes,
  updateResume,
  updateResumeStyle,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import { shellPage } from './ui.js'

type ResumeCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

export const app = new Hono()
const port = Number(process.env.PORT ?? 4214)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

function shadowApiBaseUrl() {
  return (process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002').replace(/\/+$/u, '')
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
  'resumes.list': (input) => ({ resumes: listResumes(input) }),
  'resumes.get': (input) => {
    const resume = getResume(input.resumeId)
    if (!resume) throw shadowApp.error(404, 'resume_not_found')
    return { resume }
  },
  'resumes.create': (input, context) => ({
    resume: createResume({ ...input, owner: context.actor }),
  }),
  'resumes.update': (input) => {
    const resume = updateResume(input)
    if (!resume) throw shadowApp.error(404, 'resume_not_found')
    return { resume }
  },
  'resumes.delete': (input) => {
    const resume = deleteResume(input.resumeId)
    if (!resume) throw shadowApp.error(404, 'resume_not_found')
    return { resume }
  },
  'resumes.generate': (input, context) => ({
    resume: generateResume({ ...input, owner: context.actor }),
  }),
  'resumes.style.update': (input) => {
    const resume = updateResumeStyle(input)
    if (!resume) throw shadowApp.error(404, 'resume_not_found')
    return { resume }
  },
})

function commandName(value: string): ResumeCommandName | null {
  return commandNames.has(value) ? (value as ResumeCommandName) : null
}

function localContext(command: ResumeCommandName): ShadowServerAppCommandContext {
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
        displayName: 'Local Resume Owner',
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
  <rect width="96" height="96" rx="22" fill="#0f766e"/>
  <path d="M28 18h31l13 13v47H28z" fill="#fff"/>
  <path d="M58 18v15h14" fill="#ccfbf1"/>
  <path d="M38 45h20M38 56h26M38 67h18" stroke="#0f766e" stroke-width="5" stroke-linecap="round"/>
</svg>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

app.post('/api/local/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  const result = await shadowApp.executeLocal(name, body.input ?? {}, localContext(name), commands)
  const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
  return c.json(bodyWithDeliveries, result.status as 200)
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
  console.log(`Super Resume listening on http://localhost:${port}`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startStandalone()
}
