export const DESKTOP_COMMUNITY_AUTH_REQUIRED = 'AUTH_REQUIRED'
export const DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT = 'shadow:desktop-community-auth-required'

export class DesktopCommunityAuthRequiredError extends Error {
  readonly code = DESKTOP_COMMUNITY_AUTH_REQUIRED

  constructor() {
    super(DESKTOP_COMMUNITY_AUTH_REQUIRED)
    this.name = 'DesktopCommunityAuthRequiredError'
  }
}

export function communityErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

export function isCommunityAuthRequiredError(error: unknown) {
  return communityErrorMessage(error).includes(DESKTOP_COMMUNITY_AUTH_REQUIRED)
}

export function communityRequestStateFromError(error: unknown): 'auth' | 'error' {
  return isCommunityAuthRequiredError(error) ? 'auth' : 'error'
}

export function normalizeCommunityAuthError(error: unknown) {
  if (!isCommunityAuthRequiredError(error)) return error
  return new DesktopCommunityAuthRequiredError()
}
