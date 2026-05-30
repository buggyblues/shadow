import { describe, expect, it } from 'vitest'
import {
  buildShadowOAuthDenyRedirect,
  parseShadowOAuthAuthorizeUrl,
  shadowOAuthAuthorizeApiPath,
} from './authorization'

describe('Shadow OAuth authorization URL helpers', () => {
  it('parses Shadow authorize URLs for native interceptors', () => {
    const request = parseShadowOAuthAuthorizeUrl(
      'https://shadowob.com/app/oauth/authorize?response_type=code&client_id=client_1&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&scope=user%3Aread+messages%3Awrite&state=abc',
      { allowedOrigins: ['https://shadowob.com'] },
    )

    expect(request).toEqual({
      responseType: 'code',
      clientId: 'client_1',
      redirectUri: 'https://app.example/callback',
      scope: 'user:read messages:write',
      state: 'abc',
      sourceUrl:
        'https://shadowob.com/app/oauth/authorize?response_type=code&client_id=client_1&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&scope=user%3Aread+messages%3Awrite&state=abc',
    })
  })

  it('ignores non-Shadow origins when allowlisted', () => {
    expect(
      parseShadowOAuthAuthorizeUrl(
        'https://evil.example/app/oauth/authorize?client_id=x&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback',
        { allowedOrigins: ['https://shadowob.com'] },
      ),
    ).toBeNull()
  })

  it('builds authorize API paths and denied redirects', () => {
    const request = parseShadowOAuthAuthorizeUrl(
      'https://shadowob.com/app/oauth/authorize?client_id=client_1&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&state=abc',
    )
    expect(request).not.toBeNull()
    expect(shadowOAuthAuthorizeApiPath(request!)).toBe(
      '/api/oauth/authorize?response_type=code&client_id=client_1&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&scope=user%3Aread&state=abc',
    )
    expect(buildShadowOAuthDenyRedirect(request!)).toBe(
      'https://app.example/callback?error=access_denied&state=abc',
    )
  })
})
