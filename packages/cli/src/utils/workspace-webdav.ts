import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

export type WorkspaceWebDavClient = {
  createWorkspaceFolder(
    serverId: string,
    data: { name: string; parentId?: string | null },
  ): Promise<Record<string, unknown>>
  deleteWorkspaceFile(serverId: string, fileId: string): Promise<unknown>
  deleteWorkspaceFolder(serverId: string, folderId: string): Promise<unknown>
  downloadWorkspaceFile(
    serverId: string,
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment'; contentRef?: string },
  ): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }>
  getWorkspaceChildren(
    serverId: string,
    parentId?: string | null,
  ): Promise<Record<string, unknown>[]>
  updateWorkspaceFile(
    serverId: string,
    fileId: string,
    data: { name?: string; parentId?: string | null },
  ): Promise<Record<string, unknown>>
  updateWorkspaceFolder(
    serverId: string,
    folderId: string,
    data: { name?: string; parentId?: string | null },
  ): Promise<Record<string, unknown>>
  uploadWorkspaceFile(
    serverId: string,
    file: Blob,
    filename: string,
    parentId?: string,
  ): Promise<Record<string, unknown>>
}

export type WorkspaceWebDavServerOptions = {
  authToken?: string
  maxFileBytes?: number
  maxPropfindNodes?: number
  readOnly?: boolean
  rootId?: string | null
}

export type WebDavListenAddress = {
  host: string
  port: number
}

type WorkspaceWebDavNode = {
  id: string
  kind: 'dir' | 'file'
  name: string
  contentRef?: string | null
  createdAt?: string | null
  mime?: string | null
  parentId?: string | null
  path?: string | null
  sizeBytes?: number | null
  updatedAt?: string | null
}

type ResolvedWebDavPath = {
  isRoot: boolean
  node: WorkspaceWebDavNode
  parentId: string | null
  segments: string[]
}

type ParentResolution = {
  name: string
  parentId: string | null
}

const DEFAULT_MAX_FILE_BYTES = 256 * 1024 * 1024
const DEFAULT_MAX_PROPFIND_NODES = 2000
const DEFAULT_LISTEN_HOST = '127.0.0.1'
const DEFAULT_LISTEN_PORT = 8765

class WebDavHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeWorkspaceNode(value: unknown): WorkspaceWebDavNode | null {
  if (!isRecord(value)) return null

  const id = stringValue(value.id)
  const name = stringValue(value.name)
  const rawKind = stringValue(value.kind)
  if (!id || !name || !rawKind) return null

  const kind =
    rawKind === 'dir' || rawKind === 'folder' || rawKind === 'directory'
      ? 'dir'
      : rawKind === 'file'
        ? 'file'
        : null
  if (!kind) return null

  return {
    id,
    kind,
    name,
    contentRef: stringValue(value.contentRef) ?? null,
    createdAt: stringValue(value.createdAt) ?? null,
    mime: stringValue(value.mime) ?? null,
    parentId: stringValue(value.parentId) ?? null,
    path: stringValue(value.path) ?? null,
    sizeBytes: numberValue(value.sizeBytes ?? value.size) ?? null,
    updatedAt: stringValue(value.updatedAt) ?? null,
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function encodeHref(segments: string[], isCollection: boolean): string {
  const encoded = segments.map((segment) => encodeURIComponent(segment)).join('/')
  if (!encoded) return '/'
  return `/${encoded}${isCollection ? '/' : ''}`
}

function parsePathSegments(urlValue: string | undefined): string[] {
  const url = new URL(urlValue ?? '/', 'http://127.0.0.1')
  const segments = url.pathname.split('/').filter(Boolean)
  return segments.map((segment) => {
    const decoded = decodeURIComponent(segment)
    if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/')) {
      throw new WebDavHttpError(400, 'Invalid WebDAV path')
    }
    if (decoded.includes('\0')) throw new WebDavHttpError(400, 'Invalid WebDAV path')
    return decoded
  })
}

function parseDestinationSegments(req: IncomingMessage): string[] {
  const destination = req.headers.destination
  if (!destination || Array.isArray(destination)) {
    throw new WebDavHttpError(400, 'Missing Destination header')
  }
  const base = `http://${req.headers.host ?? '127.0.0.1'}`
  const url = new URL(destination, base)
  return parsePathSegments(url.pathname)
}

function formatHttpDate(value?: string | null): string {
  if (!value) return new Date(0).toUTCString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0).toUTCString() : date.toUTCString()
}

