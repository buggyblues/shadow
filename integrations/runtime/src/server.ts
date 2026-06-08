import 'dotenv/config'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { serve } from '@hono/node-server'

type IntegrationSlug = 'kanban' | 'qna' | 'quiz' | 'trainer' | 'resume' | 'skills' | 'warbuddy'

type HonoLikeApp = {
  fetch: (request: Request) => Response | Promise<Response>
}

type UpgradeHandler = (request: IncomingMessage, socket: Socket) => void

type RuntimeIntegration = {
  slug: IntegrationSlug
  label: string
  app: HonoLikeApp
  hosts: string[]
  upgrade?: UpgradeHandler
}

type ResolvedIntegration = {
  integration: RuntimeIntegration
  pathPrefix: string | null
}

const port = Number(process.env.PORT ?? 4200)
const dataDir = trimTrailingSlash(process.env.INTEGRATIONS_DATA_DIR ?? '/data')

setDefaultEnv('KANBAN_DATA_FILE', `${dataDir}/kanban-board.json`)
setDefaultEnv('QNA_DATA_FILE', `${dataDir}/qna.json`)
setDefaultEnv('QNA_UPLOAD_DIR', `${dataDir}/uploads/qna`)
setDefaultEnv('QUIZ_DATA_FILE', `${dataDir}/quiz.json`)
setDefaultEnv('TRAINER_DATA_FILE', `${dataDir}/trainer.json`)
setDefaultEnv('RESUME_DATA_FILE', `${dataDir}/resume.json`)
setDefaultEnv('SKILLS_DATA_FILE', `${dataDir}/skills-library.json`)
setDefaultEnv('WARBUDDY_DATA_FILE', `${dataDir}/warbuddy.json`)

const [kanban, qna, quiz, trainer, resume, skills, warbuddy] = await Promise.all([
  import('../../kanban/src/server.js'),
  import('../../qna/src/server.js'),
  import('../../quiz/src/server.js'),
  import('../../trainer/src/server.js'),
  import('../../resume/src/server.js'),
  import('../../skills/src/server.js'),
  import('../../warbuddy/src/server.js'),
])

skills.startSkillsBackgroundTasks()

const integrations: RuntimeIntegration[] = [
  {
    slug: 'kanban',
    label: 'Kanban',
    app: kanban.app,
    hosts: hostsFor('kanban', ['kanban.localhost', 'kanban-app.localhost']),
  },
  {
    slug: 'qna',
    label: 'Answers',
    app: qna.app,
    hosts: hostsFor('qna', ['qna.localhost', 'qna-app.localhost']),
  },
  {
    slug: 'quiz',
    label: 'Quiz',
    app: quiz.app,
    hosts: hostsFor('quiz', ['quiz.localhost', 'quiz-app.localhost']),
  },
  {
    slug: 'trainer',
    label: 'Code Trainer',
    app: trainer.app,
    hosts: hostsFor('trainer', ['trainer.localhost', 'trainer-app.localhost']),
  },
  {
    slug: 'resume',
    label: 'Super Resume',
    app: resume.app,
    hosts: hostsFor('resume', ['resume.localhost', 'resume-app.localhost']),
  },
  {
    slug: 'skills',
    label: 'Skills',
    app: skills.app,
    hosts: hostsFor('skills', ['skills.localhost', 'skills-app.localhost']),
  },
  {
    slug: 'warbuddy',
    label: 'WarBuddy',
    app: warbuddy.app,
    hosts: hostsFor('warbuddy', ['warbuddy.localhost', 'warbuddy-app.localhost']),
    upgrade: warbuddy.handleLiveUpgrade,
  },
]

const integrationsBySlug = new Map(
  integrations.map((integration) => [integration.slug, integration]),
)
const integrationsByHost = new Map(
  integrations.flatMap((integration) =>
    integration.hosts.map((host) => [normalizeHost(host), integration] as const),
  ),
)

