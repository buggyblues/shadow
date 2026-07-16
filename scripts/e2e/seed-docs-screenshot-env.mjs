import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createDocsDesktopLayout,
  createDocsScreenshotFixture,
  createDocsScreenshotFixtures,
  LEGACY_DOCS_SCREENSHOT_FILE_NAMES,
} from './docs-screenshot-faker.mjs'

const origin = (process.env.E2E_ORIGIN ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const appBaseUrl = (process.env.E2E_APP_BASE_URL ?? `${origin}/app/`).replace(/([^/])$/, '$1/')
const sessionPath = process.env.E2E_SESSION_PATH
  ? path.resolve(process.env.E2E_SESSION_PATH)
  : path.resolve(process.cwd(), '.tmp/e2e/docs-screenshot-session.json')
const screenshotDir = process.env.E2E_SCREENSHOT_DIR
  ? path.resolve(process.env.E2E_SCREENSHOT_DIR)
  : path.resolve(process.cwd(), 'docs/e2e/screenshots')
const seed = process.env.DOCS_SCREENSHOT_SEED ?? 'shadow-docs-v1'
const fixtures = createDocsScreenshotFixtures(seed)
let fixture = fixtures[0] ?? createDocsScreenshotFixture(seed)
const websitePublicDir = path.resolve(process.cwd(), 'website/docs/public')
const mediaUploadCache = new Map()
const WORKSPACE_ASSET_FOLDER_NAME = 'Wallpapers'

const admin = {
  email: process.env.ADMIN_EMAIL ?? 'admin@shadowob.app',
  password: process.env.ADMIN_PASSWORD ?? 'admin123456',
}

let cachedAdminSession = null

function imageMimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.avif') return 'image/avif'
  return 'application/octet-stream'
}

function resolveWebsiteAsset(assetPath) {
  if (!assetPath) return null
  const normalized = String(assetPath).replace(/^\/+/, '')
  const relativePath = normalized.startsWith('website/docs/public/')
    ? normalized.slice('website/docs/public/'.length)
    : normalized
  const fullPath = path.resolve(websitePublicDir, relativePath)
  const relativeToPublic = path.relative(websitePublicDir, fullPath)
  if (relativeToPublic.startsWith('..') || path.isAbsolute(relativeToPublic)) {
    throw new Error(`Docs screenshot asset must live under website/docs/public: ${assetPath}`)
  }
  return {
    fullPath,
    name: path.basename(relativePath),
    mime: imageMimeForPath(fullPath),
  }
}

async function readWebsiteAssetBlob(assetPath, nameOverride) {
  const asset = resolveWebsiteAsset(assetPath)
  if (!asset) return null
  const buffer = await fs.readFile(asset.fullPath)
  return {
    name: nameOverride ?? asset.name,
    mime: asset.mime,
    blob: new Blob([buffer], { type: asset.mime }),
  }
}

async function waitForAppReady() {
  const startedAt = Date.now()
  const timeoutMs = Number(process.env.E2E_READY_TIMEOUT_MS ?? 180_000)
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/api/servers/discover`)
      if (response.status < 500) return
      lastError = new Error(`Unexpected status ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }

  throw new Error(
    `Timed out waiting for ${origin}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

function parseResponseText(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function absoluteOriginUrl(value) {
  if (!value) return value
  return new URL(value, origin).toString()
}

async function requestJson(url, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${origin}${url}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = parseResponseText(await response.text())
  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.error ?? data.message)) ||
      `${response.status} ${response.statusText}`
    const error = new Error(message)
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}

async function requestFormData(url, { token, formData }) {
  const response = await fetch(`${origin}${url}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  })
  const data = parseResponseText(await response.text())
  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.error ?? data.message)) ||
      `${response.status} ${response.statusText}`
    const error = new Error(message)
    error.status = response.status
    error.payload = data
    throw error
  }
  return data
}