function creationDate(value?: string | null): string {
  if (!value) return new Date(0).toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString()
}

function inferMimeType(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const mimeMap: Record<string, string> = {
    css: 'text/css',
    csv: 'text/csv',
    gif: 'image/gif',
    html: 'text/html',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    js: 'text/javascript',
    json: 'application/json',
    md: 'text/markdown',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    png: 'image/png',
    svg: 'image/svg+xml',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    txt: 'text/plain',
    wav: 'audio/wav',
    webm: 'video/webm',
    webp: 'image/webp',
    xml: 'application/xml',
    zip: 'application/zip',
  }
  return mimeMap[ext] ?? 'application/octet-stream'
}

function safeTokenEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.byteLength === expectedBuffer.byteLength
    ? timingSafeEqual(actualBuffer, expectedBuffer)
    : false
}

function hasValidAuth(req: IncomingMessage, authToken?: string): boolean {
  if (!authToken) return true
  const authorization = req.headers.authorization
  if (!authorization) return false

  const [scheme, rawValue] = authorization.split(/\s+/, 2)
  if (!scheme || !rawValue) return false

  if (scheme.toLowerCase() === 'bearer') {
    return safeTokenEquals(rawValue, authToken)
  }

  if (scheme.toLowerCase() === 'basic') {
    const decoded = Buffer.from(rawValue, 'base64').toString('utf8')
    const password = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded
    return safeTokenEquals(password, authToken)
  }

  return false
}

function sendResponse(
  res: ServerResponse,
  status: number,
  headers: Record<string, string | number> = {},
  body?: string | Buffer,
) {
  const normalizedBody = typeof body === 'string' ? Buffer.from(body) : body
  const nextHeaders: Record<string, string | number> = {
    DAV: '1',
    'MS-Author-Via': 'DAV',
    ...headers,
  }
  if (normalizedBody) nextHeaders['Content-Length'] = normalizedBody.byteLength
  res.writeHead(status, nextHeaders)
  res.end(normalizedBody)
}

function sendAuthChallenge(res: ServerResponse) {
  sendResponse(
    res,
    401,
    {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="shadowob-workspace-webdav"',
    },
    'Authentication required',
  )
}

function sendError(res: ServerResponse, error: unknown) {
  if (error instanceof WebDavHttpError) {
    sendResponse(res, error.status, { 'Content-Type': 'text/plain; charset=utf-8' }, error.message)
    return
  }

  const message = error instanceof Error ? error.message : String(error)
  const statusMatch = message.match(/failed \((\d{3})\)/)
  const status = statusMatch ? Number(statusMatch[1]) : 500
  const safeStatus = status >= 400 && status <= 599 ? status : 500
  sendResponse(res, safeStatus, { 'Content-Type': 'text/plain; charset=utf-8' }, message)
}