const server = serve({ fetch: routeRequest, port })
server.on('upgrade', (request, socket) => {
  const resolved = resolveIncomingMessage(request)
  if (!resolved?.integration.upgrade) {
    socket.destroy()
    return
  }

  const originalUrl = request.url
  if (resolved.pathPrefix)
    request.url = stripPrefixFromPath(originalUrl ?? '/', resolved.pathPrefix)
  try {
    resolved.integration.upgrade(request, socket as Socket)
  } finally {
    request.url = originalUrl
  }
})

console.log(`Integrations runtime listening on http://localhost:${port}`)
console.log(
  `Loaded integrations: ${integrations
    .map((integration) => `${integration.slug}(${integration.hosts.join(',')})`)
    .join(' ')}`,
)

async function routeRequest(request: Request) {
  const url = new URL(request.url)
  if (url.pathname === '/healthz') {
    return jsonResponse(200, { ok: true, integrations: integrations.map((item) => item.slug) })
  }
  if (url.pathname === '/__runtime/apps') {
    return jsonResponse(200, {
      apps: integrations.map((integration) => ({
        slug: integration.slug,
        label: integration.label,
        hosts: integration.hosts,
      })),
    })
  }

  const resolved = resolveRequest(request)
  if (!resolved) {
    return jsonResponse(404, {
      ok: false,
      error: 'integration_not_found',
      hint: 'Set the Host header to a configured integration host or route by /<slug>/...',
    })
  }

  const forwardedRequest = resolved.pathPrefix
    ? stripPrefixFromRequest(request, resolved.pathPrefix)
    : request
  return resolved.integration.app.fetch(forwardedRequest)
}

function resolveRequest(request: Request): ResolvedIntegration | null {
  const url = new URL(request.url)
  const hostIntegration = integrationsByHost.get(normalizeHost(request.headers.get('host')))
  if (hostIntegration) return { integration: hostIntegration, pathPrefix: null }

  const pathPrefix = firstPathSegment(url.pathname)
  const pathIntegration = pathPrefix ? integrationsBySlug.get(pathPrefix as IntegrationSlug) : null
  return pathIntegration ? { integration: pathIntegration, pathPrefix } : null
}

function resolveIncomingMessage(request: IncomingMessage): ResolvedIntegration | null {
  const hostIntegration = integrationsByHost.get(normalizeHost(request.headers.host))
  if (hostIntegration) return { integration: hostIntegration, pathPrefix: null }

  const pathPrefix = firstPathSegment(request.url ?? '/')
  const pathIntegration = pathPrefix ? integrationsBySlug.get(pathPrefix as IntegrationSlug) : null
  return pathIntegration ? { integration: pathIntegration, pathPrefix } : null
}

function firstPathSegment(pathname: string) {
  const segment = pathname.split('/').find(Boolean)
  return segment && integrationsBySlug.has(segment as IntegrationSlug) ? segment : null
}

function stripPrefixFromRequest(request: Request, pathPrefix: string) {
  const url = new URL(request.url)
  url.pathname = stripPrefixFromPath(url.pathname, pathPrefix)
  return new Request(url.toString(), request)
}

function stripPrefixFromPath(pathname: string, pathPrefix: string) {
  const prefix = `/${pathPrefix}`
  if (pathname === prefix) return '/'
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length) || '/'
  return pathname
}

function hostsFor(slug: IntegrationSlug, defaults: string[]) {
  const key = `${slug.toUpperCase()}_HOSTS`
  return (process.env[key] ?? defaults.join(','))
    .split(',')
    .map((item) => normalizeHost(item))
    .filter(Boolean)
}

function normalizeHost(value: string | null | undefined) {
  const host = (value ?? '').trim().toLowerCase()
  if (!host) return ''
  if (host.startsWith('[')) {
    const closing = host.indexOf(']')
    return closing === -1 ? host : host.slice(1, closing)
  }
  return host.split(':')[0] ?? host
}

function setDefaultEnv(key: string, value: string) {
  if (!process.env[key]) process.env[key] = value
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
