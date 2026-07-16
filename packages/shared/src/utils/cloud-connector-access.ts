export type CloudConnectorAccessKind = 'oauth' | 'manual' | 'direct' | 'unavailable'

export function cloudConnectorAccessKind(connector: {
  oauth?: { available?: boolean; configured?: boolean } | null
  authType?: string | null
  authFields: ReadonlyArray<{ required?: boolean } | unknown>
}): CloudConnectorAccessKind {
  if (connector.oauth?.available && connector.oauth.configured !== false) return 'oauth'
  if (
    connector.oauth?.available &&
    connector.oauth.configured === false &&
    connector.authFields.length === 0
  ) {
    return 'unavailable'
  }
  if (connector.authType === 'none') return 'direct'
  if (
    connector.authFields.length === 0 ||
    connector.authFields.every(
      (field) =>
        !field ||
        typeof field !== 'object' ||
        Array.isArray(field) ||
        (field as { required?: boolean }).required !== true,
    )
  ) {
    return 'direct'
  }
  return 'manual'
}