async function readRequestBody(req: IncomingMessage, maxFileBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0

  return new Promise((resolve, reject) => {
    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength
      if (total > maxFileBytes) {
        reject(new WebDavHttpError(413, 'WebDAV upload exceeds max file size'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function listChildren(
  client: WorkspaceWebDavClient,
  serverId: string,
  parentId: string | null,
) {
  const children = await client.getWorkspaceChildren(serverId, parentId)
  return children
    .map(normalizeWorkspaceNode)
    .filter((node): node is WorkspaceWebDavNode => Boolean(node))
}

async function resolveWebDavPath(
  client: WorkspaceWebDavClient,
  serverId: string,
  rootId: string | null,
  segments: string[],
): Promise<ResolvedWebDavPath | null> {
  if (segments.length === 0) {
    return {
      isRoot: true,
      node: {
        id: rootId ?? '__shadowob_webdav_root__',
        kind: 'dir',
        name: '',
        parentId: null,
        path: '/',
      },
      parentId: null,
      segments,
    }
  }

  let parentId = rootId
  let parentForResult: string | null = null
  for (const [index, segment] of segments.entries()) {
    const children = await listChildren(client, serverId, parentId)
    const node = children.find((child) => child.name === segment)
    if (!node) return null

    if (index === segments.length - 1) {
      return { isRoot: false, node, parentId: parentForResult, segments }
    }

    if (node.kind !== 'dir') return null
    parentForResult = node.id
    parentId = node.id
  }

  return null
}

async function resolveParent(
  client: WorkspaceWebDavClient,
  serverId: string,
  rootId: string | null,
  segments: string[],
): Promise<ParentResolution> {
  if (segments.length === 0) throw new WebDavHttpError(403, 'Cannot write WebDAV root')
  const name = segments[segments.length - 1]
  if (!name) throw new WebDavHttpError(400, 'Invalid WebDAV path')
  const parentSegments = segments.slice(0, -1)
  const parent = await resolveWebDavPath(client, serverId, rootId, parentSegments)
  if (!parent || parent.node.kind !== 'dir') {
    throw new WebDavHttpError(409, 'Destination parent folder does not exist')
  }
  return {
    name,
    parentId: parent.isRoot ? rootId : parent.node.id,
  }
}

async function findChildByName(
  client: WorkspaceWebDavClient,
  serverId: string,
  parentId: string | null,
  name: string,
) {
  const children = await listChildren(client, serverId, parentId)
  return children.find((child) => child.name === name) ?? null
}

function nodeToPropstat(node: WorkspaceWebDavNode, segments: string[], isRoot: boolean) {
  const isCollection = node.kind === 'dir'
  const href = encodeHref(segments, isCollection)
  const displayName = isRoot ? 'workspace' : node.name
  const size = node.sizeBytes ?? 0
  const mime = node.mime ?? inferMimeType(node.name)
  const etag = `${node.id}:${node.updatedAt ?? ''}:${size}`

  return [
    '<D:response>',
    `<D:href>${xmlEscape(href)}</D:href>`,
    '<D:propstat>',
    '<D:prop>',
    `<D:displayname>${xmlEscape(displayName)}</D:displayname>`,
    `<D:creationdate>${xmlEscape(creationDate(node.createdAt))}</D:creationdate>`,
    `<D:getlastmodified>${xmlEscape(formatHttpDate(node.updatedAt ?? node.createdAt))}</D:getlastmodified>`,
    `<D:getetag>"${xmlEscape(etag)}"</D:getetag>`,
    isCollection ? '<D:resourcetype><D:collection/></D:resourcetype>' : '<D:resourcetype/>',
    isCollection ? '' : `<D:getcontentlength>${size}</D:getcontentlength>`,
    isCollection ? '' : `<D:getcontenttype>${xmlEscape(mime)}</D:getcontenttype>`,
    '</D:prop>',
    '<D:status>HTTP/1.1 200 OK</D:status>',
    '</D:propstat>',
    '</D:response>',
  ].join('')
}

function parseDepth(value: string | string[] | undefined): 0 | 1 | 'infinity' {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === '0') return 0
  if (raw === 'infinity') return 'infinity'
  return 1
}

async function collectPropfindResponses(
  client: WorkspaceWebDavClient,
  serverId: string,
  rootId: string | null,
  resolved: ResolvedWebDavPath,
  depth: 0 | 1 | 'infinity',
  remaining: { count: number; max: number },
): Promise<string[]> {
  if (remaining.count >= remaining.max) {
    throw new WebDavHttpError(507, 'PROPFIND node limit exceeded')
  }
  remaining.count += 1

  const responses = [nodeToPropstat(resolved.node, resolved.segments, resolved.isRoot)]
  if (resolved.node.kind !== 'dir' || depth === 0) return responses

  const childParentId = resolved.isRoot ? rootId : resolved.node.id
  const children = await listChildren(client, serverId, childParentId)
  for (const child of children) {
    const childResolved: ResolvedWebDavPath = {
      isRoot: false,
      node: child,
      parentId: childParentId,
      segments: [...resolved.segments, child.name],
    }
    responses.push(
      ...(await collectPropfindResponses(
        client,
        serverId,
        rootId,
        childResolved,
        depth === 1 ? 0 : 'infinity',
        remaining,
      )),
    )
  }
  return responses
}

async function handlePropfind(
  client: WorkspaceWebDavClient,
  serverId: string,
  options: Required<Pick<WorkspaceWebDavServerOptions, 'maxPropfindNodes'>> &
    Pick<WorkspaceWebDavServerOptions, 'rootId'>,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const segments = parsePathSegments(req.url)
  const rootId = options.rootId ?? null
  const resolved = await resolveWebDavPath(client, serverId, rootId, segments)
  if (!resolved) throw new WebDavHttpError(404, 'WebDAV path not found')

  const responses = await collectPropfindResponses(
    client,
    serverId,
    rootId,
    resolved,
    parseDepth(req.headers.depth),
    { count: 0, max: options.maxPropfindNodes },
  )
  const body = `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses.join('')}</D:multistatus>`
  sendResponse(res, 207, { 'Content-Type': 'application/xml; charset=utf-8' }, body)
}

async function handleGetOrHead(
  client: WorkspaceWebDavClient,
  serverId: string,
  rootId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const resolved = await resolveWebDavPath(client, serverId, rootId, parsePathSegments(req.url))
  if (!resolved) throw new WebDavHttpError(404, 'WebDAV path not found')
  if (resolved.node.kind !== 'file') throw new WebDavHttpError(405, 'Cannot download a folder')

  const contentType = resolved.node.mime ?? inferMimeType(resolved.node.name)
  if (req.method === 'HEAD') {
    sendResponse(res, 200, {
      'Content-Length': resolved.node.sizeBytes ?? 0,
      'Content-Type': contentType,
      'Last-Modified': formatHttpDate(resolved.node.updatedAt ?? resolved.node.createdAt),
    })
    return
  }

  const downloaded = await client.downloadWorkspaceFile(serverId, resolved.node.id, {
    disposition: 'inline',
  })
  const body = Buffer.from(downloaded.buffer)
  sendResponse(
    res,
    200,
    {
      'Content-Disposition': `inline; filename="${downloaded.filename.replace(/"/g, '\\"')}"`,
      'Content-Type': downloaded.contentType || contentType,
      'Last-Modified': formatHttpDate(resolved.node.updatedAt ?? resolved.node.createdAt),
    },
    body,
  )
}

async function handlePut(
  client: WorkspaceWebDavClient,
  serverId: string,
  rootId: string | null,
  maxFileBytes: number,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const segments = parsePathSegments(req.url)
  const parent = await resolveParent(client, serverId, rootId, segments)
  const existing = await findChildByName(client, serverId, parent.parentId, parent.name)
  if (existing?.kind === 'dir') throw new WebDavHttpError(409, 'Cannot overwrite a folder')

  const body = await readRequestBody(req, maxFileBytes)
  const uploadBytes = new Uint8Array(body.byteLength)
  uploadBytes.set(body)
  const file = new Blob([uploadBytes], { type: inferMimeType(parent.name) })

  if (!existing) {
    await client.uploadWorkspaceFile(serverId, file, parent.name, parent.parentId ?? undefined)
    sendResponse(res, 201)
    return
  }

  const uploaded = normalizeWorkspaceNode(
    await client.uploadWorkspaceFile(serverId, file, parent.name, parent.parentId ?? undefined),
  )
  if (!uploaded) throw new WebDavHttpError(502, 'Shadow API returned an invalid upload result')
  await client.deleteWorkspaceFile(serverId, existing.id)
  await client.updateWorkspaceFile(serverId, uploaded.id, {
    name: parent.name,
    parentId: parent.parentId,
  })
  sendResponse(res, 204)
}

async function handleMkcol(
  client: WorkspaceWebDavClient,
  serverId: string,
  rootId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const parent = await resolveParent(client, serverId, rootId, parsePathSegments(req.url))
  const existing = await findChildByName(client, serverId, parent.parentId, parent.name)
  if (existing) throw new WebDavHttpError(405, 'WebDAV collection already exists')
  await client.createWorkspaceFolder(serverId, { name: parent.name, parentId: parent.parentId })
  sendResponse(res, 201)
}

async function handleDelete(
  client: WorkspaceWebDavClient,
  serverId: string,
  rootId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const resolved = await resolveWebDavPath(client, serverId, rootId, parsePathSegments(req.url))
  if (!resolved) throw new WebDavHttpError(404, 'WebDAV path not found')
  if (resolved.isRoot) throw new WebDavHttpError(403, 'Cannot delete WebDAV root')

  if (resolved.node.kind === 'dir') await client.deleteWorkspaceFolder(serverId, resolved.node.id)
  else await client.deleteWorkspaceFile(serverId, resolved.node.id)
  sendResponse(res, 204)
}

async function handleMove(
  client: WorkspaceWebDavClient,
  serverId: string,
  rootId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const source = await resolveWebDavPath(client, serverId, rootId, parsePathSegments(req.url))
  if (!source) throw new WebDavHttpError(404, 'WebDAV path not found')
  if (source.isRoot) throw new WebDavHttpError(403, 'Cannot move WebDAV root')

  const destination = await resolveParent(client, serverId, rootId, parseDestinationSegments(req))
  const existing = await findChildByName(client, serverId, destination.parentId, destination.name)
  const overwrite = req.headers.overwrite !== 'F'

  if (existing && existing.id !== source.node.id) {
    if (!overwrite) throw new WebDavHttpError(412, 'Destination already exists')
    if (existing.kind === 'dir') await client.deleteWorkspaceFolder(serverId, existing.id)
    else await client.deleteWorkspaceFile(serverId, existing.id)
  }

  const update = { name: destination.name, parentId: destination.parentId }
  if (source.node.kind === 'dir') {
    await client.updateWorkspaceFolder(serverId, source.node.id, update)
  } else {
    await client.updateWorkspaceFile(serverId, source.node.id, update)
  }
  sendResponse(res, existing ? 204 : 201)
}

function handleOptions(res: ServerResponse) {
  sendResponse(res, 204, {
    Allow: 'OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, MOVE',
    'Content-Length': 0,
  })
}

function isMutationMethod(method: string) {
  return method === 'PUT' || method === 'DELETE' || method === 'MKCOL' || method === 'MOVE'
}

export function createWorkspaceWebDavHandler(
  client: WorkspaceWebDavClient,
  serverId: string,
  options: WorkspaceWebDavServerOptions = {},
) {
  const rootId = options.rootId ?? null
  const readOnly = Boolean(options.readOnly)
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const maxPropfindNodes = options.maxPropfindNodes ?? DEFAULT_MAX_PROPFIND_NODES

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!hasValidAuth(req, options.authToken)) {
        sendAuthChallenge(res)
        return
      }

      const method = req.method ?? 'GET'
      if (readOnly && isMutationMethod(method)) {
        throw new WebDavHttpError(403, 'WebDAV server is read-only')
      }

      switch (method) {
        case 'OPTIONS':
          handleOptions(res)
          return
        case 'PROPFIND':
          await handlePropfind(client, serverId, { maxPropfindNodes, rootId }, req, res)
          return
        case 'GET':
        case 'HEAD':
          await handleGetOrHead(client, serverId, rootId, req, res)
          return
        case 'PUT':
          await handlePut(client, serverId, rootId, maxFileBytes, req, res)
          return
        case 'MKCOL':
          await handleMkcol(client, serverId, rootId, req, res)
          return
        case 'DELETE':
          await handleDelete(client, serverId, rootId, req, res)
          return
        case 'MOVE':
          await handleMove(client, serverId, rootId, req, res)
          return
        default:
          throw new WebDavHttpError(405, `Unsupported WebDAV method: ${method}`)
      }
    } catch (error) {
      sendError(res, error)
    }
  }
}

export function createWorkspaceWebDavServer(
  client: WorkspaceWebDavClient,
  serverId: string,
  options: WorkspaceWebDavServerOptions = {},
): Server {
  return createServer(createWorkspaceWebDavHandler(client, serverId, options))
}

export function parseWebDavListen(value?: string): WebDavListenAddress {
  const raw = value?.trim() || `${DEFAULT_LISTEN_HOST}:${DEFAULT_LISTEN_PORT}`
  if (/^\d+$/.test(raw)) return { host: DEFAULT_LISTEN_HOST, port: Number(raw) }

  const index = raw.lastIndexOf(':')
  if (index <= 0 || index === raw.length - 1) {
    throw new Error('Invalid --listen value. Expected <host>:<port> or <port>.')
  }

  const host = raw.slice(0, index)
  const port = Number(raw.slice(index + 1))
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid --listen port. Expected a value between 1 and 65535.')
  }
  return { host, port }
}

export function isLoopbackWebDavHost(host: string) {
  const normalized = host.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === '127.0.0.1' ||
    normalized.startsWith('127.')
  )
}
