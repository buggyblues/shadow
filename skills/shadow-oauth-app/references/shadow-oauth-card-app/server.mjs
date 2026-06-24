import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 4178)
const SHADOWOB_SERVER_URL = (process.env.SHADOWOB_SERVER_URL ?? 'https://shadowob.com').replace(
  /\/$/,
  '',
)
const CLIENT_ID = process.env.SHADOWOB_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.SHADOWOB_CLIENT_SECRET ?? ''
const REDIRECT_URI = process.env.SHADOWOB_REDIRECT_URI ?? `http://localhost:${PORT}/callback`
const COMMERCE_RESOURCE_ID = process.env.SHADOWOB_COMMERCE_RESOURCE_ID ?? `${CLIENT_ID}:premium`
const SCOPES = ['user:read', 'servers:read', 'channels:read', 'commerce:read', 'commerce:write']

const sessions = new Map()

function html(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shadow OAuth Sample</title><style>body{font-family:system-ui,sans-serif;margin:24px;background:#101116;color:#f4f4f5}a,button{background:#6ee7b7;color:#04130d;border:0;border-radius:8px;padding:10px 12px;font-weight:700;text-decoration:none}pre{white-space:pre-wrap;background:#181a22;border:1px solid #2a2d38;border-radius:8px;padding:12px}</style></head><body>${body}</body></html>`
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value, null, 2))
}

function redirect(res, location) {
  res.writeHead(302, { location })
  res.end()
}

