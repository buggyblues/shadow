import { describe, expect, it } from 'vitest'
import { normalizeOAuthCallbackParams, parseOAuthCallbackUrl } from './oauth-callback'

describe('oauth callback parsing', () => {
  it('normalizes query token payloads from mobile deep links', () => {
    expect(
      parseOAuthCallbackUrl('shadow://oauth-callback?access_token=access&refresh_token=refresh'),
    ).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      oauth: undefined,
      provider: undefined,
      error: undefined,
    })
  })

  it('normalizes hash token payloads from browser callbacks', () => {
    expect(
      parseOAuthCallbackUrl('/app/oauth-callback#access_token=access&refresh_token=refresh'),
    ).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
    })
  })

  it('handles hash callbacks that include a route before the query', () => {
    expect(
      parseOAuthCallbackUrl('shadow://oauth-callback#/oauth-callback?accessToken=a&refreshToken=r'),
    ).toMatchObject({
      accessToken: 'a',
      refreshToken: 'r',
    })
  })

  it('normalizes linked account callback params', () => {
    expect(
      normalizeOAuthCallbackParams({
        oauth: ['linked'],
        provider: ['github'],
      }),
    ).toMatchObject({
      oauth: 'linked',
      provider: 'github',
    })
  })
})
