#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const proxyHost = process.env.DEV_FRONTEND_HOST?.trim()
const devServerHost = process.env.DEV_FRONTEND_TARGET_HOST?.trim() || '127.0.0.1'
const publicHost = process.env.DEV_FRONTEND_PUBLIC_HOST?.trim() || 'localhost'
const publicPort = parsePortEnv('DEV_FRONTEND_PORT', 3000)
const webPort = parsePortEnv('DEV_FRONTEND_WEB_PORT', 3003)
const websitePort = parsePortEnv('DEV_FRONTEND_WEBSITE_PORT', 3004)
const webHmrPath = process.env.DEV_FRONTEND_WEB_HMR_PATH?.trim()
const websiteHmrPath = process.env.DEV_FRONTEND_WEBSITE_HMR_PATH?.trim()

const publicOrigin = `http://${publicHost}:${publicPort}`
const apiTarget = parseTarget(process.env.SHADOWOB_DEV_API_BASE || 'http://127.0.0.1:3002')
const webTarget = parseTarget(`http://${devServerHost}:${webPort}`)
const websiteTarget = parseTarget(`http://${devServerHost}:${websitePort}`)

const children = new Set()
let shuttingDown = false

const proxy = createServer((request, response) => {
  const route = routeRequest(request.url || '/')

  if (route.kind === 'redirect') {
    response.writeHead(302, { location: route.location })
    response.end()
    return
  }

  proxyHttp(request, response, route.target)
})

proxy.on('upgrade', (request, socket, head) => {
  const target = routeUpgrade(request.url || '/')
  proxyWebSocket(request, socket, head, target)
})

proxy.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    log(`port ${publicPort} is already in use; stop the existing frontend before running this`)
  } else {
    log(`proxy failed: ${error.message}`)
  }
  shutdown(1)
})

listen(publicPort, proxyHost, () => {
  log(`frontend proxy: ${publicOrigin}`)
  log(`website -> ${formatTarget(websiteTarget)}`)
  log(`web app -> ${formatTarget(webTarget)}/app`)
  log(`api/socket -> ${formatTarget(apiTarget)}`)

  startFrontend('website', path.join(rootDir, 'website'), 'rspress', [
    'dev',
    '--host',
    devServerHost,
    '--port',
    String(websitePort),
  ])
  startFrontend('web', path.join(rootDir, 'apps/web'), 'rsbuild', [
    'dev',
    '--host',
    devServerHost,
    '--port',
    String(webPort),
  ])
})

process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(143))

function listen(port, host, onListening) {
  if (host) {
    proxy.listen(port, host, onListening)
    return
  }
  proxy.listen(port, onListening)
}

function parsePortEnv(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  const port = Number.parseInt(raw, 10)
  if (Number.isInteger(port) && port > 0 && port < 65536) return port
  throw new Error(`${name} must be a valid TCP port, got ${raw}`)
}

function parseTarget(value) {
  const target = new URL(value)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error(`unsupported proxy target protocol: ${target.protocol}`)
  }
  if (!target.port) {
    target.port = target.protocol === 'https:' ? '443' : '80'
  }
  return target
}

function formatTarget(target) {
  return `${target.protocol}//${target.hostname}:${target.port}`
}

function binPath(cwd, binName) {
  const executable = process.platform === 'win32' ? `${binName}.cmd` : binName
  return path.join(cwd, 'node_modules', '.bin', executable)
}

function hmrHost() {
  return devServerHost === '0.0.0.0' || devServerHost === '::' ? publicHost : devServerHost
}

function hmrPath(name) {
  return name === 'web' ? webHmrPath : websiteHmrPath
}

function startFrontend(name, cwd, binName, args) {
  const clientHmrPath = hmrPath(name)
  const child = spawn(binPath(cwd, binName), args, {
    cwd,
    env: {
      ...process.env,
      PUBLIC_APP_BASE_URL: process.env.PUBLIC_APP_BASE_URL || publicOrigin,
      SHADOWOB_DEV_API_BASE: process.env.SHADOWOB_DEV_API_BASE || formatTarget(apiTarget),
      SHADOWOB_DEV_HMR_PORT: String(name === 'web' ? webPort : websitePort),
      SHADOWOB_DEV_HMR_HOST: hmrHost(),
      SHADOWOB_DEV_HMR_PROTOCOL: 'ws',
      ...(clientHmrPath ? { SHADOWOB_DEV_HMR_PATH: clientHmrPath } : {}),
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  children.add(child)
  pipePrefixed(child.stdout, name, process.stdout)
  pipePrefixed(child.stderr, name, process.stderr)

  child.on('error', (error) => {
    log(`${name} failed to start: ${error.message}`)
    shutdown(1)
  })

  child.on('exit', (code, signal) => {
    children.delete(child)
    if (shuttingDown) return
    log(`${name} exited with ${signal || `code ${code ?? 0}`}`)
    shutdown(code || 1)
  })
}

function pipePrefixed(stream, name, output) {
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      output.write(`[${name}] ${line}\n`)
    }
  })
  stream.on('end', () => {
    if (buffer) output.write(`[${name}] ${buffer}\n`)
  })
}