function getCookie(req, name) {
  const cookie = req.headers.cookie ?? ''
  return cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

async function readShadow(path, accessToken) {
  const response = await fetch(`${SHADOWOB_SERVER_URL}${path}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`)
  return response.json()
}

async function writeShadow(path, accessToken, payload) {
  const response = await fetch(`${SHADOWOB_SERVER_URL}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${JSON.stringify(body)}`)
  return body
}

async function exchangeToken(payload) {
  const response = await fetch(`${SHADOWOB_SERVER_URL}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `Token exchange failed: ${response.status}`)
  return body
}

function requireConfig(res) {
  if (CLIENT_ID && CLIENT_SECRET) return true
  res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' })
  res.end(
    html('<h1>Missing OAuth config</h1><p>Set SHADOWOB_CLIENT_ID and SHADOWOB_CLIENT_SECRET.</p>'),
  )
  return false
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
    const sessionId = getCookie(req, 'shadow_sample_session')
    const session = sessionId ? sessions.get(sessionId) : null

    if (url.pathname === '/.well-known/shadow-card.json') {
      return json(res, 200, {
        schemaVersion: 1,
        name: 'Shadow OAuth Sample',
        description: 'Local external app card with iframe handshake and external fallback',
        origin: `http://localhost:${PORT}`,
        entry: `http://localhost:${PORT}/card`,
        avatarUrl: `http://localhost:${PORT}/avatar.svg`,
        iconUrl: `http://localhost:${PORT}/avatar.svg`,
        coverUrl: `http://localhost:${PORT}/cover.svg`,
        permissions: SCOPES,
        fallbackUrl: `http://localhost:${PORT}/`,
      })
    }

    if (url.pathname === '/avatar.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8' })
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#111827"/><circle cx="48" cy="48" r="26" fill="#6ee7b7"/><path d="M34 50h28M48 36v28" stroke="#042f2e" stroke-width="8" stroke-linecap="round"/></svg>',
      )
      return
    }

    if (url.pathname === '/cover.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8' })
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 180"><rect width="640" height="180" fill="#101116"/><path d="M0 140C120 80 200 200 330 116S520 36 640 92v88H0z" fill="#6ee7b7"/><circle cx="506" cy="54" r="28" fill="#a78bfa"/></svg>',
      )
      return
    }

    if (url.pathname === '/login') {
      if (!requireConfig(res)) return
      const state = randomBytes(16).toString('hex')
      const nextSessionId = randomBytes(16).toString('hex')
      sessions.set(nextSessionId, { state })
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPES.join(' '),
        state,
      })
      res.setHeader('set-cookie', `shadow_sample_session=${nextSessionId}; HttpOnly; SameSite=Lax`)
      return redirect(res, `${SHADOWOB_SERVER_URL}/app/oauth/authorize?${params}`)
    }

    if (url.pathname === '/callback') {
      if (!requireConfig(res)) return
      if (!session || url.searchParams.get('state') !== session.state) {
        throw new Error('Invalid OAuth state')
      }
      const code = url.searchParams.get('code')
      if (!code) throw new Error('Missing authorization code')
      const token = await exchangeToken({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      })
      sessions.set(sessionId, { ...session, token })
      return redirect(res, '/')
    }

    if (url.pathname === '/refresh') {
      if (!requireConfig(res)) return
      if (!session?.token?.refresh_token) throw new Error('No refresh token in session')
      const token = await exchangeToken({
        grant_type: 'refresh_token',
        refresh_token: session.token.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      })
      sessions.set(sessionId, { ...session, token })
      return redirect(res, '/')
    }

    if (url.pathname === '/api/summary') {
      if (!session?.token?.access_token) return json(res, 401, { error: 'not_authenticated' })
      const entitlementQuery = new URLSearchParams({
        resourceType: 'external_app',
        resourceId: COMMERCE_RESOURCE_ID,
        capability: 'use',
      })
      const [user, servers] = await Promise.all([
        readShadow('/api/oauth/userinfo', session.token.access_token),
        readShadow('/api/oauth/servers', session.token.access_token),
      ])
      const firstServer = servers[0]
      const channels = firstServer
        ? await readShadow(
            `/api/oauth/servers/${firstServer.id}/channels`,
            session.token.access_token,
          )
        : []
      const commerceAccess = await readShadow(
        `/api/oauth/commerce/entitlements?${entitlementQuery}`,
        session.token.access_token,
      )
      return json(res, 200, {
        user,
        servers,
        channels,
        commerceAccess,
        lastRedemption: session.lastRedemption ?? null,
      })
    }

    if (url.pathname === '/redeem-commerce') {
      if (!session?.token?.access_token) throw new Error('No OAuth session in sample app')
      const result = await writeShadow(
        '/api/oauth/commerce/entitlements/redeem',
        session.token.access_token,
        {
          idempotencyKey: `sample-${Date.now()}-${randomBytes(4).toString('hex')}`,
          resourceType: 'external_app',
          resourceId: COMMERCE_RESOURCE_ID,
          capability: 'use',
          metadata: { source: 'shadow-oauth-card-app' },
        },
      )
      sessions.set(sessionId, { ...session, lastRedemption: result })
      return redirect(res, '/')
    }

    if (url.pathname === '/card') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        html(`<h1>Shadow OAuth Card</h1><p id="status">Waiting for Shadow...</p><pre id="summary"></pre><button id="open">Open externally</button><script>
const status = document.getElementById('status');
const summary = document.getElementById('summary');
window.parent?.postMessage({ type: 'shadow.card.ready', name: 'shadow-oauth-sample' }, '*');
window.addEventListener('message', (event) => {
  if (event.data?.type === 'shadow.card.launch') status.textContent = 'Launched inside Shadow';
});
document.getElementById('open').onclick = () => window.open('/', '_blank', 'noopener');
fetch('/api/summary').then((r) => r.json()).then((data) => {
  if (data?.error === 'not_authenticated') {
    summary.textContent = 'No OAuth session is active for this sample app yet. The card launch handshake still works; open the sample app externally to start a full OAuth login flow.';
    const openButton = document.getElementById('open');
    openButton.textContent = 'Open sample app';
    openButton.onclick = () => window.open('/', '_blank', 'noopener');
    return;
  }
  summary.textContent = JSON.stringify(data, null, 2);
}).catch((error) => { summary.textContent = String(error); });
</script>`),
      )
      return
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      html(
        session?.token
          ? '<h1>Shadow OAuth Sample</h1><p>Authenticated.</p><p><a href="/card">Open card</a> <a href="/refresh">Refresh token</a> <a href="/redeem-commerce">Redeem commerce entitlement</a></p><pre id="summary">Loading...</pre><script>fetch("/api/summary").then(r=>r.json()).then(v=>summary.textContent=JSON.stringify(v,null,2))</script>'
          : '<h1>Shadow OAuth Sample</h1><p><a href="/login">Login with Shadow</a></p>',
      ),
    )
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html(`<h1>Error</h1><pre>${String(error.stack ?? error)}</pre>`))
  }
})

server.listen(PORT, () => {
  console.log(`Shadow OAuth sample listening on http://localhost:${PORT}`)
})
