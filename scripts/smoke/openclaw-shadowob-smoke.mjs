import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const envPath = process.env.SHADOW_SMOKE_ENV_PATH
  ? path.resolve(process.env.SHADOW_SMOKE_ENV_PATH)
  : path.join(root, '.env')
const sessionPath =
  process.env.SHADOW_SMOKE_SESSION_PATH ?? '/tmp/shadow-openclaw-smoke-session.json'
const agentPath = process.env.SHADOW_SMOKE_AGENT_PATH ?? '/tmp/shadow-openclaw-smoke-agent.json'
const configDir = process.env.SHADOW_SMOKE_CONFIG_DIR
  ? path.resolve(process.env.SHADOW_SMOKE_CONFIG_DIR)
  : path.join(root, '.tmp', 'openclaw-smoke')
const image = process.env.SHADOW_SMOKE_IMAGE ?? 'shadowob/openclaw-runner:codex-smoke'
const containerName =
  process.env.SHADOW_SMOKE_CONTAINER ?? `shadow-openclaw-smoke-${Date.now().toString(36)}`

function parseSuites(argv) {
  if (argv.includes('--health-only')) return new Set(['health'])
  const values = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--suite' && argv[index + 1]) {
      values.push(argv[index + 1])
      index += 1
    } else if (arg.startsWith('--suite=')) {
      values.push(arg.slice('--suite='.length))
    } else if (arg === '--basic') {
      values.push('basic')
    } else if (arg === '--advanced') {
      values.push('advanced')
    } else if (arg === '--dm') {
      values.push('dm')
    } else if (arg === '--rules') {
      values.push('rules')
    } else if (arg === '--multi') {
      values.push('multi')
    } else if (arg === '--cron') {
      values.push('cron')
    } else if (arg === '--thread') {
      values.push('thread')
    } else if (arg === '--dm-advanced') {
      values.push('dm-advanced')
    } else if (arg === '--media-outbound') {
      values.push('media-outbound')
    } else if (arg === '--interactive') {
      values.push('interactive')
    } else if (arg === '--discussion') {
      values.push('discussion')
    }
  }

  const selected = values.length > 0 ? values : ['basic']
  const suites = new Set(
    selected
      .flatMap((value) => value.split(','))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )

  if (suites.has('all')) {
    return new Set([
      'basic',
      'advanced',
      'dm',
      'rules',
      'multi',
      'cron',
      'thread',
      'dm-advanced',
      'media-outbound',
      'interactive',
      'discussion',
    ])
  }
  if (suites.has('core')) return new Set(['basic', 'advanced'])
  if (suites.has('deep')) {
    return new Set(['thread', 'dm-advanced', 'media-outbound', 'interactive', 'discussion'])
  }
  return suites
}

function loadDotEnv(raw) {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed)
    if (!match) continue
    const [, key, value] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = value.replace(/^['"]|['"]$/g, '')
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function toDockerHostUrl(origin) {
  return origin
    .replace('http://127.0.0.1:', 'http://host.docker.internal:')
    .replace('http://localhost:', 'http://host.docker.internal:')
}

function redact(value) {
  return String(value).replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1...')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function imageExists(imageRef) {
  return spawnSync('docker', ['image', 'inspect', imageRef], { stdio: 'ignore' }).status === 0
}

function buildSmokeImage() {
  const args = ['build', '-t', image, '-f', 'apps/cloud/images/openclaw-runner/Dockerfile', '.']
  if (process.env.SHADOW_SMOKE_DOCKER_NO_CACHE === '1') {
    args.splice(1, 0, '--no-cache')
  }

  const build = spawnSync('docker', args, {
    cwd: root,
    env: { ...process.env, DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? '1' },
    stdio: 'inherit',
  })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

async function requestJson(origin, url, { method = 'GET', token, body } = {}) {
  const attempts = method === 'GET' ? 3 : 1
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${origin}${url}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await response.text()
      const payload = text ? JSON.parse(text) : null
      if (!response.ok) {
        throw new Error(`${method} ${url} failed (${response.status}): ${text}`)
      }
      return payload
    } catch (err) {
      if (attempt >= attempts) throw err
      await sleep(250 * attempt)
    }
  }

  throw new Error(`${method} ${url} failed`)
}

async function waitForReady(port) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < 180_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`)
      const payload = await response.json().catch(() => null)
      if (response.ok) return payload
      lastError = new Error(`ready=${response.status} ${JSON.stringify(payload)}`)
    } catch (error) {
      lastError = error
    }
    await sleep(2_000)
  }
  throw new Error(
    `Timed out waiting for OpenClaw runner: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

async function login(origin, email, password) {
  return requestJson(origin, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

async function sendChannelMessage(session, token, body) {
  return requestJson(session.origin, `/api/channels/${session.channels.generalId}/messages`, {
    method: 'POST',
    token,
    body,
  })
}

async function fetchRecentMessages(session, token, channelId = session.channels.generalId) {
  return requestJson(session.origin, `/api/channels/${channelId}/messages?limit=50`, {
    token,
  })
}

async function fetchThreadMessages(session, token, threadId) {
  return requestJson(session.origin, `/api/threads/${threadId}/messages?limit=50`, {
    token,
  })
}

async function waitForBotReply(session, token, marker, startedAt) {
  const since = startedAt ?? Date.now()
  while (Date.now() - since < 180_000) {
    const page = await fetchRecentMessages(session, token)
    const botReply = page.messages
      ?.slice()
      .reverse()
      .find((message) => {
        return Boolean(
          message.author?.isBot &&
            message.content &&
            message.createdAt &&
            Date.parse(message.createdAt) >= since - 5_000 &&
            message.content.includes(marker),
        )
      })
    if (botReply) return botReply
    await sleep(3_000)
  }
  throw new Error(`Timed out waiting for Buddy reply containing ${marker}`)
}

async function waitForBotReplies(session, token, marker, startedAt, expectedCount) {
  const since = startedAt ?? Date.now()
  while (Date.now() - since < 240_000) {
    const page = await fetchRecentMessages(session, token)
    const replies =
      page.messages
        ?.filter((message) => {
          return Boolean(
            message.author?.isBot &&
              message.content &&
              message.createdAt &&
              Date.parse(message.createdAt) >= since - 5_000 &&
              message.content.includes(marker),
          )
        })
        .reverse() ?? []
    const uniqueAuthorIds = new Set(replies.map((message) => message.authorId))
    if (uniqueAuthorIds.size >= expectedCount) return replies
    await sleep(3_000)
  }
  throw new Error(`Timed out waiting for ${expectedCount} Buddy replies containing ${marker}`)
}

async function assertNoBotReply(session, token, marker, startedAt, timeoutMs = 25_000) {
  const since = startedAt ?? Date.now()
  while (Date.now() - since < timeoutMs) {
    const page = await fetchRecentMessages(session, token)
    const botReply = page.messages?.find((message) => {
      return Boolean(
        message.author?.isBot &&
          message.content &&
          message.createdAt &&
          Date.parse(message.createdAt) >= since - 5_000 &&
          message.content.includes(marker),
      )
    })
    if (botReply) {
      throw new Error(`Unexpected Buddy reply containing ${marker}: ${botReply.content}`)
    }
    await sleep(2_000)
  }
  return true
}

async function sendRoundTripMessage(session, owner, marker) {
  const startedAt = Date.now()
  await sendChannelMessage(session, owner.accessToken, {
    content: `OpenClaw Shadow smoke ${marker}. 只回复 ${marker}_OK，不要解释。`,
  })

  return waitForBotReply(session, owner.accessToken, `${marker}_OK`, startedAt)
}

async function createDmChannel(session, owner, userId) {
  return requestJson(session.origin, '/api/dm/channels', {
    method: 'POST',
    token: owner.accessToken,
    body: { userId },
  })
}

async function createSmokeChannel(session, owner, label) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  return requestJson(session.origin, `/api/servers/${session.server.id}/channels`, {
    method: 'POST',
    token: owner.accessToken,
    body: {
      name: `smoke-${label.toLowerCase()}-${suffix}`.slice(0, 100),
      type: 'text',
      topic: `OpenClaw Shadow ${label} smoke isolation`,
      isPrivate: false,
    },
  })
}

async function ensureSmokeSession(session, owner) {
  const servers = await requestJson(session.origin, '/api/servers', { token: owner.accessToken })
  let server = servers.find(
    (item) => item.id === session.server?.id || item.slug === session.server?.slug,
  )
  if (!server) {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    server = await requestJson(session.origin, '/api/servers', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        name: 'OpenClaw Smoke',
        slug: `openclaw-smoke-${suffix}`.slice(0, 64),
        description: 'OpenClaw Shadow smoke test server',
        isPublic: false,
      },
    })
  }

  let channels = await requestJson(session.origin, `/api/servers/${server.id}/channels`, {
    token: owner.accessToken,
  })
  let general = channels.find((channel) => channel.type === 'text')
  if (!general) {
    general = await createSmokeChannel({ ...session, server }, owner, 'general')
    channels = [general, ...channels]
  }

  const refreshed = {
    ...session,
    server,
    channels: {
      ...session.channels,
      generalId: general.id,
      announcementsId:
        session.channels?.announcementsId &&
        channels.some((channel) => channel.id === session.channels.announcementsId)
          ? session.channels.announcementsId
          : general.id,
    },
  }
  await writeJson(sessionPath, refreshed).catch(() => {})
  return refreshed
}

