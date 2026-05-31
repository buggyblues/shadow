import { describe, expect, it } from 'vitest'
import {
  communityRequestStateFromError,
  isCommunityAuthRequiredError,
} from '../src/renderer/lib/pet-community'

describe('desktop community request errors', () => {
  it('recognizes direct and Electron-wrapped auth failures', () => {
    expect(isCommunityAuthRequiredError(new Error('AUTH_REQUIRED'))).toBe(true)
    expect(
      isCommunityAuthRequiredError(
        new Error(
          "Error invoking remote method 'desktop:community:fetchJson': Error: AUTH_REQUIRED",
        ),
      ),
    ).toBe(true)
  })

  it('maps only auth failures to the auth state', () => {
    expect(communityRequestStateFromError(new Error('AUTH_REQUIRED'))).toBe('auth')
    expect(communityRequestStateFromError(new Error('REQUEST_FAILED_500'))).toBe('error')
  })
})