async function uploadMediaAsset(token, assetPath, { kind, name } = {}) {
  if (!assetPath) return null
  const cacheKey = `${token}:${kind ?? 'image'}:${assetPath}:${name ?? ''}`
  if (mediaUploadCache.has(cacheKey)) return mediaUploadCache.get(cacheKey)

  const asset = await readWebsiteAssetBlob(assetPath, name)
  if (!asset) return null
  const formData = new FormData()
  formData.set('file', asset.blob, asset.name)
  if (kind) formData.set('kind', kind)
  const uploaded = await requestFormData('/api/media/upload', { token, formData })
  mediaUploadCache.set(cacheKey, uploaded)
  return uploaded
}

async function login(email, password) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

async function register({ email, password, displayName, inviteCode }) {
  return requestJson('/api/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      displayName,
      ...(inviteCode ? { inviteCode } : {}),
    },
  })
}

async function adminSession() {
  if (!cachedAdminSession) {
    cachedAdminSession = await login(admin.email, admin.password)
  }
  return cachedAdminSession
}

async function createInvite(note) {
  const session = await adminSession()
  const result = await requestJson('/api/invite-codes', {
    method: 'POST',
    token: session.accessToken,
    body: { count: 1, note },
  })
  return Array.isArray(result) ? result[0] : result
}

async function ensureUserAccount(user, role) {
  let session = null
  try {
    session = await login(user.email, user.password)
  } catch (error) {
    if (error.status !== 401) throw error
  }

  if (!session) {
    const invite = await createInvite(`Docs screenshots ${role}: ${user.name}`)
    session = await register({
      email: user.email,
      password: user.password,
      displayName: user.name,
      inviteCode: invite?.code,
    })
  }

  const avatarUpload = await uploadMediaAsset(session.accessToken, user.avatarAsset, {
    kind: 'avatar',
  })
  const avatarUrl = avatarUpload?.url ?? user.avatarUrl

  await requestJson('/api/auth/me', {
    method: 'PATCH',
    token: session.accessToken,
    body: {
      displayName: user.name,
      avatarUrl,
    },
  })

  return {
    ...user,
    avatarUrl: avatarUpload?.avatarUrl ?? avatarUrl,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  }
}

function membershipEntriesToServers(entries) {
  return Array.isArray(entries) ? entries.map((item) => item.server ?? item) : []
}

async function redeemMemberInvite(token, note) {
  const invite = await createInvite(note)
  if (!invite?.code) throw new Error('Admin invite creation did not return a code')
  await requestJson('/api/membership/redeem-invite', {
    method: 'POST',
    token,
    body: { code: invite.code },
  })
}

async function fixtureServerWithUploadedAssets(owner) {
  const [iconUpload, bannerUpload] = await Promise.all([
    uploadMediaAsset(owner.accessToken, fixture.server.iconAsset, { kind: 'avatar' }),
    uploadMediaAsset(owner.accessToken, fixture.server.bannerAsset),
  ])
  const server = { ...fixture.server }
  delete server.iconAsset
  delete server.bannerAsset
  return {
    ...server,
    iconUrl: iconUpload?.url ?? server.iconUrl,
    bannerUrl: bannerUpload?.url ?? server.bannerUrl,
  }
}

async function ensureServer(owner) {
  const desiredServer = await fixtureServerWithUploadedAssets(owner)
  const memberships = await requestJson('/api/servers', { token: owner.accessToken })
  let server = membershipEntriesToServers(memberships).find(
    (item) => item.slug === desiredServer.slug || item.name === desiredServer.name,
  )

  if (!server) {
    try {
      server = await requestJson('/api/servers', {
        method: 'POST',
        token: owner.accessToken,
        body: desiredServer,
      })
    } catch (error) {
      if (error.status !== 403) throw error
      await redeemMemberInvite(owner.accessToken, 'Docs screenshots owner membership')
      server = await requestJson('/api/servers', {
        method: 'POST',
        token: owner.accessToken,
        body: desiredServer,
      })
    }
  }

  const serverKey = server.slug ?? server.id
  const patched = await requestJson(`/api/servers/${serverKey}`, {
    method: 'PATCH',
    token: owner.accessToken,
    body: {
      name: desiredServer.name,
      description: desiredServer.description,
      slug: desiredServer.slug,
      iconUrl: desiredServer.iconUrl,
      bannerUrl: desiredServer.bannerUrl,
      isPublic: true,
    },
  })

  return requestJson(`/api/servers/${patched.slug ?? patched.id}`, { token: owner.accessToken })
}

