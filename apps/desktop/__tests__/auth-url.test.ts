import { describe, expect, it } from 'vitest'
import { parseAuthCallbackUrl } from '../src/shared/auth-url'

describe('parseAuthCallbackUrl', () => {
  it('reads tokens from a shadow protocol callback', () => {
    expect(parseAuthCallbackUrl('shadow://auth/callback?access_token=a&refresh_token=b')).toEqual({
      accessToken: 'a',
      refreshToken: 'b',
    })
  })

  it('reads tokens from an oauth hash callback', () => {
    expect(
      parseAuthCallbackUrl('https://shadowob.app/oauth-callback#access_token=a&refresh_token=b'),
    ).toEqual({ accessToken: 'a', refreshToken: 'b' })
  })

  it('rejects incomplete callbacks', () => {
    expect(parseAuthCallbackUrl('shadow://auth/callback?access_token=a')).toBeNull()
  })
})
