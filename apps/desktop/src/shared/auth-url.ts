export type ParsedAuthCallback = {
  accessToken: string
  refreshToken: string
}

function collectParams(url: URL) {
  const params = new URLSearchParams(url.search)
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  if (hash) {
    const hashParams = new URLSearchParams(hash)
    for (const [key, value] of hashParams.entries()) {
      if (!params.has(key)) params.set(key, value)
    }
  }
  return params
}

export function parseAuthCallbackUrl(rawUrl: string): ParsedAuthCallback | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  const params = collectParams(url)
  const accessToken =
    params.get('access_token') ?? params.get('accessToken') ?? params.get('token') ?? ''
  const refreshToken = params.get('refresh_token') ?? params.get('refreshToken') ?? ''

  if (!accessToken.trim() || !refreshToken.trim()) return null
  return {
    accessToken: accessToken.trim(),
    refreshToken: refreshToken.trim(),
  }
}
