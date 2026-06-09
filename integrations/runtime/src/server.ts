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

const pathMountedRootPrefixes = [
  '/api/',
  '/assets/',
  '/shadow/',
  '/src/client/assets/',
  '/uploads/',
]

const port = Number(process.env.PORT ?? 4200)
const dataDir = trimTrailingSlash(process.env.INTEGRATIONS_DATA_DIR ?? '/data')
const shadowApiBaseUrl = trimTrailingSlash(process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002')
const runtimePublicBaseUrl = trimTrailingSlash(
  process.env.INTEGRATIONS_PUBLIC_BASE_URL ??
    process.env.SHADOW_APP_PUBLIC_BASE_URL ??
    `http://localhost:${port}`,
)
const runtimeApiBaseUrl = trimTrailingSlash(
  process.env.INTEGRATIONS_API_BASE_URL ??
    process.env.SHADOW_APP_API_BASE_URL ??
    `http://host.lima.internal:${port}`,
)
const runtimeIntegrationSlugs = [
  'kanban',
  'qna',
  'quiz',
  'trainer',
  'resume',
  'skills',
  'warbuddy',
] as const satisfies readonly IntegrationSlug[]

for (const slug of runtimeIntegrationSlugs) {
  const envPrefix = slug.toUpperCase()
  setDefaultEnv(`${envPrefix}_PUBLIC_BASE_URL`, joinRuntimeBasePath(runtimePublicBaseUrl, slug))
  setDefaultEnv(`${envPrefix}_API_BASE_URL`, joinRuntimeBasePath(runtimeApiBaseUrl, slug))
}

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
  if (isShadowSignedMediaPath(url.pathname)) {
    return proxyShadowRequest(request)
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
  const response = await resolved.integration.app.fetch(forwardedRequest)
  const mountedResponse = resolved.pathPrefix
    ? await prefixMountedResponse(response, resolved.pathPrefix)
    : response
  return withRuntimeCacheHeaders(request, mountedResponse)
}

function resolveRequest(request: Request): ResolvedIntegration | null {
  const url = new URL(request.url)
  const hostIntegration = integrationsByHost.get(normalizeHost(request.headers.get('host')))
  if (hostIntegration) return { integration: hostIntegration, pathPrefix: null }

  const pathPrefix = firstPathSegment(url.pathname)
  const pathIntegration = pathPrefix ? integrationsBySlug.get(pathPrefix as IntegrationSlug) : null
  if (pathIntegration) return { integration: pathIntegration, pathPrefix }

  const launchIntegration = resolveLaunchMountedRootRequest(
    url.pathname,
    request.headers.get('x-shadow-launch-token'),
  )
  if (launchIntegration) return { integration: launchIntegration, pathPrefix: null }

  const refererIntegration = resolvePathMountedRootRequest(
    url.pathname,
    request.headers.get('referer'),
  )
  return refererIntegration ? { integration: refererIntegration, pathPrefix: null } : null
}

function resolveIncomingMessage(request: IncomingMessage): ResolvedIntegration | null {
  const hostIntegration = integrationsByHost.get(normalizeHost(request.headers.host))
  if (hostIntegration) return { integration: hostIntegration, pathPrefix: null }

  const pathPrefix = firstPathSegment(request.url ?? '/')
  const pathIntegration = pathPrefix ? integrationsBySlug.get(pathPrefix as IntegrationSlug) : null
  if (pathIntegration) return { integration: pathIntegration, pathPrefix }

  const launchIntegration = resolveLaunchMountedRootRequest(
    request.url ?? '/',
    headerValue(request.headers['x-shadow-launch-token']),
  )
  if (launchIntegration) return { integration: launchIntegration, pathPrefix: null }

  const refererIntegration = resolvePathMountedRootRequest(
    request.url ?? '/',
    headerValue(request.headers.referer),
  )
  return refererIntegration ? { integration: refererIntegration, pathPrefix: null } : null
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

function resolvePathMountedRootRequest(pathname: string, referer: string | null | undefined) {
  if (!pathMountedRootPrefixes.some((prefix) => pathname.startsWith(prefix))) return null
  if (!referer) return null
  try {
    const refererPrefix = firstPathSegment(new URL(referer).pathname)
    return refererPrefix ? (integrationsBySlug.get(refererPrefix as IntegrationSlug) ?? null) : null
  } catch {
    return null
  }
}

function resolveLaunchMountedRootRequest(pathname: string, launchToken: string | null | undefined) {
  if (!pathMountedRootPrefixes.some((prefix) => pathname.startsWith(prefix))) return null
  const hint = decodeLaunchTokenHint(launchToken)
  return hint ? (integrationsBySlug.get(hint.appKey as IntegrationSlug) ?? null) : null
}

function decodeLaunchTokenHint(token: string | null | undefined) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'sat_v1') return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      appKey?: unknown
    }
    return typeof payload.appKey === 'string' ? { appKey: payload.appKey } : null
  } catch {
    return null
  }
}

function isShadowSignedMediaPath(pathname: string) {
  return pathname.startsWith('/api/media/signed/')
}

async function proxyShadowRequest(request: Request) {
  const sourceUrl = new URL(request.url)
  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, shadowApiBaseUrl)
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('origin')
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  })
  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

async function prefixMountedResponse(response: Response, pathPrefix: string) {
  const location = response.headers.get('location')
  if (location?.startsWith('/')) {
    const headers = new Headers(response.headers)
    headers.set('location', `/${pathPrefix}${location}`)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('text/html')) return response

  const body = prefixMountedHtml(await response.text(), pathPrefix)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}

function withRuntimeCacheHeaders(request: Request, response: Response) {
  const url = new URL(request.url)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const isHtml = contentType.includes('text/html')
  const isAppAsset = /\/assets\/app\.(?:js|css)$/u.test(url.pathname)
  if (!isHtml && !isAppAsset) return response

  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function prefixMountedHtml(html: string, pathPrefix: string) {
  return html.replace(
    /(\s(?:src|href)=["'])\/(assets|src\/client\/assets|api|uploads|shadow)\//gu,
    `$1/${pathPrefix}/$2/`,
  )
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
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

function joinRuntimeBasePath(baseUrl: string, pathPrefix: string) {
  return `${trimTrailingSlash(baseUrl)}/${pathPrefix}`
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