async function ensureServerMembership(user, server) {
  if (!server.inviteCode) return
  try {
    await requestJson(`/api/servers/${server.slug ?? server.id}/join`, {
      method: 'POST',
      token: user.accessToken,
      body: { inviteCode: server.inviteCode },
    })
  } catch (error) {
    if (error.status !== 409) throw error
  }
}

async function ensureChannels(owner, server) {
  const serverKey = server.slug ?? server.id
  let existing = await requestJson(`/api/servers/${serverKey}/channels`, {
    token: owner.accessToken,
  })
  const ensured = {}

  for (const channel of fixture.channels) {
    let record = existing.find((item) => item.name === channel.name)
    if (!record && channel.name !== 'general') {
      record = await requestJson(`/api/servers/${serverKey}/channels`, {
        method: 'POST',
        token: owner.accessToken,
        body: {
          name: channel.name,
          type: channel.type,
          topic: channel.topic,
        },
      })
      existing = [...existing, record]
    }
    if (!record && channel.name === 'general') {
      record = existing.find((item) => item.name === 'general')
    }
    if (!record) throw new Error(`Unable to ensure channel ${channel.name}`)
    ensured[channel.key] = record
  }

  return ensured
}

function flattenWorkspaceNodes(nodes) {
  return nodes.flatMap((node) => [node, ...flattenWorkspaceNodes(node.children ?? [])])
}

async function ensureWorkspaceAssetFolder(owner, server) {
  const tree = await requestJson(`/api/servers/${server.slug ?? server.id}/workspace/tree`, {
    token: owner.accessToken,
  })
  const existing = flattenWorkspaceNodes(Array.isArray(tree) ? tree : []).find(
    (node) =>
      node.kind === 'dir' && node.parentId === null && node.name === WORKSPACE_ASSET_FOLDER_NAME,
  )
  if (existing) return existing

  return requestJson(`/api/servers/${server.slug ?? server.id}/workspace/folders`, {
    method: 'POST',
    token: owner.accessToken,
    body: { parentId: null, name: WORKSPACE_ASSET_FOLDER_NAME },
  })
}

async function findWorkspaceFiles(owner, server, name, { parentId } = {}) {
  const query = new URLSearchParams({ searchText: name })
  if (parentId !== undefined) query.set('parentId', parentId ?? '')
  const files = await requestJson(
    `/api/servers/${server.slug ?? server.id}/workspace/files/search?${query}`,
    { token: owner.accessToken },
  )
  return Array.isArray(files) ? files.filter((item) => item.name === name) : []
}

async function findWorkspaceFile(owner, server, name, options) {
  return (await findWorkspaceFiles(owner, server, name, options))[0] ?? null
}

async function searchWorkspaceFiles(owner, server, searchText) {
  const query = new URLSearchParams({ searchText })
  const files = await requestJson(
    `/api/servers/${server.slug ?? server.id}/workspace/files/search?${query}`,
    { token: owner.accessToken },
  )
  return Array.isArray(files) ? files : []
}

async function deleteWorkspaceFile(owner, server, file) {
  if (!file?.id) return
  try {
    await requestJson(
      `/api/servers/${server.slug ?? server.id}/workspace/files/${encodeURIComponent(file.id)}`,
      {
        method: 'DELETE',
        token: owner.accessToken,
      },
    )
  } catch (error) {
    if (error.status !== 404) throw error
  }
}

async function uploadWorkspaceFile(
  owner,
  server,
  { name, mime, content },
  { replace = false, parentId } = {},
) {
  const existingFiles = await findWorkspaceFiles(owner, server, name)
  if (replace)
    await Promise.all(existingFiles.map((file) => deleteWorkspaceFile(owner, server, file)))
  const existing = !replace
    ? parentId === undefined
      ? existingFiles[0]
      : existingFiles.find((file) => file.parentId === parentId)
    : null
  if (existing) return existing

  const formData = new FormData()
  formData.set('file', new Blob([content], { type: mime }), name)
  if (parentId) formData.set('parentId', parentId)
  return requestFormData(`/api/servers/${server.slug ?? server.id}/workspace/upload`, {
    token: owner.accessToken,
    formData,
  })
}