async function sendDmMessage(session, owner, dmChannelId, body) {
  return requestJson(session.origin, `/api/dm/channels/${dmChannelId}/messages`, {
    method: 'POST',
    token: owner.accessToken,
    body,
  })
}

async function createThread(session, owner, parentMessageId, name) {
  return requestJson(session.origin, `/api/channels/${session.channels.generalId}/threads`, {
    method: 'POST',
    token: owner.accessToken,
    body: { name, parentMessageId },
  })
}

async function createSmokeAgent(session, owner, label) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const created = await requestJson(session.origin, '/api/agents', {
    method: 'POST',
    token: owner.accessToken,
    body: {
      name: `${label} Buddy`,
      username: `smoke-${label.toLowerCase()}-${suffix}`.slice(0, 32),
      description: `OpenClaw Shadow ${label} smoke Buddy`,
      kernelType: 'openclaw',
      config: {},
    },
  })
  const tokenPayload = await requestJson(session.origin, `/api/agents/${created.id}/token`, {
    method: 'POST',
    token: owner.accessToken,
  })
  await requestJson(session.origin, `/api/servers/${session.server.id}/agents`, {
    method: 'POST',
    token: owner.accessToken,
    body: { agentIds: [created.id] },
  })
  await requestJson(session.origin, `/api/channels/${session.channels.generalId}/members`, {
    method: 'POST',
    token: owner.accessToken,
    body: { userId: tokenPayload.botUser.id },
  })
  return {
    agentId: created.id,
    agentToken: tokenPayload.token,
    botUser: tokenPayload.botUser,
  }
}

