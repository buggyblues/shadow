export type ScannedShadowLink =
  | {
      type: 'channel'
      serverSlug: string
      channelId: string
      messageId?: string
    }
  | {
      type: 'invite'
      code: string
    }
  | {
      type: 'profile'
      userId: string
    }
  | {
      type: 'buddy'
      buddyId: string
    }

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function cleanSegments(pathname: string): string[] {
  return pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(decodeSegment)
}

function parseCustomScheme(url: URL): ScannedShadowLink | null {
  const segments = [url.hostname, ...cleanSegments(url.pathname)].filter(Boolean)
  const messageId = url.searchParams.get('msg') ?? url.searchParams.get('messageId') ?? undefined

  if (segments[0] === 'servers' && segments[2] === 'channels' && segments[1] && segments[3]) {
    return {
      type: 'channel',
      serverSlug: segments[1],
      channelId: segments[3],
      messageId,
    }
  }

  if (segments[0] === 'invite' && segments[1]) {
    return { type: 'invite', code: segments[1] }
  }

  if ((segments[0] === 'profile' || segments[0] === 'user') && segments[1]) {
    return { type: 'profile', userId: segments[1] }
  }

  if ((segments[0] === 'buddy' || segments[0] === 'agent') && segments[1]) {
    return { type: 'buddy', buddyId: segments[1] }
  }

  return null
}

function parseWebPath(url: URL): ScannedShadowLink | null {
  const segments = cleanSegments(url.pathname)
  const appOffset = segments[0] === 'app' ? 1 : 0
  const messageId = url.searchParams.get('msg') ?? url.searchParams.get('messageId') ?? undefined

  if (
    segments[appOffset] === 'servers' &&
    segments[appOffset + 2] === 'channels' &&
    segments[appOffset + 1] &&
    segments[appOffset + 3]
  ) {
    const serverSlug = segments[appOffset + 1]
    const channelId = segments[appOffset + 3]
    if (!serverSlug || !channelId) return null
    return {
      type: 'channel',
      serverSlug,
      channelId,
      messageId,
    }
  }

  if (segments[appOffset] === 'invite' && segments[appOffset + 1]) {
    const code = segments[appOffset + 1]
    if (!code) return null
    return { type: 'invite', code }
  }

  if (segments[appOffset] === 'profile' && segments[appOffset + 1]) {
    const userId = segments[appOffset + 1]
    if (!userId) return null
    return { type: 'profile', userId }
  }

  if (
    (segments[appOffset] === 'buddy' ||
      segments[appOffset] === 'buddies' ||
      segments[appOffset] === 'agents') &&
    segments[appOffset + 1]
  ) {
    const buddyId = segments[appOffset + 1]
    if (!buddyId) return null
    return { type: 'buddy', buddyId }
  }

  return null
}

export function parseScannedShadowLink(rawValue: string): ScannedShadowLink | null {
  const value = rawValue.trim()
  if (!value) return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol === 'shadow:') {
    return parseCustomScheme(url)
  }

  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return parseWebPath(url)
  }

  return null
}