async function uploadWorkspaceBlob(
  owner,
  server,
  { name, mime, blob },
  { replace = false, parentId } = {},
) {
  const existingFiles = await findWorkspaceFiles(owner, server, name)
  if (replace)
    await Promise.all(existingFiles.map((file) => deleteWorkspaceFile(owner, server, file)))
  const existing = !replace
    ? parentId === undefined
      ? existingFiles[0]
      : existingFiles.find((file) => file.parentId === parentId)
    : null
  if (existing) return existing

  const formData = new FormData()
  formData.set('file', blob, name)
  if (parentId) formData.set('parentId', parentId)
  return requestFormData(`/api/servers/${server.slug ?? server.id}/workspace/upload`, {
    token: owner.accessToken,
    formData,
  })
}

async function uploadRemoteWorkspaceImage(
  owner,
  server,
  { name, url },
  { replace = false, parentId } = {},
) {
  const existingFiles = await findWorkspaceFiles(owner, server, name)
  if (replace)
    await Promise.all(existingFiles.map((file) => deleteWorkspaceFile(owner, server, file)))
  const existing = !replace
    ? parentId === undefined
      ? existingFiles[0]
      : existingFiles.find((file) => file.parentId === parentId)
    : null
  if (existing) return existing

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch docs screenshot image ${url}: ${response.status}`)
  }
  const mime = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
  const blob = new Blob([await response.arrayBuffer()], { type: mime })
  return uploadWorkspaceBlob(owner, server, { name, mime, blob }, { parentId })
}

async function uploadLocalWorkspaceImage(
  owner,
  server,
  { name, asset },
  { replace = false, parentId } = {},
) {
  const localImage = await readWebsiteAssetBlob(asset, name)
  if (!localImage) return null
  return uploadWorkspaceBlob(owner, server, localImage, { replace, parentId })
}

async function ensureWorkspaceFiles(owner, server) {
  const markdownFiles = []
  for (const file of fixture.files) {
    markdownFiles.push(await uploadWorkspaceFile(owner, server, file, { replace: true }))
  }

  const assetFolder = await ensureWorkspaceAssetFolder(owner, server)
  const staleRootAssetPrefixes = [
    `docs-${fixture.scenario.key}-wallpaper-${fixture.hash}`,
    `docs-${fixture.scenario.key}-reference-${fixture.hash}`,
  ]
  const staleRootAssets = (
    await Promise.all(
      staleRootAssetPrefixes.map((prefix) => searchWorkspaceFiles(owner, server, prefix)),
    )
  )
    .flat()
    .filter(
      (file) =>
        file.parentId === null &&
        staleRootAssetPrefixes.some((prefix) => file.name.startsWith(prefix)),
    )
  await Promise.all(staleRootAssets.map((file) => deleteWorkspaceFile(owner, server, file)))

  const wallpaper = fixture.media.wallpaperAsset
    ? await uploadLocalWorkspaceImage(
        owner,
        server,
        {
          name: fixture.media.wallpaperName,
          asset: fixture.media.wallpaperAsset,
        },
        { replace: true, parentId: assetFolder.id },
      )
    : await uploadRemoteWorkspaceImage(
        owner,
        server,
        {
          name: fixture.media.wallpaperName,
          url: fixture.media.wallpaperUrl,
        },
        { replace: true, parentId: assetFolder.id },
      )
  const workspacePhoto = fixture.media.workspacePhotoAsset
    ? await uploadLocalWorkspaceImage(
        owner,
        server,
        {
          name: fixture.media.workspacePhotoName,
          asset: fixture.media.workspacePhotoAsset,
        },
        { replace: true, parentId: assetFolder.id },
      )
    : null
  if (!wallpaper) throw new Error('Docs screenshot wallpaper upload failed')
  if (fixture.media.workspacePhotoAsset && !workspacePhoto) {
    throw new Error('Docs screenshot workspace photo upload failed')
  }
  const legacyGeneratedFiles = (
    await Promise.all([
      findWorkspaceFile(owner, server, `docs-wallpaper-${fixture.hash}.html`),
      findWorkspaceFile(owner, server, `docs-os-sketch-${fixture.hash}.svg`),
    ])
  ).filter(Boolean)
  const legacyMarkdownFiles = (
    await Promise.all(
      LEGACY_DOCS_SCREENSHOT_FILE_NAMES.map((name) => findWorkspaceFile(owner, server, name)),
    )
  ).filter(Boolean)

  await requestJson(`/api/servers/${server.slug ?? server.id}`, {
    method: 'PATCH',
    token: owner.accessToken,
    body: {
      wallpaperType: 'image',
      wallpaperWorkspaceFileId: wallpaper.id,
      wallpaperInteractive: false,
    },
  })

  return {
    markdownFiles,
    assetFolder,
    wallpaper,
    allFiles: [
      ...markdownFiles,
      assetFolder,
      wallpaper,
      ...(workspacePhoto ? [workspacePhoto] : []),
      ...legacyGeneratedFiles,
      ...legacyMarkdownFiles,
    ],
  }
}

async function ensureAgents(owner, server) {
  const existingAgents = await requestJson('/api/agents', { token: owner.accessToken })
  const ensured = []

  for (const agent of fixture.agents) {
    const avatarUpload = await uploadMediaAsset(owner.accessToken, agent.avatarAsset, {
      kind: 'avatar',
    })
    const agentInput = { ...agent, avatarUrl: avatarUpload?.url ?? agent.avatarUrl }
    delete agentInput.avatarAsset
    delete agentInput.avatarAssetPublicPath
    let record = existingAgents.find(
      (item) =>
        item.botUser?.username === agentInput.username ||
        item.botUser?.displayName === agentInput.name,
    )
    if (!record) {
      record = await requestJson('/api/agents', {
        method: 'POST',
        token: owner.accessToken,
        body: agentInput,
      })
    } else {
      record = await requestJson(`/api/agents/${record.id}`, {
        method: 'PATCH',
        token: owner.accessToken,
        body: agentInput,
      })
    }
    ensured.push(record)
  }

  for (const agent of ensured) {
    try {
      await requestJson(`/api/servers/${server.slug ?? server.id}/agents`, {
        method: 'POST',
        token: owner.accessToken,
        body: { agentIds: [agent.id] },
      })
    } catch (error) {
      if (error.status !== 409) throw error
    }
  }

  return ensured
}

async function ensureShop(owner, server) {
  const categories = await requestJson(`/api/servers/${server.slug ?? server.id}/shop/categories`, {
    token: owner.accessToken,
  })
  let category = categories.find((item) => item.slug === fixture.shop.category.slug)
  if (!category) {
    category = await requestJson(`/api/servers/${server.slug ?? server.id}/shop/categories`, {
      method: 'POST',
      token: owner.accessToken,
      body: {
        name: fixture.shop.category.name,
        slug: fixture.shop.category.slug,
        position: 0,
      },
    })
  }

  const productResult = await requestJson(
    `/api/servers/${server.slug ?? server.id}/shop/products`,
    {
      token: owner.accessToken,
    },
  )
  const products = Array.isArray(productResult) ? productResult : (productResult.products ?? [])
  const ensuredProducts = []

  for (const product of fixture.shop.products) {
    let record = products.find((item) => item.slug === product.slug)
    if (!record) {
      record = await requestJson(`/api/servers/${server.slug ?? server.id}/shop/products`, {
        method: 'POST',
        token: owner.accessToken,
        body: {
          ...product,
          categoryId: category.id,
        },
      })
    }
    ensuredProducts.push(record)
  }

  return { category, products: ensuredProducts }
}

async function ensureSpaceApps(owner, server) {
  const ensured = []
  const serverKey = server.slug ?? server.id

  for (const app of fixture.spaceApps ?? []) {
    const iconUpload = await uploadMediaAsset(owner.accessToken, app.iconAsset, { kind: 'avatar' })
    const manifest = {
      ...app.manifest,
      iconUrl: absoluteOriginUrl(iconUpload?.avatarUrl ?? app.manifest.iconUrl),
    }
    const record = await requestJson(`/api/servers/${serverKey}/space-apps`, {
      method: 'POST',
      token: owner.accessToken,
      body: { manifest },
    })
    ensured.push(record)
  }

  return ensured
}

async function ensureCloudComputer(owner) {
  const list = await requestJson('/api/cloud-computers?includeHistory=1&limit=100&offset=0', {
    token: owner.accessToken,
  })
  const existing = Array.isArray(list)
    ? list.find(
        (item) =>
          item.name === fixture.cloudComputer.name &&
          !['destroyed', 'deleted'].includes(String(item.status ?? '').toLowerCase()),
      )
    : null

  if (existing) return existing

  return requestJson('/api/cloud-computers', {
    method: 'POST',
    token: owner.accessToken,
    body: {
      name: fixture.cloudComputer.name,
    },
  })
}

async function ensureBuddyInboxes(owner, server, agents) {
  const ensured = []
  const serverKey = server.slug ?? server.id

  for (const [index, agent] of agents.slice(0, 2).entries()) {
    const result = await requestJson(`/api/servers/${serverKey}/inboxes/${agent.id}`, {
      method: 'POST',
      token: owner.accessToken,
    })
    ensured.push(result)

    const channel = result.channel
    if (!channel?.id || index > 0) continue

    const title = fixture.inboxTask.title
    const existing = messageList(
      await requestJson(`/api/channels/${channel.id}/messages?limit=100`, {
        token: owner.accessToken,
      }),
    )
    const hasTask = existing.some((message) => JSON.stringify(message).includes(title))
    if (hasTask) continue

    await requestJson(`/api/servers/${serverKey}/inboxes/${agent.id}/tasks`, {
      method: 'POST',
      token: owner.accessToken,
      body: {
        title,
        body: fixture.inboxTask.body,
        priority: 'normal',
        tags: fixture.inboxTask.tags,
        idempotencyKey: `docs:${fixture.hash}:${fixture.scenario.key}:handoff:${agent.id}`,
        source: {
          kind: 'docs_screenshot_seed',
          scenario: fixture.scenario.name,
        },
        privacy: {
          dataClass: 'server-private',
        },
      },
    })
  }

  return ensured
}

function sessionForMessageAuthor(author, sessions) {
  if (author === 'owner') return sessions.owner
  const teammateMatch = author.match(/^teammate:(\d+)$/)
  if (teammateMatch) {
    return sessions.teammates[Number(teammateMatch[1])]
  }
  return sessions.owner
}

function messageList(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.messages)) return result.messages
  if (Array.isArray(result?.items)) return result.items
  return []
}

async function ensureMessages(sessions, channels) {
  for (const message of fixture.messages) {
    const channel = channels[message.channelKey]
    if (!channel) continue
    const author = sessionForMessageAuthor(message.author, sessions)
    if (!author) continue
    const existing = messageList(
      await requestJson(`/api/channels/${channel.id}/messages?limit=100`, {
        token: author.accessToken,
      }),
    )
    if (existing.some((item) => item.content === message.content)) continue
    await requestJson(`/api/channels/${channel.id}/messages`, {
      method: 'POST',
      token: author.accessToken,
      body: { content: message.content },
    })
  }
}

async function updateDesktopLayout(owner, server, workspaceFiles, agents, spaceApps) {
  const layout = createDocsDesktopLayout({
    fixture,
    files: workspaceFiles.allFiles,
    agents,
    spaceApps,
  })
  await requestJson(`/api/servers/${server.slug ?? server.id}/desktop-layout`, {
    method: 'PATCH',
    token: owner.accessToken,
    body: layout,
  })
  return layout
}

async function seedFixture(nextFixture) {
  fixture = nextFixture
  const owner = await ensureUserAccount(fixture.owner, 'owner')
  const teammates = []
  for (const [index, teammate] of fixture.teammates.entries()) {
    teammates.push(
      await ensureUserAccount(teammate, `${fixture.scenario.key}-teammate-${index + 1}`),
    )
  }

  const server = await ensureServer(owner)
  for (const teammate of teammates) {
    await ensureServerMembership(teammate, server)
  }

  const channels = await ensureChannels(owner, server)
  const workspace = await ensureWorkspaceFiles(owner, server)
  const agents = await ensureAgents(owner, server)
  const inboxes = await ensureBuddyInboxes(owner, server, agents)
  const shop = await ensureShop(owner, server)
  const spaceApps = await ensureSpaceApps(owner, server)
  const cloudComputer = await ensureCloudComputer(owner)
  const layout = await updateDesktopLayout(owner, server, workspace, agents, spaceApps)
  await ensureMessages({ owner, teammates }, channels)

  return {
    key: fixture.scenario.key,
    label: fixture.scenario.label,
    seed: fixture.seed,
    scenarioHash: fixture.hash,
    scenario: fixture.scenario,
    origin,
    appBaseUrl,
    screenshotDir,
    owner: {
      email: fixture.owner.email,
      password: fixture.owner.password,
      displayName: fixture.owner.name,
      accessToken: owner.accessToken,
      refreshToken: owner.refreshToken,
    },
    teammates: fixture.teammates.map((user) => ({
      email: user.email,
      password: user.password,
      displayName: user.name,
    })),
    server: {
      id: server.id,
      slug: server.slug ?? server.id,
      name: server.name,
      inviteCode: server.inviteCode,
      description: server.description,
    },
    channels: Object.fromEntries(
      Object.entries(channels).map(([key, channel]) => [
        key,
        {
          id: channel.id,
          name: channel.name,
          type: channel.type,
        },
      ]),
    ),
    workspace: {
      files: workspace.allFiles.map((file) => ({
        id: file.id,
        name: file.name,
        mime: file.mime,
      })),
      wallpaperFileId: workspace.wallpaper.id,
    },
    publicAssets: fixture.media.publicAssets,
    agents: agents.map((agent) => ({
      id: agent.id,
      name: agent.botUser?.displayName ?? agent.name,
      username: agent.botUser?.username ?? agent.username,
    })),
    inboxes: inboxes.map((entry) => ({
      agentId: entry.agent?.id,
      agentName: entry.agent?.user?.displayName ?? entry.agent?.user?.username,
      channelId: entry.channel?.id,
      channelName: entry.channel?.name,
    })),
    shop: {
      categoryId: shop.category.id,
      categoryName: shop.category.name,
      products: shop.products.map((product) => ({ id: product.id, name: product.name })),
    },
    spaceApps: spaceApps.map((app) => ({
      id: app.id,
      appKey: app.appKey,
      name: app.name,
      iconUrl: app.iconUrl,
    })),
    cloudComputer: {
      id: cloudComputer.id,
      name: cloudComputer.name,
      status: cloudComputer.status,
      description: fixture.cloudComputer.description,
    },
    desktopLayout: layout,
    inboxTask: fixture.inboxTask,
    capture: {
      ...fixture.desktop.capture,
      screenshot: fixture.desktop.screenshot,
    },
    screenshots: [fixture.desktop.screenshot],
  }
}

async function main() {
  await waitForAppReady()

  const scenarios = []
  for (const nextFixture of fixtures) {
    const scenario = await seedFixture(nextFixture)
    scenarios.push(scenario)
    console.log(`Seeded docs desktop scenario "${scenario.server.name}" (${scenario.scenario.key})`)
  }

  const primary = scenarios[0]
  const session = {
    kind: 'docs-screenshots',
    generatedAt: new Date().toISOString(),
    ...primary,
    seed,
    baseSeed: seed,
    origin,
    appBaseUrl,
    screenshotDir,
    scenarios,
    screenshots: scenarios.map((scenario) => scenario.capture.screenshot),
  }

  await fs.mkdir(path.dirname(sessionPath), { recursive: true })
  await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8')

  console.log(`Wrote session to ${sessionPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