async function isSmokeAgentUsable(session, agent) {
  if (!agent?.agentId || !agent?.agentToken || !agent?.botUser?.id) return false
  try {
    await requestJson(session.origin, '/api/auth/me', { token: agent.agentToken })
    return true
  } catch (error) {
    console.warn(
      `[smoke] Stored smoke Buddy token is not usable; creating a fresh Buddy. ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return false
  }
}

async function ensureReusableSmokeAgent(session, owner, agent, label) {
  if (await isSmokeAgentUsable(session, agent)) {
    await requestJson(session.origin, `/api/servers/${session.server.id}/agents`, {
      method: 'POST',
      token: owner.accessToken,
      body: { agentIds: [agent.agentId] },
    }).catch((error) => {
      console.warn(
        `[smoke] Failed to reattach stored smoke Buddy to server: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
    await requestJson(session.origin, `/api/channels/${session.channels.generalId}/members`, {
      method: 'POST',
      token: owner.accessToken,
      body: { userId: agent.botUser.id },
    }).catch((error) => {
      console.warn(
        `[smoke] Failed to reattach stored smoke Buddy to channel: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
    await setChannelPolicy(session, owner, agent.agentId, { mode: 'replyAll' }).catch(() => {})
    return agent
  }
  const fresh = await createSmokeAgent(session, owner, label)
  await setChannelPolicy(session, owner, fresh.agentId, { mode: 'replyAll' }).catch(() => {})
  await writeJson(agentPath, fresh).catch((error) => {
    console.warn(
      `[smoke] Failed to persist refreshed smoke Buddy: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  })
  return fresh
}

async function fetchRecentDmMessages(session, owner, dmChannelId) {
  return requestJson(session.origin, `/api/dm/channels/${dmChannelId}/messages?limit=50`, {
    token: owner.accessToken,
  })
}

async function waitForBotDmReply(session, owner, dmChannelId, marker, startedAt) {
  const since = startedAt ?? Date.now()
  while (Date.now() - since < 180_000) {
    const messages = await fetchRecentDmMessages(session, owner, dmChannelId)
    const botReply = messages
      ?.slice()
      .reverse()
      .find((message) => {
        return Boolean(
          message.author?.isBot &&
            message.content &&
            message.createdAt &&
            Date.parse(message.createdAt) >= since - 5_000 &&
            message.content.includes(marker),
        )
      })
    if (botReply) return botReply
    await sleep(3_000)
  }
  throw new Error(`Timed out waiting for Buddy DM reply containing ${marker}`)
}

async function waitForDmMessage(
  session,
  owner,
  dmChannelId,
  predicate,
  startedAt,
  timeoutMs = 90_000,
) {
  const since = startedAt ?? Date.now()
  while (Date.now() - since < timeoutMs) {
    const messages = await fetchRecentDmMessages(session, owner, dmChannelId)
    const found = messages
      ?.slice()
      .reverse()
      .find((message) => {
        return Boolean(
          message.createdAt && Date.parse(message.createdAt) >= since - 5_000 && predicate(message),
        )
      })
    if (found) return found
    await sleep(2_000)
  }
  throw new Error(`Timed out waiting for DM message in ${dmChannelId}`)
}

async function waitForChannelMessage(session, token, predicate, startedAt, timeoutMs = 90_000) {
  const since = startedAt ?? Date.now()
  while (Date.now() - since < timeoutMs) {
    const page = await fetchRecentMessages(session, token)
    const found = page.messages
      ?.slice()
      .reverse()
      .find((message) => {
        return Boolean(
          message.createdAt && Date.parse(message.createdAt) >= since - 5_000 && predicate(message),
        )
      })
    if (found) return found
    await sleep(2_000)
  }
  throw new Error('Timed out waiting for Shadow channel message')
}

async function assertNoAdditionalBuddyChainMessage(session, token, peerReply, timeoutMs = 18_000) {
  const chain = peerReply.metadata?.agentChain
  const rootMessageId = chain?.rootMessageId
  const since = Date.parse(peerReply.createdAt ?? new Date().toISOString())
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const page = await fetchRecentMessages(session, token)
    const extra = page.messages?.find((message) => {
      const messageChain = message.metadata?.agentChain
      return Boolean(
        message.author?.isBot &&
          message.id !== peerReply.id &&
          message.createdAt &&
          Date.parse(message.createdAt) > since + 1_000 &&
          messageChain?.rootMessageId === rootMessageId &&
          Number(messageChain?.depth ?? 0) > Number(chain?.depth ?? 0),
      )
    })
    if (extra) {
      throw new Error(
        `Buddy discussion loop continued after peer reply: ${JSON.stringify({
          id: extra.id,
          authorId: extra.authorId,
          agentChain: extra.metadata?.agentChain,
          content: extra.content?.slice(0, 200),
        })}`,
      )
    }
    await sleep(2_000)
  }

  return { windowMs: timeoutMs, extraChainMessages: 0 }
}

async function uploadTextMedia(origin, token, filename, content) {
  const formData = new FormData()
  formData.append('file', new Blob([content], { type: 'text/plain' }), filename)
  const response = await fetch(`${origin}/api/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`POST /api/media/upload failed (${response.status}): ${text}`)
  }
  return payload
}

async function waitForLog(getLogs, needle, timeoutMs = 60_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const logs = getLogs()
    if (needle instanceof RegExp ? needle.test(logs) : logs.includes(needle)) return true
    await sleep(1_000)
  }
  throw new Error(`Timed out waiting for container log: ${needle}`)
}

async function waitForHeartbeat(session, owner, agentId, freshAfter) {
  let lastPayload = null
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const current = await requestJson(session.origin, `/api/agents/${agentId}`, {
      token: owner.accessToken,
    })
    lastPayload = current
    const heartbeatMs = current.lastHeartbeat ? Date.parse(current.lastHeartbeat) : Number.NaN
    if (
      current.status === 'running' &&
      Number.isFinite(heartbeatMs) &&
      heartbeatMs >= freshAfter - 5_000
    ) {
      return current
    }
    await sleep(2_000)
  }
  throw new Error(
    `Timed out waiting for heartbeat on agent ${agentId}; last payload=${JSON.stringify(
      lastPayload,
    )}`,
  )
}

async function waitForSlashCommand(session, owner, agentId, commandName) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 60_000) {
    const result = await requestJson(session.origin, `/api/agents/${agentId}/slash-commands`, {
      token: owner.accessToken,
    })
    const command = result.commands?.find?.((item) => item.name === commandName)
    if (command) return command
    await sleep(2_000)
  }
  throw new Error(`Timed out waiting for slash command registration: /${commandName}`)
}

async function runAttachmentSmoke(session, owner, marker, getLogs) {
  const filename = `shadow-smoke-${marker.toLowerCase()}.txt`
  const uploaded = await uploadTextMedia(
    session.origin,
    owner.accessToken,
    filename,
    `attachment smoke payload ${marker}`,
  )

  const startedAt = Date.now()
  await sendChannelMessage(session, owner.accessToken, {
    content: `ATTACH_SMOKE ${marker}. 我附了一个文本文件；请只回复 ${marker}_ATTACH_OK，不要解释。`,
    attachments: [
      {
        filename,
        url: uploaded.url,
        contentType: 'text/plain',
        size: uploaded.size,
      },
    ],
  })

  await waitForLog(
    getLogs,
    new RegExp(`\\[media\\] Downloaded ${uploaded.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    90_000,
  )
  const reply = await waitForBotReply(session, owner.accessToken, `${marker}_ATTACH_OK`, startedAt)
  return { uploaded, reply }
}

async function waitForInteractiveMessage(session, token, predicate, startedAt) {
  while (Date.now() - startedAt < 90_000) {
    const page = await fetchRecentMessages(session, token)
    const message = page.messages
      ?.slice()
      .reverse()
      .find((item) => {
        return Boolean(
          item.author?.isBot &&
            item.createdAt &&
            Date.parse(item.createdAt) >= startedAt - 5_000 &&
            item.metadata?.interactive &&
            predicate(item),
        )
      })
    if (message) return message
    await sleep(2_000)
  }
  throw new Error('Timed out waiting for Shadow interactive message')
}

async function runSlashFormSmoke(session, owner, marker) {
  const startedAt = Date.now()
  await sendChannelMessage(session, owner.accessToken, {
    content: '/smoke-form',
  })

  const interactiveMessage = await waitForInteractiveMessage(
    session,
    owner.accessToken,
    (message) =>
      message.metadata?.interactive?.kind === 'form' &&
      message.metadata?.slashCommand?.name === 'smoke-form',
    startedAt,
  )
  const block = interactiveMessage.metadata.interactive
  const submittedValue = `${marker}_FORM_OK`
  const response = await requestJson(
    session.origin,
    `/api/messages/${interactiveMessage.id}/interactive`,
    {
      method: 'POST',
      token: owner.accessToken,
      body: {
        blockId: block.id,
        actionId: 'submit',
        values: { brief: submittedValue },
      },
    },
  )
  const duplicate = await requestJson(
    session.origin,
    `/api/messages/${interactiveMessage.id}/interactive`,
    {
      method: 'POST',
      token: owner.accessToken,
      body: {
        blockId: block.id,
        actionId: 'submit',
        values: { brief: `${submittedValue}_DUPLICATE_SHOULD_NOT_SEND` },
      },
    },
  )
  if (response.id && duplicate.id && response.id !== duplicate.id) {
    throw new Error('Interactive duplicate submission created a second response message')
  }

  const state = await requestJson(
    session.origin,
    `/api/messages/${interactiveMessage.id}/interactive-state?blockId=${encodeURIComponent(block.id)}`,
    { token: owner.accessToken },
  )
  if (!state.submitted || state.response?.values?.brief !== submittedValue) {
    throw new Error(`Interactive state was not persisted correctly: ${JSON.stringify(state)}`)
  }

  const reply = await waitForBotReply(session, owner.accessToken, submittedValue, Date.now())
  return { interactiveMessage, response, state, reply }
}

async function runDmSmoke(session, owner, agent, marker) {
  const dm = await createDmChannel(session, owner, agent.botUser.id)
  const dmChannelId = dm.id
  const expected = `${marker}_DM_OK`
  const startedAt = Date.now()
  await sendDmMessage(session, owner, dmChannelId, {
    content: `DM_SMOKE ${marker}. 只回复 ${expected}，不要解释。`,
  })
  const reply = await waitForBotDmReply(session, owner, dmChannelId, expected, startedAt)
  return { dmChannelId, reply }
}

async function runDmAdvancedSmoke(session, owner, agent, marker) {
  const dm = await createDmChannel(session, owner, agent.botUser.id)
  const dmChannelId = dm.id
  const filename = `shadow-dm-smoke-${marker.toLowerCase()}.txt`
  const uploaded = await uploadTextMedia(
    session.origin,
    owner.accessToken,
    filename,
    `dm attachment smoke payload ${marker}`,
  )
  const expected = `${marker}_DM_ATTACH_OK`
  const startedAt = Date.now()
  const sent = await sendDmMessage(session, owner, dmChannelId, {
    content: `DM_ATTACH_SMOKE ${marker}. 我附了一个文本文件；请只回复 ${expected}，不要解释。`,
    attachments: [
      {
        filename,
        url: uploaded.url,
        contentType: 'text/plain',
        size: uploaded.size,
      },
    ],
  })
  const reply = await waitForBotDmReply(session, owner, dmChannelId, expected, startedAt)
  if (reply.replyToId !== sent.id) {
    throw new Error(`Expected DM replyToId=${sent.id}, got ${reply.replyToId}`)
  }
  return { dmChannelId, uploaded, sent, reply }
}

async function setChannelPolicy(session, owner, agentId, body) {
  return requestJson(
    session.origin,
    `/api/channels/${session.channels.generalId}/agents/${agentId}/policy`,
    {
      method: 'PUT',
      token: owner.accessToken,
      body,
    },
  )
}

async function runRulesSmoke(session, owner, agent, marker) {
  const blockedMarker = `${marker}_RULE_BLOCKED`
  const allowedMarker = `${marker}_RULE_OK`

  try {
    await setChannelPolicy(session, owner, agent.agentId, { mode: 'mentionOnly' })
    await sleep(2_000)

    const blockedStartedAt = Date.now()
    await sendChannelMessage(session, owner.accessToken, {
      content: `RULE_SMOKE ${marker}. 如果你看到这条消息，请只回复 ${blockedMarker}。`,
    })
    await assertNoBotReply(session, owner.accessToken, blockedMarker, blockedStartedAt)

    const allowedStartedAt = Date.now()
    await sendChannelMessage(session, owner.accessToken, {
      content: `@${agent.botUser.username} RULE_SMOKE ${marker}. 只回复 ${allowedMarker}，不要解释。`,
    })
    const reply = await waitForBotReply(session, owner.accessToken, allowedMarker, allowedStartedAt)

    return {
      mentionOnlyBlocked: true,
      reply: {
        id: reply.id,
        content: reply.content.slice(0, 200),
      },
    }
  } finally {
    await setChannelPolicy(session, owner, agent.agentId, { mode: 'replyAll' }).catch(() => {})
  }
}

async function runMultiBuddySmoke(session, owner, configuredAgents, marker) {
  const expected = `${marker}_MULTI_OK`
  const startedAt = Date.now()
  await sendChannelMessage(session, owner.accessToken, {
    content: `MULTI_SMOKE ${marker}. 每个 Buddy 如果看到这条人类消息，都只回复 ${expected}，不要解释。`,
  })
  const replies = await waitForBotReplies(
    session,
    owner.accessToken,
    expected,
    startedAt,
    configuredAgents.length,
  )
  return {
    expectedBuddyCount: configuredAgents.length,
    replies: replies.slice(0, configuredAgents.length).map((reply) => ({
      id: reply.id,
      authorId: reply.authorId,
      content: reply.content.slice(0, 200),
    })),
  }
}

async function runThreadSmoke(session, owner, agent, marker) {
  await setChannelPolicy(session, owner, agent.agentId, { mode: 'disabled' })
  await sleep(1_000)
  const parent = await sendChannelMessage(session, owner.accessToken, {
    content: `THREAD_PARENT ${marker}`,
  })
  const thread = await createThread(
    session,
    owner,
    parent.id,
    `Smoke thread ${marker}`.slice(0, 100),
  )
  await setChannelPolicy(session, owner, agent.agentId, { mode: 'replyAll' })
  await sleep(1_000)

  const expected = `${marker}_THREAD_OK`
  const startedAt = Date.now()
  await sendChannelMessage(session, owner.accessToken, {
    content: `THREAD_SMOKE ${marker}. 只回复 ${expected}，不要解释。`,
    threadId: thread.id,
  })
  const reply = await waitForBotReply(session, owner.accessToken, expected, startedAt)
  if (reply.threadId !== thread.id) {
    throw new Error(`Expected thread reply in ${thread.id}, got ${reply.threadId}`)
  }
  const threadMessages = await fetchThreadMessages(session, owner.accessToken, thread.id)
  if (!threadMessages.some((message) => message.id === reply.id)) {
    throw new Error(
      `Thread reply ${reply.id} was not returned by /api/threads/${thread.id}/messages`,
    )
  }
  return { parentId: parent.id, threadId: thread.id, reply }
}

async function runMediaOutboundSmoke(session, owner, agent, marker, container) {
  const channelExpected = `${marker}_OUTBOUND_CHANNEL_ATTACHMENT`
  const channelStartedAt = Date.now()
  const channelResult = runShadowAction(container, 'upload-file', {
    target: `shadowob:channel:${session.channels.generalId}`,
    message: channelExpected,
    filename: `shadow-outbound-${marker.toLowerCase()}.txt`,
    contentType: 'text/plain',
    buffer: Buffer.from(`outbound channel attachment ${marker}`, 'utf8').toString('base64'),
  })
  if (!channelResult?.ok) {
    throw new Error(`Channel upload-file action failed: ${JSON.stringify(channelResult)}`)
  }
  const channelMessage = await waitForBotReply(
    session,
    owner.accessToken,
    channelExpected,
    channelStartedAt,
  )
  if (!channelMessage.attachments?.length) {
    throw new Error('Channel outbound attachment message had no attachments')
  }

  const dm = await createDmChannel(session, owner, agent.botUser.id)
  const dmExpected = `${marker}_OUTBOUND_DM_ATTACHMENT`
  const dmStartedAt = Date.now()
  const dmResult = runShadowAction(container, 'upload-file', {
    target: `shadowob:dm:${dm.id}`,
    message: dmExpected,
    filename: `shadow-dm-outbound-${marker.toLowerCase()}.txt`,
    contentType: 'text/plain',
    buffer: Buffer.from(`outbound DM attachment ${marker}`, 'utf8').toString('base64'),
  })
  if (!dmResult?.ok) {
    throw new Error(`DM upload-file action failed: ${JSON.stringify(dmResult)}`)
  }
  const dmMessage = await waitForDmMessage(
    session,
    owner,
    dm.id,
    (message) =>
      message.author?.isBot && message.content?.includes(dmExpected) && message.attachments?.length,
    dmStartedAt,
  )

  return {
    channel: { action: channelResult, message: channelMessage },
    dm: { dmChannelId: dm.id, action: dmResult, message: dmMessage },
  }
}

async function runInteractiveActionSmoke(session, owner, marker, container) {
  const proposalMarker = `${marker}_ROADMAP`
  const expected = `${marker}_APPROVED_OK`
  const content = [
    `ROADMAP_SMOKE ${proposalMarker}`,
    '90-day roadmap: week 1 validate ICP, week 2 ship onboarding, week 3 measure retention.',
    'MVP scope: one channel, one Buddy, one form, one deployment path.',
    '提交 approval 表单后，按 responsePrompt 继续处理用户的决定。',
  ].join('\n')
  const startedAt = Date.now()
  const action = runShadowAction(container, 'send', {
    target: `shadowob:channel:${session.channels.generalId}`,
    message: content,
    prompt: content,
    kind: 'approval',
    responsePrompt: 'Reply exactly with the submitted decision field value; no other words.',
    approvalCommentLabel: 'Decision',
  })
  if (!action?.ok || !action.interactive || action.kind !== 'approval') {
    throw new Error(`Approval action failed: ${JSON.stringify(action)}`)
  }
  const interactiveMessage = await waitForInteractiveMessage(
    session,
    owner.accessToken,
    (message) =>
      message.content?.includes(proposalMarker) &&
      message.metadata?.interactive?.kind === 'approval',
    startedAt,
  )
  if (
    !interactiveMessage.content.includes('90-day roadmap') ||
    !interactiveMessage.content.includes('MVP scope')
  ) {
    throw new Error('Approval interactive message did not include roadmap and MVP scope')
  }
  const block = interactiveMessage.metadata.interactive
  const response = await requestJson(
    session.origin,
    `/api/messages/${interactiveMessage.id}/interactive`,
    {
      method: 'POST',
      token: owner.accessToken,
      body: {
        blockId: block.id,
        actionId: 'approve',
        value: 'approve',
        label: 'Approve',
        values: { decision: expected },
      },
    },
  )
  const state = await requestJson(
    session.origin,
    `/api/messages/${interactiveMessage.id}/interactive-state?blockId=${encodeURIComponent(block.id)}`,
    { token: owner.accessToken },
  )
  if (!state.submitted || state.response?.values?.decision !== expected) {
    throw new Error(`Approval interactive state was not persisted: ${JSON.stringify(state)}`)
  }
  const responseStartedAt = Date.now()
  const reply = await waitForChannelMessage(
    session,
    owner.accessToken,
    (message) =>
      message.author?.isBot &&
      message.id !== interactiveMessage.id &&
      !message.metadata?.interactive &&
      message.content?.includes(expected),
    responseStartedAt,
  )
  return { action, interactiveMessage, response, state, reply }
}

async function runDiscussionChainSmoke(session, owner, configuredAgents, marker) {
  if (configuredAgents.length < 2) {
    throw new Error('discussion suite requires at least two configured agents')
  }
  const [primary, peer] = configuredAgents
  await setChannelPolicy(session, owner, primary.shadowAgent.agentId, { mode: 'replyAll' })
  await setChannelPolicy(session, owner, peer.shadowAgent.agentId, {
    mode: 'custom',
    config: {
      replyToBuddy: true,
      maxBuddyChainDepth: 2,
      replyToUsers: [primary.shadowAgent.botUser.username],
      smartReply: false,
    },
  })
  await sleep(1_500)

  const primaryExpected = `${marker}_STRATEGIST_SMOKE`
  const peerExpected = 'REVIEWER_SMOKE'
  const startedAt = Date.now()
  await sendChannelMessage(session, owner.accessToken, {
    content: [
      `DISCUSSION_SMOKE ${marker}.`,
      '主题：Shadow Cloud 一键部署 agent pack 团队，支持 skills、slash commands、forms、hooks、MCP 和多 Buddy 协作。',
      `Product Strategist Buddy 先回复，必须包含 "${primaryExpected}"、"方案:"、"MVP:" 三段，并把消息交给 Risk Reviewer Buddy。`,
      `Risk Reviewer Buddy 看到 Strategist 的消息后回复，必须包含 "${peerExpected}"、"风险:"、"取舍:"、"建议:" 三段。`,
      '两位 Buddy 都要围绕这个真实产品目标讨论，不要自我介绍，不要说自己刚上线。',
    ].join(' '),
  })
  const primaryReply = await waitForBotReply(session, owner.accessToken, primaryExpected, startedAt)
  if (!primaryReply.content.includes('方案:') || !primaryReply.content.includes('MVP:')) {
    throw new Error(`Strategist reply was not a real product discussion: ${primaryReply.content}`)
  }
  const peerReply = await waitForChannelMessage(
    session,
    owner.accessToken,
    (message) =>
      message.author?.isBot &&
      message.authorId !== primaryReply.authorId &&
      message.id !== primaryReply.id &&
      message.content?.includes('风险') &&
      message.content?.includes('取舍') &&
      message.content?.includes('建议') &&
      Number(message.metadata?.agentChain?.depth ?? 0) >= 2,
    Date.parse(primaryReply.createdAt ?? new Date().toISOString()),
  )
  if (
    /Bootstrap|IDENTITY\.md|SOUL\.md/.test(peerReply.content) ||
    !peerReply.content.includes('风险:') ||
    !peerReply.content.includes('取舍:') ||
    !peerReply.content.includes('建议:')
  ) {
    throw new Error(`Reviewer reply was not a real risk review: ${peerReply.content}`)
  }
  const chain = peerReply.metadata?.agentChain
  if (!chain || chain.depth < 2) {
    throw new Error(`Discussion peer reply missing chain metadata: ${JSON.stringify(chain)}`)
  }
  const noLoop = await assertNoAdditionalBuddyChainMessage(session, owner.accessToken, peerReply)
  return {
    primaryReply: {
      id: primaryReply.id,
      authorId: primaryReply.authorId,
      content: primaryReply.content.slice(0, 200),
    },
    peerReply: {
      id: peerReply.id,
      authorId: peerReply.authorId,
      content: peerReply.content.slice(0, 200),
      agentChain: chain,
    },
    noLoop,
  }
}

function dockerExec(container, args) {
  const result = spawnSync('docker', ['exec', container, ...args], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(
      `docker exec ${args.join(' ')} failed (${result.status}): ${result.stdout}\n${result.stderr}`,
    )
  }
  return result.stdout
}

function runShadowAction(container, action, params, accountId = 'default') {
  const code = `
    import fs from 'node:fs/promises'
    import { shadowPlugin } from '/app/extensions/shadowob/dist/index.js'
    const cfgPaths = ['/tmp/openclaw/config/openclaw.json', '/home/openclaw/.openclaw/openclaw.json']
    let cfg = null
    for (const cfgPath of cfgPaths) {
      try {
        cfg = JSON.parse(await fs.readFile(cfgPath, 'utf8'))
        break
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    if (!cfg) throw new Error('OpenClaw config file not found')
    const result = await shadowPlugin.actions.handleAction({
      action: ${JSON.stringify(action)},
      accountId: ${JSON.stringify(accountId)},
      cfg,
      params: ${JSON.stringify(params)},
    })
    console.log(JSON.stringify(result?.details ?? result ?? null))
  `
  const output = dockerExec(container, ['node', '--input-type=module', '-e', code])
  const lines = output
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return JSON.parse(lines.at(-1) ?? 'null')
}

function runActionSurfaceSmoke(container) {
  const code = `
    import { shadowPlugin } from '/app/extensions/shadowob/dist/index.js'
    const discovery = shadowPlugin.actions.describeMessageTool({ cfg: {} })
    const promptHints = shadowPlugin.agentPrompt?.messageToolHints?.({ cfg: {} }) ?? []
    const supports = Object.fromEntries(
      ['send', 'send-interactive', 'upload-file', 'sendAttachment', 'get-server', 'update-homepage']
        .map((action) => [action, shadowPlugin.actions.supportsAction({ action })])
    )
    console.log(JSON.stringify({
      actions: discovery.actions,
      mediaSourceParams: discovery.mediaSourceParams,
      supports,
      promptHints,
    }))
  `
  const output = dockerExec(container, ['node', '--input-type=module', '-e', code])
  const lines = output
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const surface = JSON.parse(lines.at(-1) ?? 'null')
  const actions = new Set(surface?.actions ?? [])
  const promptText = (surface?.promptHints ?? []).join('\n')
  for (const action of ['send', 'send-interactive', 'upload-file']) {
    if (!actions.has(action)) throw new Error(`Expected action ${action} to be discovered`)
    if (surface?.supports?.[action] !== true) throw new Error(`Expected action ${action} support`)
  }
  for (const action of ['sendAttachment', 'get-server', 'update-homepage']) {
    if (actions.has(action)) throw new Error(`Removed action ${action} was still discovered`)
    if (surface?.supports?.[action] !== false) {
      throw new Error(`Removed action ${action} was still supported`)
    }
    if (promptText.includes(action)) {
      throw new Error(`Removed action ${action} was still present in prompt hints`)
    }
  }
  if (promptText.toLowerCase().includes('homepage')) {
    throw new Error('Homepage management prompt hints were still present')
  }
  if (surface?.mediaSourceParams?.sendAttachment) {
    throw new Error('sendAttachment media source params were still present')
  }
  return {
    actions: [...actions],
    fileAction: 'upload-file',
    removedActions: ['sendAttachment', 'get-server', 'update-homepage'],
  }
}

async function runCronSmoke(session, owner, marker, container) {
  const expected = `${marker}_CRON_OK`
  const startedAt = Date.now()
  const runAt = new Date(Date.now() + 20_000).toISOString()

  const output = dockerExec(container, [
    'openclaw',
    'cron',
    'add',
    '--name',
    `shadow-smoke-${marker.toLowerCase()}`,
    '--at',
    runAt,
    '--session',
    'isolated',
    '--message',
    `CRON_SMOKE ${marker}. Return exactly ${expected}, no other words.`,
    '--agent',
    'smoke-agent',
    '--announce',
    '--channel',
    'shadowob',
    '--to',
    `shadowob:channel:${session.channels.generalId}`,
    '--delete-after-run',
  ])
  const reply = await waitForBotReply(session, owner.accessToken, expected, startedAt)
  return {
    scheduledFor: runAt,
    cliOutput: output.trim().slice(0, 500),
    reply: {
      id: reply.id,
      content: reply.content.slice(0, 200),
    },
  }
}

async function main() {
  const suites = parseSuites(process.argv.slice(2))
  await fs
    .readFile(envPath, 'utf8')
    .then(loadDotEnv)
    .catch(() => {})

  const apiKey = process.env.OPENAI_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL
  const model = process.env.OPENAI_MODEL
  if (!apiKey || !baseUrl || !model) {
    throw new Error('OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL are required')
  }

  let [session, agent] = await Promise.all([readJson(sessionPath), readJson(agentPath)])
  const isolated = process.argv.includes('--isolated')
  let setupOwner = null

  if (isolated) {
    setupOwner = await login(session.origin, session.owner.email, session.owner.password)
    session = await ensureSmokeSession(session, setupOwner)
    const channel = await createSmokeChannel(session, setupOwner, [...suites].join('-') || 'basic')
    session = {
      ...session,
      channels: {
        ...session.channels,
        generalId: channel.id,
      },
      isolatedChannel: channel,
    }
    agent = await createSmokeAgent(
      session,
      setupOwner,
      suites.has('discussion') ? 'Strategist' : 'Primary',
    )
    await setChannelPolicy(session, setupOwner, agent.agentId, { mode: 'replyAll' })
  } else {
    setupOwner = await login(session.origin, session.owner.email, session.owner.password)
    session = await ensureSmokeSession(session, setupOwner)
    agent = await ensureReusableSmokeAgent(
      session,
      setupOwner,
      agent,
      suites.has('discussion') ? 'Strategist' : 'Primary',
    )
  }

  const configuredAgents = [
    {
      accountId: 'default',
      localAgentId: 'smoke-agent',
      name: suites.has('discussion') ? 'Product Strategist Buddy' : 'Smoke Agent',
      shadowAgent: agent,
    },
  ]
  if (suites.has('multi') || suites.has('discussion')) {
    setupOwner ??= await login(session.origin, session.owner.email, session.owner.password)
    const peerAgent = await createSmokeAgent(
      session,
      setupOwner,
      suites.has('discussion') ? 'RiskReviewer' : 'Peer',
    )
    configuredAgents.push({
      accountId: 'peer',
      localAgentId: 'smoke-agent-peer',
      name: suites.has('discussion') ? 'Risk Reviewer Buddy' : 'Smoke Peer Agent',
      shadowAgent: peerAgent,
    })
  }
  const providerId = process.env.SHADOW_SMOKE_PROVIDER_ID ?? 'smoke-openai-compatible'
  const discussionSystemPrompts = {
    'smoke-agent': [
      '你是 Product Strategist Buddy，专注产品路线图、MVP 范围和落地顺序。',
      '当收到 DISCUSSION_SMOKE 时，你必须围绕 Shadow Cloud 一键部署 agent pack 团队给出真实产品讨论。',
      '回复格式必须包含：第一行包含 STRATEGIST_SMOKE marker，随后包含 "方案:" 和 "MVP:" 两段。',
      '不要自我介绍，不要说自己刚上线，不要输出与产品无关的寒暄。',
    ].join('\n'),
    'smoke-agent-peer': [
      '你是 Risk Reviewer Buddy，专注指出风险、取舍和可执行建议。',
      '当看到 Product Strategist Buddy 的消息时，你必须接力做风险评审。',
      '回复格式必须包含：第一行包含 REVIEWER_SMOKE marker，随后包含 "风险:"、"取舍:"、"建议:" 三段。',
      '不要自我介绍，不要说自己刚上线，不要重复 Strategist 的完整方案。',
      '不要输出 Bootstrap、IDENTITY.md、USER.md 或 SOUL.md 相关提示。',
    ].join('\n'),
  }
  const config = {
    gateway: { mode: 'local', auth: { token: 'shadow-smoke' } },
    agents: {
      list: configuredAgents.map((item, index) => ({
        id: item.localAgentId,
        name: item.name,
        default: index === 0,
        model: { primary: `${providerId}/${model}` },
        ...(suites.has('discussion')
          ? {
              systemPromptOverride: discussionSystemPrompts[item.localAgentId],
            }
          : {}),
      })),
      defaults: {
        workspace: '/home/openclaw/.openclaw/workspace',
        model: { primary: `${providerId}/${model}` },
      },
    },
    bindings: configuredAgents.map((item) => ({
      agentId: item.localAgentId,
      match: { channel: 'shadowob', accountId: item.accountId },
    })),
    channels: {
      shadowob: {
        enabled: true,
        replyToMode: 'first',
        accounts: Object.fromEntries(
          configuredAgents.map((item) => [
            item.accountId,
            {
              token: item.shadowAgent.agentToken,
              serverUrl: toDockerHostUrl(session.origin),
              agentId: item.shadowAgent.agentId,
              buddyName: item.shadowAgent.botUser?.displayName,
              buddyId: item.shadowAgent.botUser?.id,
            },
          ]),
        ),
        accountAgentMap: Object.fromEntries(
          configuredAgents.map((item) => [item.accountId, item.localAgentId]),
        ),
      },
    },
    plugins: {
      enabled: true,
      allow: ['openclaw-shadowob'],
      entries: { 'openclaw-shadowob': { enabled: true } },
    },
    models: {
      mode: 'merge',
      providers: {
        [providerId]: {
          api: 'openai-completions',
          apiKey: '${env:OPENAI_API_KEY}',
          baseUrl: '${env:OPENAI_BASE_URL}',
          request: { allowPrivateNetwork: true },
          models: [{ id: '${env:OPENAI_MODEL}', name: model }],
        },
      },
    },
    cron: { enabled: suites.has('cron') },
  }

  await writeJson(path.join(configDir, 'config.json'), config)
  await writeJson(path.join(configDir, 'slash-commands.json'), [
    {
      name: 'smoke-form',
      description: 'Shadow OpenClaw smoke form command',
      body: [
        'When the Shadow interactive form response arrives, reply exactly with the submitted `brief` field value.',
        'Do not add any other words, markdown, punctuation, or explanation.',
      ].join('\n'),
      interaction: {
        id: 'smoke-form',
        kind: 'form',
        prompt: 'Smoke form: fill the brief field.',
        submitLabel: 'Submit',
        responsePrompt: 'Reply exactly with the submitted `brief` field value; no other words.',
        fields: [
          {
            id: 'brief',
            kind: 'textarea',
            label: 'Brief',
            required: true,
          },
        ],
      },
    },
  ])
  await writeJson(path.join(configDir, 'runtime-extensions.json'), {
    artifacts: [
      {
        kind: 'shadow.slashCommands',
        path: '/etc/openclaw/slash-commands.json',
      },
    ],
  })
  await fs.writeFile(
    path.join(configDir, 'SOUL.md'),
    [
      '# Smoke Agent',
      '',
      '你是 Shadow OpenClaw 容器冒烟测试 Buddy。收到带 smoke marker 的消息时，只回复用户要求的指定 marker。',
      '如果收到 Shadow interactive response，并且 follow-up instruction 要求你精确回复某个提交值，只回复该值，不要解释。',
      '如果收到其他 Buddy 的消息包含 DISCUSS_HANDOFF 或 DISCUSS，并且里面有 *_PEER_OK marker，只回复这个 *_PEER_OK marker，不要解释。',
      '',
    ].join('\n'),
    'utf8',
  )
  await fs.writeFile(
    path.join(configDir, 'IDENTITY.md'),
    [
      '# Smoke Agent Identity',
      '',
      'Name: Shadow Smoke Buddy',
      'Role: Container smoke-test agent for Shadow OpenClaw integration.',
      'Status: Initialized for automated validation.',
      '',
    ].join('\n'),
    'utf8',
  )
  await fs.writeFile(
    path.join(configDir, 'USER.md'),
    [
      '# Smoke Test User',
      '',
      'The operator is validating Shadow Cloud and OpenClaw channel integration.',
      'Prioritize the requested smoke-test task over bootstrap or identity setup.',
      '',
    ].join('\n'),
    'utf8',
  )

  if (process.argv.includes('--build')) {
    buildSmokeImage()
  } else if (!imageExists(image)) {
    console.log(`[smoke] Docker image ${image} not found; building it once with cache.`)
    buildSmokeImage()
  }

  spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' })
  const run = spawn('docker', [
    'run',
    '--rm',
    '--name',
    containerName,
    '--env-file',
    envPath,
    '-v',
    `${configDir}:/etc/openclaw:ro`,
    '-p',
    '3100',
    image,
  ])
  let capturedLogs = ''
  const appendLogs = (chunk) => {
    capturedLogs += chunk.toString()
    if (capturedLogs.length > 250_000) {
      capturedLogs = capturedLogs.slice(-250_000)
    }
  }
  run.stdout.on('data', appendLogs)
  run.stderr.on('data', appendLogs)
  const getCapturedLogs = () => capturedLogs

  let hostPort = null
  const cleanup = () => spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' })
  process.on('exit', cleanup)
  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })

  try {
    const inspectStartedAt = Date.now()
    while (!hostPort && Date.now() - inspectStartedAt < 30_000) {
      const inspect = spawnSync('docker', ['port', containerName, '3100/tcp'])
      const output = inspect.stdout.toString().trim()
      const match = output.match(/:(\d+)$/)
      if (match) hostPort = Number(match[1])
      else await sleep(500)
    }
    if (!hostPort) throw new Error('Unable to resolve mapped OpenClaw health port')

    const ready = await waitForReady(hostPort)
    const owner =
      setupOwner ?? (await login(session.origin, session.owner.email, session.owner.password))
    const result = {
      ready,
      providerId,
      model,
      smoke: suites.has('health') ? 'health' : 'shadow-channel-smoke',
      suites: [...suites],
      ...(isolated
        ? {
            isolated: {
              channelId: session.channels.generalId,
              agentIds: configuredAgents.map((item) => item.shadowAgent.agentId),
            },
          }
        : {}),
      features: {},
    }

    if (!suites.has('health')) {
      await waitForLog(getCapturedLogs, /\[config\] Monitoring [1-9]\d* channel\(s\)/, 90_000)
      const marker = `SMOKE_${Date.now().toString(36).toUpperCase()}`
      result.features.actionSurface = runActionSurfaceSmoke(containerName)
      const heartbeat = await waitForHeartbeat(session, owner, agent.agentId, Date.now() - 30_000)
      result.features.heartbeat = {
        status: heartbeat.status,
        lastHeartbeat: heartbeat.lastHeartbeat,
      }
      if (suites.has('multi') || suites.has('discussion')) {
        result.features.multiAccountHeartbeats = []
        for (const item of configuredAgents.slice(1)) {
          const peerHeartbeat = await waitForHeartbeat(
            session,
            owner,
            item.shadowAgent.agentId,
            Date.now() - 60_000,
          )
          result.features.multiAccountHeartbeats.push({
            accountId: item.accountId,
            agentId: item.shadowAgent.agentId,
            status: peerHeartbeat.status,
            lastHeartbeat: peerHeartbeat.lastHeartbeat,
          })
        }
      }

      if (suites.has('basic') || suites.has('advanced')) {
        const slashCommand = await waitForSlashCommand(session, owner, agent.agentId, 'smoke-form')
        result.features.slashCommands = {
          command: slashCommand.name,
          kind: slashCommand.interaction?.kind,
        }
      }

      if (suites.has('basic')) {
        const reply = await sendRoundTripMessage(session, owner, marker)
        result.features.messageRoundtrip = { id: reply.id, content: reply.content.slice(0, 200) }
        result.reply = { id: reply.id, content: reply.content.slice(0, 200) }
      }

      if (suites.has('advanced')) {
        const attachment = await runAttachmentSmoke(session, owner, marker, getCapturedLogs)
        result.features.attachmentInbound = {
          uploadedUrl: attachment.uploaded.url,
          reply: {
            id: attachment.reply.id,
            content: attachment.reply.content.slice(0, 200),
          },
        }

        const form = await runSlashFormSmoke(session, owner, marker)
        result.features.formRoundtrip = {
          interactiveMessageId: form.interactiveMessage.id,
          responseMessageId: form.response.id,
          submitted: form.state.submitted,
          reply: {
            id: form.reply.id,
            content: form.reply.content.slice(0, 200),
          },
        }
      }

      if (suites.has('dm')) {
        const dm = await runDmSmoke(session, owner, agent, marker)
        result.features.dmRoundtrip = {
          dmChannelId: dm.dmChannelId,
          reply: {
            id: dm.reply.id,
            content: dm.reply.content.slice(0, 200),
          },
        }
      }

      if (suites.has('dm-advanced')) {
        const dmAdvanced = await runDmAdvancedSmoke(session, owner, agent, marker)
        result.features.dmAdvanced = {
          dmChannelId: dmAdvanced.dmChannelId,
          uploadedUrl: dmAdvanced.uploaded.url,
          reply: {
            id: dmAdvanced.reply.id,
            replyToId: dmAdvanced.reply.replyToId,
            content: dmAdvanced.reply.content.slice(0, 200),
          },
        }
      }

      if (suites.has('rules')) {
        result.features.chatRules = await runRulesSmoke(session, owner, agent, marker)
      }

      if (suites.has('multi')) {
        result.features.multiBuddy = await runMultiBuddySmoke(
          session,
          owner,
          configuredAgents,
          marker,
        )
      }

      if (suites.has('thread')) {
        const thread = await runThreadSmoke(session, owner, agent, marker)
        result.features.threadRoundtrip = {
          parentId: thread.parentId,
          threadId: thread.threadId,
          reply: {
            id: thread.reply.id,
            threadId: thread.reply.threadId,
            content: thread.reply.content.slice(0, 200),
          },
        }
      }

      if (suites.has('media-outbound')) {
        const mediaOutbound = await runMediaOutboundSmoke(
          session,
          owner,
          agent,
          marker,
          containerName,
        )
        result.features.mediaOutbound = {
          channel: {
            messageId: mediaOutbound.channel.message.id,
            attachmentCount: mediaOutbound.channel.message.attachments?.length ?? 0,
          },
          dm: {
            dmChannelId: mediaOutbound.dm.dmChannelId,
            messageId: mediaOutbound.dm.message.id,
            attachmentCount: mediaOutbound.dm.message.attachments?.length ?? 0,
          },
        }
      }

      if (suites.has('interactive')) {
        const interactive = await runInteractiveActionSmoke(session, owner, marker, containerName)
        result.features.interactiveAction = {
          action: interactive.action,
          interactiveMessageId: interactive.interactiveMessage.id,
          responseMessageId: interactive.response.id,
          submitted: interactive.state.submitted,
          reply: {
            id: interactive.reply.id,
            content: interactive.reply.content.slice(0, 200),
          },
        }
      }

      if (suites.has('discussion')) {
        result.features.discussionChain = await runDiscussionChainSmoke(
          session,
          owner,
          configuredAgents,
          marker,
        )
      }

      if (suites.has('cron')) {
        result.features.cronDelivery = await runCronSmoke(session, owner, marker, containerName)
      }

      result.smoke = `shadow-${[...suites].join('-')}`
    }

    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const logs = spawnSync('docker', ['logs', '--tail', '160', containerName])
    const output = `${getCapturedLogs()}\n${logs.stdout.toString()}\n${logs.stderr.toString()}`
    console.error(redact(output))
    throw error
  } finally {
    run.kill('SIGTERM')
    cleanup()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
