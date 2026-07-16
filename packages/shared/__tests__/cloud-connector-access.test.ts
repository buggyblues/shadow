import { describe, expect, it } from 'vitest'
import { cloudConnectorAccessKind } from '../src/utils/cloud-connector-access'

describe('cloudConnectorAccessKind', () => {
  it('uses executable OAuth metadata instead of the broad manifest auth type', () => {
    expect(cloudConnectorAccessKind({ oauth: { available: true }, authFields: [{}] })).toBe('oauth')
  })

  it('does not present an unconfigured OAuth-only connector as executable', () => {
    expect(
      cloudConnectorAccessKind({
        oauth: { available: true, configured: false },
        authType: 'oauth2',
        authFields: [],
      }),
    ).toBe('unavailable')
  })

  it('treats connectors without account fields as direct', () => {
    expect(cloudConnectorAccessKind({ oauth: null, authFields: [] })).toBe('direct')
  })

  it('keeps credentials-only connectors in the manual group', () => {
    expect(cloudConnectorAccessKind({ oauth: null, authFields: [{ required: true }] })).toBe(
      'manual',
    )
  })

  it('keeps auth-free connectors with optional enhancement fields in the direct group', () => {
    expect(
      cloudConnectorAccessKind({
        oauth: null,
        authType: 'none',
        authFields: [{ required: false }],
      }),
    ).toBe('direct')
  })
})