function routeRequest(rawUrl) {
  const pathname = pathnameFromUrl(rawUrl)

  if (pathname === '/oauth/authorize') {
    return {
      kind: 'redirect',
      location: `/app/oauth/authorize${queryFromUrl(rawUrl)}`,
    }
  }

  if (isApiPath(pathname)) return { kind: 'proxy', target: apiTarget }
  if (isWebPath(pathname)) return { kind: 'proxy', target: webTarget }
  return { kind: 'proxy', target: websiteTarget }
}

function routeUpgrade(rawUrl) {
  const pathname = pathnameFromUrl(rawUrl)
  if (isApiPath(pathname)) return apiTarget
  if (webHmrPath && pathname === webHmrPath) return webTarget
  if (websiteHmrPath && pathname === websiteHmrPath) return websiteTarget
  if (isWebPath(pathname)) return webTarget
  return websiteTarget
}

function pathnameFromUrl(rawUrl) {
  return new URL(rawUrl, publicOrigin).pathname
}

function queryFromUrl(rawUrl) {
  return new URL(rawUrl, publicOrigin).search
}

function isWebPath(pathname) {
  return pathname === '/app' || pathname.startsWith('/app/')
}

function isApiPath(pathname) {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/desktop' ||
    pathname.startsWith('/desktop/') ||
    pathname === '/socket.io' ||
    pathname.startsWith('/socket.io/') ||
    pathname === '/shadow' ||
    pathname.startsWith('/shadow/') ||
    pathname === '/.well-known' ||
    pathname.startsWith('/.well-known/')
  )
}

function proxyHttp(clientRequest, clientResponse, target) {
  const proxyRequest = requestForTarget(target)(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: proxyRequestHeaders(clientRequest),
    },
    (proxyResponse) => {
      clientResponse.writeHead(
        proxyResponse.statusCode || 502,
        proxyResponse.statusMessage,
        proxyResponseHeaders(proxyResponse.headers, target),
      )
      proxyResponse.pipe(clientResponse)
    },
  )

  proxyRequest.on('error', (error) => {
    if (clientResponse.headersSent) {
      clientResponse.destroy(error)
      return
    }
    clientResponse.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    clientResponse.end(
      `Dev frontend proxy could not reach ${formatTarget(target)}.\n${error.message}\n`,
    )
  })

  clientRequest.on('aborted', () => proxyRequest.destroy())
  clientRequest.pipe(proxyRequest)
}

function requestForTarget(target) {
  return target.protocol === 'https:' ? httpsRequest : httpRequest
}

function proxyRequestHeaders(clientRequest) {
  const headers = { ...clientRequest.headers }
  const forwardedFor = appendHeader(
    headers['x-forwarded-for'],
    clientRequest.socket.remoteAddress || undefined,
  )

  headers.host = clientRequest.headers.host || `${publicHost}:${publicPort}`
  headers['x-forwarded-for'] = forwardedFor
  headers['x-forwarded-host'] = clientRequest.headers.host || `${publicHost}:${publicPort}`
  headers['x-forwarded-proto'] = 'http'

  return headers
}

function appendHeader(value, next) {
  if (!next) return value || ''
  if (Array.isArray(value)) return [...value, next].join(', ')
  return value ? `${value}, ${next}` : next
}

function proxyResponseHeaders(headers, target) {
  const nextHeaders = { ...headers }
  if (typeof nextHeaders.location === 'string') {
    nextHeaders.location = rewriteLocation(nextHeaders.location, target)
  }
  return nextHeaders
}

function rewriteLocation(location, target) {
  try {
    const parsed = new URL(location, target)
    if (parsed.origin !== target.origin) return location
    return `${publicOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return location
  }
}

function proxyWebSocket(clientRequest, clientSocket, head, target) {
  const upstreamSocket = net.connect(Number(target.port), target.hostname, () => {
    upstreamSocket.write(
      `${clientRequest.method} ${clientRequest.url} HTTP/${clientRequest.httpVersion}\r\n`,
    )
    for (const [key, value] of Object.entries(proxyRequestHeaders(clientRequest))) {
      if (Array.isArray(value)) {
        for (const entry of value) upstreamSocket.write(`${key}: ${entry}\r\n`)
      } else if (value !== undefined) {
        upstreamSocket.write(`${key}: ${value}\r\n`)
      }
    }
    upstreamSocket.write('\r\n')
    if (head.length > 0) upstreamSocket.write(head)
    upstreamSocket.pipe(clientSocket)
    clientSocket.pipe(upstreamSocket)
  })

  upstreamSocket.on('error', () => {
    if (!clientSocket.destroyed) {
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
    }
  })
  clientSocket.on('error', () => upstreamSocket.destroy())
  upstreamSocket.on('close', () => clientSocket.destroy())
  clientSocket.on('close', () => upstreamSocket.destroy())
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  process.exitCode = code

  proxy.close()
  for (const child of children) {
    child.kill('SIGTERM')
  }

  setTimeout(() => {
    for (const child of children) {
      child.kill('SIGKILL')
    }
    process.exit(code)
  }, 5000).unref()
}

function log(message) {
  console.log(`[dev:frontend] ${message}`)
}
